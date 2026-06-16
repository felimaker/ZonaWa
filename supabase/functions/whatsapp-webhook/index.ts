import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Manejar solicitudes CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL')
    const EVOLUTION_API_TOKEN = Deno.env.get('EVOLUTION_API_TOKEN')

    const payload = await req.json()
    console.log("=========================================")
    console.log("⚡ WEBHOOK RECIBIDO ⚡")
    console.log("Evento:", payload.event)
    console.log("Instancia (session_name):", payload.instance)
    console.log("Datos:", JSON.stringify(payload.data, null, 2))
    console.log("=========================================")

    const { event, data } = payload
    const instance = payload.instance || payload.instanceName || payload.instance_name
    const eventLower = (event || '').toLowerCase().replace('_', '.')
    console.log(`[VERIFICADOR] Procesando Evento Normalizado: "${eventLower}" para Instancia: "${instance}"`)

    if (!instance) {
      console.error("[ERROR] No se recibió el nombre de la instancia en el webhook.");
      return new Response(JSON.stringify({ error: 'Missing instance name' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Cargar información del número registrado y validar token secreto del webhook
    const { data: numData, error: numErr } = await supabase
      .from('whatsapp_numbers')
      .select('id, user_id, bot_enabled, webhook_secret')
      .eq('session_name', instance)
      .maybeSingle()

    if (numErr || !numData) {
      console.error(`[ERROR] No se encontró el número de WhatsApp registrado para la sesión: ${instance}`, numErr)
      return new Response(JSON.stringify({ error: 'WhatsApp instance not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const urlParams = new URL(req.url).searchParams
    const incomingSecret = urlParams.get('secret')
    
    if (numData.webhook_secret && numData.webhook_secret !== incomingSecret) {
      console.error(`[ERROR] Token secreto inválido en el webhook para la sesión ${instance}. Recibido: ${incomingSecret}`);
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid webhook secret' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`[VERIFICADOR] Token secreto validado con éxito para ${instance}`);

    // 1. EVENTO: ACTUALIZACIÓN DE CONEXIÓN
    if (eventLower === 'connection.update') {
      const state = data?.state
      const phone = data?.phone || data?.number || ""
      
      let dbStatus = 'DISCONNECTED'
      if (state === 'open') {
        dbStatus = 'CONNECTED'
      } else if (state === 'connecting') {
        dbStatus = 'WAITING_QR'
      } else if (state === 'close') {
        dbStatus = 'DISCONNECTED'
      } else if (state === 'refused') {
        dbStatus = 'ERROR'
      }

      console.log(`[VERIFICADOR] Actualizando estado de conexión de ${instance} a ${dbStatus} (Teléfono: ${phone})`)

      const updateData: any = { status: dbStatus }
      if (phone) {
        updateData.phone_number = phone.split('@')[0]
      }

      const { error } = await supabase
        .from('whatsapp_numbers')
        .update(updateData)
        .eq('session_name', instance)

      if (error) {
        console.error('[ERROR] Al actualizar whatsapp_numbers en Supabase:', error)
        throw error
      }
      console.log('[OK] Estado de conexión actualizado correctamente en Supabase.')
      return new Response(JSON.stringify({ success: true, connection_updated: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 2. EVENTO: RECEPCIÓN DE MENSAJES
    if (eventLower === 'messages.upsert') {
      const messageData = data?.message
      const key = data?.key
      const fromMe = key?.fromMe
      
      if (fromMe) {
        const messageId = key?.id
        console.log(`[VERIFICADOR] Mensaje saliente detectado (fromMe = true), ID: ${messageId}`);
        
        // Comprobar si el mensaje ya existe en Supabase (evitar duplicar del Bot o Panel)
        const { data: existingMsg, error: existErr } = await supabase
          .from('messages')
          .select('id')
          .eq('whatsapp_message_id', messageId)
          .maybeSingle()
        
        if (existingMsg) {
          console.log("[OK] El mensaje ya existe en la base de datos (enviado por Bot o Panel). Omitiendo.");
          return new Response(JSON.stringify({ success: true, ignored: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        
        // Si no existe, es un mensaje manual del operador desde su celular
        let textContent = messageData?.conversation || 
                          messageData?.extendedTextMessage?.text || 
                          messageData?.imageMessage?.caption || 
                          messageData?.videoMessage?.caption || 
                          messageData?.documentMessage?.caption || 
                          null

        if (!textContent) {
          console.log("[OK] Mensaje manual sin texto. Omitiendo.");
          return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        console.log(`[VERIFICADOR] Mensaje manual del operador desde celular detectado: "${textContent}"`);

        const customerJid = key?.remoteJid || ""
        if (!customerJid) {
          console.warn("[WARNING] Mensaje saliente sin remoteJid. Omitiendo.");
          return new Response(JSON.stringify({ success: true, reason: 'missing_remoteJid' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        const customerPhone = customerJid.split('@')[0]
        const customerName = 'Cliente de WhatsApp' // pushName no disponible en fromMe

        // Asegurar conversación sin sobreescribir last_message_at ni status
        let { data: convData, error: convErr } = await supabase
          .from('conversations')
          .select('*')
          .eq('number_id', numData.id)
          .eq('customer_phone', customerPhone)
          .maybeSingle()

        if (convErr) {
          console.error('[ERROR] Al buscar conversación para mensaje saliente:', convErr)
          throw convErr
        }

        if (!convData) {
          const { data: newConv, error: createErr } = await supabase
            .from('conversations')
            .insert({
              number_id: numData.id,
              customer_phone: customerPhone,
              customer_name: customerName,
              last_message_at: new Date().toISOString()
            })
            .select()
            .single()

          if (createErr || !newConv) {
            console.error('[ERROR] Al crear conversación para mensaje saliente:', createErr)
            throw new Error('Database conversation error')
          }
          convData = newConv
        }

        // Guardar mensaje manual en la base de datos
        await insertMessageToDb(supabase, convData.id, messageId, 'agent', textContent)

        // Obtener configuración de bot para comprobar triggers y continue_ai_after_manual
        const { data: botConfig } = await supabase
          .from('bot_configurations')
          .select('*')
          .eq('number_id', numData.id)
          .maybeSingle()

        const normBotTrigger = (botConfig?.bot_trigger || 'bot').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
        const normStopTrigger = (botConfig?.stop_trigger || 'stop').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
        const normalizedMsg = textContent.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()

        const isBotTriggered = normalizedMsg === normBotTrigger
        const isStopTriggered = normalizedMsg === normStopTrigger

        const continueAi = botConfig?.continue_ai_after_manual || false
        let newStatus = convData.status

        if (isBotTriggered) {
          newStatus = 'BOT'
          console.log(`[VERIFICADOR] Operador envía bot_trigger desde celular. Reactivando bot a BOT.`)
        } else if (isStopTriggered) {
          newStatus = 'HUMAN'
          console.log(`[VERIFICADOR] Operador envía stop_trigger desde celular. Pausando bot a HUMAN.`)
        } else {
          newStatus = continueAi ? 'BOT' : 'HUMAN'
          console.log(`[VERIFICADOR] Operador envía mensaje manual ordinario desde celular. continueAi = ${continueAi}. Nuevo estado: ${newStatus}`)
        }

        await supabase
          .from('conversations')
          .update({ status: newStatus })
          .eq('id', convData.id)

        console.log(`[OK] Mensaje manual guardado. Estado de conversación actualizado a: ${newStatus}`);

        let auditEvent = 'MANUAL_MESSAGE_DETECTED'
        let auditDetails = `Mensaje manual enviado desde el celular. Estado de conversación: ${newStatus === 'BOT' ? 'Bot Activo' : 'Pausado (Handoff)'}`
        if (isBotTriggered) {
          auditEvent = 'BOT_REACTIVATED'
          auditDetails = `Bot reactivado manualmente por operador desde celular.`
        } else if (isStopTriggered) {
          auditEvent = 'BOT_PAUSED'
          auditDetails = `Bot pausado manualmente por operador desde celular.`
        }

        await insertAuditLog(supabase, numData.user_id, numData.id, auditEvent, auditDetails)

        return new Response(JSON.stringify({ success: true, fromMe_processed: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      if (key && messageData) {
        const customerJid = key?.remoteJid || ""
        if (!customerJid) {
          console.warn("[WARNING] Mensaje entrante sin remoteJid. Omitiendo.");
          return new Response(JSON.stringify({ success: true, reason: 'missing_remoteJid' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        const customerPhone = customerJid.split('@')[0]
        const customerName = data.pushName || 'Cliente de WhatsApp'
        const messageId = key.id
        
        // Extraer texto del mensaje
        let textContent = messageData.conversation || 
                          messageData.extendedTextMessage?.text || 
                          messageData.imageMessage?.caption || 
                          messageData.videoMessage?.caption || 
                          messageData.documentMessage?.caption || 
                          null

        if (!textContent) {
          console.log("[OK] Mensaje recibido sin contenido de texto válido (posible sticker, audio o archivo sin leyenda). Omitiendo.");
          return new Response(JSON.stringify({ success: true, reason: 'no_text_content' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        console.log(`[OK] Mensaje de texto extraído: [${customerPhone}] (${customerName}): "${textContent}"`)

        console.log(`[VERIFICADOR] Instancia encontrada de forma global: ID ${numData.id}. ¿Bot Activo?: ${numData.bot_enabled}`)

        // B. Asegurar que la conversación exista en la base de datos sin sobreescribir last_message_at
        let { data: convData, error: convErr } = await supabase
          .from('conversations')
          .select('*')
          .eq('number_id', numData.id)
          .eq('customer_phone', customerPhone)
          .maybeSingle()

        if (convErr) {
          console.error('[ERROR] Al buscar conversación en Supabase:', convErr)
          throw convErr
        }

        if (!convData) {
          console.log(`[VERIFICADOR] Conversación no encontrada para número ${numData.id} y cliente ${customerPhone}. Creando...`)
          const { data: newConv, error: createErr } = await supabase
            .from('conversations')
            .insert({
              number_id: numData.id,
              customer_phone: customerPhone,
              customer_name: customerName,
              last_message_at: new Date().toISOString()
            })
            .select()
            .single()

          if (createErr || !newConv) {
            console.error('[ERROR] Al crear la conversación en Supabase:', createErr)
            throw new Error('Database conversation error')
          }
          convData = newConv
        }

        console.log(`[VERIFICADOR] Conversación ID: ${convData.id}. Estado de handoff: ${convData.status}, Último mensaje en: ${convData.last_message_at}`)

        // C. Guardar mensaje del cliente en BD inmediatamente para el registro de tráfico
        const insertedMsg = await insertMessageToDb(supabase, convData.id, messageId, 'customer', textContent)
        if (!insertedMsg) {
          console.log("[OK] Mensaje duplicado o ya procesado anteriormente. Omitiendo.");
          return new Response(JSON.stringify({ success: true, status: 'duplicate_message' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        // D. Si el bot está desactivado, finalizamos aquí (el mensaje ya quedó registrado en tráfico)
        if (!numData.bot_enabled) {
          console.log(`[OK] El Bot está desactivado (bot_enabled = false) para la sesión ${instance}. Mensaje guardado en tráfico.`);
          await insertAuditLog(supabase, numData.user_id, numData.id, 'BOT_DISABLED', `Mensaje recibido de ${customerPhone} pero el Bot está inactivo en este número.`)
          return new Response(JSON.stringify({ success: true, bot_enabled: false }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        // F. Obtener la configuración del bot para este número (cargado anticipadamente)
        const { data: botConfig, error: configErr } = await supabase
          .from('bot_configurations')
          .select('*, agents(*)')
          .eq('number_id', numData.id)
          .single()

        if (configErr || !botConfig) {
          console.error('[ERROR] No se encontró configuración de bot activa para el número ID:', numData.id, configErr)
          await insertAuditLog(supabase, numData.user_id, numData.id, 'BOT_DISABLED', 'No se encontró la configuración del bot en la base de datos. Por favor, abre la app y haz clic en "Configurar" para completar el asistente de IA.')
          return new Response(JSON.stringify({ error: 'Bot configuration not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        console.log(`[VERIFICADOR] Configuración del Bot cargada: Agent ID ${botConfig.agent_id}, Connection ID ${botConfig.connection_id}`)

        // E. Evaluar reactivación si el estado actual es HUMAN (Modo Manual)
        const normBotTrigger = (botConfig.bot_trigger || 'bot').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
        const normStopTrigger = (botConfig.stop_trigger || 'stop').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
        const normalizedMsg = textContent.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()

        if (convData.status === 'HUMAN') {
          const isBotTriggered = normalizedMsg === normBotTrigger
          let isInactive = false

          if (botConfig.inactivity_wait_minutes > 0 && convData.last_message_at) {
            const now = new Date()
            const lastMessageTime = new Date(convData.last_message_at)
            const diffMinutes = (now.getTime() - lastMessageTime.getTime()) / (1000 * 60)
            if (diffMinutes >= botConfig.inactivity_wait_minutes) {
              isInactive = true
            }
            console.log(`[VERIFICADOR] Conversación en HUMAN. Diferencia de tiempo: ${diffMinutes.toFixed(2)} min (Espera: ${botConfig.inactivity_wait_minutes} min). Inactivo: ${isInactive}`)
          }

          if (isBotTriggered || isInactive) {
            console.log(`[VERIFICADOR] Reactivando bot (isBotTriggered: ${isBotTriggered}, isInactive: ${isInactive})`)
            const { error: updateErr } = await supabase
              .from('conversations')
              .update({ status: 'BOT' })
              .eq('id', convData.id)

            if (updateErr) {
              console.error("[ERROR] Al actualizar estado de la conversación a BOT:", updateErr)
            } else {
              convData.status = 'BOT'
              const logDetails = isBotTriggered
                ? `Bot reactivado manualmente por palabra clave "${botConfig.bot_trigger}" del cliente.`
                : `Bot reactivado automáticamente por inactividad de ${botConfig.inactivity_wait_minutes} minutos.`
              await insertAuditLog(supabase, numData.user_id, numData.id, 'BOT_REACTIVATED', logDetails)
            }
          }
        }

        // Si sigue estando en modo HUMAN, omitimos la IA
        if (convData.status === 'HUMAN') {
          console.log(`[OK] Conversación con ${customerPhone} está en modo manual (HUMAN). Mensaje guardado, omitiendo IA.`)
          await insertAuditLog(supabase, numData.user_id, numData.id, 'HANDOFF_ACTIVE', `Mensaje recibido de ${customerPhone} pero omitido por estar en modo manual (Operador Humano).`)
          return new Response(JSON.stringify({ success: true, status: 'human_intervention' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        // G. Validar Filtros de Destinatarios (Guardados vs No Guardados)
        let isContactSaved = false
        if (EVOLUTION_API_URL && EVOLUTION_API_TOKEN) {
          console.log(`[VERIFICADOR] Buscando contacto ${customerJid} en Evolution API: ${EVOLUTION_API_URL}`)
          try {
            const findContactsRes = await fetchWithTimeout(`${EVOLUTION_API_URL}/chat/findContacts/${instance}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': EVOLUTION_API_TOKEN
              },
              body: JSON.stringify({
                where: {
                  id: customerJid
                }
              }),
              timeout: 8000
            })
            
            if (findContactsRes.ok) {
              const contacts = await findContactsRes.json()
              console.log(`[VERIFICADOR] Respuesta findContacts:`, JSON.stringify(contacts))
              if (Array.isArray(contacts) && contacts.length > 0) {
                const matched = contacts.find((c: any) => c.id === customerJid || c.remoteJid === customerJid)
                if (matched) {
                  isContactSaved = !!(matched.name && matched.name.trim() !== "")
                  console.log(`[VERIFICADOR] Contacto coincidente: name = "${matched.name}", pushName = "${matched.pushName}"`)
                }
              }
            } else {
              console.error(`[ERROR] Al consultar contactos en Evolution API. Código: ${findContactsRes.status}`)
            }
          } catch (err) {
            console.error("[ERROR] Excepción llamando a findContacts de Evolution API:", err)
          }
        } else {
          console.warn("[WARNING] EVOLUTION_API_URL o EVOLUTION_API_TOKEN no están configurados en los Secretos de Supabase.");
        }
        
        console.log(`[VERIFICADOR] Remitente ${customerPhone} está guardado en contactos?:`, isContactSaved)

        const respondSaved = botConfig.respond_saved_contacts !== undefined ? botConfig.respond_saved_contacts : true
        const unsavedAction = botConfig.unsaved_contacts_action || 'respond'

        if (isContactSaved) {
          if (!respondSaved) {
            console.log(`[OK] Filtro: "No responder a contactos guardados" está activado. Finalizando.`)
            await insertAuditLog(supabase, numData.user_id, numData.id, 'CONTACT_FILTERED', `Mensaje de ${customerPhone} omitido por filtro de privacidad: "No responder a contactos guardados".`)
            return new Response(JSON.stringify({ success: true, filtered: 'saved_contact_ignored' }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
          }
        } else {
          if (unsavedAction === 'ignore') {
            console.log(`[OK] Filtro: "Ignorar números no guardados" está activado. Finalizando.`)
            await insertAuditLog(supabase, numData.user_id, numData.id, 'CONTACT_FILTERED', `Mensaje de ${customerPhone} omitido por filtro de privacidad: "Ignorar números no guardados".`)
            return new Response(JSON.stringify({ success: true, filtered: 'unsaved_contact_ignored' }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
          } else if (unsavedAction === 'fallback') {
            console.log(`[OK] Filtro: "Enviar mensaje de fallback a números no guardados" está activado.`)
            const fallbackMsg = botConfig.fallback_message || 'Hola. En este momento solo atendemos a contactos registrados.'
            
            await sendWhatsappMessage(EVOLUTION_API_URL, EVOLUTION_API_TOKEN, instance, customerPhone, fallbackMsg)
            await insertMessageToDb(supabase, convData.id, null, 'bot', fallbackMsg)
            
            await insertAuditLog(supabase, numData.user_id, numData.id, 'AI_FALLBACK', `Mensaje de número no guardado ${customerPhone} respondió con mensaje de Fallback.`)
            return new Response(JSON.stringify({ success: true, filtered: 'unsaved_contact_fallback' }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
          }
        }

        // H. Evaluar Handoff Triggers (Intervención Humana)
        const isStopTriggered = normalizedMsg === normStopTrigger
        const handoffTriggers = botConfig.handoff_triggers || []
        const isHandoffTriggered = isStopTriggered || handoffTriggers.some((t: string) => {
          const normT = t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
          return normalizedMsg.includes(normT)
        })

        if (isHandoffTriggered) {
          console.log(`[OK] Handoff activado por trigger de parada o palabra clave. Transfiriendo conversación a humano.`)
          await supabase.from('conversations').update({ status: 'HUMAN' }).eq('id', convData.id)
          
          const handoffReply = "Tu conversación ha sido transferida a un asesor. El asistente de IA se ha pausado."
          await sendWhatsappMessage(EVOLUTION_API_URL, EVOLUTION_API_TOKEN, instance, customerPhone, handoffReply)
          await insertMessageToDb(supabase, convData.id, null, 'bot', handoffReply)
          
          const triggerDetail = isStopTriggered 
            ? `Intervención humana activada por trigger de parada "${botConfig.stop_trigger}".`
            : `Intervención humana activada automáticamente por palabra clave de handoff.`
          await insertAuditLog(supabase, numData.user_id, numData.id, 'HANDOFF_TRIGGERED', `${triggerDetail} Cliente: ${customerPhone}`)

          return new Response(JSON.stringify({ success: true, status: 'handoff_triggered' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        // J. Cargar memoria contextual (últimos 10 mensajes del chat para contexto)
        const { data: historyMessages } = await supabase
          .from('messages')
          .select('sender, content, created_at')
          .eq('conversation_id', convData.id)
          .order('created_at', { ascending: false })
          .limit(10)

        const sortedHistory = (historyMessages || []).reverse()
        console.log(`[VERIFICADOR] Historial contextual cargado: ${sortedHistory.length} mensajes en memoria.`)

        // I. Evaluar Triggers de Activación (Manejo de Nulos)
        const triggerMode = botConfig.trigger_mode || 'all'
        const triggers = botConfig.triggers || []
        let triggerMatched = false

        console.log(`[VERIFICADOR] Evaluando activadores. Modo: "${triggerMode}". Palabras registradas:`, JSON.stringify(triggers))

        if (triggerMode === 'all') {
          triggerMatched = true
        } else {
          // Comprobar si hay respuestas previas del bot o del operador (indica chat ya activo)
          const hasPriorResponse = sortedHistory.some((m: any) => m.sender === 'bot' || m.sender === 'agent')
          if (hasPriorResponse) {
            console.log("[VERIFICADOR] Conversación activa con respuestas previas de IA o Agente. Omitiendo disparadores.")
            triggerMatched = true
          } else {
            if (triggerMode === 'exact') {
              triggerMatched = triggers.some((t: string) => {
                const normT = t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
                return normalizedMsg === normT
              })
            } else if (triggerMode === 'contains') {
              triggerMatched = triggers.some((t: string) => {
                const normT = t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
                return normalizedMsg.includes(normT)
              })
            }
          }
        }

        if (!triggerMatched) {
          console.log("[OK] El mensaje no coincide con ningún disparador activo. Finalizando ejecución.")
          await insertAuditLog(supabase, numData.user_id, numData.id, 'TRIGGER_MISMATCH', `Mensaje de ${customerPhone} ("${textContent.slice(0, 60)}") no coincidió con los activadores (${triggerMode}).`)
          return new Response(JSON.stringify({ success: true, status: 'trigger_not_matched' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        // I. Obtener Conexión de IA Activa y Cifrada
        const { data: connData, error: connErr } = await supabase
          .from('decrypted_ai_connections')
          .select('*')
          .eq('id', botConfig.connection_id)
          .single()

        if (connErr || !connData) {
          console.error('[ERROR] No se encontró la conexión de IA activa asignada a este bot en la tabla ai_connections.')
          return new Response(JSON.stringify({ error: 'AI Connection credentials not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        console.log(`[VERIFICADOR] Conexión de IA encontrada: Provider = ${connData.provider}, Nickname = "${connData.nickname}"`)

        // J. Ensamblar Prompt y Llamar a Proveedor
        const rulesList = botConfig.agents?.rules || []
        const rulePrompts: string[] = []

        if (rulesList.includes('short_clear')) {
          rulePrompts.push("- Responde de forma corta y clara.")
        }
        if (rulesList.includes('max_3_lines')) {
          rulePrompts.push("- Limita tus respuestas a un máximo de 3 líneas, a menos que te pidan detalles explícitos.")
        }
        if (rulesList.includes('short_questions')) {
          rulePrompts.push("- Haz preguntas cortas para guiar la conversación.")
        }
        if (rulesList.includes('avoid_repetition')) {
          rulePrompts.push("- Evita repetir información que ya se haya mencionado en el historial.")
        }
        if (rulesList.includes('natural_tone')) {
          rulePrompts.push("- Mantén un tono natural, amigable y conversacional.")
        }
        if (rulesList.includes('ask_if_missing')) {
          rulePrompts.push("- Si falta información para ayudar al cliente, haz una pregunta de forma cortés para aclararla.")
        }

        let systemPrompt = botConfig.agents?.role_prompt || "Eres un asistente virtual de IA."
        if (rulePrompts.length > 0) {
          systemPrompt += "\n\nReglas de comportamiento obligatorias:\n" + rulePrompts.join("\n")
        }

        const temperature = parseFloat(botConfig.agents?.temperature || "0.7")
        const maxTokens = parseInt(botConfig.agents?.max_tokens || "300")

        const messagesPayload = [
          { role: 'system', content: systemPrompt },
          ...sortedHistory.map((m: any) => ({
            role: m.sender === 'customer' ? 'user' : 'assistant',
            content: m.content
          }))
        ]

        console.log(`[VERIFICADOR] Llamando al LLM: ${connData.provider} con System Prompt: "${systemPrompt.slice(0, 150)}..." y temperatura ${temperature}`)
        console.log(`[VERIFICADOR] Historial de mensajes ensamblado para LLM:`, JSON.stringify(messagesPayload, null, 2))
        
        let responseText = ""
        let tokensPrompt = 0
        let tokensCompletion = 0

        // Obtener el modelo asignado al agente, con fallback al default del proveedor
        let modelName = botConfig.agents?.model
        const provider = connData.provider
        
        if (provider === 'openai') {
          if (!modelName || !modelName.startsWith('gpt-')) {
            modelName = 'gpt-4o-mini'
          }
        } else if (provider === 'claude') {
          if (!modelName || !modelName.startsWith('claude-')) {
            modelName = 'claude-haiku-4-5'
          }
        } else if (provider === 'gemini') {
          if (!modelName || !modelName.startsWith('gemini-')) {
            modelName = 'gemini-1.5-flash'
          }
        } else if (provider === 'groq') {
          if (!modelName || !modelName.startsWith('llama')) {
            modelName = 'llama3-8b-8192'
          }
        }

        console.log(`[VERIFICADOR] API Key del proveedor (${connData.provider}): "${connData.api_key ? connData.api_key.slice(0, 10) + '...' : 'VACÍA'}"`)

        try {
          if (connData.provider === 'openai' || connData.provider === 'groq' || connData.provider === 'gemini') {
            let apiUrl = 'https://api.openai.com/v1/chat/completions'
            
            if (connData.provider === 'groq') {
              apiUrl = 'https://api.groq.com/openai/v1/chat/completions'
            } else if (connData.provider === 'gemini') {
              apiUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
            }

            console.log(`[VERIFICADOR] Realizando Fetch a endpoint compatible con OpenAI: ${apiUrl} (Modelo: ${modelName})`)

            const aiRes = await fetchWithTimeout(apiUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${connData.api_key}`
              },
              body: JSON.stringify({
                model: modelName,
                messages: messagesPayload,
                temperature: temperature,
                max_tokens: maxTokens
              }),
              timeout: 18000
            })

            console.log(`[VERIFICADOR] API del proveedor respondió con Status HTTP: ${aiRes.status}`)

            if (!aiRes.ok) {
              const errorText = await aiRes.text()
              console.error(`[ERROR] La API de ${connData.provider} devolvió HTTP ${aiRes.status}:`, errorText);
              throw new Error(`Error en API del proveedor ${connData.provider}: ${errorText}`)
            }

            const aiJson = await aiRes.json()
            console.log(`[VERIFICADOR] JSON de respuesta de la API de ${connData.provider}:`, JSON.stringify(aiJson, null, 2))
            responseText = aiJson.choices?.[0]?.message?.content || ""
            tokensPrompt = aiJson.usage?.prompt_tokens || 0
            tokensCompletion = aiJson.usage?.completion_tokens || 0
          } else if (connData.provider === 'claude') {
            const system = systemPrompt
            const claudeMessages = messagesPayload.filter(m => m.role !== 'system')

            console.log(`[VERIFICADOR] Realizando Fetch a Claude (Anthropic API)... (Modelo: ${modelName}) (Prompt Caching activado)`)

            const aiRes = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': connData.api_key,
                'anthropic-version': '2023-06-01',
                'anthropic-beta': 'prompt-caching-2024-07-31'
              },
              body: JSON.stringify({
                model: modelName,
                system: [
                  {
                    type: 'text',
                    text: system,
                    cache_control: { type: 'ephemeral' }
                  }
                ],
                messages: claudeMessages,
                max_tokens: maxTokens,
                temperature: temperature
              }),
              timeout: 18000
            })

            console.log(`[VERIFICADOR] API de Claude respondió con Status HTTP: ${aiRes.status}`)

            if (!aiRes.ok) {
              const errorText = await aiRes.text()
              console.error(`[ERROR] La API de Claude devolvió HTTP ${aiRes.status}:`, errorText);
              throw new Error(`Error en API de Claude: ${errorText}`)
            }

            const aiJson = await aiRes.json()
            console.log(`[VERIFICADOR] JSON de respuesta de la API de Claude:`, JSON.stringify(aiJson, null, 2))
            responseText = aiJson.content?.[0]?.text || ""
            tokensPrompt = aiJson.usage?.input_tokens || 0
            tokensCompletion = aiJson.usage?.output_tokens || 0
          }
        } catch (llmErr) {
          console.error("[ERROR] Excepción crítica al invocar el LLM:", llmErr);
          responseText = botConfig.fallback_message || "Lo siento, tengo problemas para procesar tu solicitud ahora."
          await insertAuditLog(supabase, numData.user_id, numData.id, 'AI_ERROR', `Fallo al invocar el LLM (${connData.provider}): ${llmErr.message || llmErr}`)
        }

        console.log(`[VERIFICADOR] Respuesta LLM obtenida: "${responseText.slice(0, 100)}..."`)

        // K. Enviar Respuesta vía WhatsApp
        if (responseText && EVOLUTION_API_URL && EVOLUTION_API_TOKEN) {
          console.log(`[VERIFICADOR] Enviando mensaje de respuesta a WhatsApp: ${customerPhone}`)
          await sendWhatsappMessage(EVOLUTION_API_URL, EVOLUTION_API_TOKEN, instance, customerPhone, responseText)
          
          // Guardar el mensaje del bot en Supabase
          await insertMessageToDb(supabase, convData.id, null, 'bot', responseText)
          
          // Log success of AI processing
          await insertAuditLog(supabase, numData.user_id, numData.id, 'AI_RESPONSE', `IA respondió a ${customerPhone} exitosamente usando ${connData.provider}.`)

          // Registrar Log de Consumo
          const { costPerPrompt, costPerCompletion } = getModelRates(connData.provider, modelName || '')
          const estimatedCost = (tokensPrompt * costPerPrompt) + (tokensCompletion * costPerCompletion)

          await supabase.from('usage_logs').insert({
            user_id: numData.user_id,
            number_id: numData.id,
            provider: connData.provider,
            tokens_prompt: tokensPrompt,
            tokens_completion: tokensCompletion,
            estimated_cost: estimatedCost
          })
          console.log("[OK] Uso de tokens y costo financiero registrado correctamente.");
        } else {
          console.warn("[WARNING] No se envió mensaje de respuesta debido a que no hay texto de respuesta o faltan variables globales.");
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error("💥 [ERROR CRÍTICO EXCEPCIÓN] 💥", err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

// HELPERS

function getModelRates(provider: string, model: string) {
  let costPerPrompt = 0; // Costo por token (costo por millón / 1,000,000)
  let costPerCompletion = 0;

  const normalizedModel = model.toLowerCase();

  if (provider === 'openai') {
    if (normalizedModel.includes('gpt-4o-mini')) {
      costPerPrompt = 0.15 / 1000000;
      costPerCompletion = 0.60 / 1000000;
    } else if (normalizedModel.includes('gpt-4o')) {
      costPerPrompt = 2.50 / 1000000;
      costPerCompletion = 10.00 / 1000000;
    } else {
      // Fallback
      costPerPrompt = 0.15 / 1000000;
      costPerCompletion = 0.60 / 1000000;
    }
  } else if (provider === 'claude') {
    if (normalizedModel.includes('3-5-sonnet') || normalizedModel.includes('3.5-sonnet')) {
      costPerPrompt = 3.00 / 1000000;
      costPerCompletion = 15.00 / 1000000;
    } else if (normalizedModel.includes('3-5-haiku') || normalizedModel.includes('3.5-haiku')) {
      costPerPrompt = 0.80 / 1000000;
      costPerCompletion = 4.00 / 1000000;
    } else {
      // Fallback
      costPerPrompt = 3.00 / 1000000;
      costPerCompletion = 15.00 / 1000000;
    }
  } else if (provider === 'gemini') {
    if (normalizedModel.includes('pro')) {
      costPerPrompt = 1.25 / 1000000;
      costPerCompletion = 5.00 / 1000000;
    } else {
      // Fallback a Flash
      costPerPrompt = 0.075 / 1000000;
      costPerCompletion = 0.30 / 1000000;
    }
  } else if (provider === 'groq') {
    if (normalizedModel.includes('70b')) {
      costPerPrompt = 0.59 / 1000000;
      costPerCompletion = 0.79 / 1000000;
    } else {
      // Fallback a 8B
      costPerPrompt = 0.05 / 1000000;
      costPerCompletion = 0.08 / 1000000;
    }
  }

  return { costPerPrompt, costPerCompletion };
}

async function insertMessageToDb(supabase: any, conversationId: string, messageId: string | null, sender: string, content: string) {
  const insertPayload: any = {
    conversation_id: conversationId,
    sender,
    content
  }
  if (messageId) {
    insertPayload.whatsapp_message_id = messageId
  }
  
  const { data, error } = await supabase
    .from('messages')
    .insert(insertPayload)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') { // Duplicado
      return null
    }
    console.error('[ERROR] Insertando mensaje en BD Supabase:', error)
    return null
  }
  return data
}

async function sendWhatsappMessage(serverUrl: string, apikey: string, instanceName: string, number: string, text: string): Promise<string | null> {
  if (!serverUrl || !apikey) {
    console.error("[ERROR] No se puede enviar mensaje: faltan serverUrl o apikey.")
    return null
  }
  const cleanUrl = serverUrl.endsWith('/') ? serverUrl.slice(0, -1) : serverUrl
  const url = `${cleanUrl}/message/sendText/${instanceName}`
  
  console.log(`[VERIFICADOR] Llamando sendText de Evolution API: ${url}`)
  try {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apikey
      },
      body: JSON.stringify({
        number,
        text,
        delay: 1200
      }),
      timeout: 10000
    })

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[ERROR] sendText falló. HTTP status: ${res.status}. Detalle: ${errorText}`)
    } else {
      const resJson = await res.json()
      const msgId = resJson?.key?.id || null
      console.log(`[OK] Mensaje de texto enviado con éxito a ${number}, ID: ${msgId}`)
      return msgId
    }
  } catch (e) {
    console.error("[ERROR] Excepción llamando a sendText de Evolution API:", e)
  }
  return null
}

async function insertAuditLog(supabase: any, userId: string, numberId: string, eventType: string, details: string) {
  const { error } = await supabase
    .from('audit_logs')
    .insert({
      user_id: userId,
      number_id: numberId,
      event_type: eventType,
      details
    })
  if (error) {
    console.error(`[ERROR] Insertando audit_log (${eventType}):`, error)
  }
}

async function fetchWithTimeout(resource: string | URL | Request, options: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const { timeout = 15000, ...rest } = options;
  
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(resource, {
      ...rest,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}

