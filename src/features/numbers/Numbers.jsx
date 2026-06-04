import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { createInstance, getInstanceQR, logoutInstance, setWebhook } from '../../lib/evolution'
import { useToast } from '../../components/Toast'
import Modal from '../../components/Modal'
import { Plus, Smartphone, Wifi, WifiOff, QrCode, Trash2, Loader2, RefreshCw } from 'lucide-react'

const STATUS_CONFIG = {
  CONNECTED:    { label: 'Conectado',    color: 'success', icon: Wifi },
  WAITING_QR:   { label: 'Esperando QR', color: 'warning', icon: QrCode },
  DISCONNECTED: { label: 'Desconectado', color: 'danger',  icon: WifiOff },
  ERROR:        { label: 'Error',        color: 'danger',  icon: WifiOff },
  PAUSED:       { label: 'Pausado',      color: 'warning', icon: WifiOff },
  CREATED:      { label: 'Creado',       color: 'info',    icon: Smartphone },
}

export default function Numbers() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [numbers, setNumbers] = useState([])
  const [loading, setLoading] = useState(true)
  const [addModal, setAddModal] = useState(false)
  const [qrModal, setQrModal] = useState(null) // { id, session_name, qr }
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [togglingId, setTogglingId] = useState(null)

  useEffect(() => {
    if (!user) return
    fetchNumbers()

    // Supabase Realtime: sync status changes reactively
    const channel = supabase
      .channel('whatsapp-status')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'whatsapp_numbers', filter: `user_id=eq.${user.id}` },
        (payload) => setNumbers(prev => prev.map(n => n.id === payload.new.id ? { ...n, ...payload.new } : n))
      ).subscribe()

    return () => supabase.removeChannel(channel)
  }, [user])

  async function fetchNumbers() {
    const { data, error } = await supabase
      .from('whatsapp_numbers')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
    if (error) toast({ message: error.message, type: 'error' })
    else setNumbers(data || [])
    setLoading(false)
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (numbers.length >= 6) {
      toast({ message: 'Límite alcanzado: máximo 6 números.', type: 'warning' }); return
    }
    setCreating(true)
    const sessionName = `zonawa_${user.id.slice(0, 8)}_${Date.now()}`
    try {
      await createInstance(sessionName)
      await setWebhook(sessionName, `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`)
      const { data, error } = await supabase.from('whatsapp_numbers').insert({
        user_id: user.id, display_name: newName, session_name: sessionName, status: 'WAITING_QR',
      }).select().single()
      if (error) throw error
      const qrData = await getInstanceQR(sessionName)
      setNumbers(prev => [{ ...data }, ...prev])
      setQrModal({ id: data.id, session_name: sessionName, qr: qrData.qrcode || qrData.base64 })
      setAddModal(false); setNewName('')
    } catch (err) {
      toast({ message: err.message, type: 'error' })
    } finally { setCreating(false) }
  }

  async function handleToggleBot(number) {
    if (!number.bot_enabled) {
      const activeCount = numbers.filter(n => n.bot_enabled).length
      if (activeCount >= 5) {
        toast({ message: 'Límite excedido: máximo 5 bots activos.', type: 'warning' }); return
      }
    }
    setTogglingId(number.id)
    const { error } = await supabase
      .from('whatsapp_numbers')
      .update({ bot_enabled: !number.bot_enabled })
      .eq('id', number.id)
    if (error) toast({ message: error.message, type: 'error' })
    else setNumbers(prev => prev.map(n => n.id === number.id ? { ...n, bot_enabled: !n.bot_enabled } : n))
    setTogglingId(null)
  }

  async function handleDelete(number) {
    if (!confirm(`¿Eliminar "${number.display_name}"? Esta acción no se puede deshacer.`)) return
    try {
      await logoutInstance(number.session_name)
    } catch (_) {}
    const { error } = await supabase.from('whatsapp_numbers').delete().eq('id', number.id)
    if (error) toast({ message: error.message, type: 'error' })
    else setNumbers(prev => prev.filter(n => n.id !== number.id))
  }

  async function handleShowQR(number) {
    try {
      const data = await getInstanceQR(number.session_name)
      setQrModal({ id: number.id, session_name: number.session_name, qr: data.qrcode || data.base64 })
    } catch (err) {
      toast({ message: 'No se pudo obtener el QR', type: 'error' })
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Números de WhatsApp</h1>
          <p className="page-subtitle">{numbers.length} / 6 registrados · {numbers.filter(n => n.bot_enabled).length} / 5 bots activos</p>
        </div>
        <button id="btn-add-number" className="btn-primary" onClick={() => setAddModal(true)} disabled={numbers.length >= 6}>
          <Plus size={18} /> Agregar Número
        </button>
      </div>

      {loading ? (
        <div className="loading-state"><Loader2 size={32} className="spin" /></div>
      ) : numbers.length === 0 ? (
        <div className="empty-page">
          <Smartphone size={56} />
          <h2>Sin números registrados</h2>
          <p>Agrega tu primer número de WhatsApp para comenzar</p>
          <button className="btn-primary" onClick={() => setAddModal(true)}><Plus size={18} /> Agregar Número</button>
        </div>
      ) : (
        <div className="numbers-grid">
          {numbers.map(number => {
            const cfg = STATUS_CONFIG[number.status] || STATUS_CONFIG.DISCONNECTED
            const StatusIcon = cfg.icon
            return (
              <div key={number.id} className="number-card glass-card">
                <div className="number-card-header">
                  <div className={`status-badge status-${cfg.color}`}>
                    <StatusIcon size={12} />
                    <span>{cfg.label}</span>
                  </div>
                  <button id={`btn-delete-${number.id}`} className="icon-btn danger" onClick={() => handleDelete(number)}>
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="number-card-body">
                  <div className="number-avatar">
                    <Smartphone size={24} />
                  </div>
                  <div>
                    <h3 className="number-name">{number.display_name}</h3>
                    <p className="number-phone">{number.phone_number || 'Sin número asignado'}</p>
                    <p className="number-session">{number.session_name}</p>
                  </div>
                </div>

                <div className="number-card-footer">
                  {number.status === 'WAITING_QR' && (
                    <button id={`btn-qr-${number.id}`} className="btn-outline btn-sm" onClick={() => handleShowQR(number)}>
                      <QrCode size={14} /> Ver QR
                    </button>
                  )}
                  {number.status === 'DISCONNECTED' || number.status === 'ERROR' ? (
                    <button className="btn-outline btn-sm" onClick={() => handleShowQR(number)}>
                      <RefreshCw size={14} /> Reconectar
                    </button>
                  ) : null}

                  <div className="bot-toggle-wrap">
                    <span className="toggle-label">Bot</span>
                    <button
                      id={`toggle-bot-${number.id}`}
                      className={`toggle-switch ${number.bot_enabled ? 'on' : ''}`}
                      onClick={() => handleToggleBot(number)}
                      disabled={togglingId === number.id}
                    >
                      <span className="toggle-knob" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal: Agregar Número */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="Agregar Número de WhatsApp">
        <form onSubmit={handleAdd} className="modal-form">
          <div className="form-group">
            <label>Nombre de la Instancia</label>
            <input id="input-instance-name" type="text" placeholder="Ej: Ventas Principal" value={newName} onChange={e => setNewName(e.target.value)} required />
            <small>Un nombre para identificar este WhatsApp en tu panel</small>
          </div>
          <button id="btn-create-instance" type="submit" className="btn-primary btn-block" disabled={creating}>
            {creating ? <><Loader2 size={16} className="spin" /> Creando instancia…</> : <><Plus size={16} /> Crear y Generar QR</>}
          </button>
        </form>
      </Modal>

      {/* Modal: QR Code */}
      <Modal open={!!qrModal} onClose={() => setQrModal(null)} title="Escanea el Código QR" size="sm">
        <div className="qr-modal-body">
          <p className="qr-instructions">Abre WhatsApp → Dispositivos Vinculados → Vincular Dispositivo</p>
          {qrModal?.qr ? (
            <div className="qr-wrapper">
              <img src={qrModal.qr.startsWith('data:') ? qrModal.qr : `data:image/png;base64,${qrModal.qr}`} alt="QR WhatsApp" className="qr-image" />
            </div>
          ) : (
            <div className="qr-placeholder"><Loader2 size={32} className="spin" /><p>Generando QR…</p></div>
          )}
          <div className="qr-status-note">
            <div className="pulse-dot" />
            <span>Esperando escaneo…</span>
          </div>
        </div>
      </Modal>
    </div>
  )
}
