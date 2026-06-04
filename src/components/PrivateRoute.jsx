import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function PrivateRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <span>Cargando ZonaWa…</span>
      </div>
    )
  }

  return user ? children : <Navigate to="/auth" replace />
}
