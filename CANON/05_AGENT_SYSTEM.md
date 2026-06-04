# ZonaWa - 05_AGENT_SYSTEM.md

## 1. Configuración del Agente IA

Cada agente en ZonaWa se comporta de acuerdo con los parámetros establecidos en su configuración. La tabla `agents` almacena la lógica del rol, mientras que `bot_configurations` asocia el agente a un número de teléfono.

* **Role Prompt (Prompt de Sistema):** Texto que define el comportamiento del bot, su contexto de negocio, tono de voz y restricciones de conversación.
  * *Ejemplo:* *"Eres un asistente virtual de ventas para 'Gimnasio Fit'. Tu único objetivo es agendar visitas guiadas. Sé cortés, responde en menos de 2 párrafos y no des precios exactos directos, invita a agendar."*
* **Temperatura (Temperature):** Control de creatividad de la respuesta.
  * Rango: `0.0` (preciso, respuestas idénticas) a `1.2` (creativo, variado).
* **Max Tokens:** Controla el tamaño de la respuesta generada por la IA para optimizar consumo.

---

## 2. Motor de Disparadores (Trigger Engine)

El orquestador no procesa todos los mensajes entrantes de WhatsApp si hay triggers configurados. La evaluación de los disparadores sigue la siguiente jerarquía:

```
[Mensaje Entrante]
        │
  (¿Hay Triggers?) ────(No)───> [Procesar con IA directamente]
        │ (Sí)
        ▼
[¿El mensaje contiene alguna palabra clave del trigger?]
        │
        ├───(Sí)───> [Procesar con IA]
        │
        └───(No)───> [Ignorar Mensaje (No responder)]
```

### Tipos de Triggers soportados (JSONB Array):
1. **Palabras Clave Simples (Keywords):** Comparación parcial de texto insensible a mayúsculas/minúsculas y acentos (ej: si el trigger es `"precio"` y el mensaje es *"¿Cuál es el precio del curso?"*, se activa).
2. **Coincidencia Exacta:** El mensaje debe ser idéntico al disparador (ej: `"Hola"`, `"Empezar"`).
3. **Filtro de Exclusión (Opcional):** Si el mensaje contiene palabras reservadas (ej: `"humano"`, `"asesor"`), el bot se apaga para que intervenga un agente real (mecanismo de handoff).

---

## 3. Flujo y Estructura de Memoria (Memory Pipeline)

El contexto de la conversación se recupera dinámicamente de Supabase para mantener el hilo del chat sin sobrecargar la llamada de contexto de la IA.

### Recuperación de Contexto (Últimos N Mensajes)
El orquestador realiza una consulta a la base de datos buscando el historial del chat:
```sql
select sender, content 
from public.messages 
where conversation_id = $1 
and created_at > now() - interval '24 hours' -- Evita cargar historial obsoleto que confunda al agente
order by created_at desc 
limit 15;
```
*Nota: Los resultados se invierten en memoria antes de enviarse al LLM para mantener el orden cronológico correcto.*

### Mapeo al Formato de Mensajes del Chat Completion (OpenAI / Anthropic):
La lista de mensajes recuperados de Supabase se traduce al esquema esperado por la API de IA:

```json
[
  {
    "role": "system",
    "content": "Prompt de Sistema del Agente + Reglas de negocio"
  },
  // Memoria Histórica
  {
    "role": "user",
    "content": "Hola, ¿atienden hoy?"
  },
  {
    "role": "assistant",
    "content": "¡Hola! Sí, estamos atendiendo hasta las 6:00 PM."
  },
  // Mensaje Actual
  {
    "role": "user",
    "content": "¿Tienen citas libres para las 4:00 PM?"
  }
]
```

---

## 4. Ensamblador del Prompt

El pipeline de ensamblaje final junta las siguientes piezas antes de realizar la petición HTTP al LLM:

1. **System Prompt (Fijo):** El rol principal configurado en `agents.role_prompt`.
2. **Contexto de Seguridad (Fijo):** Instrucciones adicionales inyectadas por el sistema (ej: *"No menciones que eres una IA a menos que te pregunten directamente. Responde siempre en español."*).
3. **Memoria de Conversación (Dinámico):** Los últimos $N$ mensajes convertidos al formato del proveedor de IA.
4. **Mensaje Entrante del Usuario (Dinámico):** El último mensaje recibido de Evolution API.

---

## 5. Mecanismo de Handoff (Intervención Humana)

Para evitar que el bot interrumpa cuando un operador humano está chateando con el cliente, se implementa un sistema de control de estado por chat (Handoff).

### Flujo de Intervención:
1. **Creación Segura de Conversación (Evitar Condiciones de Carrera):**
   Cuando llega un mensaje, el orquestador realiza una inserción de tipo Upsert para la conversación para evitar errores de concurrencia cuando ingresan múltiples mensajes al mismo tiempo para un chat nuevo:
   ```sql
   insert into public.conversations (number_id, customer_phone, last_message_at, status)
   values ($1, $2, now(), 'BOT')
   on conflict (number_id, customer_phone) 
   do update set last_message_at = excluded.last_message_at
   returning id, status;
   ```
2. **Activación Automática (Triggers de Escape):** 
   Si el mensaje entrante coincide con algún disparador configurado dinámicamente en `bot_configurations.handoff_triggers` (ej: `["humano", "asesor", "soporte"]`), el orquestador:
   * Modifica `conversations.status` a `'HUMAN'` para esa conversación.
   * Envía un mensaje de transición (ej: *"Te estoy transfiriendo con un asesor humano. En un momento te atenderán."*).
   * Genera un log en `audit_logs` y notifica al operador.
3. **Activación Manual (Desde la UI):**
   El operador presiona el botón "Pausar Bot" en la interfaz de chat, ejecutando un `UPDATE conversations SET status = 'HUMAN'`.

### Control de Webhook:
En la Edge Function, antes de evaluar los triggers estándar o llamar al LLM:
* Se valida el `status` obtenido del paso de inserción/upsert de la conversación.
* Si `status = 'HUMAN'`, la función inserta el mensaje del cliente en la tabla `messages` usando el ID único para deduplicar, y **finaliza inmediatamente la ejecución con un 200 OK** sin realizar llamadas al LLM.

### Retorno al Modo Bot:
* El bot se reactiva únicamente cuando el operador humano presiona "Reactivar Bot" en la plataforma, restableciendo `status = 'BOT'`.

