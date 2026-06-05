import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ToastProvider } from './components/Toast'
import PrivateRoute from './components/PrivateRoute'
import Layout from './components/Layout'
import AuthForm from './features/auth/AuthForm'
import LandingPage from './features/landing/LandingPage'
import Dashboard from './features/dashboard/Dashboard'
import Numbers from './features/numbers/Numbers'
import Connections from './features/connections/Connections'
import AgentSettings from './features/settings/AgentSettings'
import Chats from './features/chats/Chats'
import Profile from './features/profile/Profile'
import Styles from './features/styles/Styles'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/auth" element={<AuthForm />} />
            <Route path="/" element={<LandingPage />} />
            <Route path="/dashboard" element={
              <PrivateRoute>
                <Layout><Dashboard /></Layout>
              </PrivateRoute>
            } />
            <Route path="/numbers" element={
              <PrivateRoute>
                <Layout><Numbers /></Layout>
              </PrivateRoute>
            } />
            <Route path="/connections" element={
              <PrivateRoute>
                <Layout><Connections /></Layout>
              </PrivateRoute>
            } />
            <Route path="/styles" element={
              <PrivateRoute>
                <Layout><Styles /></Layout>
              </PrivateRoute>
            } />
            <Route path="/settings" element={
              <PrivateRoute>
                <Layout><AgentSettings /></Layout>
              </PrivateRoute>
            } />
            <Route path="/chats" element={
              <PrivateRoute>
                <Layout><Chats /></Layout>
              </PrivateRoute>
            } />
            <Route path="/profile" element={
              <PrivateRoute>
                <Layout><Profile /></Layout>
              </PrivateRoute>
            } />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
