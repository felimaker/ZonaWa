import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import MetricCard from '../../components/MetricCard'
import { DollarSign, MessageCircle, Bot, Zap, TrendingUp, Clock } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export default function Dashboard() {
  const { user, profile } = useAuth()
  const [stats, setStats] = useState({ cost: 0, messages: 0, activeBots: 0, latency: 0 })
  const [chartData, setChartData] = useState([])
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) { fetchStats(); fetchChart(); fetchActivity() }
  }, [user])

  async function fetchStats() {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()

    const [{ data: usage }, { data: todayMsgs }, { data: bots }] = await Promise.all([
      supabase.from('usage_logs').select('estimated_cost').eq('user_id', user.id).gte('created_at', startOfMonth),
      supabase.from('messages').select('id', { count: 'exact' })
        .eq('sender', 'bot')
        .gte('created_at', today),
      supabase.from('whatsapp_numbers').select('id').eq('user_id', user.id).eq('bot_enabled', true),
    ])

    setStats({
      cost: (usage || []).reduce((s, r) => s + (r.estimated_cost || 0), 0).toFixed(4),
      messages: todayMsgs?.length || 0,
      activeBots: bots?.length || 0,
    })
    setLoading(false)
  }

  async function fetchChart() {
    const days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString()
      const { data } = await supabase.from('usage_logs')
        .select('estimated_cost, tokens_prompt, tokens_completion')
        .eq('user_id', user.id)
        .gte('created_at', start).lt('created_at', end)
      const cost = (data || []).reduce((s, r) => s + (r.estimated_cost || 0), 0)
      const tokens = (data || []).reduce((s, r) => s + (r.tokens_prompt || 0) + (r.tokens_completion || 0), 0)
      days.push({ day: d.toLocaleDateString('es', { weekday: 'short' }), cost: parseFloat(cost.toFixed(4)), tokens })
    }
    setChartData(days)
  }

  async function fetchActivity() {
    const { data } = await supabase
      .from('messages')
      .select('content, created_at, conversations(customer_phone, whatsapp_numbers(display_name))')
      .eq('sender', 'bot')
      .order('created_at', { ascending: false })
      .limit(8)
    setActivity(data || [])
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{greeting}, {profile?.first_name || 'Usuario'} 👋</h1>
          <p className="page-subtitle">Resumen de tu plataforma ZonaWa</p>
        </div>
      </div>

      <div className="metrics-grid">
        <MetricCard icon={DollarSign} label="Costo del Mes" value={`$${stats.cost}`} sub="USD (tokens IA)" color="primary" />
        <MetricCard icon={MessageCircle} label="Mensajes Hoy" value={stats.messages} sub="Respuestas de bots" color="success" />
        <MetricCard icon={Bot} label="Bots Activos" value={`${stats.activeBots} / 5`} sub="Límite del plan" color="warning" />
        <MetricCard icon={Zap} label="Estado General" value="Operativo" sub="Todos los sistemas OK" color="success" />
      </div>

      <div className="dashboard-grid">
        <div className="glass-card chart-card">
          <div className="card-header">
            <TrendingUp size={18} />
            <h2>Consumo de Tokens (7 días)</h2>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" stroke="#4b5563" tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <YAxis stroke="#4b5563" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, color: '#f3f4f6' }}
                formatter={(v) => [`$${v}`, 'Costo USD']}
              />
              <Area type="monotone" dataKey="cost" stroke="#6366f1" fill="url(#costGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card activity-card">
          <div className="card-header">
            <Clock size={18} />
            <h2>Actividad Reciente</h2>
          </div>
          <div className="activity-list">
            {activity.length === 0 && !loading && (
              <p className="empty-state">Sin actividad reciente</p>
            )}
            {activity.map((msg, i) => (
              <div key={i} className="activity-item">
                <div className="activity-dot" />
                <div className="activity-body">
                  <p className="activity-content">{msg.content?.slice(0, 60)}…</p>
                  <span className="activity-meta">
                    {msg.conversations?.whatsapp_numbers?.display_name} · {new Date(msg.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
