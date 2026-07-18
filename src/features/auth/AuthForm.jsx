import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../components/Toast'
import { Bot, Eye, EyeOff, ArrowRight, Loader2, KeyRound } from 'lucide-react'

export default function AuthForm() {
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState(() => searchParams.get('mode') || 'login') // 'login' | 'signup' | 'recover' | 'update-password'
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', firstName: '', lastName: '' })
  const { signIn, signUp, signInWithGoogle, resetPassword, updatePassword } = useAuth()
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
      } else if (mode === 'signup') {
        await signUp({ email: form.email, password: form.password, firstName: form.firstName, lastName: form.lastName })
        toast({ message: 'Cuenta creada. Verifica tu correo.', type: 'success' })
        setMode('login')
      } else if (mode === 'recover') {
        await resetPassword(form.email)
        toast({ message: 'Enlace enviado. Revisa tu correo.', type: 'success' })
        setMode('login')
      } else if (mode === 'update-password') {
        await updatePassword(form.password)
        toast({ message: 'Contraseña actualizada. Ya puedes iniciar sesión.', type: 'success' })
        setMode('login')
      }
    } catch (err) {
      toast({ message: err.message || 'Error de autenticación', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleLogin() {
    setLoading(true)
    try {
      await signInWithGoogle()
    } catch (err) {
      toast({ message: err.message || 'Error al iniciar sesión con Google', type: 'error' })
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

        {/* Mostrar pestañas solo en Login y Registro */}
        {(mode === 'login' || mode === 'signup') && (
          <div className="auth-tabs">
            <button className={`auth-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>
              Iniciar Sesión
            </button>
            <button className={`auth-tab ${mode === 'signup' ? 'active' : ''}`} onClick={() => setMode('signup')}>
              Registrarse
            </button>
          </div>
        )}

        {/* Encabezado alternativo en Recuperación / Modificación de Contraseña */}
        {mode === 'recover' && (
          <div className="auth-section-header">
            <h2 className="auth-section-title"><KeyRound size={20} className="inline mr-2" /> Recuperar Contraseña</h2>
            <p className="auth-section-subtitle">Te enviaremos un correo con las instrucciones para restablecer tu contraseña.</p>
          </div>
        )}

        {mode === 'update-password' && (
          <div className="auth-section-header">
            <h2 className="auth-section-title"><KeyRound size={20} className="inline mr-2" /> Nueva Contraseña</h2>
            <p className="auth-section-subtitle">Establece la nueva contraseña para tu cuenta unificada.</p>
          </div>
        )}

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

          {/* Ocultar Email solo en actualización de contraseña */}
          {mode !== 'update-password' && (
            <div className="form-group">
              <label>Correo Electrónico</label>
              <input id="email" type="email" placeholder="tu@email.com" value={form.email} onChange={update('email')} required />
            </div>
          )}

          {/* Ocultar contraseña solo en recuperación */}
          {mode !== 'recover' && (
            <div className="form-group">
              <div className="form-label-row">
                <label>{mode === 'update-password' ? 'Nueva Contraseña' : 'Contraseña'}</label>
                {mode === 'login' && (
                  <button type="button" className="forgot-password-link" onClick={() => setMode('recover')}>
                    ¿Olvidaste tu contraseña?
                  </button>
                )}
              </div>
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
          )}

          <button id="auth-submit" type="submit" className="btn-primary btn-block" disabled={loading}>
            {loading ? (
              <><Loader2 size={18} className="spin" /> Procesando…</>
            ) : mode === 'login' ? (
              <>Ingresar <ArrowRight size={18} /></>
            ) : mode === 'signup' ? (
              <>Crear Cuenta <ArrowRight size={18} /></>
            ) : mode === 'recover' ? (
              <>Enviar Instrucciones <ArrowRight size={18} /></>
            ) : (
              <>Guardar Contraseña <ArrowRight size={18} /></>
            )}
          </button>
        </form>

        {/* Botón de Google OAuth visible en Login y Registro */}
        {(mode === 'login' || mode === 'signup') && (
          <>
            <div className="auth-divider">
              <span>o continuar con</span>
            </div>

            <button type="button" className="btn-secondary btn-block google-login-btn" onClick={handleGoogleLogin} disabled={loading}>
              <svg viewBox="0 0 24 24" width="18" height="18" className="google-icon" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.77c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google
            </button>
          </>
        )}

        {/* Enlace para volver a Iniciar Sesión desde Recuperación */}
        {(mode === 'recover' || mode === 'update-password') && (
          <button type="button" className="auth-back-link" onClick={() => setMode('login')}>
            ← Volver al inicio de sesión
          </button>
        )}
      </div>
    </div>
  )
}
