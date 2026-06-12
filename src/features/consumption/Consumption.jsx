import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import MetricCard from '../../components/MetricCard'
import { useToast } from '../../components/Toast'
import { 
  DollarSign, Coins, MessageSquare, Info, TrendingDown, 
  Sparkles, CheckCircle2, RefreshCw, BarChart2, ShieldAlert
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
                  <span>Costo Salida (Completion):</span>
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
