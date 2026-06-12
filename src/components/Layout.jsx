import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  LayoutDashboard, Smartphone, Plug, Settings, User,
  MessageSquare, LogOut, Bot, ChevronLeft, ChevronRight, Menu, Sparkles,
  BarChart3, HelpCircle
} from 'lucide-react'

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/numbers', icon: Smartphone, label: 'Números' },
  { to: '/connections', icon: Plug, label: 'Conexiones IA' },
  { to: '/styles', icon: Sparkles, label: 'Estilos IA' },
  { to: '/chats', icon: MessageSquare, label: 'Chats' },
  { to: '/consumption', icon: BarChart3, label: 'Consumo' },
  { to: '/help', icon: HelpCircle, label: 'Ayuda' },
  { to: '/settings', icon: Settings, label: 'Configuración' },
  { to: '/profile', icon: User, label: 'Perfil' },
]

export default function Layout({ children }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)

  async function handleSignOut() {
    await signOut()
    navigate('/auth')
  }

  return (
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand">
            <div className="brand-icon"><Bot size={20} /></div>
            {!collapsed && <span className="brand-name">ZonaWa</span>}
          </div>
          <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/dashboard'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={20} />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          {!collapsed && profile && (
            <div className="user-info">
              <div className="user-avatar">
                {(profile.first_name?.[0] || 'U').toUpperCase()}
              </div>
              <div className="user-meta">
                <p className="user-name">{profile.first_name} {profile.last_name}</p>
                <p className="user-plan">Plan Básico</p>
              </div>
            </div>
          )}
          <button className="nav-item signout-btn" onClick={handleSignOut}>
            <LogOut size={20} />
            {!collapsed && <span>Salir</span>}
          </button>
        </div>
      </aside>

      <main className="main-content">
        {children}
      </main>

      {/* Barra de navegación inferior para pantallas móviles */}
      <nav className="mobile-nav">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/dashboard'}
            className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
          >
            <Icon size={20} />
            <span className="mobile-nav-label">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
