import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import MetricCard from '../../components/MetricCard'
import { useToast } from '../../components/Toast'
import Modal from '../../components/Modal'
import {
  DollarSign, Coins, MessageSquare, Info, TrendingDown,
  Sparkles, CheckCircle2, RefreshCw, BarChart2, ShieldAlert,
  Copy, Check, Eye, Search, BrainCircuit
} from 'lucide-react'

const MODEL_RATES_INFO = {
  openai: [
    { name: 'gpt-4o-mini', desc: 'Ideal para atención general y chats rápidos', in: '$0.15', out: '$0.60' },
    { name: 'gpt-4o', desc: 'Alta complejidad, análisis de datos y lógica avanzada', in: '$2.50', out: '$10.00' }
  ],
  claude: [
    { name: 'claude-3-5-haiku', desc: 'Veloz, preciso y sumamente eficiente en costos', in: '$0.80', out: '$4.00' },
    { name: 'claude-3-5-sonnet', desc: 'Máxima capacidad creativa y de razonamiento', in: '$3.00', out: '$15.00' }
  ],
  gemini: [
    { name: 'gemini-1.5-flash', desc: 'Ventana de contexto enorme, ultra veloz y económico', in: '$0.075', out: '$0.30' },
    { name: 'gemini-1.5-pro', desc: 'Razonamiento complejo y análisis multimodal profundo', in: '$1.25', out: '$5.00' }
  ],
  groq: [
    { name: 'llama3-8b', desc: 'Llama 3 open-source optimizada para respuestas instantáneas', in: '$0.05', out: '$0.08' },
    { name: 'llama3-70b', desc: 'Alta capacidad e inteligencia con baja latencia', in: '$0.59', out: '$0.79' }
  ]
}

export default function Consumption() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)

  // Data State
  const [rawLogs, setRawLogs] = useState([])
  const [numbers, setNumbers] = useState([])

  // UI State
  const [selectedProvider, setSelectedProvider] = useState('all')
  const [selectedLog, setSelectedLog] = useState(null)
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const [copiedResponse, setCopiedResponse] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [modelFilter, setModelFilter] = useState('all')

  const fetchData = async () => {
    if (!user) return
    try {
      // 1. Fetch usage logs
      const { data: logsData, error: logsErr } = await supabase
        .from('usage_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (logsErr) throw logsErr

      // 2. Fetch whatsapp numbers with bot configurations and agents
      const { data: numData, error: numErr } = await supabase
        .from('whatsapp_numbers')
        .select(`
          id,
          display_name,
          phone_number,
          bot_enabled,
          bot_configurations (
            agents (
              model
            )
          )
        `)
        .eq('user_id', user.id)

      if (numErr) throw numErr

      setRawLogs(logsData || [])
      setNumbers(numData || [])
    } catch (err) {
      console.error('Error fetching consumption data:', err)
      toast({ message: 'Error al cargar datos de consumo: ' + err.message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  // Realtime subscription
  useEffect(() => {
    if (!user) return

    fetchData()

    // Realtime channel for usage_logs inserts
    const channelUsage = supabase
      .channel('consumption-usage-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'usage_logs',
        filter: `user_id=eq.${user.id}`
      }, (payload) => {
        setRawLogs(prev => [payload.new, ...prev])
        toast({ message: 'Nuevo consumo registrado por bot', type: 'info' })
      })
      .subscribe()

    // Realtime channel for whatsapp_numbers modifications
    const channelNumbers = supabase
      .channel('consumption-numbers-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'whatsapp_numbers',
        filter: `user_id=eq.${user.id}`
      }, () => {
        fetchData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channelUsage)
      supabase.removeChannel(channelNumbers)
    }
  }, [user])

  // Filter logs by selected provider if not 'all'
  const filteredLogs = selectedProvider === 'all'
    ? rawLogs
    : rawLogs.filter(log => log.provider === selectedProvider)

  // Calculate Aggregated Metrics
  const totalCost = filteredLogs.reduce((sum, log) => sum + (log.estimated_cost || 0), 0)
  const totalPromptTokens = filteredLogs.reduce((sum, log) => sum + (log.tokens_prompt || 0), 0)
  const totalCompletionTokens = filteredLogs.reduce((sum, log) => sum + (log.tokens_completion || 0), 0)
  const totalTokens = totalPromptTokens + totalCompletionTokens

  // Calculate average cost per message response (each log is one AI output)
  const totalMessagesCount = filteredLogs.length
  const avgCostPerMsg = totalMessagesCount > 0 ? (totalCost / totalMessagesCount) : 0

  // Aggregate stats per WhatsApp number
  const numbersUsage = numbers.map(num => {
    const numLogs = filteredLogs.filter(log => log.number_id === num.id)
    const prompt = numLogs.reduce((sum, log) => sum + (log.tokens_prompt || 0), 0)
    const completion = numLogs.reduce((sum, log) => sum + (log.tokens_completion || 0), 0)
    const cost = numLogs.reduce((sum, log) => sum + (log.estimated_cost || 0), 0)

    // Extract configured model safely
    let config = num.bot_configurations
    if (Array.isArray(config)) {
      config = config[0]
    }
    const model = config?.agents?.model || 'Sin configurar'

    return {
      id: num.id,
      name: num.display_name,
      phone: num.phone_number,
      botEnabled: num.bot_enabled,
      model,
      prompt,
      completion,
      total: prompt + completion,
      cost: cost.toFixed(4)
    }
  })

  // Aggregate stats per AI Provider + Model
  const modelUsageStats = filteredLogs.reduce((acc, log) => {
    const prov = log.provider || 'desconocido'
    const model = log.model_name || 'desconocido'
    const key = `${prov}/${model}`
    if (!acc[key]) {
      acc[key] = {
        provider: prov,
        model: model,
        prompt: 0,
        completion: 0,
        total: 0,
        cost: 0,
        count: 0
      }
    }
    acc[key].prompt += (log.tokens_prompt || 0)
    acc[key].completion += (log.tokens_completion || 0)
    acc[key].total += ((log.tokens_prompt || 0) + (log.tokens_completion || 0))
    acc[key].cost += (log.estimated_cost || 0)
    acc[key].count += 1
    return acc
  }, {})

  const modelUsageArray = Object.values(modelUsageStats).sort((a, b) => b.total - a.total)

  // Get unique model names for filtering traffic logs
  const uniqueModels = [...new Set(filteredLogs.map(l => l.model_name).filter(Boolean))]

  // Apply search and model filters to traffic logs
  const trafficLogs = filteredLogs.filter(log => {
    if (modelFilter !== 'all' && log.model_name !== modelFilter) return false
    
    if (searchText) {
      const q = searchText.toLowerCase()
      const inPrompt = log.prompt_text ? log.prompt_text.toLowerCase().includes(q) : false
      const inResponse = log.response_text ? log.response_text.toLowerCase().includes(q) : false
      const inModel = log.model_name ? log.model_name.toLowerCase().includes(q) : false
      const inProvider = log.provider ? log.provider.toLowerCase().includes(q) : false
      return inPrompt || inResponse || inModel || inProvider
    }
    return true
  })

  const handleCopy = (text, type) => {
    navigator.clipboard.writeText(text)
    if (type === 'prompt') {
      setCopiedPrompt(true)
      setTimeout(() => setCopiedPrompt(false), 2000)
    } else {
      setCopiedResponse(true)
      setTimeout(() => setCopiedResponse(false), 2000)
    }
  }

  const getPromptSnippet = (text) => {
    if (!text) return 'Sin prompt';
    let rawText = text;
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        const lastUser = parsed.filter(m => m.role === 'user').pop();
        if (lastUser) {
          rawText = lastUser.content;
        } else {
          rawText = parsed[0]?.content || '';
        }
      }
    } catch (e) {}
    return rawText.length > 50 ? rawText.slice(0, 50) + '...' : rawText;
  }

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  const renderPromptPayload = (promptJson) => {
    if (!promptJson) return <span style={{ color: 'var(--text-3)' }}>Sin payload</span>;
    try {
      const parsed = JSON.parse(promptJson);
      if (Array.isArray(parsed)) {
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {parsed.map((msg, idx) => {
              let roleName = 'Asistente';
              let roleColor = 'var(--primary)';
              let bg = 'rgba(99,102,241,0.05)';
              if (msg.role === 'system') {
                roleName = 'Instrucción de Sistema';
                roleColor = 'var(--warning)';
                bg = 'rgba(245,158,11,0.05)';
              } else if (msg.role === 'user') {
                roleName = 'Usuario / Cliente';
                roleColor = 'var(--success)';
                bg = 'rgba(16,185,129,0.05)';
              }
              return (
                <div key={idx} style={{ background: bg, padding: '8px 12px', borderRadius: '6px', borderLeft: `3px solid ${roleColor}` }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: roleColor, marginBottom: '4px' }}>
                    {roleName.toUpperCase()}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text-1)' }}>{msg.content}</div>
                </div>
              );
            })}
          </div>
        );
      }
    } catch (e) {}
    return <div style={{ whiteSpace: 'pre-wrap' }}>{promptJson}</div>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Consumo de Tokens e IA</h1>
          <p className="page-subtitle">Monitoreo financiero en tiempo real y optimización de costos</p>
        </div>
        <button className="btn-outline btn-sm" onClick={fetchData}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          Sincronizar
        </button>
      </div>

      {/* Selector de Proveedor */}
      <div className="provider-selector" style={{ marginBottom: '24px' }}>
        <button
          className={`provider-btn ${selectedProvider === 'all' ? 'selected active' : ''}`}
          onClick={() => setSelectedProvider('all')}
        >
          Todos los Proveedores
        </button>
        <button
          className={`provider-btn ${selectedProvider === 'openai' ? 'selected active' : ''}`}
          onClick={() => setSelectedProvider('openai')}
        >
          OpenAI
        </button>
        <button
          className={`provider-btn ${selectedProvider === 'claude' ? 'selected active' : ''}`}
          onClick={() => setSelectedProvider('claude')}
        >
          Anthropic (Claude)
        </button>
        <button
          className={`provider-btn ${selectedProvider === 'gemini' ? 'selected active' : ''}`}
          onClick={() => setSelectedProvider('gemini')}
        >
          Google Gemini
        </button>
        <button
          className={`provider-btn ${selectedProvider === 'groq' ? 'selected active' : ''}`}
          onClick={() => setSelectedProvider('groq')}
        >
          Groq (Llama)
        </button>
      </div>

      {/* Tarjetas de Resumen General */}
      <div className="consumption-cards">
        <MetricCard
          icon={DollarSign}
          label="Costo Estimado"
          value={`$${totalCost.toFixed(4)}`}
          sub={`USD (${selectedProvider === 'all' ? 'Total' : selectedProvider.toUpperCase()})`}
          color="primary"
        />
        <MetricCard
          icon={Coins}
          label="Tokens Totales"
          value={totalTokens.toLocaleString()}
          sub={`${totalPromptTokens.toLocaleString()} in / ${totalCompletionTokens.toLocaleString()} out`}
          color="warning"
        />
        <MetricCard
          icon={MessageSquare}
          label="Mensajes Procesados"
          value={totalMessagesCount.toLocaleString()}
          sub="Respuestas de IA acumuladas"
          color="success"
        />
        <MetricCard
          icon={BarChart2}
          label="Costo por Respuesta"
          value={`$${avgCostPerMsg.toFixed(5)}`}
          sub="Promedio de consumo USD"
          color="info"
        />
      </div>

      {/* Consumo Acumulado por IA Seleccionada */}
      <div className="glass-card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <BrainCircuit size={18} />
          <h2>Consumo Acumulado por IA y Modelo</h2>
        </div>

        {loading ? (
          <div className="loading-state">Calculando agregados...</div>
        ) : (
          <div className="table-responsive">
            <table className="usage-table">
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th>Modelo de IA</th>
                  <th style={{ textAlign: 'right' }}>Peticiones</th>
                  <th style={{ textAlign: 'right' }}>Tokens Entrada</th>
                  <th style={{ textAlign: 'right' }}>Tokens Salida</th>
                  <th style={{ textAlign: 'right' }}>Tokens Totales</th>
                  <th style={{ textAlign: 'right' }}>Costo Estimado</th>
                </tr>
              </thead>
              <tbody>
                {modelUsageArray.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="empty-state">Sin datos de tráfico para este proveedor</td>
                  </tr>
                ) : (
                  modelUsageArray.map((item, idx) => (
                    <tr key={idx}>
                      <td className="font-semibold text-capitalize">{item.provider}</td>
                      <td className="font-mono text-xs">{item.model}</td>
                      <td style={{ textAlign: 'right' }} className="font-mono">{item.count.toLocaleString()}</td>
                      <td style={{ textAlign: 'right' }} className="font-mono">{item.prompt.toLocaleString()}</td>
                      <td style={{ textAlign: 'right' }} className="font-mono">{item.completion.toLocaleString()}</td>
                      <td style={{ textAlign: 'right' }} className="font-mono font-semibold">{item.total.toLocaleString()}</td>
                      <td style={{ textAlign: 'right' }} className="font-mono text-accent font-semibold">${item.cost.toFixed(5)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tabla de Consumo por Número */}
      <div className="glass-card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <Coins size={18} />
          <h2>Consumo Detallado por Número</h2>
        </div>

        {loading ? (
          <div className="loading-state">Cargando desglose...</div>
        ) : (
          <div className="table-responsive">
            <table className="usage-table">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Teléfono</th>
                  <th>Modelo Activo</th>
                  <th>Estado Bot</th>
                  <th style={{ textAlign: 'right' }}>Tokens Entrada</th>
                  <th style={{ textAlign: 'right' }}>Tokens Salida</th>
                  <th style={{ textAlign: 'right' }}>Tokens Totales</th>
                  <th style={{ textAlign: 'right' }}>Costo (USD)</th>
                </tr>
              </thead>
              <tbody>
                {numbersUsage.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="empty-state">No hay números vinculados</td>
                  </tr>
                ) : (
                  numbersUsage.map(num => (
                    <tr key={num.id}>
                      <td className="font-semibold">{num.name}</td>
                      <td className="font-mono text-xs">{num.phone || 'Sin número'}</td>
                      <td>
                        <span className="readonly-badge font-mono" style={{ textTransform: 'lowercase' }}>
                          {num.model}
                        </span>
                      </td>
                      <td>
                        <span className={`status-pill ${num.botEnabled ? 'active' : 'inactive'}`}>
                          {num.botEnabled ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }} className="font-mono">{num.prompt.toLocaleString()}</td>
                      <td style={{ textAlign: 'right' }} className="font-mono">{num.completion.toLocaleString()}</td>
                      <td style={{ textAlign: 'right' }} className="font-mono">{num.total.toLocaleString()}</td>
                      <td style={{ textAlign: 'right' }} className="font-mono text-accent font-semibold">${num.cost}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Historial de Tráfico e Inspector de IA */}
      <div className="glass-card" style={{ marginBottom: '24px' }}>
        <div className="card-header" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <MessageSquare size={18} />
            <h2>Historial de Tránsito e Inspector de IA</h2>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: 'auto' }}>
            <div style={{ position: 'relative', width: '180px' }}>
              <input
                type="text"
                placeholder="Buscar contenido..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{ padding: '6px 12px 6px 30px', fontSize: '0.78rem' }}
              />
              <Search size={12} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            </div>

            <select
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
              style={{ padding: '6px 24px 6px 12px', fontSize: '0.78rem', width: 'auto' }}
            >
              <option value="all">Todos los Modelos</option>
              {uniqueModels.map((m, idx) => (
                <option key={idx} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="loading-state">Cargando tráfico de IA...</div>
        ) : (
          <>
            <div className="table-responsive" style={{ maxHeight: '420px', overflowY: 'auto' }}>
              <table className="usage-table">
                <thead>
                  <tr>
                    <th>Fecha y Hora</th>
                    <th>Proveedor</th>
                    <th>Modelo</th>
                    <th>Entrada de IA (Prompt)</th>
                    <th>Respuesta de IA (Completion)</th>
                    <th style={{ textAlign: 'right' }}>Tokens (In/Out)</th>
                    <th style={{ textAlign: 'right' }}>Costo</th>
                    <th style={{ textAlign: 'center' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {trafficLogs.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="empty-state">No se registraron interacciones de IA que coincidan</td>
                    </tr>
                  ) : (
                    trafficLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="font-mono text-xs">{formatDateTime(log.created_at)}</td>
                        <td className="text-capitalize">{log.provider}</td>
                        <td className="font-mono text-xs">{log.model_name || 'Default'}</td>
                        <td className="text-xs" style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-2)' }}>
                          {getPromptSnippet(log.prompt_text)}
                        </td>
                        <td className="text-xs" style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {log.response_text || 'Sin respuesta'}
                        </td>
                        <td style={{ textAlign: 'right' }} className="font-mono text-xs">
                          {log.tokens_prompt} / {log.tokens_completion}
                        </td>
                        <td style={{ textAlign: 'right' }} className="font-mono text-xs text-accent">${(log.estimated_cost || 0).toFixed(5)}</td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            className="btn-outline btn-sm icon-btn"
                            onClick={() => setSelectedLog(log)}
                            title="Ver detalle e inspeccionar"
                          >
                            <Eye size={12} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: '12px', textAlign: 'right', fontSize: '0.72rem', color: 'var(--text-3)' }}>
              Mostrando {trafficLogs.length} de {filteredLogs.length} interacciones de IA.
            </div>
          </>
        )}
      </div>

      {/* Modal Inspector Detallado */}
      <Modal
        open={!!selectedLog}
        onClose={() => {
          setSelectedLog(null)
          setCopiedPrompt(false)
          setCopiedResponse(false)
        }}
        title="Inspector de Interacción de IA"
        size="lg"
      >
        {selectedLog && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              <div className="glass-card" style={{ padding: '12px 16px' }}>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Proveedor y Modelo</p>
                <p style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-1)', textTransform: 'capitalize', marginTop: '4px' }}>
                  {selectedLog.provider} - <span className="font-mono text-xs">{selectedLog.model_name || 'Default'}</span>
                </p>
              </div>
              <div className="glass-card" style={{ padding: '12px 16px' }}>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tokens e Impacto</p>
                <p style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-1)', marginTop: '4px' }}>
                  {((selectedLog.tokens_prompt || 0) + (selectedLog.tokens_completion || 0)).toLocaleString()} tokens 
                  <span style={{ color: 'var(--text-2)', fontSize: '0.78rem' }}> (${(selectedLog.estimated_cost || 0).toFixed(5)} USD)</span>
                </p>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-2)' }}>Tránsito de Entrada (System Prompt & Historial)</h4>
                <button className="btn-outline btn-sm" onClick={() => handleCopy(selectedLog.prompt_text, 'prompt')}>
                  {copiedPrompt ? <Check size={12} style={{ color: 'var(--success)' }} /> : <Copy size={12} />}
                  {copiedPrompt ? 'Copiado' : 'Copiar JSON'}
                </button>
              </div>
              <div style={{
                maxHeight: '240px',
                overflowY: 'auto',
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '12px',
                fontSize: '0.82rem',
                fontFamily: 'monospace'
              }}>
                {renderPromptPayload(selectedLog.prompt_text)}
              </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-2)' }}>Respuesta de la IA (Completado)</h4>
                <button className="btn-outline btn-sm" onClick={() => handleCopy(selectedLog.response_text || '', 'response')}>
                  {copiedResponse ? <Check size={12} style={{ color: 'var(--success)' }} /> : <Copy size={12} />}
                  {copiedResponse ? 'Copiado' : 'Copiar Respuesta'}
                </button>
              </div>
              <div style={{
                maxHeight: '200px',
                overflowY: 'auto',
                background: 'rgba(99,102,241,0.05)',
                border: '1px solid rgba(99,102,241,0.2)',
                borderRadius: 'var(--radius-sm)',
                padding: '14px',
                fontSize: '0.85rem',
                lineHeight: '1.5',
                color: 'var(--text-1)',
                whiteSpace: 'pre-wrap'
              }}>
                {selectedLog.response_text || <span style={{ color: 'var(--text-3)' }}>Sin respuesta registrada</span>}
              </div>
            </div>
            
            <div style={{ textAlign: 'right', fontSize: '0.7rem', color: 'var(--text-3)', fontMono: true }}>
              ID Petición: {selectedLog.id} • Creado: {formatDateTime(selectedLog.created_at)}
            </div>
          </div>
        )}
      </Modal>

      {/* Tarifas de Proveedores */}
      {selectedProvider !== 'all' && MODEL_RATES_INFO[selectedProvider] && (
        <div className="glass-card" style={{ marginBottom: '24px' }}>
          <div className="card-header">
            <Info size={18} />
            <h2>Tarifas Oficiales para {selectedProvider.toUpperCase()} (por 1M de tokens)</h2>
          </div>
          <p className="page-subtitle" style={{ marginBottom: '16px', fontSize: '0.8rem' }}>
            Los costos de consumo de IA se calculan directamente en base a las tarifas oficiales de los proveedores por cada millón de tokens (1M tokens equivale aproximadamente a 750,000 palabras).
          </p>
          <div className="consumption-model-rates">
            {MODEL_RATES_INFO[selectedProvider].map((rate, i) => (
              <div className="model-rate-card" key={i}>
                <div className="model-rate-header">
                  <span className="model-rate-name">{rate.name}</span>
                  <span className={`model-rate-provider provider-${selectedProvider}`}>{selectedProvider}</span>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-2)', minHeight: '36px' }}>{rate.desc}</p>
                <div className="model-rate-row" style={{ marginTop: '8px' }}>
                  <span>Costo Entrada (Prompt):</span>
                  <span className="model-rate-val">{rate.in} / 1M tkn</span>
                </div>
                <div className="model-rate-row">
                  <span>Costo Salida (Completado):</span>
                  <span className="model-rate-val">{rate.out} / 1M tkn</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sección de Recomendaciones de Optimización */}
      <div className="glass-card recommendations-card">
        <div className="card-header" style={{ color: 'var(--success)' }}>
          <TrendingDown size={18} />
          <h2>Recomendaciones para Reducción de Costos y Optimización de Tokens</h2>
        </div>

        <div className="recommendations-list">
          <div className="recommendation-item">
            <div className="recommendation-icon">
              <Sparkles size={18} />
            </div>
            <div className="recommendation-body">
              <h4>Utiliza Modelos "Mini" y Eficientes</h4>
              <p>
                Los modelos compactos como <strong>gpt-4o-mini</strong> o <strong>gemini-1.5-flash</strong> son hasta 20 veces más económicos que sus versiones "Pro" (como gpt-4o o Claude 3.5 Sonnet) y ofrecen un desempeño excelente para la mayoría de tareas de atención y soporte.
              </p>
            </div>
          </div>

          <div className="recommendation-item">
            <div className="recommendation-icon">
              <CheckCircle2 size={18} />
            </div>
            <div className="recommendation-body">
              <h4>Límite de Historial de Mensajes</h4>
              <p>
                ZonaWa limita el historial contextual enviado a la IA a los últimos 10 mensajes. Esto previene que chats largos consuman miles de tokens de entrada innecesariamente en cada nueva interacción, manteniendo los costos controlados y la IA en contexto.
              </p>
            </div>
          </div>

          <div className="recommendation-item">
            <div className="recommendation-icon">
              <ShieldAlert size={18} />
            </div>
            <div className="recommendation-body">
              <h4>Prompts de Rol Claros y Directos</h4>
              <p>
                Mantén las instrucciones de tus "Estilos IA" precisas y evita repetir pautas innecesarias. Un prompt de sistema corto e instructivo reduce drásticamente los tokens acumulados de entrada (Prompt Tokens) que se cobran en cada mensaje.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
