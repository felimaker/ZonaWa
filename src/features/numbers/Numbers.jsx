import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { createInstance, getInstanceQR, logoutInstance, setWebhook, getConnectionState, sendTextMessage } from '../../lib/evolution'
import { useToast } from '../../components/Toast'
import Modal from '../../components/Modal'
import {
  Plus, Smartphone, Wifi, WifiOff, QrCode, Trash2, Loader2, RefreshCw,
  AlertCircle, Save, ArrowLeft, ArrowRight, Sparkles, Sliders, User, Tag,
  Lock, Settings, Key, Check, X, Activity, Send
} from 'lucide-react'

const STATUS_CONFIG = {
  CONNECTED:    { label: 'Conectado',    color: 'success', icon: Wifi },
  WAITING_QR:   { label: 'Esperando QR', color: 'warning', icon: QrCode },
  DISCONNECTED: { label: 'Desconectado', color: 'danger',  icon: WifiOff },
  ERROR:        { label: 'Error',        color: 'danger',  icon: WifiOff },
  PAUSED:       { label: 'Pausado',      color: 'warning', icon: WifiOff },
  CREATED:      { label: 'Creado',       color: 'info',    icon: Smartphone },
}

const PROVIDER_MODELS = {
  openai: [
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { id: 'gpt-4o', label: 'GPT-4o' }
  ],
  claude: [
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { id: 'claude-opus-4-7', label: 'Claude Opus 4.7' }
  ],
  gemini: [
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' }
  ],
  groq: [
    { id: 'llama3-8b-8192', label: 'Llama 3 8B' },
    { id: 'llama3-70b-8192', label: 'Llama 3 70B' }
  ],
  deepseek: [
    { id: 'deepseek-chat', label: 'DeepSeek Chat' }
  ],
  openrouter: [
    { id: 'meta-llama/llama-3.1-8b-instruct:free', label: 'Llama 3.1 8B Free' },
    { id: 'google/gemma-2-9b-it:free', label: 'Gemma 2 9B Free' }
  ]
}

const AVAILABLE_RULES = [
  { key: 'short_clear', label: 'Responde corto y claro', desc: 'El bot será conciso, directo al grano y evitará respuestas extensas.' },
  { key: 'max_3_lines', label: 'Máximo 3 líneas', desc: 'Limita respuestas a un máximo de 3 líneas salvo que pidan detalle.' },
  { key: 'short_questions', label: 'Haz preguntas cortas', desc: 'Fórmula preguntas breves para guiar al cliente de forma interactiva.' },
  { key: 'avoid_repetition', label: 'Evita repetir información', desc: 'No repetirá explicaciones o respuestas previas.' },
  { key: 'natural_tone', label: 'Mantén tono natural', desc: 'Conversación amigable, humana y fluida.' },
  { key: 'ask_if_missing', label: 'Pregunta si falta información', desc: 'Si hay dudas o consultas incompletas, indagará antes de responder.' }
]

function mapEvolutionStateToDbStatus(stateRes) {
  const state = (
    stateRes?.instance?.state || 
    stateRes?.instance?.status || 
    stateRes?.connectionStatus || 
    stateRes?.status || 
    ''
  ).toLowerCase()
  
  if (state === 'open' || state === 'connected') {
    return 'CONNECTED'
  }
  if (state === 'connecting') {
    return 'WAITING_QR'
  }
  return 'DISCONNECTED'
}

export default function Numbers() {
  const { user } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  
  const [numbers, setNumbers] = useState([])
  const [loading, setLoading] = useState(true)
  
  // Realtime active status toggles
  const [togglingId, setTogglingId] = useState(null)
  const [qrModal, setQrModal] = useState(null) // { id, session_name, qr }
  
  // Validation modal (before toggling bot)
  const [validationModal, setValidationModal] = useState({ open: false, errors: [], number: null })
  
  // Onboarding Wizard Modal state
  const [onboardingModal, setOnboardingModal] = useState(false)
  const [onboardingStep, setOnboardingStep] = useState(1)
  const [onboardingNumberId, setOnboardingNumberId] = useState(null) // null means creating new
  const [onboardingConfig, setOnboardingConfig] = useState(null)
  
  // Onboarding Step 1: Instance Data
  const [instanceDisplayName, setInstanceDisplayName] = useState('')
  const [instanceSessionName, setInstanceSessionName] = useState('')
  const [instanceStatus, setInstanceStatus] = useState('CREATED')
  const [qrCode, setQrCode] = useState('')
  const [creatingInstanceLoader, setCreatingInstanceLoader] = useState(false)
  const [loadingQrLoader, setLoadingQrLoader] = useState(false)
  
  // Onboarding Step 2: AI Connections
  const [connections, setConnections] = useState([])
  const [selectedConnId, setSelectedConnId] = useState('')
  
  // Onboarding Step 2: Add inline AI connection
  const [showNewConnForm, setShowNewConnForm] = useState(false)
  const [newConnProvider, setNewConnProvider] = useState('openai')
  const [newConnNickname, setNewConnNickname] = useState('')
  const [newConnApiKey, setNewConnApiKey] = useState('')
  const [creatingConn, setCreatingConn] = useState(false)
  const [traffic, setTraffic] = useState({})
  
  // Details Modal state
  const [detailsModal, setDetailsModal] = useState(false)
  const [detailsNumber, setDetailsNumber] = useState(null)
  const [detailsConversations, setDetailsConversations] = useState([])
  const [detailsAuditLogs, setDetailsAuditLogs] = useState([])
  const [detailsMetrics, setDetailsMetrics] = useState({ clientMsgs: 0, botMsgs: 0, totalMsgs: 0, promptTokens: 0, completionTokens: 0, cost: 0 })
  const [loadingDetails, setLoadingDetails] = useState(false)

  // Chat direct reply state
  const [activeChat, setActiveChat] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)
  
  // Onboarding Step 3: Agent Configuration
  const [agentForm, setAgentForm] = useState({
    name: '',
    role_prompt: '',
    model: '',
    rules: [],
    temperature: 0.7,
    max_tokens: 300,
    trigger_mode: 'all',
    triggers: [],
    handoff_triggers: ['humano', 'asesor', 'soporte'],
    fallback_message: 'Lo siento, no he podido procesar tu solicitud.',
    respond_saved_contacts: true,
    unsaved_contacts_action: 'respond',
    continue_ai_after_manual: false
  })
  const [selectedOnboardingAgentId, setSelectedOnboardingAgentId] = useState('')
  const [triggerInput, setTriggerInput] = useState('')
  const [handoffInput, setHandoffInput] = useState('')
  const [savingOnboarding, setSavingOnboarding] = useState(false)
  
  // Personality Modal state
  const [personalityModal, setPersonalityModal] = useState(false)
  const [personalityNumber, setPersonalityNumber] = useState(null)
  const [personalityConfig, setPersonalityConfig] = useState(null)
  const [savedAgents, setSavedAgents] = useState([])
  const [selectedAgentId, setSelectedAgentId] = useState('') // 'new' or UUID
  const [saveAsNewTemplate, setSaveAsNewTemplate] = useState(false)
  const [personalityForm, setPersonalityForm] = useState({
    name: '',
    role_prompt: '',
    model: '',
    rules: [],
    temperature: 0.7,
    max_tokens: 300
  })
  const [savingPersonality, setSavingPersonality] = useState(false)

  // Fetch numbers and AI connections
  useEffect(() => {
    if (!user) return
    fetchNumbers()
    fetchConnections()

    // Supabase Realtime for whatsapp numbers
    const channel = supabase
      .channel('whatsapp-status')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'whatsapp_numbers', filter: `user_id=eq.${user.id}` },
        (payload) => {
          setNumbers(prev => prev.map(n => n.id === payload.new.id ? { ...n, ...payload.new } : n))
          // Sync onboarding status in real-time if matches active onboarding
          if (onboardingNumberId === payload.new.id) {
            setInstanceStatus(payload.new.status)
          }
        }
      ).subscribe()

    // Supabase Realtime for messages traffic (live monitoring)
    const msgChannel = supabase
      .channel('realtime-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          const { data: conv } = await supabase
            .from('conversations')
            .select('number_id')
            .eq('id', payload.new.conversation_id)
            .single()
          
          if (conv) {
            setTraffic(prev => {
              const current = prev[conv.number_id] || { totalCount: 0, lastMessage: null, pulse: false }
              return {
                ...prev,
                [conv.number_id]: {
                  totalCount: current.totalCount + 1,
                  lastMessage: {
                    content: payload.new.content,
                    sender: payload.new.sender,
                    created_at: payload.new.created_at
                  },
                  pulse: true
                }
              }
            })
            
            // Turn off pulse animation after 1s
            setTimeout(() => {
              setTraffic(prev => {
                const current = prev[conv.number_id]
                if (!current) return prev
                return {
                  ...prev,
                  [conv.number_id]: {
                    ...current,
                    pulse: false
                  }
                }
              })
            }, 1000)
          }
        }
      ).subscribe()

    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(msgChannel)
    }
  }, [user, onboardingNumberId])

  // Active polling for instance connection state
  useEffect(() => {
    let intervalId = null
    const sessionToPoll = qrModal?.session_name || (onboardingModal && onboardingStep === 1 && onboardingNumberId ? instanceSessionName : null)
    const numberId = qrModal?.id || (onboardingModal && onboardingStep === 1 && onboardingNumberId ? onboardingNumberId : null)

    if (sessionToPoll && numberId) {
      const checkConnection = async () => {
        try {
          const stateRes = await getConnectionState(sessionToPoll)
          const dbStatus = mapEvolutionStateToDbStatus(stateRes)

          // Only update if database is out of sync with Evolution API status
          const { data: currentDbNum, error: fetchErr } = await supabase
            .from('whatsapp_numbers')
            .select('status')
            .eq('id', numberId)
            .maybeSingle()

          if (!fetchErr && currentDbNum && currentDbNum.status !== dbStatus) {
            const { data, error } = await supabase
              .from('whatsapp_numbers')
              .update({ status: dbStatus })
              .eq('id', numberId)
              .select()
              .single()

            if (!error && data) {
              setNumbers(prev => prev.map(n => n.id === numberId ? { ...n, status: dbStatus } : n))
              if (onboardingNumberId === numberId) {
                setInstanceStatus(dbStatus)
              }
              if (dbStatus === 'CONNECTED') {
                if (qrModal && qrModal.id === numberId) {
                  setQrModal(null)
                }
                toast({ message: '¡WhatsApp conectado exitosamente!', type: 'success' })
              }
            }
          }
        } catch (err) {
          console.error("Error checking connection state:", err)
        }
      }

      // Run immediately and then every 3 seconds
      checkConnection()
      intervalId = setInterval(checkConnection, 3000)
    }

    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [qrModal, onboardingModal, onboardingStep, onboardingNumberId, instanceSessionName])

  useEffect(() => {
    if (!detailsModal || !detailsNumber) return

    console.log("🔥 [REALTIME] Suscribiéndose a eventos en tiempo real para número ID:", detailsNumber.id)

    const channelAudits = supabase
      .channel(`public:audit_logs:number_id=eq.${detailsNumber.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'audit_logs',
        filter: `number_id=eq.${detailsNumber.id}`
      }, (payload) => {
        console.log("🔥 [REALTIME] Nuevo Log de Auditoría recibido:", payload.new)
        setDetailsAuditLogs(prev => {
          if (prev.some(log => log.id === payload.new.id)) return prev
          return [payload.new, ...prev].slice(0, 10)
        })
      })
      .subscribe((status) => {
        console.log(`🔥 [REALTIME] Canal de auditoría estado: ${status}`)
      })

    const channelConvs = supabase
      .channel(`public:conversations:number_id=eq.${detailsNumber.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversations',
        filter: `number_id=eq.${detailsNumber.id}`
      }, (payload) => {
        console.log("🔥 [REALTIME] Conversación actualizada:", payload.new)
        const updatedConv = payload.new
        setDetailsConversations(prev => prev.map(c => {
          if (c.id === updatedConv.id) {
            return {
              ...c,
              status: updatedConv.status
            }
          }
          return c
        }))
        setActiveChat(chat => {
          if (chat && chat.id === updatedConv.id) {
            return {
              ...chat,
              status: updatedConv.status
            }
          }
          return chat
        })
      })
      .subscribe((status) => {
        console.log(`🔥 [REALTIME] Canal de conversaciones estado: ${status}`)
      })

    const channelMessages = supabase
      .channel('public:messages')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages'
      }, (payload) => {
        console.log("🔥 [REALTIME] Nuevo mensaje detectado:", payload.new)
        const newMsg = payload.new
        
        setDetailsConversations(prev => {
          let updated = false
          const next = prev.map(c => {
            if (c.id === newMsg.conversation_id) {
              updated = true
              const existingMsgs = c.messages || []
              const alreadyExists = existingMsgs.some(m => m.id === newMsg.id || (m.whatsapp_message_id && m.whatsapp_message_id === newMsg.whatsapp_message_id))
              const newMsgs = alreadyExists ? existingMsgs : [...existingMsgs, newMsg]
              
              setActiveChat(chat => {
                if (chat && chat.id === c.id) {
                  const chatMsgs = chat.messages || []
                  const chatAlreadyExists = chatMsgs.some(m => m.id === newMsg.id || (m.whatsapp_message_id && m.whatsapp_message_id === newMsg.whatsapp_message_id))
                  return {
                    ...chat,
                    messages: chatAlreadyExists ? chatMsgs : [...chatMsgs, newMsg]
                  }
                }
                return chat
              })

              return {
                ...c,
                messages: newMsgs,
                lastMessage: newMsg,
                last_message_at: newMsg.created_at
              }
            }
            return c
          })

          if (updated) {
            return next.sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at))
          }
          return prev
        })
      })
      .subscribe((status) => {
        console.log(`🔥 [REALTIME] Canal de mensajes estado: ${status}`)
      })

    return () => {
      console.log("🔥 [REALTIME] Limpiando suscripciones en tiempo real.")
      supabase.removeChannel(channelAudits)
      supabase.removeChannel(channelConvs)
      supabase.removeChannel(channelMessages)
    }
  }, [detailsModal, detailsNumber])

  useEffect(() => {
    if (!selectedConnId || !connections.length) return
    const conn = connections.find(c => c.id === selectedConnId)
    if (conn) {
      const provider = conn.provider
      const allowedModels = PROVIDER_MODELS[provider] || []
      const isValid = allowedModels.some(m => m.id === agentForm.model)
      if (!isValid && allowedModels.length > 0) {
        setAgentForm(prev => ({ ...prev, model: allowedModels[0].id }))
      }
    }
  }, [selectedConnId, connections])

  useEffect(() => {
    if (!personalityModal || !personalityConfig) return
    const conn = connections.find(c => c.id === personalityConfig.connection_id)
    if (conn) {
      const provider = conn.provider
      const allowedModels = PROVIDER_MODELS[provider] || []
      const isValid = allowedModels.some(m => m.id === personalityForm.model)
      if (!isValid && allowedModels.length > 0) {
        setPersonalityForm(prev => ({ ...prev, model: allowedModels[0].id }))
      }
    }
  }, [selectedAgentId, personalityConfig, connections, personalityModal])

  async function fetchTrafficInitial(numbersList) {
    const initialTraffic = {}
    try {
      for (const num of numbersList) {
        // Query exact message count for this number
        const { count } = await supabase
          .from('messages')
          .select('*, conversations!inner(number_id)', { count: 'exact', head: true })
          .eq('conversations.number_id', num.id)
        
        // Query last message for this number
        const { data: lastMsgData } = await supabase
          .from('messages')
          .select('content, sender, created_at, conversations!inner(number_id)')
          .eq('conversations.number_id', num.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        
        initialTraffic[num.id] = {
          totalCount: count || 0,
          lastMessage: lastMsgData ? {
            content: lastMsgData.content,
            sender: lastMsgData.sender,
            created_at: lastMsgData.created_at
          } : null,
          pulse: false
        }
      }
      setTraffic(initialTraffic)
    } catch (err) {
      console.error("Error cargando tráfico inicial:", err)
    }
  }

  // Personality Modal handlers
  async function fetchSavedAgents() {
    if (!user) return
    const { data } = await supabase
      .from('agents')
      .select('*')
      .eq('user_id', user.id)
      .order('name', { ascending: true })
    setSavedAgents(data || [])
  }

  async function openPersonalityModal(number) {
    setPersonalityNumber(number)
    setLoading(true)
    
    // Fetch fresh bot configuration
    const { data: config } = await supabase
      .from('bot_configurations')
      .select('*, agents(*)')
      .eq('number_id', number.id)
      .maybeSingle()
      
    setPersonalityConfig(config)
    await fetchSavedAgents()
    
    if (config) {
      const agent = config.agents
      if (agent) {
        setSelectedAgentId(agent.id)
        setPersonalityForm({
          name: agent.name || '',
          role_prompt: agent.role_prompt || '',
          model: agent.model || '',
          rules: agent.rules || [],
          temperature: agent.temperature || 0.7,
          max_tokens: agent.max_tokens || 300
        })
      } else {
        setSelectedAgentId('new')
        setPersonalityForm({
          name: '',
          role_prompt: '',
          model: '',
          rules: [],
          temperature: 0.7,
          max_tokens: 300
        })
      }
    } else {
      setSelectedAgentId('new')
      setPersonalityForm({
        name: '',
        role_prompt: '',
        model: '',
        rules: [],
        temperature: 0.7,
        max_tokens: 300
      })
    }
    setSaveAsNewTemplate(false)
    setPersonalityModal(true)
    setLoading(false)
  }

  const handleSelectAgentTemplate = (agentId) => {
    setSelectedAgentId(agentId)
    if (agentId === 'new') {
      setPersonalityForm({
        name: '',
        role_prompt: '',
        model: '',
        rules: [],
        temperature: 0.7,
        max_tokens: 300
      })
      setSaveAsNewTemplate(false)
    } else {
      const selected = savedAgents.find(a => a.id === agentId)
      if (selected) {
        setPersonalityForm({
          name: selected.name || '',
          role_prompt: selected.role_prompt || '',
          model: selected.model || '',
          rules: selected.rules || [],
          temperature: selected.temperature || 0.7,
          max_tokens: selected.max_tokens || 300
        })
      }
    }
  }

  async function handleSavePersonality(e) {
    e.preventDefault()
    if (!personalityNumber || !personalityConfig) return
    if (!personalityForm.name.trim() || !personalityForm.role_prompt.trim()) {
      toast({ message: 'Por favor, completa el nombre y prompt de rol del agente.', type: 'warning' })
      return
    }
    
    setSavingPersonality(true)
    try {
      const agentPayload = {
        user_id: user.id,
        name: personalityForm.name,
        role_prompt: personalityForm.role_prompt,
        model: personalityForm.model || 'gpt-4o-mini',
        rules: personalityForm.rules || [],
        temperature: parseFloat(personalityForm.temperature),
        max_tokens: parseInt(personalityForm.max_tokens),
      }
      
      let finalAgentId = selectedAgentId
      
      if (selectedAgentId === 'new' || saveAsNewTemplate) {
        const { data: newAgent, error: insErr } = await supabase
          .from('agents')
          .insert(agentPayload)
          .select()
          .single()
        if (insErr) throw insErr
        finalAgentId = newAgent.id
      } else {
        const { error: updErr } = await supabase
          .from('agents')
          .update(agentPayload)
          .eq('id', selectedAgentId)
        if (updErr) throw updErr
      }
      
      const { error: botUpdErr } = await supabase
        .from('bot_configurations')
        .update({
          agent_id: finalAgentId,
          updated_at: new Date().toISOString()
        })
        .eq('number_id', personalityNumber.id)
      if (botUpdErr) throw botUpdErr
      
      toast({ message: 'Estilo IA guardado correctamente.', type: 'success' })
      setPersonalityModal(false)
      fetchNumbers()
    } catch (err) {
      toast({ message: err.message, type: 'error' })
    } finally {
      setSavingPersonality(false)
    }
  }

  async function fetchNumbers() {
    const { data, error } = await supabase
      .from('whatsapp_numbers')
      .select('*, bot_configurations(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
    if (error) {
      toast({ message: error.message, type: 'error' })
    } else {
      setNumbers(data || [])
      if (data && data.length > 0) {
        fetchTrafficInitial(data)
      }
    }
    setLoading(false)
  }

  async function fetchConnections() {
    const { data } = await supabase
      .from('ai_connections')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
    setConnections(data || [])
  }

  // Pre-activation check logic
  async function handleToggleBot(number) {
    if (!number.bot_enabled) {
      const activeCount = numbers.filter(n => n.bot_enabled).length
      if (activeCount >= 5) {
        toast({ message: 'Límite excedido: máximo 5 bots activos.', type: 'warning' }); return
      }
      
      setTogglingId(number.id)
      const { data: config, error: configErr } = await supabase
        .from('bot_configurations')
        .select('*, agents(*), ai_connections(*)')
        .eq('number_id', number.id)
        .maybeSingle()
      setTogglingId(null)
      
      const errors = []
      if (configErr || !config) {
        errors.push("No se ha configurado el Agente de IA para este número.")
      } else {
        if (!config.connection_id) {
          errors.push("Falta seleccionar una Conexión de IA Activa.")
        }
        if (!config.agent_id || !config.agents) {
          errors.push("Falta configurar el Prompt de Rol del Agente.")
        } else {
          if (!config.agents.name || !config.agents.name.trim()) {
            errors.push("El Agente no tiene un nombre asignado.")
          }
          if (!config.agents.role_prompt || !config.agents.role_prompt.trim()) {
            errors.push("El Agente no tiene un Prompt de Rol (System Prompt).")
          }
        }
      }
      
      if (errors.length > 0) {
        setValidationModal({ open: true, errors, number })
        return
      }
    }
    
    // Enable/Disable normally
    setTogglingId(number.id)
    
    // Self-healing webhook: always ensure the webhook is set correctly when enabling the bot
    if (!number.bot_enabled) {
      try {
        const secretParam = number.webhook_secret ? `?secret=${number.webhook_secret}` : ''
        await setWebhook(number.session_name, `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook${secretParam}`)
      } catch (wErr) {
        console.error("Error setting webhook while enabling bot:", wErr)
      }
    }

    const { error } = await supabase
      .from('whatsapp_numbers')
      .update({ bot_enabled: !number.bot_enabled })
      .eq('id', number.id)
    if (error) toast({ message: error.message, type: 'error' })
    else setNumbers(prev => prev.map(n => n.id === number.id ? { ...n, bot_enabled: !n.bot_enabled } : n))
    setTogglingId(null)
  }

  // Initialize onboarding wizard for new or existing number
  async function openOnboarding(existingNumber = null) {
    await fetchSavedAgents()
    if (existingNumber) {
      const isConnected = existingNumber.status === 'CONNECTED'
      setOnboardingStep(isConnected ? 2 : 1)
      setOnboardingNumberId(existingNumber.id)
      setInstanceDisplayName(existingNumber.display_name)
      setInstanceSessionName(existingNumber.session_name)
      setInstanceStatus(existingNumber.status)
      setQrCode('')
      if (!isConnected) {
        loadOnboardingQr(existingNumber.session_name)
      }
      
      // Load configurations
      const { data: config } = await supabase
        .from('bot_configurations')
        .select('*, agents(*)')
        .eq('number_id', existingNumber.id)
        .maybeSingle()
      
      setOnboardingConfig(config || null)
      if (config) {
        setSelectedConnId(config.connection_id || '')
        setSelectedOnboardingAgentId(config.agent_id || '')
        setAgentForm({
          name: config.agents?.name || `Agente - ${existingNumber.display_name}`,
          role_prompt: config.agents?.role_prompt || '',
          model: config.agents?.model || '',
          rules: config.agents?.rules || [],
          temperature: config.agents?.temperature || 0.7,
          max_tokens: config.agents?.max_tokens || 300,
          trigger_mode: config.trigger_mode || 'all',
          triggers: config.triggers || [],
          handoff_triggers: config.handoff_triggers || ['humano', 'asesor', 'soporte'],
          fallback_message: config.fallback_message || 'Lo siento, no he podido procesar tu solicitud.',
          respond_saved_contacts: config.respond_saved_contacts !== undefined ? config.respond_saved_contacts : true,
          unsaved_contacts_action: config.unsaved_contacts_action || 'respond',
          continue_ai_after_manual: config.continue_ai_after_manual || false
        })
      } else {
        setSelectedConnId('')
        setSelectedOnboardingAgentId('')
        setAgentForm({
          name: `Agente - ${existingNumber.display_name}`,
          role_prompt: '',
          model: '',
          rules: [],
          temperature: 0.7,
          max_tokens: 300,
          trigger_mode: 'all',
          triggers: [],
          handoff_triggers: ['humano', 'asesor', 'soporte'],
          fallback_message: 'Lo siento, no he podido procesar tu solicitud.',
          respond_saved_contacts: true,
          unsaved_contacts_action: 'respond',
          continue_ai_after_manual: false
        })
      }
    } else {
      // Start fresh
      setOnboardingStep(1)
      setOnboardingNumberId(null)
      setOnboardingConfig(null)
      setInstanceDisplayName('')
      setInstanceSessionName('')
      setInstanceStatus('CREATED')
      setQrCode('')
      setSelectedConnId('')
      setSelectedOnboardingAgentId('')
      setAgentForm({
        name: '',
        role_prompt: '',
        model: '',
        rules: [],
        temperature: 0.7,
        max_tokens: 300,
        trigger_mode: 'all',
        triggers: [],
        handoff_triggers: ['humano', 'asesor', 'soporte'],
        fallback_message: 'Lo siento, no he podido procesar tu solicitud.',
        respond_saved_contacts: true,
        unsaved_contacts_action: 'respond',
        continue_ai_after_manual: false
      })
    }
    
    // Fetch connections list to be fresh
    fetchConnections()
    setOnboardingModal(true)
  }

  // Step 1: Create Evolution instance and register on DB
  async function handleCreateInstance(e) {
    e.preventDefault()
    if (numbers.length >= 6) {
      toast({ message: 'Límite alcanzado: máximo 6 números.', type: 'warning' }); return
    }
    setCreatingInstanceLoader(true)
    const sessionName = `zonawa_${user.id.slice(0, 8)}_${Date.now()}`
    setInstanceSessionName(sessionName)
    
    // Generar un token secreto de 16 caracteres hexadecimales localmente
    const webhookSecret = Array.from({length: 16}, () => Math.floor(Math.random()*16).toString(16)).join('');
    
    try {
      await createInstance(sessionName)
      await setWebhook(sessionName, `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook?secret=${webhookSecret}`)
      
      const { data, error } = await supabase.from('whatsapp_numbers').insert({
        user_id: user.id, 
        display_name: instanceDisplayName, 
        session_name: sessionName, 
        status: 'WAITING_QR',
        webhook_secret: webhookSecret
      }).select().single()
      
      if (error) throw error
      setOnboardingNumberId(data.id)
      setNumbers(prev => [{ ...data }, ...prev])
      setInstanceStatus('WAITING_QR')
      
      // Load QR
      await loadOnboardingQr(sessionName)
    } catch (err) {
      toast({ message: err.message, type: 'error' })
    } finally {
      setCreatingInstanceLoader(false)
    }
  }

  // Load QR helper
  async function loadOnboardingQr(sessionName) {
    setLoadingQrLoader(true)
    try {
      const data = await getInstanceQR(sessionName)
      setQrCode(data.qrcode || data.base64)
    } catch (err) {
      toast({ message: 'No se pudo obtener el código QR', type: 'error' })
    } finally {
      setLoadingQrLoader(false)
    }
  }

  async function forceVerifyConnection() {
    const session = instanceSessionName
    const numberId = onboardingNumberId
    if (!session || !numberId) return
    
    setLoadingQrLoader(true)
    try {
      const stateRes = await getConnectionState(session)
      const dbStatus = mapEvolutionStateToDbStatus(stateRes)

      // Update Supabase immediately
      const { data, error } = await supabase
        .from('whatsapp_numbers')
        .update({ status: dbStatus })
        .eq('id', numberId)
        .select()
        .single()

      if (!error && data) {
        setNumbers(prev => prev.map(n => n.id === numberId ? { ...n, status: dbStatus } : n))
        setInstanceStatus(dbStatus)
        if (dbStatus === 'CONNECTED') {
          toast({ message: '¡WhatsApp conectado exitosamente!', type: 'success' })
        } else {
          toast({ message: `Estado actual: ${STATUS_CONFIG[dbStatus]?.label || dbStatus}. Por favor escanea el QR en tu celular.`, type: 'warning' })
        }
      }
    } catch (err) {
      toast({ message: `Error al verificar: ${err.message}`, type: 'error' })
    } finally {
      setLoadingQrLoader(false)
    }
  }

  async function forceVerifyModalConnection() {
    if (!qrModal) return
    const { session_name, id } = qrModal
    setLoadingQrLoader(true)
    try {
      const stateRes = await getConnectionState(session_name)
      const dbStatus = mapEvolutionStateToDbStatus(stateRes)

      // Update Supabase immediately
      const { data, error } = await supabase
        .from('whatsapp_numbers')
        .update({ status: dbStatus })
        .eq('id', id)
        .select()
        .single()

      if (!error && data) {
        setNumbers(prev => prev.map(n => n.id === id ? { ...n, status: dbStatus } : n))
        if (dbStatus === 'CONNECTED') {
          setQrModal(null)
          toast({ message: '¡WhatsApp conectado exitosamente!', type: 'success' })
        } else {
          toast({ message: `Estado actual: ${STATUS_CONFIG[dbStatus]?.label || dbStatus}. Por favor escanea el QR en tu celular.`, type: 'warning' })
        }
      }
    } catch (err) {
      toast({ message: `Error al verificar: ${err.message}`, type: 'error' })
    } finally {
      setLoadingQrLoader(false)
    }
  }

  // Step 2: Add inline AI connection
  async function handleCreateConnection(e) {
    e.preventDefault()
    setCreatingConn(true)
    try {
      const { data, error } = await supabase
        .from('ai_connections')
        .insert({
          user_id: user.id,
          provider: newConnProvider,
          nickname: newConnNickname,
          api_key: newConnApiKey,
          is_active: true
        })
        .select()
        .single()
      
      if (error) throw error
      toast({ message: 'Proveedor de IA vinculado correctamente', type: 'success' })
      setSelectedConnId(data.id)
      fetchConnections() // Refresh list
      setShowNewConnForm(false)
      setNewConnNickname('')
      setNewConnApiKey('')
    } catch (err) {
      toast({ message: err.message, type: 'error' })
    } finally {
      setCreatingConn(false)
    }
  }

  // Step 3: Complete Onboarding & Save
  async function handleOnboardingComplete(e) {
    e.preventDefault()
    if (!onboardingNumberId) return
    if (!selectedConnId) {
      toast({ message: 'Debes seleccionar un proveedor de IA', type: 'warning' }); return
    }
    if ((selectedOnboardingAgentId === 'new' || !selectedOnboardingAgentId) && (!agentForm.name.trim() || !agentForm.role_prompt.trim())) {
      toast({ message: 'Completa la identidad y prompt del agente', type: 'warning' }); return
    }
    if (!selectedOnboardingAgentId) {
      toast({ message: 'Por favor, selecciona o crea un Estilo IA', type: 'warning' }); return
    }
    
    setSavingOnboarding(true)
    try {
      let agentId = selectedOnboardingAgentId

      // 1. If it's a new style, save it canonically to the agents table first
      if (selectedOnboardingAgentId === 'new') {
        const agentPayload = {
          user_id: user.id,
          name: agentForm.name,
          role_prompt: agentForm.role_prompt,
          model: agentForm.model || 'gpt-4o-mini',
          rules: agentForm.rules || [],
          temperature: parseFloat(agentForm.temperature),
          max_tokens: parseInt(agentForm.max_tokens),
        }
        const { data: newAgent, error: aErr } = await supabase
          .from('agents')
          .insert(agentPayload)
          .select()
          .single()
        if (aErr) throw aErr
        agentId = newAgent.id
      }

      // 2. Upsert Bot Configuration
      const botPayload = {
        number_id: onboardingNumberId,
        agent_id: agentId,
        connection_id: selectedConnId,
        triggers: agentForm.triggers,
        handoff_triggers: agentForm.handoff_triggers,
        fallback_message: agentForm.fallback_message,
        trigger_mode: agentForm.trigger_mode,
        respond_saved_contacts: agentForm.respond_saved_contacts,
        unsaved_contacts_action: agentForm.unsaved_contacts_action,
        continue_ai_after_manual: agentForm.continue_ai_after_manual,
        updated_at: new Date().toISOString(),
      }
      
      if (onboardingConfig) {
        await supabase.from('bot_configurations').update(botPayload).eq('id', onboardingConfig.id)
      } else {
        await supabase.from('bot_configurations').insert(botPayload)
      }

      // 3. Auto-enable the bot
      await supabase.from('whatsapp_numbers').update({ bot_enabled: true }).eq('id', onboardingNumberId)
      setNumbers(prev => prev.map(n => n.id === onboardingNumberId ? { ...n, bot_enabled: true } : n))
      
      // Ensure webhook is correctly set in Evolution API
      try {
        const numberObj = numbers.find(n => n.id === onboardingNumberId)
        const secret = numberObj?.webhook_secret || ''
        const secretParam = secret ? `?secret=${secret}` : ''
        await setWebhook(instanceSessionName, `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook${secretParam}`)
      } catch (wErr) {
        console.error("Error setting webhook on onboarding complete:", wErr)
      }

      toast({ message: 'Onboarding completado y Bot activado!', type: 'success' })
      setOnboardingModal(false)
      fetchNumbers()
    } catch (err) {
      toast({ message: err.message, type: 'error' })
    } finally {
      setSavingOnboarding(false)
    }
  }

  // Delete instance handler
  async function handleDelete(number) {
    if (!confirm(`¿Eliminar "${number.display_name}"? Esta acción no se puede deshacer.`)) return
    try {
      await logoutInstance(number.session_name)
    } catch (_) {}
    const { error } = await supabase.from('whatsapp_numbers').delete().eq('id', number.id)
    if (error) toast({ message: error.message, type: 'error' })
    else setNumbers(prev => prev.filter(n => n.id !== number.id))
  }

  // Reconnection helper
  async function handleShowQR(number) {
    try {
      const data = await getInstanceQR(number.session_name)
      setQrModal({ id: number.id, session_name: number.session_name, qr: data.qrcode || data.base64 })
    } catch (err) {
      toast({ message: 'No se pudo obtener el QR', type: 'error' })
    }
  }

  async function openDetailsModal(number) {
    setDetailsNumber(number)
    setDetailsModal(true)
    setLoadingDetails(true)
    setDetailsConversations([])
    setDetailsAuditLogs([])
    setDetailsMetrics({ clientMsgs: 0, botMsgs: 0, totalMsgs: 0, promptTokens: 0, completionTokens: 0, cost: 0 })
    setActiveChat(null)
    setReplyText('')
    
    try {
      console.log("=== INICIO CARGA DETALLES DE TRÁFICO ===")
      console.log("Número a consultar:", number)

      // 1. Fetch last 4 conversations with their messages
      const { data: convs, error: convErr } = await supabase
        .from('conversations')
        .select('*, messages(content, sender, created_at)')
        .eq('number_id', number.id)
        .order('last_message_at', { ascending: false })
        .limit(4)
        
      if (convErr) {
        console.error("Error al obtener conversaciones:", convErr)
        throw convErr
      }
      console.log("Conversaciones obtenidas:", convs)
      
      const mappedConvs = (convs || []).map(c => {
        const sortedMsgs = (c.messages || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        return {
          ...c,
          lastMessage: sortedMsgs[0] || null
        }
      })
      setDetailsConversations(mappedConvs)
      
      // 2. Fetch total messages count for metrics
      const { data: msgsCountData, error: msgsCountErr } = await supabase
        .from('messages')
        .select('sender, conversations!inner(number_id)')
        .eq('conversations.number_id', number.id)
      
      if (msgsCountErr) {
        console.error("Error al obtener conteo de mensajes:", msgsCountErr)
      } else {
        console.log("Datos de conteo de mensajes obtenidos:", msgsCountData)
      }

      let clientMsgCount = 0
      let botMsgCount = 0
      msgsCountData?.forEach(m => {
        if (m.sender === 'customer') clientMsgCount++
        else if (m.sender === 'bot') botMsgCount++
      })
      
      // 3. Fetch financial usage metrics from usage_logs
      const { data: logsData, error: logsErr } = await supabase
        .from('usage_logs')
        .select('tokens_prompt, tokens_completion, estimated_cost')
        .eq('number_id', number.id)

      if (logsErr) {
        console.error("Error al obtener logs de consumo:", logsErr)
      } else {
        console.log("Logs de consumo obtenidos:", logsData)
      }
        
      let totalPromptTokens = 0
      let totalCompletionTokens = 0
      let totalCost = 0
      logsData?.forEach(l => {
        totalPromptTokens += l.tokens_prompt
        totalCompletionTokens += l.tokens_completion
        totalCost += parseFloat(l.estimated_cost || 0)
      })
      
      setDetailsMetrics({
        clientMsgs: clientMsgCount,
        botMsgs: botMsgCount,
        totalMsgs: clientMsgCount + botMsgCount,
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        cost: totalCost
      })

      // 4. Fetch last 10 audit logs safely (table schema check)
      try {
        const { data: auditData, error: auditErr } = await supabase
          .from('audit_logs')
          .select('*')
          .eq('number_id', number.id)
          .order('created_at', { ascending: false })
          .limit(10)
        
        if (auditErr) {
          console.error("Error al obtener bitácora de auditoría:", auditErr)
        } else {
          console.log("Bitácora de auditoría obtenida:", auditData)
        }

        if (!auditErr && auditData) {
          setDetailsAuditLogs(auditData)
        }
      } catch (auditFetchErr) {
        console.warn("Fallo al obtener bitácora de auditoría:", auditFetchErr)
      }
      
      console.log("=== FIN CARGA DETALLES DE TRÁFICO ===")
    } catch (err) {
      console.error("Excepción en openDetailsModal:", err)
      toast({ message: `Error al cargar detalles de tráfico: ${err.message}`, type: 'error' })
    } finally {
      setLoadingDetails(false)
    }
  }

  async function toggleConversationHandoff(convId, currentStatus) {
    const newStatus = currentStatus === 'BOT' ? 'HUMAN' : 'BOT'
    const { error } = await supabase
      .from('conversations')
      .update({ status: newStatus })
      .eq('id', convId)
      
    if (error) {
      toast({ message: error.message, type: 'error' })
    } else {
      toast({ message: `Handoff actualizado a ${newStatus === 'BOT' ? 'Bot activo' : 'Operador humano'}`, type: 'success' })
      setDetailsConversations(prev => prev.map(c => c.id === convId ? { ...c, status: newStatus } : c))
      setActiveChat(prev => prev && prev.id === convId ? { ...prev, status: newStatus } : prev)
    }
  }

  async function handleSendDirectMessage(convId, customerPhone, text) {
    if (!text.trim()) return
    setSendingReply(true)
    try {
      const cleanPhone = customerPhone.split('@')[0]
      const response = await sendTextMessage(detailsNumber.session_name, cleanPhone, text)
      const whatsappMsgId = response?.key?.id || null

      const { data: newMsg, error: msgErr } = await supabase
        .from('messages')
        .insert({
          conversation_id: convId,
          sender: 'agent',
          content: text,
          whatsapp_message_id: whatsappMsgId
        })
        .select()
        .single()

      if (msgErr) throw msgErr

      // Check bot configurations to set the correct status
      const botConfig = detailsNumber.bot_configurations?.[0]
      const continueAi = botConfig?.continue_ai_after_manual || false
      const newStatus = continueAi ? 'BOT' : 'HUMAN'

      const { error: handoffErr } = await supabase
        .from('conversations')
        .update({ status: newStatus, last_message_at: new Date().toISOString() })
        .eq('id', convId)

      if (handoffErr) throw handoffErr

      toast({ 
        message: continueAi ? 'Mensaje enviado. El bot continuará activo.' : 'Mensaje enviado y bot pausado para este chat.', 
        type: 'success' 
      })
      setReplyText('')

      const updatedMsg = newMsg || { content: text, sender: 'agent', created_at: new Date().toISOString() }

      setActiveChat(prev => {
        if (!prev) return null
        return {
          ...prev,
          status: newStatus,
          messages: [...(prev.messages || []), updatedMsg]
        }
      })

      setDetailsConversations(prev => prev.map(c => {
        if (c.id === convId) {
          return {
            ...c,
            status: newStatus,
            messages: [...(c.messages || []), updatedMsg],
            lastMessage: updatedMsg
          }
        }
        return c
      }))

    } catch (err) {
      console.error("Fallo al enviar mensaje directo:", err)
      toast({ message: `Fallo al enviar mensaje: ${err.message}`, type: 'error' })
    } finally {
      setSendingReply(false)
    }
  }

  // Tag Adders & Removers for Wizard
  const addTagOnboarding = (field, value, setter) => {
    if (!value.trim()) return
    setAgentForm(prev => ({ ...prev, [field]: [...prev[field], value.trim()] }))
    setter('')
  }
  const removeTagOnboarding = (field, idx) => {
    setAgentForm(prev => ({ ...prev, [field]: prev[field].filter((_, i) => i !== idx) }))
  }

  const toggleRuleOnboarding = (ruleKey) => {
    setAgentForm(prev => {
      const currentRules = prev.rules || []
      const nextRules = currentRules.includes(ruleKey)
        ? currentRules.filter(r => r !== ruleKey)
        : [...currentRules, ruleKey]
      return { ...prev, rules: nextRules }
    })
  }


  if (personalityModal) {
    return (
      <div className="page">
        <div className="page-header" style={{ marginBottom: '16px' }}>
          <div>
            <button 
              className="btn-outline btn-sm" 
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}
              onClick={() => setPersonalityModal(false)}
            >
              <ArrowLeft size={14} /> Volver a los Números
            </button>
            <h1 className="page-title">Estilo IA - {personalityNumber?.display_name || ''}</h1>
            <p className="page-subtitle">Configura las reglas de comportamiento, modelo y parámetros para este número</p>
          </div>
        </div>

        {loading ? (
          <div className="loading-state"><Loader2 size={32} className="spin" /></div>
        ) : (
          <form onSubmit={handleSavePersonality} className="settings-form" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Selección de Plantilla Guardada */}
            <div className="glass-card settings-section" style={{ padding: '20px' }}>
              <h2 className="section-title">Perfil / Plantilla de Estilo IA</h2>
              <div className="form-group">
                <select
                  value={selectedAgentId}
                  onChange={e => handleSelectAgentTemplate(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                >
                  <option value="new">-- Crear Nuevo Estilo / Agente --</option>
                  {savedAgents.map(agent => (
                    <option key={agent.id} value={agent.id}>{agent.name}</option>
                  ))}
                </select>
                <small style={{ display: 'block', marginTop: '6px', color: 'var(--text-3)' }}>
                  Elige un agente preconfigurado o crea uno nuevo para este número de WhatsApp.
                </small>
              </div>
            </div>

            {/* Identidad del Agente */}
            <div className="glass-card settings-section" style={{ padding: '20px' }}>
              <h2 className="section-title">Identidad del Agente</h2>
              <div className="form-group">
                <label>Nombre del Agente</label>
                <input
                  type="text"
                  placeholder="Ej: Agente Comercial, Soporte Técnico"
                  value={personalityForm.name}
                  onChange={e => setPersonalityForm({ ...personalityForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Instrucciones de Comportamiento (System Prompt)</label>
                <textarea
                  rows={5}
                  placeholder="Eres un agente virtual..."
                  value={personalityForm.role_prompt}
                  onChange={e => setPersonalityForm({ ...personalityForm, role_prompt: e.target.value })}
                  required
                />
              </div>
              
              {personalityConfig?.connection_id && (
                <div className="form-group">
                  <label>Modelo de IA</label>
                  <select
                    value={personalityForm.model}
                    onChange={e => setPersonalityForm({ ...personalityForm, model: e.target.value })}
                    required
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                  >
                    {(() => {
                      const conn = connections.find(c => c.id === personalityConfig.connection_id)
                      const provider = conn?.provider || 'openai'
                      const models = PROVIDER_MODELS[provider] || []
                      return models.map(m => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))
                    })()}
                  </select>
                </div>
              )}
            </div>

            {/* Reglas de Comportamiento */}
            <div className="glass-card settings-section" style={{ padding: '20px' }}>
              <h2 className="section-title">Reglas del Bot (Instrucciones Rápidas)</h2>
              <small className="section-desc" style={{ color: 'var(--text-3)', display: 'block', marginBottom: '10px' }}>
                Define las pautas que moldean el comportamiento del bot en el chat.
              </small>
              <div className="rules-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginTop: '10px' }}>
                {AVAILABLE_RULES.map(rule => {
                  const isActive = (personalityForm.rules || []).includes(rule.key)
                  return (
                    <div 
                      key={rule.key} 
                      onClick={() => {
                        setPersonalityForm(prev => {
                          const currentRules = prev.rules || []
                          const nextRules = currentRules.includes(rule.key)
                            ? currentRules.filter(r => r !== rule.key)
                            : [...currentRules, rule.key]
                          return { ...prev, rules: nextRules }
                        })
                      }}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        padding: '12px',
                        background: isActive ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255, 255, 255, 0.01)',
                        border: isActive ? '1px solid var(--primary)' : '1px solid var(--border)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                      className="rule-card"
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <strong style={{ fontSize: '0.85rem', color: isActive ? 'var(--primary-light)' : 'var(--text-1)' }}>{rule.label}</strong>
                        <div className={`toggle-switch ${isActive ? 'on' : ''}`} style={{ transform: 'scale(0.8)', pointerEvents: 'none' }}>
                          <span className="toggle-knob" />
                        </div>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', lineHeight: '1.2' }}>{rule.desc}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Parámetros */}
            <div className="glass-card settings-section" style={{ padding: '20px' }}>
              <h2 className="section-title">Parámetros del Modelo</h2>
              <div className="form-row">
                <div className="form-group">
                  <label>Temperatura: <strong>{personalityForm.temperature}</strong></label>
                  <input
                    type="range"
                    min="0"
                    max="1.2"
                    step="0.1"
                    value={personalityForm.temperature}
                    onChange={e => setPersonalityForm({ ...personalityForm, temperature: e.target.value })}
                    style={{ accentColor: 'var(--primary)', cursor: 'pointer' }}
                  />
                  <div className="range-labels"><span>Preciso</span><span>Creativo</span></div>
                </div>
                <div className="form-group">
                  <label>Tokens Máximos</label>
                  <input
                    type="number"
                    min="100"
                    max="4000"
                    value={personalityForm.max_tokens}
                    onChange={e => setPersonalityForm({ ...personalityForm, max_tokens: e.target.value })}
                  />
                  <small style={{ color: 'var(--text-3)', fontSize: '0.72rem', display: 'block', marginTop: '2px' }}>
                    💡 Configuración recomendada: 300–500 tokens para reducir costos.
                  </small>
                </div>
              </div>
            </div>

            {/* Guardar como nueva plantilla */}
            {selectedAgentId !== 'new' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                <input
                  type="checkbox"
                  id="chk-save-as-new"
                  checked={saveAsNewTemplate}
                  onChange={e => setSaveAsNewTemplate(e.target.checked)}
                  style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                />
                <label htmlFor="chk-save-as-new" style={{ fontSize: '0.85rem', color: 'var(--text-1)', cursor: 'pointer', margin: 0 }}>
                  Guardar como una nueva plantilla de Estilo IA (no sobrescribir la original)
                </label>
              </div>
            )}

            {/* Botones de Acción */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={savingPersonality}>
                {savingPersonality ? <><Loader2 size={16} className="spin" /> Guardando…</> : <><Save size={16} /> Guardar Configuración de Estilo</>}
              </button>
              <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={() => setPersonalityModal(false)}>
                Cancelar
              </button>
            </div>

          </form>
        )}
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Números de WhatsApp</h1>
          <p className="page-subtitle">{numbers.length} / 6 registrados · {numbers.filter(n => n.bot_enabled).length} / 5 bots activos</p>
        </div>
        <button id="btn-add-number" className="btn-primary" onClick={() => openOnboarding(null)} disabled={numbers.length >= 6}>
          <Plus size={18} /> Agregar Número
        </button>
      </div>

      {loading ? (
        <div className="loading-state"><Loader2 size={32} className="spin" /></div>
      ) : numbers.length === 0 ? (
        <div className="empty-page">
          <Smartphone size={56} />
          <h2>Sin números registrados</h2>
          <p>Sincroniza y configura tu primer número de WhatsApp mediante nuestro asistente</p>
          <button className="btn-primary" onClick={() => openOnboarding(null)}><Plus size={18} /> Iniciar Onboarding</button>
        </div>
      ) : (
        <div className="numbers-grid">
          {numbers.map(number => {
            const cfg = STATUS_CONFIG[number.status] || STATUS_CONFIG.DISCONNECTED
            const StatusIcon = cfg.icon
            return (
              <div key={number.id} className="number-card glass-card">
                <div className="number-card-header">
                  <div className={`status-badge status-${cfg.color}`}>
                    <StatusIcon size={12} />
                    <span>{cfg.label}</span>
                  </div>
                  <button id={`btn-delete-${number.id}`} className="icon-btn danger" onClick={() => handleDelete(number)}>
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="number-card-body">
                  <div className="number-avatar">
                    <Smartphone size={24} />
                  </div>
                  <div>
                    <h3 className="number-name">{number.display_name}</h3>
                    <p className="number-phone">{number.phone_number || 'Sin número asignado'}</p>
                    <p className="number-session">{number.session_name}</p>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-3)', background: 'rgba(255,255,255,0.03)', padding: '2px 6px', borderRadius: '4px', display: 'inline-block', marginTop: '2px', fontFamily: 'monospace' }}>
                      Secret Token: {number.webhook_secret || 'No generado'}
                    </span>
                  </div>
                </div>

                {/* Monitor de Tráfico en Tiempo Real */}
                <div 
                  className="traffic-monitor" 
                  style={{ 
                    borderTop: '1px solid var(--border)', 
                    borderBottom: '1px solid var(--border)',
                    padding: '12px 16px', 
                    background: 'rgba(255, 255, 255, 0.01)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    transition: 'all 0.3s ease',
                    boxShadow: traffic[number.id]?.pulse ? 'inset 0 0 15px rgba(99, 102, 241, 0.15)' : 'none',
                    backgroundColor: traffic[number.id]?.pulse ? 'rgba(99, 102, 241, 0.03)' : 'transparent'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-3)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Monitor de Tráfico
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className={`pulse-dot-live`} style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: number.status === 'CONNECTED' ? 'var(--success)' : 'var(--text-3)',
                        boxShadow: number.status === 'CONNECTED' ? '0 0 8px var(--success)' : 'none',
                      }} />
                      <span style={{ fontSize: '0.7rem', color: number.status === 'CONNECTED' ? 'var(--success)' : 'var(--text-2)', fontWeight: '500' }}>
                        {number.status === 'CONNECTED' ? 'Activo (Leyendo)' : 'Inactivo'}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-2)' }}>Mensajes procesados:</span>
                    <strong style={{ fontSize: '0.85rem', color: 'var(--text-1)', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px' }}>
                      {traffic[number.id]?.totalCount || 0}
                    </strong>
                  </div>

                  {traffic[number.id]?.lastMessage ? (
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.02)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', alignItems: 'center' }}>
                        <span className={`tag tag-xs ${traffic[number.id].lastMessage.sender === 'customer' ? 'tag-primary' : 'tag-warning'}`} style={{ fontSize: '0.62rem', padding: '1px 4px', height: 'auto' }}>
                          {traffic[number.id].lastMessage.sender === 'customer' ? 'Cliente' : 'Bot'}
                        </span>
                        <span style={{ fontSize: '0.62rem', color: 'var(--text-3)' }}>
                          {new Date(traffic[number.id].lastMessage.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-1)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {traffic[number.id].lastMessage.content}
                      </p>
                    </div>
                  ) : (
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-3)', margin: 0, fontStyle: 'italic', textAlign: 'center', padding: '4px 0' }}>
                      Esperando tráfico...
                    </p>
                  )}
                </div>

                <div className="number-card-footer">
                  {number.status === 'WAITING_QR' && (
                    <button id={`btn-qr-${number.id}`} className="btn-outline btn-sm" onClick={() => handleShowQR(number)}>
                      <QrCode size={14} /> Ver QR
                    </button>
                  )}
                  {number.status === 'DISCONNECTED' || number.status === 'ERROR' ? (
                    <button className="btn-outline btn-sm" onClick={() => handleShowQR(number)}>
                      <RefreshCw size={14} /> Reconectar
                    </button>
                  ) : null}

                  {/* Si NO tiene configuración de bot, mostramos botón Configurar Bot (Wizard inicial) */}
                  {(!number.bot_configurations || number.bot_configurations.length === 0) ? (
                    <button className="btn-outline btn-sm" style={{ marginLeft: '6px' }} onClick={() => openOnboarding(number)}>
                      <Settings size={13} /> Configurar Bot
                    </button>
                  ) : (
                    <>
                      {/* Si TIENE configuración, y el bot NO está activo, permitimos reconfigurar WhatsApp/Conexión */}
                      {!number.bot_enabled && (
                        <button className="btn-outline btn-sm" style={{ marginLeft: '6px' }} onClick={() => openOnboarding(number)}>
                          <RefreshCw size={13} /> Reconfigurar
                        </button>
                      )}
                      
                      {/* Botón de Estilo de IA, visible siempre que esté configurado */}
                      <button className="btn-outline btn-sm" style={{ marginLeft: '6px' }} onClick={() => openPersonalityModal(number)}>
                        <Sparkles size={13} style={{ color: 'var(--warning)' }} /> Estilo IA
                      </button>
                    </>
                  )}

                  <button className="btn-outline btn-sm" style={{ marginRight: 'auto', marginLeft: '6px' }} onClick={() => openDetailsModal(number)}>
                    <Activity size={13} /> Tráfico
                  </button>

                  <div className="bot-toggle-wrap">
                    <span className="toggle-label">Bot</span>
                    <button
                      id={`toggle-bot-${number.id}`}
                      className={`toggle-switch ${number.bot_enabled ? 'on' : ''}`}
                      onClick={() => {
                        if (!number.bot_enabled && number.status !== 'CONNECTED') {
                          toast({ message: 'No puedes activar el bot si el número no está conectado a WhatsApp. Escanea el código QR primero.', type: 'warning' })
                          return
                        }
                        handleToggleBot(number)
                      }}
                      disabled={togglingId === number.id}
                      style={{ 
                        opacity: !number.bot_enabled && number.status !== 'CONNECTED' ? 0.5 : 1, 
                        cursor: !number.bot_enabled && number.status !== 'CONNECTED' ? 'not-allowed' : 'pointer' 
                      }}
                    >
                      <span className="toggle-knob" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Validation Modal: Shows missing fields before bot activation */}
      <Modal open={validationModal.open} onClose={() => setValidationModal({ open: false, errors: [], number: null })} title="Configuración Incompleta" size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--warning)' }}>
            <AlertCircle size={24} />
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>Faltan Parámetros Obligatorios</h3>
          </div>
          
          <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', margin: 0 }}>
            Para activar el asistente virtual en "{validationModal.number?.display_name}", debes resolver las siguientes alertas:
          </p>

          <ul className="validation-error-list">
            {validationModal.errors.map((err, i) => (
              <li key={i} className="validation-error-item">
                <AlertCircle size={14} />
                <span>{err}</span>
              </li>
            ))}
          </ul>

          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <button className="btn-outline" style={{ flex: 1 }} onClick={() => setValidationModal({ open: false, errors: [], number: null })}>
              Cerrar
            </button>
            <button className="btn-primary" style={{ flex: 1.5 }} onClick={() => {
              const num = validationModal.number
              setValidationModal({ open: false, errors: [], number: null })
              openOnboarding(num)
            }}>
              Completar Configuración
            </button>
          </div>
        </div>
      </Modal>

      {/* QR Code Modal for normal reconnection */}
      <Modal open={!!qrModal} onClose={() => setQrModal(null)} title="Escanea el Código QR" size="sm">
        <div className="qr-modal-body">
          <p className="qr-instructions">Abre WhatsApp → Dispositivos Vinculados → Vincular Dispositivo</p>
          {qrModal?.qr ? (
            <div className="qr-wrapper">
              <img src={qrModal.qr.startsWith('data:') ? qrModal.qr : `data:image/png;base64,${qrModal.qr}`} alt="QR WhatsApp" className="qr-image" />
            </div>
          ) : (
            <div className="qr-placeholder"><Loader2 size={32} className="spin" /><p>Generando QR…</p></div>
          )}
          <div className="qr-status-note" style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', marginTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="pulse-dot" />
              <span>Esperando escaneo…</span>
            </div>
            <button 
              type="button" 
              className="btn-primary btn-sm" 
              onClick={forceVerifyModalConnection}
              disabled={loadingQrLoader}
              style={{ width: '100%', marginTop: '6px' }}
            >
              Verificar Conexión
            </button>
          </div>
        </div>
      </Modal>

      {/* Onboarding Wizard Modal */}
      <Modal open={onboardingModal} onClose={() => setOnboardingModal(false)} title="Asistente de Onboarding de Número" size="md">
        
        {/* Step Indicator Header */}
        <div className="wizard-steps">
          <div className={`wizard-step ${onboardingStep === 1 ? 'active' : ''} ${onboardingStep > 1 ? 'completed' : ''}`}>
            <span className="wizard-step-badge">{onboardingStep > 1 ? <Check size={14} /> : '1'}</span>
            <span className="wizard-step-label">Vincular QR</span>
          </div>
          <div className={`wizard-step ${onboardingStep === 2 ? 'active' : ''} ${onboardingStep > 2 ? 'completed' : ''}`}>
            <span className="wizard-step-badge">{onboardingStep > 2 ? <Check size={14} /> : '2'}</span>
            <span className="wizard-step-label">Vincular IA</span>
          </div>
          <div className={`wizard-step ${onboardingStep === 3 ? 'active' : ''}`}>
            <span className="wizard-step-badge">3</span>
            <span className="wizard-step-label">Configurar Bot</span>
          </div>
        </div>

        {/* STEP 1 CONTENT: WhatsApp connection */}
        {onboardingStep === 1 && (
          <div className="wizard-content">
            <form onSubmit={handleCreateInstance} className="modal-form">
              <div className="form-group">
                <label>Nombre de la Instancia</label>
                <input
                  type="text"
                  placeholder="Ej: WhatsApp Ventas"
                  value={instanceDisplayName}
                  onChange={e => setInstanceDisplayName(e.target.value)}
                  disabled={!!onboardingNumberId}
                  required
                />
                <small>Asigna un nombre descriptivo para identificar este número.</small>
              </div>

              {!onboardingNumberId ? (
                <button type="submit" className="btn-primary btn-block" disabled={creatingInstanceLoader}>
                  {creatingInstanceLoader ? <><Loader2 size={16} className="spin" /> Inicializando Instancia…</> : <><Plus size={16} /> Crear y Generar QR</>}
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', marginTop: '16px', width: '100%' }}>
                  <div className={`status-badge status-${instanceStatus === 'CONNECTED' ? 'success' : 'warning'}`} style={{ alignSelf: 'center' }}>
                    {instanceStatus === 'CONNECTED' ? <Wifi size={12} /> : <QrCode size={12} />}
                    <span>{instanceStatus === 'CONNECTED' ? 'Dispositivo Vinculado!' : 'Esperando escaneo…'}</span>
                  </div>

                  {instanceStatus === 'CONNECTED' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '16px', borderRadius: '8px', width: '100%', margin: '12px 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontWeight: '600' }}>
                        <Check size={20} />
                        <span>¡WhatsApp Vinculado con Éxito!</span>
                      </div>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-2)', textAlign: 'center', margin: 0 }}>
                        Tu cuenta de WhatsApp se ha enlazado de forma segura. Presiona "Siguiente" para continuar.
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', width: '100%' }}>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-3)', textAlign: 'center', margin: 0 }}>
                        Escanea el código QR desde tu celular. El asistente se actualizará automáticamente en tiempo real.
                      </p>
                      
                      {qrCode ? (
                        <div className="qr-wrapper">
                          <img src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`} alt="QR WhatsApp" className="qr-image" style={{ width: '180px', height: '180px' }} />
                        </div>
                      ) : (
                        <div className="qr-placeholder" style={{ padding: '20px' }}>
                          <Loader2 size={24} className="spin" />
                          <p style={{ fontSize: '0.78rem' }}>Cargando QR…</p>
                        </div>
                      )}
                      
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button type="button" className="btn-outline btn-xs" onClick={() => loadOnboardingQr(instanceSessionName)} disabled={loadingQrLoader}>
                          <RefreshCw size={10} className={loadingQrLoader ? 'spin' : ''} /> Regenerar QR
                        </button>
                        <button type="button" className="btn-primary btn-xs" onClick={forceVerifyConnection} disabled={loadingQrLoader} style={{ padding: '4px 8px', fontSize: '0.7rem' }}>
                          <Check size={10} /> Verificar Conexión
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="modal-footer" style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                    <button 
                      type="button" 
                      className="btn-primary" 
                      onClick={() => setOnboardingStep(2)}
                      disabled={instanceStatus !== 'CONNECTED'}
                    >
                      Siguiente <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>
        )}

        {/* STEP 2 CONTENT: Select or Add AI Connections */}
        {onboardingStep === 2 && (
          <div className="wizard-content">
            <h3 style={{ fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-1)', marginBottom: '12px' }}>Selecciona un Proveedor de IA Activo</h3>
            
            {/* List existing connections */}
            <div className="radio-cards-grid">
              {connections.map(conn => (
                <button
                  key={conn.id}
                  type="button"
                  className={`radio-card ${selectedConnId === conn.id ? 'active' : ''}`}
                  onClick={() => setSelectedConnId(conn.id)}
                >
                  <div className="radio-card-header">
                    <span className="radio-card-title">{conn.nickname}</span>
                    <Sparkles size={12} style={{ color: 'var(--primary)' }} />
                  </div>
                  <span className="radio-card-desc">Proveedor: {conn.provider.toUpperCase()}</span>
                </button>
              ))}
              {connections.length === 0 && (
                <p className="empty-state" style={{ gridColumn: '1 / -1', margin: 0, padding: '16px' }}>
                  No tienes proveedores de IA vinculados. Agrega uno abajo.
                </p>
              )}
            </div>

            {/* Inline New Connection form toggle */}
            {!showNewConnForm ? (
              <button
                type="button"
                className="btn-outline btn-block"
                style={{ marginTop: '16px', borderStyle: 'dashed' }}
                onClick={() => setShowNewConnForm(true)}
              >
                <Plus size={14} /> Vincular Nuevo Proveedor de IA
              </button>
            ) : (
              <form onSubmit={handleCreateConnection} className="inline-form-card">
                <div style={{ display: 'flex', justifyContent: 'between', alignItems: 'center', width: '100%' }}>
                  <span className="inline-form-title">Vincular Proveedor de IA</span>
                  <button type="button" className="icon-btn danger btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setShowNewConnForm(false)}>
                    <X size={14} />
                  </button>
                </div>

                <div className="form-group">
                  <label>Proveedor</label>
                  <select value={newConnProvider} onChange={e => setNewConnProvider(e.target.value)}>
                    <option value="openai">OpenAI</option>
                    <option value="gemini">Google Gemini</option>
                    <option value="groq">Groq</option>
                    <option value="claude">Anthropic Claude</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Apodo / Identificador</label>
                  <input
                    type="text"
                    placeholder="Ej: OpenAI Prod"
                    value={newConnNickname}
                    onChange={e => setNewConnNickname(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>API Key</label>
                  <input
                    type="password"
                    placeholder="sk-..."
                    value={newConnApiKey}
                    onChange={e => setNewConnApiKey(e.target.value)}
                    required
                  />
                </div>

                <button type="submit" className="btn-primary btn-sm btn-block" disabled={creatingConn}>
                  {creatingConn ? <><Loader2 size={12} className="spin" /> Guardando…</> : <><Save size={12} /> Guardar Proveedor</>}
                </button>
              </form>
            )}

            {/* Wizard Navigation */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
              <button
                type="button"
                className="btn-outline"
                onClick={() => {
                  // Only allow back to Step 1 if we're configuring a brand new instance
                  if (!onboardingConfig) {
                    setOnboardingStep(1)
                  } else {
                    setOnboardingModal(false)
                  }
                }}
              >
                <ArrowLeft size={14} /> {onboardingConfig ? 'Cancelar' : 'Atrás'}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setOnboardingStep(3)}
                disabled={!selectedConnId}
              >
                Siguiente <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 CONTENT: Configure Agent prompts & settings */}
        {onboardingStep === 3 && (
          <div className="wizard-content" style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '4px' }}>
            <form onSubmit={handleOnboardingComplete} className="modal-form" style={{ gap: '16px' }}>
              
              {/* Selección de Estilo IA */}
              <div style={{ padding: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-1)' }}>Estilo IA (Plantilla del Agente)</h4>
                <div className="form-group">
                  <label>Seleccionar Estilo</label>
                  <select
                    value={selectedOnboardingAgentId}
                    onChange={e => {
                      const val = e.target.value
                      setSelectedOnboardingAgentId(val)
                      if (val === 'new') {
                        setAgentForm(prev => ({
                          ...prev,
                          name: '',
                          role_prompt: '',
                          model: prev.model || 'gpt-4o-mini',
                          rules: [],
                          temperature: 0.7,
                          max_tokens: 300
                        }))
                      } else {
                        const selected = savedAgents.find(a => a.id === val)
                        if (selected) {
                          setAgentForm(prev => ({
                            ...prev,
                            name: selected.name,
                            role_prompt: selected.role_prompt,
                            model: selected.model,
                            rules: selected.rules || [],
                            temperature: selected.temperature,
                            max_tokens: selected.max_tokens
                          }))
                        }
                      }
                    }}
                    required
                  >
                    <option value="">-- Selecciona un Estilo IA --</option>
                    <option value="new">+ Crear Nuevo Estilo IA (Canónico)</option>
                    {savedAgents.map(agent => (
                      <option key={agent.id} value={agent.id}>{agent.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Vista previa si ya existe un Estilo seleccionado */}
              {selectedOnboardingAgentId && selectedOnboardingAgentId !== 'new' && (
                <div style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--text-2)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div><strong style={{ color: 'var(--text-1)' }}>System Prompt:</strong> {agentForm.role_prompt}</div>
                  <div>
                    <strong style={{ color: 'var(--text-1)' }}>Modelo:</strong> {agentForm.model} · 
                    <strong style={{ color: 'var(--text-1)' }}> Temp:</strong> {agentForm.temperature} · 
                    <strong style={{ color: 'var(--text-1)' }}> Max Tokens:</strong> {agentForm.max_tokens}
                  </div>
                  <div>
                    <strong style={{ color: 'var(--text-1)' }}>Reglas Activas:</strong> {(agentForm.rules || []).length > 0 ? (
                      (agentForm.rules || []).map(r => AVAILABLE_RULES.find(rule => rule.key === r)?.label || r).join(', ')
                    ) : (
                      'Ninguna'
                    )}
                  </div>
                </div>
              )}

              {/* Formulario de creación de nuevo Estilo (solo si selectedOnboardingAgentId === 'new') */}
              {selectedOnboardingAgentId === 'new' && (
                <>
                  {/* Identidad del Agente */}
                  <div style={{ padding: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-1)' }}>Identidad del Agente</h4>
                    <div className="form-group">
                      <label>Nombre del Agente</label>
                      <input
                        type="text"
                        placeholder="Ej: Agente Comercial"
                        value={agentForm.name}
                        onChange={e => setAgentForm({ ...agentForm, name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Prompt de Rol (System Prompt)</label>
                      <textarea
                        rows={4}
                        placeholder="Eres un vendedor virtual..."
                        value={agentForm.role_prompt}
                        onChange={e => setAgentForm({ ...agentForm, role_prompt: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Modelo de IA</label>
                      <select
                        value={agentForm.model}
                        onChange={e => setAgentForm({ ...agentForm, model: e.target.value })}
                        required
                      >
                        {(() => {
                          const conn = connections.find(c => c.id === selectedConnId)
                          const provider = conn?.provider || 'openai'
                          const models = PROVIDER_MODELS[provider] || []
                          return models.map(m => (
                            <option key={m.id} value={m.id}>{m.label}</option>
                          ))
                        })()}
                      </select>
                    </div>
                  </div>

                  {/* Parámetros */}
                  <div style={{ padding: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-1)' }}>Parámetros</h4>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Temperatura: <strong>{agentForm.temperature}</strong></label>
                        <input
                          type="range"
                          min="0"
                          max="1.2"
                          step="0.1"
                          value={agentForm.temperature}
                          onChange={e => setAgentForm({ ...agentForm, temperature: e.target.value })}
                        />
                      </div>
                      <div className="form-group">
                        <label>Tokens Máximos</label>
                        <input
                          type="number"
                          min="100"
                          max="4000"
                          value={agentForm.max_tokens}
                          onChange={e => setAgentForm({ ...agentForm, max_tokens: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Reglas del Bot */}
                  <div style={{ padding: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-1)' }}>Reglas del Bot (Instrucciones Rápidas)</h4>
                    <small style={{ color: 'var(--text-3)', display: 'block', marginBottom: '10px', fontSize: '0.72rem' }}>
                      Activa pautas de comportamiento específicas para moderar y optimizar la respuesta del bot.
                    </small>
                    <div className="rules-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '8px' }}>
                      {AVAILABLE_RULES.map(rule => {
                        const isActive = (agentForm.rules || []).includes(rule.key)
                        return (
                          <div 
                            key={rule.key} 
                            onClick={() => toggleRuleOnboarding(rule.key)}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              padding: '10px',
                              background: isActive ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255, 255, 255, 0.01)',
                              border: isActive ? '1px solid var(--primary)' : '1px solid var(--border)',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                            }}
                            className="rule-card"
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                              <strong style={{ fontSize: '0.8rem', color: isActive ? 'var(--primary-light)' : 'var(--text-1)' }}>{rule.label}</strong>
                              <div className={`toggle-switch ${isActive ? 'on' : ''}`} style={{ transform: 'scale(0.75)', pointerEvents: 'none' }}>
                                <span className="toggle-knob" />
                              </div>
                            </div>
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-3)', lineHeight: '1.2' }}>{rule.desc}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </>
              )}

              {/* Modo de Activación & Triggers */}
              <div style={{ padding: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-1)' }}>Reglas de Activación</h4>
                
                <div className="form-group">
                  <label>Modo de Activación</label>
                  <div className="radio-cards-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                    <button
                      type="button"
                      className={`radio-card ${agentForm.trigger_mode === 'all' ? 'active' : ''}`}
                      onClick={() => setAgentForm({ ...agentForm, trigger_mode: 'all' })}
                      style={{ padding: '8px' }}
                    >
                      <span className="radio-card-title" style={{ fontSize: '0.78rem' }}>Todos</span>
                    </button>
                    <button
                      type="button"
                      className={`radio-card ${agentForm.trigger_mode === 'exact' ? 'active' : ''}`}
                      onClick={() => setAgentForm({ ...agentForm, trigger_mode: 'exact' })}
                      style={{ padding: '8px' }}
                    >
                      <span className="radio-card-title" style={{ fontSize: '0.78rem' }}>Exacto</span>
                    </button>
                    <button
                      type="button"
                      className={`radio-card ${agentForm.trigger_mode === 'contains' ? 'active' : ''}`}
                      onClick={() => setAgentForm({ ...agentForm, trigger_mode: 'contains' })}
                      style={{ padding: '8px' }}
                    >
                      <span className="radio-card-title" style={{ fontSize: '0.78rem' }}>Contiene</span>
                    </button>
                  </div>
                </div>

                {agentForm.trigger_mode !== 'all' && (
                  <div className="form-group">
                    <label>Palabras clave de activación</label>
                    <div className="tag-input-wrap">
                      <input
                        type="text"
                        placeholder="Añadir..."
                        value={triggerInput}
                        onChange={e => setTriggerInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTagOnboarding('triggers', triggerInput, setTriggerInput))}
                      />
                      <button type="button" className="btn-outline btn-sm" onClick={() => addTagOnboarding('triggers', triggerInput, setTriggerInput)}>
                        Añadir
                      </button>
                    </div>
                    <div className="tags-list">
                      {agentForm.triggers.map((t, i) => (
                        <span key={i} className="tag tag-primary">
                          {t} <button type="button" onClick={() => removeTagOnboarding('triggers', i)}><X size={10} /></button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label>Handoff (pausar bot)</label>
                  <div className="tag-input-wrap">
                    <input
                      type="text"
                      placeholder="Ej: hablar con humano"
                      value={handoffInput}
                      onChange={e => setHandoffInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTagOnboarding('handoff_triggers', handoffInput, setHandoffInput))}
                    />
                    <button type="button" className="btn-outline btn-sm" onClick={() => addTagOnboarding('handoff_triggers', handoffInput, setHandoffInput)}>
                      Añadir
                    </button>
                  </div>
                  <div className="tags-list">
                    {agentForm.handoff_triggers.map((t, i) => (
                      <span key={i} className="tag tag-warning">
                        {t} <button type="button" onClick={() => removeTagOnboarding('handoff_triggers', i)}><X size={10} /></button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Filtros de Destinatarios */}
              <div style={{ padding: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-1)' }}>Filtros de Destinatarios</h4>
                
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                    <div>
                      <span style={{ fontWeight: '500', fontSize: '0.8rem', display: 'block', color: 'var(--text-1)' }}>Contactos Guardados</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-2)' }}>Responder a números guardados en la agenda.</span>
                    </div>
                    <button
                      type="button"
                      className={`toggle-switch ${agentForm.respond_saved_contacts ? 'on' : ''}`}
                      onClick={() => setAgentForm(prev => ({ ...prev, respond_saved_contacts: !prev.respond_saved_contacts }))}
                    >
                      <span className="toggle-knob" />
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label>Números No Guardados</label>
                  <select
                    value={agentForm.unsaved_contacts_action}
                    onChange={e => setAgentForm({ ...agentForm, unsaved_contacts_action: e.target.value })}
                  >
                    <option value="respond">Responder con IA</option>
                    <option value="ignore">Ignorar / No responder</option>
                    <option value="fallback">Enviar mensaje de Fallback</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Mensaje de Fallback</label>
                  <input
                    type="text"
                    value={agentForm.fallback_message}
                    onChange={e => setAgentForm({ ...agentForm, fallback_message: e.target.value })}
                  />
                </div>

                <div className="form-group" style={{ marginTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                    <div>
                      <span style={{ fontWeight: '500', fontSize: '0.8rem', display: 'block', color: 'var(--text-1)' }}>Continuar IA tras Mensaje Manual</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-2)' }}>Si respondes manualmente, el bot seguirá respondiendo a los próximos mensajes del cliente.</span>
                    </div>
                    <button
                      type="button"
                      className={`toggle-switch ${agentForm.continue_ai_after_manual ? 'on' : ''}`}
                      onClick={() => setAgentForm(prev => ({ ...prev, continue_ai_after_manual: !prev.continue_ai_after_manual }))}
                    >
                      <span className="toggle-knob" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Wizard Navigation */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <button type="button" className="btn-outline" onClick={() => setOnboardingStep(2)}>
                  <ArrowLeft size={14} /> Atrás
                </button>
                <button type="submit" className="btn-primary" disabled={savingOnboarding}>
                  {savingOnboarding ? <><Loader2 size={14} className="spin" /> Guardando…</> : <><Save size={14} /> Finalizar y Activar Bot</>}
                </button>
              </div>

            </form>
          </div>
        )}
      </Modal>

      {/* Modal: Detalles de Tráfico e Historial */}
      <Modal open={detailsModal} onClose={() => setDetailsModal(false)} title={`Tráfico y Métricas: ${detailsNumber?.display_name || ''}`} size="md">
        {loadingDetails ? (
          <div className="loading-state" style={{ padding: '40px 0' }}><Loader2 size={32} className="spin" /></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Cabecera del Estado */}
            <div style={{ display: 'flex', gap: '16px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', padding: '12px 16px', borderRadius: '8px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '150px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', display: 'block', textTransform: 'uppercase', fontWeight: '600' }}>Instancia</span>
                <strong style={{ fontSize: '0.9rem', color: 'var(--text-1)' }}>{detailsNumber?.session_name}</strong>
              </div>
              <div style={{ flex: 1, minWidth: '150px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', display: 'block', textTransform: 'uppercase', fontWeight: '600' }}>Teléfono Vinculado</span>
                <strong style={{ fontSize: '0.9rem', color: 'var(--text-1)' }}>{detailsNumber?.phone_number || 'Ninguno'}</strong>
              </div>
              <div style={{ flex: 1, minWidth: '100px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', display: 'block', textTransform: 'uppercase', fontWeight: '600' }}>Estado WhatsApp</span>
                <span className={`status-badge status-${STATUS_CONFIG[detailsNumber?.status]?.color || 'danger'}`} style={{ marginTop: '4px', display: 'inline-flex' }}>
                  {STATUS_CONFIG[detailsNumber?.status]?.label || 'Desconectado'}
                </span>
              </div>
            </div>

            {/* Panel de Métricas de Tráfico */}
            <div>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Activity size={14} style={{ color: 'var(--primary)' }} /> Métricas de Tráfico y Consumo
              </h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
                {/* Caja: Mensajes Totales */}
                <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', padding: '12px', borderRadius: '8px' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-2)', display: 'block', marginBottom: '4px' }}>Mensajes Procesados</span>
                  <strong style={{ fontSize: '1.25rem', color: 'var(--text-1)' }}>{detailsMetrics.totalMsgs}</strong>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginTop: '4px', display: 'flex', gap: '8px' }}>
                    <span>Cliente: {detailsMetrics.clientMsgs}</span>
                    <span>Bot: {detailsMetrics.botMsgs}</span>
                  </div>
                  {/* Progress bar */}
                  <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', marginTop: '6px', overflow: 'hidden' }}>
                    <div style={{ 
                      height: '100%', 
                      background: 'var(--primary)', 
                      width: detailsMetrics.totalMsgs > 0 ? `${(detailsMetrics.botMsgs / detailsMetrics.totalMsgs) * 100}%` : '0%' 
                    }} />
                  </div>
                </div>

                {/* Caja: Tokens */}
                <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', padding: '12px', borderRadius: '8px' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-2)', display: 'block', marginBottom: '4px' }}>Tokens Consumidos</span>
                  <strong style={{ fontSize: '1.25rem', color: 'var(--text-1)' }}>
                    {detailsMetrics.promptTokens + detailsMetrics.completionTokens}
                  </strong>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginTop: '4px', display: 'flex', gap: '8px' }}>
                    <span>Input: {detailsMetrics.promptTokens}</span>
                    <span>Output: {detailsMetrics.completionTokens}</span>
                  </div>
                </div>

                {/* Caja: Costo */}
                <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', padding: '12px', borderRadius: '8px' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-2)', display: 'block', marginBottom: '4px' }}>Costo Estimado</span>
                  <strong style={{ fontSize: '1.25rem', color: 'var(--success)' }}>
                    ${detailsMetrics.cost.toFixed(6)}
                  </strong>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-3)', display: 'block', marginTop: '4px' }}>USD acumulado</span>
                </div>
              </div>
            </div>

            {/* Lista de las últimas 4 conversaciones o Ventana de Chat */}
            <div>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Smartphone size={14} style={{ color: 'var(--primary)' }} /> {activeChat ? 'Chat en Vivo' : 'Últimas 4 Conversaciones Activas'}
              </h4>

              {activeChat ? (
                /* PANEL DE CHAT EN VIVO */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
                  {/* Chat Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                    <div>
                      <strong style={{ fontSize: '0.85rem', color: 'var(--text-1)' }}>{activeChat.customer_name || 'Desconocido'}</strong>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginLeft: '6px' }}>({activeChat.customer_phone})</span>
                      <span className={`status-badge status-${activeChat.status === 'BOT' ? 'success' : 'warning'}`} style={{ marginLeft: '8px', padding: '1px 6px', fontSize: '0.62rem' }}>
                        {activeChat.status === 'BOT' ? 'Bot Activo' : 'Manual'}
                      </span>
                    </div>
                    <button 
                      type="button" 
                      className="btn-outline btn-sm" 
                      onClick={() => setActiveChat(null)}
                      style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                    >
                      Volver a la lista
                    </button>
                  </div>

                  {/* Chat Messages */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                    {((activeChat.messages || []).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at))).map((m, idx) => {
                      const isMe = m.sender === 'agent' || m.sender === 'bot';
                      return (
                        <div 
                          key={idx} 
                          style={{ 
                            alignSelf: isMe ? 'flex-end' : 'flex-start',
                            background: isMe ? 'var(--primary-dim)' : 'rgba(255,255,255,0.03)',
                            border: '1px solid ' + (isMe ? 'rgba(99,102,241,0.2)' : 'var(--border)'),
                            padding: '8px 12px',
                            borderRadius: '8px',
                            maxWidth: '75%',
                            fontSize: '0.75rem',
                            lineHeight: '1.4'
                          }}
                        >
                          <div style={{ fontWeight: '600', fontSize: '0.62rem', color: isMe ? 'var(--primary)' : 'var(--text-2)', marginBottom: '3px', textTransform: 'uppercase' }}>
                            {m.sender === 'customer' ? 'Cliente' : m.sender === 'bot' ? 'Bot IA' : 'Operador'}
                          </div>
                          <div style={{ color: 'var(--text-1)' }}>{m.content}</div>
                          <div style={{ fontSize: '0.58rem', color: 'var(--text-3)', textAlign: 'right', marginTop: '4px' }}>
                            {new Date(m.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      );
                    })}
                    {(activeChat.messages || []).length === 0 && (
                      <p style={{ margin: 0, padding: '24px 0', fontSize: '0.72rem', color: 'var(--text-3)', fontStyle: 'italic', textAlign: 'center' }}>
                        Sin mensajes en el historial.
                      </p>
                    )}
                  </div>

                  {/* Chat Input */}
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSendDirectMessage(activeChat.id, activeChat.customer_phone, replyText);
                    }}
                    style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--border)', paddingTop: '10px', marginTop: '4px' }}
                  >
                    <input
                      type="text"
                      placeholder="Escribe un mensaje directamente..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      disabled={sendingReply}
                      style={{ fontSize: '0.75rem', padding: '6px 10px', height: '34px', background: 'rgba(0,0,0,0.15)', flex: 1 }}
                    />
                    <button 
                      type="submit" 
                      className="btn-primary btn-sm" 
                      disabled={!replyText.trim() || sendingReply}
                      style={{ height: '34px', width: '38px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    >
                      {sendingReply ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
                    </button>
                  </form>
                </div>
              ) : (
                /* LISTA DE CONVERSACIONES */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {detailsConversations.map(conv => (
                    <div key={conv.id} style={{ display: 'flex', alignItems: 'center', justifycontent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '8px', gap: '12px', justifyContent: 'space-between' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                          <strong style={{ fontSize: '0.85rem', color: 'var(--text-1)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            {conv.customer_name || 'Desconocido'}
                          </strong>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>({conv.customer_phone})</span>
                        </div>
                        
                        {conv.lastMessage ? (
                          <p style={{ fontSize: '0.72rem', color: 'var(--text-2)', margin: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            <strong style={{ color: conv.lastMessage.sender === 'customer' ? 'var(--primary)' : conv.lastMessage.sender === 'bot' ? 'var(--success)' : 'var(--warning)' }}>
                              {conv.lastMessage.sender === 'customer' ? 'Cliente: ' : conv.lastMessage.sender === 'bot' ? 'Bot: ' : 'Operador: '}
                            </strong>
                            {conv.lastMessage.content}
                          </p>
                        ) : (
                          <p style={{ fontSize: '0.72rem', color: 'var(--text-3)', margin: 0, fontStyle: 'italic' }}>Sin mensajes registrados</p>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <span className={`status-badge status-${conv.status === 'BOT' ? 'success' : 'warning'}`} style={{ display: 'inline-flex', fontSize: '0.65rem', padding: '2px 6px' }}>
                          {conv.status === 'BOT' ? 'Bot' : 'Manual'}
                        </span>

                        <button 
                          type="button" 
                          className="btn-outline btn-xs"
                          onClick={() => setActiveChat(conv)}
                          style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}
                        >
                          Chatear
                        </button>

                        <button 
                          type="button" 
                          className={`btn-outline btn-xs`}
                          style={{ borderColor: conv.status === 'BOT' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)' }}
                          onClick={() => toggleConversationHandoff(conv.id, conv.status)}
                        >
                          {conv.status === 'BOT' ? 'Pausar Bot' : 'Activar Bot'}
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  {detailsConversations.length === 0 && (
                    <p className="empty-state" style={{ margin: 0, padding: '24px 0', fontSize: '0.8rem', fontStyle: 'italic' }}>
                      No hay conversaciones registradas en este número de WhatsApp.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Bitácora de Auditoría de IA */}
            <div>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={14} style={{ color: 'var(--warning)' }} /> Bitácora de Auditoría de IA (Últimos Eventos)
              </h4>
              
              <div 
                style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '8px', 
                  maxHeight: '170px', 
                  overflowY: 'auto',
                  background: 'rgba(0,0,0,0.15)',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)'
                }}
              >
                {detailsAuditLogs.map(log => {
                  let badgeColor = 'info'
                  let eventLabel = log.event_type
                  
                  if (log.event_type === 'AI_RESPONSE') {
                    badgeColor = 'success'
                    eventLabel = 'Respuesta IA'
                  } else if (log.event_type === 'TRIGGER_MISMATCH') {
                    badgeColor = 'info'
                    eventLabel = 'Sin Coincidencia'
                  } else if (log.event_type === 'CONTACT_FILTERED') {
                    badgeColor = 'warning'
                    eventLabel = 'Filtro Privacidad'
                  } else if (log.event_type === 'AI_ERROR') {
                    badgeColor = 'danger'
                    eventLabel = 'Error LLM'
                  } else if (log.event_type === 'BOT_DISABLED') {
                    badgeColor = 'danger'
                    eventLabel = 'Bot Inactivo'
                  } else if (log.event_type === 'HANDOFF_ACTIVE') {
                    badgeColor = 'warning'
                    eventLabel = 'Handoff Activo'
                  } else if (log.event_type === 'AI_FALLBACK') {
                    badgeColor = 'warning'
                    eventLabel = 'Respuesta Fallback'
                  } else if (log.event_type === 'HANDOFF_TRIGGERED') {
                    badgeColor = 'warning'
                    eventLabel = 'Pausado por Humano'
                  }
                  
                  return (
                    <div key={log.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '8px', fontSize: '0.72rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className={`status-badge status-${badgeColor}`} style={{ fontSize: '0.62rem', padding: '1px 6px', display: 'inline-flex', textTransform: 'uppercase' }}>
                          {eventLabel}
                        </span>
                        <span style={{ fontSize: '0.62rem', color: 'var(--text-3)' }}>
                          {new Date(log.created_at).toLocaleString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit' })}
                        </span>
                      </div>
                      <p style={{ color: 'var(--text-2)', margin: 0, paddingLeft: '4px', lineHeight: '1.3' }}>
                        {log.details}
                      </p>
                    </div>
                  )
                })}
                
                {detailsAuditLogs.length === 0 && (
                  <p style={{ margin: 0, padding: '12px 0', fontSize: '0.75rem', color: 'var(--text-3)', fontStyle: 'italic', textAlign: 'center' }}>
                    Sin eventos registrados. Asegúrate de ejecutar la migración SQL para habilitar el reporte de auditoría.
                  </p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '8px' }}>
              <button type="button" className="btn-primary" onClick={() => setDetailsModal(false)}>
                Cerrar
              </button>
            </div>

          </div>
        )}
      </Modal>

    </div>
  )
}
