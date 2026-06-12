import { useEffect, useState, useRef } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../components/Toast'
import { sendTextMessage } from '../../lib/evolution'
import { Bot, User2, MessageCircle, Loader2, ToggleLeft, ToggleRight, Send } from 'lucide-react'

export default function Chats() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [numbers, setNumbers] = useState([])
  const [selectedNumber, setSelectedNumber] = useState(null)
  const [conversations, setConversations] = useState([])
  const [selectedConv, setSelectedConv] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    if (!user) return
    supabase
      .from('whatsapp_numbers')
      .select('id, display_name, session_name')
      .eq('user_id', user.id)
      .then(({ data, error }) => {
        if (error) {
          console.error('Error fetching numbers:', error)
          toast({ message: 'Error al cargar números: ' + error.message, type: 'error' })
          return
        }
        setNumbers(data || [])
        if (data?.length) setSelectedNumber(data[0])
      })
  }, [user])

  // Realtime subscription for Conversations
  useEffect(() => {
    if (!selectedNumber) return

    fetchConversations(selectedNumber.id)

    const channelConvs = supabase
      .channel(`convs-${selectedNumber.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'conversations',
        filter: `number_id=eq.${selectedNumber.id}`
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setConversations(prev => {
            if (prev.some(c => c.id === payload.new.id)) return prev
            return [payload.new, ...prev].sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at))
          })
        } else if (payload.eventType === 'UPDATE') {
          setConversations(prev => {
            return prev.map(c => c.id === payload.new.id ? { ...c, ...payload.new } : c)
              .sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at))
          })
          setSelectedConv(prev => {
            if (prev?.id === payload.new.id) {
              return { ...prev, ...payload.new }
            }
            return prev
          })
        } else if (payload.eventType === 'DELETE') {
          setConversations(prev => prev.filter(c => c.id === payload.old.id))
          setSelectedConv(prev => prev?.id === payload.old.id ? null : prev)
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channelConvs)
    }
  }, [selectedNumber])

  // Realtime subscription for Messages & Fetch messages
  useEffect(() => {
    if (!selectedConv) {
      setMessages([])
      return
    }

    fetchMessages(selectedConv.id)

    const channelMessages = supabase
      .channel(`msgs-${selectedConv.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${selectedConv.id}`
      }, (payload) => {
        setMessages(prev => {
          if (prev.some(m => m.id === payload.new.id || (payload.new.whatsapp_message_id && m.whatsapp_message_id === payload.new.whatsapp_message_id))) {
            return prev
          }
          return [...prev, payload.new]
        })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channelMessages)
    }
  }, [selectedConv])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function fetchConversations(numberId) {
    setLoading(true)
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('number_id', numberId)
      .order('last_message_at', { ascending: false })
      
    if (error) {
      console.error('Error fetching conversations:', error)
      toast({ message: 'Error al obtener chats: ' + error.message, type: 'error' })
      setLoading(false)
      return
    }
    
    setConversations(data || [])
    setSelectedConv(data?.[0] || null)
    setLoading(false)
  }

  async function fetchMessages(convId) {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      
    if (error) {
      console.error('Error fetching messages:', error)
      toast({ message: 'Error al obtener mensajes: ' + error.message, type: 'error' })
      return
    }
    setMessages(data || [])
  }

  async function toggleHandoff(conv) {
    const newStatus = conv.status === 'BOT' ? 'HUMAN' : 'BOT'
    const { error } = await supabase.from('conversations').update({ status: newStatus }).eq('id', conv.id)
    if (error) {
      toast({ message: error.message, type: 'error' })
      return
    }
    
    // Updates are handled by realtime payload, but updating local state is good as fallback
    setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, status: newStatus } : c))
    if (selectedConv?.id === conv.id) setSelectedConv(prev => ({ ...prev, status: newStatus }))
    toast({ message: newStatus === 'HUMAN' ? 'Bot pausado. Ahora responde manualmente.' : 'Bot reactivado.', type: newStatus === 'HUMAN' ? 'warning' : 'success' })
  }

  async function handleSendMessage(e) {
    e.preventDefault()
    if (!newMessage.trim() || !selectedConv || !selectedNumber) return

    setSending(true)
    const textToSend = newMessage.trim()
    try {
      // 1. Send via Evolution API
      const evoRes = await sendTextMessage(selectedNumber.session_name, selectedConv.customer_phone, textToSend)
      const whatsappMsgId = evoRes?.key?.id || null

      // 2. Insert message into Supabase messages table
      const { data: insertedMsg, error: insertErr } = await supabase
        .from('messages')
        .insert({
          conversation_id: selectedConv.id,
          sender: 'agent',
          content: textToSend,
          whatsapp_message_id: whatsappMsgId
        })
        .select()
        .single()

      if (insertErr) throw insertErr

      // 3. Clear text input
      setNewMessage('')

      // 4. Update state locally
      setMessages(prev => {
        if (prev.some(m => m.id === insertedMsg.id)) return prev
        return [...prev, insertedMsg]
      })

      // 5. Check configuration to pause bot if required
      const { data: botConfig } = await supabase
        .from('bot_configurations')
        .select('continue_ai_after_manual')
        .eq('number_id', selectedNumber.id)
        .maybeSingle()

      const continueAi = botConfig?.continue_ai_after_manual || false
      const newStatus = continueAi ? 'BOT' : 'HUMAN'

      if (selectedConv.status !== newStatus) {
        await supabase
          .from('conversations')
          .update({ status: newStatus })
          .eq('id', selectedConv.id)

        setSelectedConv(prev => ({ ...prev, status: newStatus }))
        setConversations(prev => prev.map(c => c.id === selectedConv.id ? { ...c, status: newStatus } : c))
      }

    } catch (err) {
      console.error('Error sending message:', err)
      toast({ message: 'Fallo al enviar mensaje: ' + err.message, type: 'error' })
    } finally {
      setSending(false)
    }
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
                      {msg.sender === 'bot' ? <Bot size={14} />
                        : msg.sender === 'agent' ? <User2 size={14} style={{ color: 'var(--success)' }} />
                        : <User2 size={14} />}
                    </div>
                    <div className="msg-content">
                      <p>{msg.content}</p>
                      <span className="msg-time">{new Date(msg.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                ))}
                {messages.length === 0 && <p className="empty-state">Sin mensajes</p>}
                <div ref={messagesEndRef} />
              </div>

              {/* Formulario de Envío de Mensaje Manual */}
              <form onSubmit={handleSendMessage} className="chat-input-form">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Escribe un mensaje manual..."
                  disabled={sending}
                  autoComplete="off"
                />
                <button type="submit" className="btn-primary" disabled={sending || !newMessage.trim()}>
                  {sending ? <Loader2 className="spin" size={16} /> : <><Send size={16} /> Enviar</>}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
