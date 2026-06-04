import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

export default function LandingPage() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070b14] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  // Redirigir usuarios autenticados al dashboard
  if (user) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <iframe
      src="/landing.html"
      title="Zonadinero Landing Page"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        border: 'none',
        overflow: 'hidden',
        zIndex: 99999
      }}
    />
  )
}
