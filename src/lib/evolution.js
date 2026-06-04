const EVOLUTION_URL = import.meta.env.VITE_EVOLUTION_API_URL
const EVOLUTION_TOKEN = import.meta.env.VITE_EVOLUTION_API_TOKEN

function getHeaders() {
  if (!EVOLUTION_TOKEN) {
    throw new Error('Evolution API Token (VITE_EVOLUTION_API_TOKEN) no está configurado en el archivo .env.')
  }
  return {
    'Content-Type': 'application/json',
    'apikey': EVOLUTION_TOKEN,
  }
}

function getUrl(path) {
  if (!EVOLUTION_URL) {
    throw new Error('Evolution API URL (VITE_EVOLUTION_API_URL) no está configurado en el archivo .env.')
  }
  const base = EVOLUTION_URL.endsWith('/') ? EVOLUTION_URL.slice(0, -1) : EVOLUTION_URL
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${base}${cleanPath}`
}

export async function createInstance(instanceName) {
  const url = getUrl('/instance/create')
  const headers = getHeaders()
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ instanceName, qrcode: true }),
  })
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(errData.message || `Error al crear la instancia (HTTP ${res.status})`)
  }
  return res.json()
}

export async function getInstanceQR(instanceName) {
  const url = getUrl(`/instance/connect/${instanceName}`)
  const headers = getHeaders()
  const res = await fetch(url, { headers })
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(errData.message || `Error al obtener el código QR (HTTP ${res.status})`)
  }
  return res.json()
}

export async function logoutInstance(instanceName) {
  const url = getUrl(`/instance/logout/${instanceName}`)
  const headers = getHeaders()
  const res = await fetch(url, {
    method: 'DELETE',
    headers,
  })
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(errData.message || `Error al cerrar sesión de la instancia (HTTP ${res.status})`)
  }
  return res.json()
}

export async function sendTextMessage(instanceName, number, text) {
  const url = getUrl(`/message/sendText/${instanceName}`)
  const headers = getHeaders()
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      number,
      options: { delay: 1200, presence: 'composing' },
      textMessage: { text },
    }),
  })
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(errData.message || `Error al enviar mensaje (HTTP ${res.status})`)
  }
  return res.json()
}

export async function setWebhook(instanceName, webhookUrl) {
  const url = getUrl(`/webhook/set/${instanceName}`)
  const headers = getHeaders()
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        byEvents: false,
        events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
      },
    }),
  })
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(errData.message || `Error al configurar el webhook (HTTP ${res.status})`)
  }
  return res.json()
}
