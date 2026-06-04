import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/Toast'
import { Bot, Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react'

export default function AuthForm() {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', firstName: '', lastName: '' })
  const { signIn, signUp } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()

  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'login') {
        await signIn({ email: form.email, password: form.password })
        navigate('/dashboard')
      } else {
        await signUp({ email: form.email, password: form.password, firstName: form.firstName, lastName: form.lastName })
        toast({ message: 'Cuenta creada. Verifica tu correo.', type: 'success' })
        setMode('login')
      }
    } catch (err) {
      toast({ message: err.message || 'Error de autenticación', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-glow" />
      <div className="auth-card glass-card">
        <div className="auth-brand">
          <div className="brand-icon large"><Bot size={28} /></div>
          <h1 className="auth-title">ZonaWa</h1>
          <p className="auth-subtitle">Gestión inteligente de WhatsApp con IA</p>
        </div>

        <div className="auth-tabs">
          <button className={`auth-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>
            Iniciar Sesión
          </button>
          <button className={`auth-tab ${mode === 'signup' ? 'active' : ''}`} onClick={() => setMode('signup')}>
            Registrarse
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'signup' && (
            <div className="form-row">
              <div className="form-group">
                <label>Nombre</label>
                <input id="firstName" type="text" placeholder="Carlos" value={form.firstName} onChange={update('firstName')} required />
              </div>
              <div className="form-group">
                <label>Apellido</label>
                <input id="lastName" type="text" placeholder="García" value={form.lastName} onChange={update('lastName')} required />
              </div>
            </div>
          )}

          <div className="form-group">
            <label>Correo Electrónico</label>
            <input id="email" type="email" placeholder="tu@email.com" value={form.email} onChange={update('email')} required />
          </div>

          <div className="form-group">
            <label>Contraseña</label>
            <div className="input-with-icon">
              <input
                id="password"
                type={showPass ? 'text' : 'password'}
                placeholder="••••••••"
                value={form.password}
                onChange={update('password')}
                required
                minLength={6}
              />
              <button type="button" className="input-icon-btn" onClick={() => setShowPass(!showPass)}>
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button id="auth-submit" type="submit" className="btn-primary btn-block" disabled={loading}>
            {loading
              ? <><Loader2 size={18} className="spin" /> Procesando…</>
              : <>{mode === 'login' ? 'Ingresar' : 'Crear Cuenta'} <ArrowRight size={18} /></>
            }
          </button>
        </form>
      </div>
    </div>
  )
}
