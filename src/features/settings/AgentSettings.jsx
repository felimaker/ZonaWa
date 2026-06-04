import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../components/Toast'
import { Settings, Save, Loader2, Sliders, Tag, X } from 'lucide-react'

export default function AgentSettings() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [numbers, setNumbers] = useState([])
  const [connections, setConnections] = useState([])
  const [selectedNumber, setSelectedNumber] = useState('')
  const [config, setConfig] = useState(null)
  const [form, setForm] = useState({
    name: '', role_prompt: '', temperature: 0.7, max_tokens: 500,
    connection_id: '', triggers: [], handoff_triggers: ['humano', 'asesor', 'soporte'],
    fallback_message: 'Lo siento, no pude procesar tu solicitud.',
  })
  const [triggerInput, setTriggerInput] = useState('')
  const [handoffInput, setHandoffInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase.from('whatsapp_numbers').select('id, display_name, phone_number').eq('user_id', user.id).then(({ data }) => setNumbers(data || []))
    supabase.from('ai_connections').select('id, nickname, provider').eq('user_id', user.id).eq('is_active', true).then(({ data }) => setConnections(data || []))
  }, [user])

  useEffect(() => {
    if (selectedNumber) loadConfig(selectedNumber)
  }, [selectedNumber])

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
        temperature: data.agents?.temperature || 0.7,
        max_tokens: data.agents?.max_tokens || 500,
        connection_id: data.connection_id || '',
        triggers: data.triggers || [],
        handoff_triggers: data.handoff_triggers || ['humano', 'asesor', 'soporte'],
        fallback_message: data.fallback_message || '',
      })
    } else {
      setConfig(null)
      setForm({
        name: '', role_prompt: '', temperature: 0.7, max_tokens: 500,
        connection_id: '', triggers: [], handoff_triggers: ['humano', 'asesor', 'soporte'],
        fallback_message: 'Lo siento, no pude procesar tu solicitud.',
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
              </div>

              {/* Sección: Disparadores */}
              <div className="glass-card settings-section">
                <h2 className="section-title"><Tag size={16} /> Disparadores (Triggers)</h2>
                <div className="form-group">
                  <label>Palabras clave de activación</label>
                  <small>Si está vacío, el bot responde a todos los mensajes</small>
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
