import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/Toast'
import { supabase } from '../../lib/supabase'
import { User, Save, Loader2, Mail, Building, Phone, Globe } from 'lucide-react'

const TIMEZONES = [
  'America/Bogota', 'America/Mexico_City', 'America/Lima', 'America/Santiago',
  'America/New_York', 'America/Los_Angeles', 'Europe/Madrid', 'UTC',
]

export default function Profile() {
  const { user, profile, updateProfile, signOut } = useAuth()
  const { toast } = useToast()
  const [form, setForm] = useState({
    first_name: profile?.first_name || '',
    last_name: profile?.last_name || '',
    phone: profile?.phone || '',
    company_name: profile?.company_name || '',
    timezone: profile?.timezone || 'America/Bogota',
  })
  const [saving, setSaving] = useState(false)

  const up = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await updateProfile(form)
      toast({ message: 'Perfil actualizado correctamente', type: 'success' })
    } catch (err) {
      toast({ message: err.message, type: 'error' })
    } finally { setSaving(false) }
  }

  const initials = ((profile?.first_name?.[0] || '') + (profile?.last_name?.[0] || '')).toUpperCase() || 'U'

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Mi Perfil</h1>
          <p className="page-subtitle">Gestiona tu información personal y preferencias</p>
        </div>
      </div>

      <div className="profile-layout">
        {/* Avatar y resumen */}
        <div className="glass-card profile-card">
          <div className="profile-avatar-lg">{initials}</div>
          <h2 className="profile-display-name">{profile?.first_name} {profile?.last_name}</h2>
          <div className="profile-email-row">
            <Mail size={14} />
            <span>{user?.email}</span>
            <span className="readonly-badge">Solo lectura</span>
          </div>
          <div className="profile-plan-badge">Plan Básico</div>
          <div className="profile-limits">
            <div className="limit-item">
              <span className="limit-label">Números</span>
              <span className="limit-value">0 / 6</span>
            </div>
            <div className="limit-item">
              <span className="limit-label">Bots Activos</span>
              <span className="limit-value">0 / 5</span>
            </div>
          </div>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSave} className="glass-card profile-form-card">
          <h2 className="section-title">Información Personal</h2>

          <div className="form-row">
            <div className="form-group">
              <label><User size={14} /> Nombre</label>
              <input id="profile-first-name" type="text" value={form.first_name} onChange={up('first_name')} required />
            </div>
            <div className="form-group">
              <label>Apellido</label>
              <input id="profile-last-name" type="text" value={form.last_name} onChange={up('last_name')} />
            </div>
          </div>

          <div className="form-group">
            <label><Phone size={14} /> Teléfono de Contacto</label>
            <input id="profile-phone" type="tel" placeholder="+57 300 000 0000" value={form.phone} onChange={up('phone')} />
          </div>

          <div className="form-group">
            <label><Building size={14} /> Empresa</label>
            <input id="profile-company" type="text" placeholder="Nombre de tu empresa" value={form.company_name} onChange={up('company_name')} />
          </div>

          <div className="form-group">
            <label><Globe size={14} /> Zona Horaria</label>
            <select id="profile-timezone" value={form.timezone} onChange={up('timezone')}>
              {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
            <small>Afecta la lógica de horarios de atención del bot</small>
          </div>

          <div className="form-group">
            <label><Mail size={14} /> Correo Electrónico</label>
            <input type="email" value={user?.email} disabled className="input-disabled" />
          </div>

          <div className="profile-actions">
            <button id="btn-save-profile" type="submit" className="btn-primary" disabled={saving}>
              {saving ? <><Loader2 size={16} className="spin" /> Guardando…</> : <><Save size={16} /> Guardar Cambios</>}
            </button>
            <button type="button" className="btn-danger-outline" onClick={signOut}>Cerrar Sesión</button>
          </div>
        </form>
      </div>
    </div>
  )
}
