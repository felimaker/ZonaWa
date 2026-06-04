import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../components/Toast'
import { Bot, User2, MessageCircle, Loader2, ToggleLeft, ToggleRight } from 'lucide-react'

export default function Chats() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [numbers, setNumbers] = useState([])
  const [selectedNumber, setSelectedNumber] = useState(null)
  const [conversations, setConversations] = useState([])
  const [selectedConv, setSelectedConv] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase.from('whatsapp_numbers').select('id, display_name').eq('user_id', user.id).then(({ data }) => {
      setNumbers(data || [])
      if (data?.length) setSelectedNumber(data[0])
    })
  }, [user])

  useEffect(() => {
    if (selectedNumber) fetchConversations(selectedNumber.id)
  }, [selectedNumber])

  useEffect(() => {
    if (selectedConv) fetchMessages(selectedConv.id)
  }, [selectedConv])

  async function fetchConversations(numberId) {
    setLoading(true)
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .eq('number_id', numberId)
      .order('last_message_at', { ascending: false })
    setConversations(data || [])
    setSelectedConv(data?.[0] || null)
    setLoading(false)
  }

  async function fetchMessages(convId) {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
    setMessages(data || [])
  }

  async function toggleHandoff(conv) {
    const newStatus = conv.status === 'BOT' ? 'HUMAN' : 'BOT'
    const { error } = await supabase.from('conversations').update({ status: newStatus }).eq('id', conv.id)
    if (error) { toast({ message: error.message, type: 'error' }); return }
    setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, status: newStatus } : c))
    if (selectedConv?.id === conv.id) setSelectedConv(prev => ({ ...prev, status: newStatus }))
    toast({ message: newStatus === 'HUMAN' ? 'Bot pausado. Ahora responde manualmente.' : 'Bot reactivado.', type: newStatus === 'HUMAN' ? 'warning' : 'success' })
  }

  return (
    <div className="page page-full">
      <div className="page-header">
        <div>
          <h1 className="page-title">Chats</h1>
          <p className="page-subtitle">Conversaciones activas y control de handoff</p>
        </div>
        <div className="number-tabs">
          {numbers.map(n => (
            <button
              key={n.id}
              className={`number-tab ${selectedNumber?.id === n.id ? 'active' : ''}`}
              onClick={() => setSelectedNumber(n)}
            >{n.display_name}</button>
          ))}
        </div>
      </div>

      <div className="chat-layout">
        {/* Lista de Conversaciones */}
        <div className="chat-list glass-card">
          <h3 className="chat-list-title">Conversaciones</h3>
          {loading ? <div className="loading-state"><Loader2 className="spin" /></div>
            : conversations.length === 0
              ? <p className="empty-state">Sin conversaciones</p>
              : conversations.map(conv => (
                <button
                  key={conv.id}
                  className={`conv-item ${selectedConv?.id === conv.id ? 'active' : ''}`}
                  onClick={() => setSelectedConv(conv)}
                >
                  <div className="conv-avatar">{(conv.customer_name || conv.customer_phone)?.[0]?.toUpperCase()}</div>
                  <div className="conv-meta">
                    <p className="conv-name">{conv.customer_name || conv.customer_phone}</p>
                    <p className="conv-time">{new Date(conv.last_message_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <div className={`handoff-dot ${conv.status === 'HUMAN' ? 'human' : 'bot'}`} title={conv.status} />
                </button>
              ))}
        </div>

        {/* Vista de Mensajes */}
        <div className="chat-messages glass-card">
          {!selectedConv ? (
            <div className="empty-page"><MessageCircle size={48} /><p>Selecciona una conversación</p></div>
          ) : (
            <>
              <div className="chat-header">
                <div>
                  <h3>{selectedConv.customer_name || selectedConv.customer_phone}</h3>
                  <span className={`chat-status-badge ${selectedConv.status === 'HUMAN' ? 'human' : 'bot'}`}>
                    {selectedConv.status === 'HUMAN' ? 'Modo Humano' : 'Modo Bot'}
                  </span>
                </div>
                <button
                  id={`handoff-toggle-${selectedConv.id}`}
                  className={`handoff-btn ${selectedConv.status === 'HUMAN' ? 'active' : ''}`}
                  onClick={() => toggleHandoff(selectedConv)}
                >
                  {selectedConv.status === 'HUMAN' ? <><ToggleRight size={18} /> Reactivar Bot</> : <><ToggleLeft size={18} /> Pausar Bot</>}
                </button>
              </div>

              <div className="messages-list">
                {messages.map((msg, i) => (
                  <div key={i} className={`message-bubble ${msg.sender}`}>
                    <div className="msg-icon">
                      {msg.sender === 'bot' ? <Bot size={14} /> : <User2 size={14} />}
                    </div>
                    <div className="msg-content">
                      <p>{msg.content}</p>
                      <span className="msg-time">{new Date(msg.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                ))}
                {messages.length === 0 && <p className="empty-state">Sin mensajes</p>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
