import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../components/Toast'
import Modal from '../../components/Modal'
import { Plus, Plug, Trash2, CheckCircle, XCircle, Loader2, Eye, EyeOff } from 'lucide-react'

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI', color: '#10a37f', hint: 'sk-...' },
  { id: 'gemini', label: 'Google Gemini', color: '#4285f4', hint: 'AIza...' },
  { id: 'claude', label: 'Anthropic Claude', color: '#d97706', hint: 'sk-ant-...' },
  { id: 'groq', label: 'Groq', color: '#f43f5e', hint: 'gsk_...' },
]

export default function Connections() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [connections, setConnections] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ provider: 'openai', nickname: '', api_key: '' })
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (user) fetchConnections() }, [user])

  async function fetchConnections() {
    const { data, error } = await supabase
      .from('ai_connections')
      .select('id, provider, nickname, is_active, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (error) toast({ message: error.message, type: 'error' })
    else setConnections(data || [])
    setLoading(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const { error } = await supabase.from('ai_connections').insert({
        user_id: user.id,
        provider: form.provider,
        nickname: form.nickname,
        api_key: form.api_key, // In production: encrypted via Edge Function
        is_active: true,
      })
      if (error) throw error
      toast({ message: 'Conexión de IA guardada correctamente', type: 'success' })
      setModal(false)
      setForm({ provider: 'openai', nickname: '', api_key: '' })
      fetchConnections()
    } catch (err) {
      toast({ message: err.message, type: 'error' })
    } finally { setSaving(false) }
  }

  async function handleToggleActive(conn) {
    const { error } = await supabase
      .from('ai_connections')
      .update({ is_active: !conn.is_active })
      .eq('id', conn.id)
    if (error) toast({ message: error.message, type: 'error' })
    else setConnections(prev => prev.map(c => c.id === conn.id ? { ...c, is_active: !c.is_active } : c))
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta conexión de IA? Los bots que la usen dejarán de funcionar.')) return
    const { error } = await supabase.from('ai_connections').delete().eq('id', id)
    if (error) toast({ message: error.message, type: 'error' })
    else setConnections(prev => prev.filter(c => c.id !== id))
  }

  const selectedHint = PROVIDERS.find(p => p.id === form.provider)?.hint || ''

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Conexiones de IA</h1>
          <p className="page-subtitle">Gestiona tus credenciales de proveedores de inteligencia artificial</p>
        </div>
        <button id="btn-add-connection" className="btn-primary" onClick={() => setModal(true)}>
          <Plus size={18} /> Nueva Conexión
        </button>
      </div>

      {loading ? (
        <div className="loading-state"><Loader2 size={32} className="spin" /></div>
      ) : connections.length === 0 ? (
        <div className="empty-page">
          <Plug size={56} />
          <h2>Sin conexiones de IA</h2>
          <p>Agrega tu primer proveedor de IA para activar los bots</p>
          <button className="btn-primary" onClick={() => setModal(true)}><Plus size={18} /> Nueva Conexión</button>
        </div>
      ) : (
        <div className="connections-list">
          {connections.map(conn => {
            const prov = PROVIDERS.find(p => p.id === conn.provider)
            return (
              <div key={conn.id} className="connection-card glass-card">
                <div className="conn-left">
                  <div className="provider-badge" style={{ background: prov?.color + '22', color: prov?.color }}>
                    {prov?.label || conn.provider}
                  </div>
                  <div>
                    <h3 className="conn-name">{conn.nickname}</h3>
                    <p className="conn-key">API Key: ••••••••••••••••</p>
                    <p className="conn-date">Agregada {new Date(conn.created_at).toLocaleDateString('es')}</p>
                  </div>
                </div>
                <div className="conn-actions">
                  <div className={`status-pill ${conn.is_active ? 'active' : 'inactive'}`}>
                    {conn.is_active ? <CheckCircle size={14} /> : <XCircle size={14} />}
                    {conn.is_active ? 'Activa' : 'Inactiva'}
                  </div>
                  <button
                    id={`toggle-conn-${conn.id}`}
                    className="btn-outline btn-sm"
                    onClick={() => handleToggleActive(conn)}
                  >
                    {conn.is_active ? 'Desactivar' : 'Activar'}
                  </button>
                  <button id={`delete-conn-${conn.id}`} className="icon-btn danger" onClick={() => handleDelete(conn.id)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Nueva Conexión de IA">
        <form onSubmit={handleSave} className="modal-form">
          <div className="form-group">
            <label>Proveedor de IA</label>
            <div className="provider-selector">
              {PROVIDERS.map(p => (
                <button
                  key={p.id}
                  type="button"
                  id={`provider-${p.id}`}
                  className={`provider-btn ${form.provider === p.id ? 'selected' : ''}`}
                  style={form.provider === p.id ? { borderColor: p.color, color: p.color } : {}}
                  onClick={() => setForm({ ...form, provider: p.id })}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Apodo (Nickname)</label>
            <input id="conn-nickname" type="text" placeholder="Ej: OpenAI Producción" value={form.nickname} onChange={e => setForm({ ...form, nickname: e.target.value })} required />
          </div>

          <div className="form-group">
            <label>API Key</label>
            <div className="input-with-icon">
              <input
                id="conn-api-key"
                type={showKey ? 'text' : 'password'}
                placeholder={selectedHint}
                value={form.api_key}
                onChange={e => setForm({ ...form, api_key: e.target.value })}
                required
              />
              <button type="button" className="input-icon-btn" onClick={() => setShowKey(!showKey)}>
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <small>Tu API Key nunca se muestra en texto plano una vez guardada</small>
          </div>

          <button id="btn-save-connection" type="submit" className="btn-primary btn-block" disabled={saving}>
            {saving ? <><Loader2 size={16} className="spin" /> Guardando…</> : <><Plus size={16} /> Guardar Conexión</>}
          </button>
        </form>
      </Modal>
    </div>
  )
}
