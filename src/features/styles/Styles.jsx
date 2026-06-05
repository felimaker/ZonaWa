import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../components/Toast'
import { Sparkles, Save, Loader2, Plus, Edit, Trash2, ArrowLeft, Sliders, AlertCircle } from 'lucide-react'

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

export default function Styles() {
  const { user } = useAuth()
  const { toast } = useToast()
  
  const [styles, setStyles] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeProviders, setActiveProviders] = useState([])
  
  // State for CRUD flow: editingStyle === null means listing, otherwise represents edit or create mode
  const [isEditing, setIsEditing] = useState(false)
  const [editingStyle, setEditingStyle] = useState(null) // null means new, object means editing
  const [form, setForm] = useState({
    name: '',
    role_prompt: '',
    model: 'gpt-4o-mini',
    rules: [],
    temperature: 0.7,
    max_tokens: 300
  })

  useEffect(() => {
    if (user) {
      fetchStyles()
      fetchActiveProviders()
    }
  }, [user])

  async function fetchStyles() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      setStyles(data || [])
    } catch (err) {
      toast({ message: `Error al cargar estilos: ${err.message}`, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  async function fetchActiveProviders() {
    try {
      const { data } = await supabase
        .from('ai_connections')
        .select('provider')
        .eq('user_id', user.id)
        .eq('is_active', true)
      
      const providers = data ? data.map(d => d.provider) : []
      setActiveProviders(providers)
    } catch (err) {
      console.error('Error fetching active providers:', err)
    }
  }

  const handleEdit = (style) => {
    setEditingStyle(style)
    setForm({
      name: style.name || '',
      role_prompt: style.role_prompt || '',
      model: style.model || 'gpt-4o-mini',
      rules: style.rules || [],
      temperature: style.temperature || 0.7,
      max_tokens: style.max_tokens || 300
    })
    setIsEditing(true)
  }

  const handleCreateNew = () => {
    setEditingStyle(null)
    
    // Choose a default model that matches their active providers if possible
    let defaultModel = 'gpt-4o-mini'
    if (activeProviders.length > 0) {
      const firstProv = activeProviders[0]
      if (PROVIDER_MODELS[firstProv] && PROVIDER_MODELS[firstProv].length > 0) {
        defaultModel = PROVIDER_MODELS[firstProv][0].id
      }
    }

    setForm({
      name: '',
      role_prompt: '',
      model: defaultModel,
      rules: [],
      temperature: 0.7,
      max_tokens: 300
    })
    setIsEditing(true)
  }

  const handleDelete = async (style) => {
    if (!confirm(`¿Eliminar el estilo "${style.name}"? Esta acción no se puede deshacer y desvinculará los bots que lo utilicen.`)) return
    
    try {
      const { error } = await supabase
        .from('agents')
        .delete()
        .eq('id', style.id)
      
      if (error) throw error
      toast({ message: 'Estilo eliminado correctamente', type: 'success' })
      fetchStyles()
    } catch (err) {
      toast({ message: `Error al eliminar estilo: ${err.message}`, type: 'error' })
    }
  }

  const toggleRule = (ruleKey) => {
    setForm(prev => {
      const currentRules = prev.rules || []
      const nextRules = currentRules.includes(ruleKey)
        ? currentRules.filter(r => r !== ruleKey)
        : [...currentRules, ruleKey]
      return { ...prev, rules: nextRules }
    })
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.name.trim() || !form.role_prompt.trim()) {
      toast({ message: 'Por favor, completa los campos requeridos.', type: 'warning' })
      return
    }

    setSaving(true)
    try {
      const payload = {
        user_id: user.id,
        name: form.name,
        role_prompt: form.role_prompt,
        model: form.model,
        rules: form.rules,
        temperature: parseFloat(form.temperature),
        max_tokens: parseInt(form.max_tokens)
      }

      if (editingStyle) {
        // Update
        const { error } = await supabase
          .from('agents')
          .update(payload)
          .eq('id', editingStyle.id)
        if (error) throw error
        toast({ message: 'Estilo actualizado correctamente.', type: 'success' })
      } else {
        // Insert
        const { error } = await supabase
          .from('agents')
          .insert(payload)
        if (error) throw error
        toast({ message: 'Nuevo Estilo creado correctamente.', type: 'success' })
      }
      setIsEditing(false)
      fetchStyles()
    } catch (err) {
      toast({ message: `Error al guardar estilo: ${err.message}`, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  // Helper to compile the list of selectable models
  const getSelectableModels = () => {
    // If user has active connections, show models of active providers
    if (activeProviders.length > 0) {
      return activeProviders.flatMap(p => PROVIDER_MODELS[p] || [])
    }
    // Fallback: show all models across all providers
    return Object.values(PROVIDER_MODELS).flat()
  }

  return (
    <div className="page">
      {isEditing ? (
        // FORMULARIO DE EDICIÓN / DETALLES INLINE
        <>
          <div className="page-header" style={{ marginBottom: '16px' }}>
            <div>
              <button 
                className="btn-outline btn-sm" 
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}
                onClick={() => setIsEditing(false)}
              >
                <ArrowLeft size={14} /> Volver a los Estilos
              </button>
              <h1 className="page-title">{editingStyle ? `Editar Estilo: ${editingStyle.name}` : 'Crear Nuevo Estilo IA'}</h1>
              <p className="page-subtitle">Configura los parámetros, reglas rápidas y comportamiento de respuesta de la IA</p>
            </div>
          </div>

          <form onSubmit={handleSave} className="settings-form" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Identidad del Estilo */}
            <div className="glass-card settings-section" style={{ padding: '20px' }}>
              <h2 className="section-title">Identidad del Estilo</h2>
              <div className="form-group">
                <label>Nombre del Estilo</label>
                <input
                  type="text"
                  placeholder="Ej: Estilo Comercial, Soporte Formal, Ventas Directo"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Instrucciones de Comportamiento (System Prompt)</label>
                <textarea
                  rows={6}
                  placeholder="Eres un agente virtual de ventas..."
                  value={form.role_prompt}
                  onChange={e => setForm({ ...form, role_prompt: e.target.value })}
                  required
                />
              </div>
            </div>

            {/* Proveedor y Modelo de IA */}
            <div className="glass-card settings-section" style={{ padding: '20px' }}>
              <h2 className="section-title">Proveedor y Modelo de IA</h2>
              <div className="form-group">
                <label>Modelo de IA</label>
                <select
                  value={form.model}
                  onChange={e => setForm({ ...form, model: e.target.value })}
                  required
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                >
                  {getSelectableModels().map(m => (
                    <option key={m.id} value={m.id}>{m.label} ({m.id})</option>
                  ))}
                </select>
                {activeProviders.length === 0 && (
                  <small className="warn-text" style={{ marginTop: '6px', display: 'block' }}>
                    ⚠ No tienes conexiones de IA activas en tu panel. Ve a "Conexiones IA" para configurar tus API Keys.
                  </small>
                )}
              </div>
            </div>

            {/* Reglas de Comportamiento (Instrucciones Rápidas) */}
            <div className="glass-card settings-section" style={{ padding: '20px' }}>
              <h2 className="section-title">Reglas del Bot (Instrucciones Rápidas)</h2>
              <small className="section-desc" style={{ color: 'var(--text-3)', display: 'block', marginBottom: '10px' }}>
                Define las pautas de interacción para controlar y pulir la salida del bot en la conversación.
              </small>
              <div className="rules-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginTop: '10px' }}>
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

            {/* Parámetros del Modelo */}
            <div className="glass-card settings-section" style={{ padding: '20px' }}>
              <h2 className="section-title">Parámetros del Modelo</h2>
              <div className="form-row">
                <div className="form-group">
                  <label>Temperatura: <strong>{form.temperature}</strong></label>
                  <input
                    type="range"
                    min="0"
                    max="1.2"
                    step="0.1"
                    value={form.temperature}
                    onChange={e => setForm({ ...form, temperature: e.target.value })}
                    style={{ accentColor: 'var(--primary)', cursor: 'pointer' }}
                  />
                  <div className="range-labels"><span>Preciso</span><span>Creativo</span></div>
                </div>
                <div className="form-group">
                  <label>Tokens Máximos</label>
                  <input
                    type="number"
                    min="100"
                    max="4000"
                    value={form.max_tokens}
                    onChange={e => setForm({ ...form, max_tokens: e.target.value })}
                  />
                  <small style={{ color: 'var(--text-3)', fontSize: '0.72rem', display: 'block', marginTop: '2px' }}>
                    💡 Configuración recomendada: 300–500 tokens para respuestas breves en chat.
                  </small>
                </div>
              </div>
            </div>

            {/* Botones de Guardar / Cancelar */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={saving}>
                {saving ? <><Loader2 size={16} className="spin" /> Guardando…</> : <><Save size={16} /> Guardar Estilo</>}
              </button>
              <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={() => setIsEditing(false)}>
                Cancelar
              </button>
            </div>

          </form>
        </>
      ) : (
        // VISTA PRINCIPAL: LISTADO DE ESTILOS
        <>
          <div className="page-header">
            <div>
              <h1 className="page-title">Estilos IA</h1>
              <p className="page-subtitle">Crea y administra estilos de respuesta de IA reutilizables para tus números de WhatsApp</p>
            </div>
            <button className="btn-primary" onClick={handleCreateNew}>
              <Plus size={18} /> Crear Estilo
            </button>
          </div>

          {loading ? (
            <div className="loading-state"><Loader2 size={32} className="spin" /></div>
          ) : styles.length === 0 ? (
            <div className="empty-page">
              <Sparkles size={56} style={{ color: 'var(--warning)', opacity: 0.6 }} />
              <h2>No hay estilos configurados</h2>
              <p>Crea tu primer estilo de IA para personalizar la personalidad de respuesta de tus bots.</p>
              <button className="btn-primary" onClick={handleCreateNew}>
                <Plus size={18} /> Crear Estilo
              </button>
            </div>
          ) : (
            <div className="numbers-grid">
              {styles.map(style => (
                <div key={style.id} className="number-card glass-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '14px', justifyContent: 'space-between' }}>
                  
                  {/* Cabecera de la tarjeta */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3 className="number-name" style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-1)' }}>{style.name}</h3>
                      <span className="provider-badge" style={{ fontSize: '0.68rem', background: 'rgba(255,255,255,0.05)', color: 'var(--text-2)', padding: '2px 6px', borderRadius: '4px', marginTop: '4px', display: 'inline-block' }}>
                        Modelo: {style.model}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="icon-btn" onClick={() => handleEdit(style)}>
                        <Edit size={16} />
                      </button>
                      <button className="icon-btn danger" onClick={() => handleDelete(style)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Prompt Resumen */}
                  <div style={{ flex: '1 0 auto' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', fontWeight: '600', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                      System Prompt
                    </span>
                    <p style={{
                      fontSize: '0.8rem',
                      color: 'var(--text-2)',
                      margin: 0,
                      lineHeight: '1.4',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      lineClamp: 3,
                      overflow: 'hidden',
                      height: '3.6em' // fixes height for alignment
                    }}>
                      {style.role_prompt}
                    </p>
                  </div>

                  {/* Parámetros */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.15)', padding: '8px 12px', borderRadius: '6px', fontSize: '0.75rem', border: '1px solid rgba(255,255,255,0.02)' }}>
                    <div>
                      <span style={{ color: 'var(--text-3)' }}>Temp:</span> <strong style={{ color: 'var(--text-1)' }}>{style.temperature}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-3)' }}>Max Tokens:</span> <strong style={{ color: 'var(--text-1)' }}>{style.max_tokens}</strong>
                    </div>
                  </div>

                  {/* Reglas Activas */}
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', fontWeight: '600', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                      Reglas Activas ({style.rules?.length || 0})
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {style.rules?.length > 0 ? (
                        style.rules.map(rk => {
                          const r = AVAILABLE_RULES.find(rule => rule.key === rk)
                          return (
                            <span key={rk} className="tag tag-primary" style={{ fontSize: '0.62rem', padding: '2px 6px' }}>
                              {r?.label || rk}
                            </span>
                          )
                        })
                      ) : (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', fontStyle: 'italic' }}>Sin reglas activas</span>
                      )}
                    </div>
                  </div>

                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
