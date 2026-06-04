import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../components/Toast'
import { Settings, Save, Loader2, Sliders, Tag, X } from 'lucide-react'

const PROVIDER_MODELS = {
  openai: [
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { id: 'gpt-4o', label: 'GPT-4o' }
  ],
  claude: [
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { id: 'claude-opus-4-7', label: 'Claude Opus 4.7' }
  ],
  gemini: [
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' }
  ],
  groq: [
    { id: 'llama3-8b-8192', label: 'Llama 3 8B' },
    { id: 'llama3-70b-8192', label: 'Llama 3 70B' }
  ]
}

const AVAILABLE_RULES = [
  { key: 'short_clear', label: 'Responde corto y claro', desc: 'El bot será conciso, directo al grano y evitará respuestas extensas.' },
  { key: 'max_3_lines', label: 'Máximo 3 líneas', desc: 'Limita respuestas a un máximo de 3 líneas salvo que pidan detalle.' },
  { key: 'short_questions', label: 'Haz preguntas cortas', desc: 'Fórmula preguntas breves para guiar al cliente de forma interactiva.' },
  { key: 'avoid_repetition', label: 'Evita repetir información', desc: 'No repetirá explicaciones o respuestas previas.' },
  { key: 'natural_tone', label: 'Mantén tono natural', desc: 'Conversación amigable, humana y fluida.' },
  { key: 'ask_if_missing', label: 'Pregunta si falta información', desc: 'Si hay dudas o consultas incompletas, indagará antes de responder.' }
]

export default function AgentSettings() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [numbers, setNumbers] = useState([])
  const [connections, setConnections] = useState([])
  const [selectedNumber, setSelectedNumber] = useState('')
  const [config, setConfig] = useState(null)
  const [form, setForm] = useState({
    name: '', role_prompt: '', temperature: 0.7, max_tokens: 300, model: '',
    connection_id: '', triggers: [], handoff_triggers: ['humano', 'asesor', 'soporte'],
    fallback_message: 'Lo siento, no pude procesar tu solicitud.',
    trigger_mode: 'all', respond_saved_contacts: true, unsaved_contacts_action: 'respond',
    rules: [],
  })
  const [triggerInput, setTriggerInput] = useState('')
  const [handoffInput, setHandoffInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)

  const toggleRule = (ruleKey) => {
    setForm(prev => {
      const currentRules = prev.rules || []
      const nextRules = currentRules.includes(ruleKey)
        ? currentRules.filter(r => r !== ruleKey)
        : [...currentRules, ruleKey]
      return { ...prev, rules: nextRules }
    })
  }

  useEffect(() => {
    if (!user) return
    supabase.from('whatsapp_numbers').select('id, display_name, phone_number').eq('user_id', user.id).then(({ data }) => setNumbers(data || []))
    supabase.from('ai_connections').select('id, nickname, provider').eq('user_id', user.id).eq('is_active', true).then(({ data }) => setConnections(data || []))
  }, [user])

  useEffect(() => {
    if (selectedNumber) loadConfig(selectedNumber)
  }, [selectedNumber])

  useEffect(() => {
    if (!form.connection_id || !connections.length) return
    const conn = connections.find(c => c.id === form.connection_id)
    if (conn) {
      const provider = conn.provider
      const allowedModels = PROVIDER_MODELS[provider] || []
      const isValid = allowedModels.some(m => m.id === form.model)
      if (!isValid && allowedModels.length > 0) {
        setForm(prev => ({ ...prev, model: allowedModels[0].id }))
      }
    }
  }, [form.connection_id, connections])

  async function loadConfig(numberId) {
    setLoading(true)
    const { data } = await supabase
      .from('bot_configurations')
      .select('*, agents(*)')
      .eq('number_id', numberId)
      .single()

    if (data) {
      setConfig(data)
      setForm({
        name: data.agents?.name || '',
        role_prompt: data.agents?.role_prompt || '',
        model: data.agents?.model || '',
        rules: data.agents?.rules || [],
        temperature: data.agents?.temperature || 0.7,
        max_tokens: data.agents?.max_tokens || 300,
        connection_id: data.connection_id || '',
        triggers: data.triggers || [],
        handoff_triggers: data.handoff_triggers || ['humano', 'asesor', 'soporte'],
        fallback_message: data.fallback_message || '',
        trigger_mode: data.trigger_mode || 'all',
        respond_saved_contacts: data.respond_saved_contacts !== undefined ? data.respond_saved_contacts : true,
        unsaved_contacts_action: data.unsaved_contacts_action || 'respond',
      })
    } else {
      setConfig(null)
      setForm({
        name: '', role_prompt: '', temperature: 0.7, max_tokens: 300, model: '',
        rules: [],
        connection_id: '', triggers: [], handoff_triggers: ['humano', 'asesor', 'soporte'],
        fallback_message: 'Lo siento, no pude procesar tu solicitud.',
        trigger_mode: 'all',
        respond_saved_contacts: true,
        unsaved_contacts_action: 'respond',
      })
    }
    setLoading(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!selectedNumber) return
    setSaving(true)
    try {
      // Upsert agent
      const agentPayload = {
        user_id: user.id,
        name: form.name,
        role_prompt: form.role_prompt,
        model: form.model || 'gpt-4o-mini',
        rules: form.rules || [],
        temperature: parseFloat(form.temperature),
        max_tokens: parseInt(form.max_tokens),
      }
      let agentId = config?.agent_id
      if (agentId) {
        await supabase.from('agents').update(agentPayload).eq('id', agentId)
      } else {
        const { data: newAgent } = await supabase.from('agents').insert({ ...agentPayload }).select().single()
        agentId = newAgent.id
      }

      // Upsert bot_configuration
      const botPayload = {
        number_id: selectedNumber,
        agent_id: agentId,
        connection_id: form.connection_id || null,
        triggers: form.triggers,
        handoff_triggers: form.handoff_triggers,
        fallback_message: form.fallback_message,
        trigger_mode: form.trigger_mode,
        respond_saved_contacts: form.respond_saved_contacts,
        unsaved_contacts_action: form.unsaved_contacts_action,
        updated_at: new Date().toISOString(),
      }
      if (config) {
        await supabase.from('bot_configurations').update(botPayload).eq('id', config.id)
      } else {
        await supabase.from('bot_configurations').insert(botPayload)
      }
      toast({ message: 'Configuración guardada correctamente', type: 'success' })
      loadConfig(selectedNumber)
    } catch (err) {
      toast({ message: err.message, type: 'error' })
    } finally { setSaving(false) }
  }

  const addTag = (field, value, setter) => {
    if (!value.trim()) return
    setForm(prev => ({ ...prev, [field]: [...prev[field], value.trim()] }))
    setter('')
  }
  const removeTag = (field, idx) => setForm(prev => ({ ...prev, [field]: prev[field].filter((_, i) => i !== idx) }))

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Configuración de Agentes</h1>
          <p className="page-subtitle">Asigna una IA, prompt y parámetros a cada número de WhatsApp</p>
        </div>
      </div>

      <div className="settings-layout">
        {/* Selector de Número */}
        <div className="glass-card settings-sidebar">
          <h2 className="sidebar-section-title"><Sliders size={16} /> Selecciona un Número</h2>
          {numbers.map(n => (
            <button
              key={n.id}
              id={`select-number-${n.id}`}
              className={`number-select-btn ${selectedNumber === n.id ? 'active' : ''}`}
              onClick={() => setSelectedNumber(n.id)}
            >
              <span className="nsb-name">{n.display_name}</span>
              <span className="nsb-phone">{n.phone_number || 'Sin número'}</span>
            </button>
          ))}
          {numbers.length === 0 && <p className="empty-state">Sin números registrados</p>}
        </div>

        {/* Formulario */}
        <div className="settings-main">
          {!selectedNumber ? (
            <div className="empty-page">
              <Settings size={48} />
              <h2>Selecciona un número</h2>
              <p>Elige un número del panel izquierdo para configurar su agente de IA</p>
            </div>
          ) : loading ? (
            <div className="loading-state"><Loader2 size={32} className="spin" /></div>
          ) : (
            <form onSubmit={handleSave} className="settings-form">
              {/* Sección: Identidad del Agente */}
              <div className="glass-card settings-section">
                <h2 className="section-title">Identidad del Agente</h2>
                <div className="form-group">
                  <label>Nombre del Agente</label>
                  <input id="agent-name" type="text" placeholder="Ej: Agente de Ventas" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Prompt de Rol (System Prompt)</label>
                  <textarea
                    id="agent-prompt"
                    rows={6}
                    placeholder="Eres un asistente virtual de ventas para [Empresa]. Tu objetivo es..."
                    value={form.role_prompt}
                    onChange={e => setForm({ ...form, role_prompt: e.target.value })}
                    required
                  />
                  <small>{form.role_prompt.length} caracteres</small>
                </div>
              </div>

              {/* Sección: Conexión de IA */}
              <div className="glass-card settings-section">
                <h2 className="section-title">Proveedor de IA</h2>
                <div className="form-group">
                  <label>Conexión de IA Activa</label>
                  <select id="select-connection" value={form.connection_id} onChange={e => setForm({ ...form, connection_id: e.target.value })}>
                    <option value="">-- Sin conexión --</option>
                    {connections.map(c => (
                      <option key={c.id} value={c.id}>{c.nickname} ({c.provider})</option>
                    ))}
                  </select>
                  {connections.length === 0 && <small className="warn-text">⚠ No hay conexiones activas. Ve al módulo Conexiones IA.</small>}
                </div>
              </div>

              {/* Sección: Parámetros */}
              <div className="glass-card settings-section">
                <h2 className="section-title">Parámetros del Modelo</h2>
                <div className="form-row">
                  <div className="form-group">
                    <label>Temperatura: <strong>{form.temperature}</strong></label>
                    <input id="agent-temp" type="range" min="0" max="1.2" step="0.1" value={form.temperature}
                      onChange={e => setForm({ ...form, temperature: e.target.value })} />
                    <div className="range-labels"><span>Preciso</span><span>Creativo</span></div>
                  </div>
                  <div className="form-group">
                    <label>Tokens Máximos</label>
                    <input id="agent-tokens" type="number" min="100" max="4000" value={form.max_tokens}
                      onChange={e => setForm({ ...form, max_tokens: e.target.value })} />
                  </div>
                </div>
                {form.connection_id && (
                  <div className="form-group" style={{ marginTop: '14px' }}>
                    <label>Modelo de IA</label>
                    <select 
                      id="agent-model"
                      value={form.model} 
                      onChange={e => setForm({ ...form, model: e.target.value })}
                    >
                      {(() => {
                        const conn = connections.find(c => c.id === form.connection_id)
                        const provider = conn?.provider || 'openai'
                        const models = PROVIDER_MODELS[provider] || []
                        return models.map(m => (
                          <option key={m.id} value={m.id}>{m.label}</option>
                        ))
                      })()}
                    </select>
                  </div>
                )}
              </div>

              {/* Sección: Reglas de Comportamiento */}
              <div className="glass-card settings-section">
                <h2 className="section-title">Reglas del Bot (Instrucciones Rápidas)</h2>
                <small className="section-desc" style={{ color: 'var(--text-3)', display: 'block', marginBottom: '10px' }}>
                  Activa pautas de comportamiento específicas para moderar y optimizar la respuesta del bot.
                </small>
                <div className="rules-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '10px' }}>
                  {AVAILABLE_RULES.map(rule => {
                    const isActive = (form.rules || []).includes(rule.key)
                    return (
                      <div 
                        key={rule.key} 
                        onClick={() => toggleRule(rule.key)}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          padding: '12px',
                          background: isActive ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255, 255, 255, 0.01)',
                          border: isActive ? '1px solid var(--primary)' : '1px solid var(--border)',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                        }}
                        className="rule-card"
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <strong style={{ fontSize: '0.85rem', color: isActive ? 'var(--primary-light)' : 'var(--text-1)' }}>{rule.label}</strong>
                          <div className={`toggle-switch ${isActive ? 'on' : ''}`} style={{ transform: 'scale(0.8)', pointerEvents: 'none' }}>
                            <span className="toggle-knob" />
                          </div>
                        </div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', lineHeight: '1.2' }}>{rule.desc}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Sección: Disparadores */}
              <div className="glass-card settings-section">
                <h2 className="section-title"><Tag size={16} /> Disparadores (Triggers)</h2>
                
                <div className="form-group">
                  <label>Modo de Activación</label>
                  <small>Determina cómo se debe iniciar o activar la conversación con el bot.</small>
                  <div className="radio-cards-grid">
                    <button
                      type="button"
                      className={`radio-card ${form.trigger_mode === 'all' ? 'active' : ''}`}
                      onClick={() => setForm({ ...form, trigger_mode: 'all' })}
                    >
                      <span className="radio-card-title">Todos los mensajes</span>
                      <span className="radio-card-desc">El bot responde a cualquier mensaje recibido de inmediato.</span>
                    </button>
                    <button
                      type="button"
                      className={`radio-card ${form.trigger_mode === 'exact' ? 'active' : ''}`}
                      onClick={() => setForm({ ...form, trigger_mode: 'exact' })}
                    >
                      <span className="radio-card-title">Palabras exactas</span>
                      <span className="radio-card-desc">Solo responde si el mensaje coincide exactamente con un activador.</span>
                    </button>
                    <button
                      type="button"
                      className={`radio-card ${form.trigger_mode === 'contains' ? 'active' : ''}`}
                      onClick={() => setForm({ ...form, trigger_mode: 'contains' })}
                    >
                      <span className="radio-card-title">Contiene palabra</span>
                      <span className="radio-card-desc">Responde si el mensaje contiene alguna palabra clave activadora.</span>
                    </button>
                  </div>
                </div>

                {form.trigger_mode !== 'all' && (
                  <div className="form-group">
                    <label>Palabras clave de activación</label>
                    <small>Si el mensaje no coincide con estas palabras, el bot ignorará el mensaje.</small>
                    <div className="tag-input-wrap">
                      <input id="trigger-input" type="text" placeholder="Añadir palabra clave..." value={triggerInput}
                        onChange={e => setTriggerInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag('triggers', triggerInput, setTriggerInput))} />
                      <button type="button" className="btn-outline btn-sm" onClick={() => addTag('triggers', triggerInput, setTriggerInput)}>
                        Añadir
                      </button>
                    </div>
                    <div className="tags-list">
                      {form.triggers.map((t, i) => (
                        <span key={i} className="tag tag-primary">
                          {t} <button type="button" onClick={() => removeTag('triggers', i)}><X size={10} /></button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label>Disparadores de Handoff (pausar bot)</label>
                  <small>Palabras que activan la intervención humana</small>
                  <div className="tag-input-wrap">
                    <input id="handoff-input" type="text" placeholder="Ej: hablar con humano" value={handoffInput}
                      onChange={e => setHandoffInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag('handoff_triggers', handoffInput, setHandoffInput))} />
                    <button type="button" className="btn-outline btn-sm" onClick={() => addTag('handoff_triggers', handoffInput, setHandoffInput)}>
                      Añadir
                    </button>
                  </div>
                  <div className="tags-list">
                    {form.handoff_triggers.map((t, i) => (
                      <span key={i} className="tag tag-warning">
                        {t} <button type="button" onClick={() => removeTag('handoff_triggers', i)}><X size={10} /></button>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label>Mensaje de Fallback</label>
                  <input id="fallback-msg" type="text" value={form.fallback_message} onChange={e => setForm({ ...form, fallback_message: e.target.value })} />
                </div>
              </div>

              {/* Sección: Filtros de Destinatarios */}
              <div className="glass-card settings-section">
                <h2 className="section-title">Filtros de Destinatarios (Privacidad)</h2>
                
                <div className="form-group">
                  <div className="settings-toggle-row flex items-center justify-between p-3 rounded-lg border border-white-05 bg-white-02 mb-3" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <div className="toggle-info">
                      <span className="toggle-title" style={{ fontWeight: '600', fontSize: '0.9rem', display: 'block', color: 'var(--text-1)' }}>Responder a Contactos Guardados</span>
                      <span className="toggle-description" style={{ fontSize: '0.75rem', color: 'var(--text-2)' }}>El bot responderá a los números registrados en tu agenda telefónica de WhatsApp.</span>
                    </div>
                    <button
                      type="button"
                      className={`toggle-switch ${form.respond_saved_contacts ? 'on' : ''}`}
                      onClick={() => setForm(prev => ({ ...prev, respond_saved_contacts: !prev.respond_saved_contacts }))}
                    >
                      <span className="toggle-knob" />
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label>Qué hacer con números NO guardados</label>
                  <small>Define la acción a tomar si escribe un número desconocido.</small>
                  <select
                    id="select-unsaved-action"
                    value={form.unsaved_contacts_action}
                    onChange={e => setForm({ ...form, unsaved_contacts_action: e.target.value })}
                  >
                    <option value="respond">Responder normalmente con Inteligencia Artificial</option>
                    <option value="ignore">Ignorar y no responder (No hacer nada)</option>
                    <option value="fallback">Responder con el mensaje de Fallback / Bienvenida</option>
                  </select>
                </div>
              </div>

              <button id="btn-save-settings" type="submit" className="btn-primary btn-block" disabled={saving}>
                {saving ? <><Loader2 size={16} className="spin" /> Guardando…</> : <><Save size={16} /> Guardar Configuración</>}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
