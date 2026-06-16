# ZonaWa - Agent System

## Purpose
Describir la configuración del agente, el motor de disparadores, la memoria de conversación de 24 horas y las reglas de handoff y reactivación manual/automática.

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

## 5. Mecanismo de Handoff (Intervención Humana) y Reglas Avanzadas

Para evitar que el bot interrumpa cuando un operador humano está chateando con el cliente, se implementa un sistema de control de estado por chat (Handoff) con reglas automáticas avanzadas.

### A. Estructura de Control en la Conversación:
La tabla `conversations` tiene una columna `status` que puede ser:
- `'BOT'`: El bot de IA tiene el control del chat y responde de forma automatizada.
- `'HUMAN'`: El chat está en modo manual. El bot no responderá a menos que se cumplan las reglas automáticas de reactivación.

### B. Reglas de Transición y Triggers en Chat:

1. **Pausa Manual (Intervención del Operador):**
   - **Desde la Web App**: Al chatear en vivo desde ZonaWa, el bot se cambia automáticamente a modo `'HUMAN'`.
   - **Desde el Celular (Escribiendo por WhatsApp)**: Si el operador envía un mensaje en el chat, el webhook detecta el evento con `fromMe = true`. Si el contenido no coincide con el trigger del bot, el webhook guarda el mensaje como `'agent'` y cambia el estado de la conversación a `'HUMAN'`.
   - **Trigger de Pausa (Stop Trigger)**: Si el operador o el cliente envían el comando configurado en `bot_configurations.stop_trigger` (por defecto `'stop'`), la conversación se cambia inmediatamente a `'HUMAN'`, se registra un evento en la bitácora y el bot se silencia.

2. **Reactivación Manual (Resumen del Bot):**
   - **Desde la Web App**: El operador hace clic en "Activar Bot" en la interfaz, restableciendo el estado a `'BOT'`.
   - **Desde el Chat (Escribiendo por WhatsApp)**: Si el operador (o el cliente) escribe la palabra clave configurada en `bot_configurations.bot_trigger` (por defecto `'bot'`), el webhook cambia de inmediato el estado a `'BOT'` e invoca al LLM para responder de inmediato al cliente.

3. **Reactivación Automática por Inactividad (Inactivity Timeout):**
   - Si un chat está en modo `'HUMAN'`, cuando llega un nuevo mensaje del cliente, el webhook evalúa `bot_configurations.inactivity_wait_minutes`.
   - Si este parámetro es mayor que `0`, se calcula el tiempo transcurrido desde el último mensaje registrado en la conversación (`last_message_at`).
   - Si el tiempo de inactividad es igual o superior al límite de minutos configurado, el estado de la conversación se cambia automáticamente a `'BOT'`, se registra la reactivación por inactividad en la bitácora de auditoría, y la IA genera y envía una respuesta.
   - Si no ha transcurrido suficiente tiempo, la conversación permanece en `'HUMAN'` y el bot sigue silenciado.

---

## 6. Unificación de Estilo de IA

Para evitar confusión en el sistema, las nociones de **Rol del Agente**, **System Prompt** e **Identidad** se unifican bajo el concepto de **Estilo de IA**.
El Estilo de IA define:
- El prompt de comportamiento principal (`role_prompt`).
- El modelo del LLM a utilizar.
- Las reglas de negocio adicionales (ej: respuestas de máximo 3 líneas).
- Parámetros técnicos como la temperatura y los tokens máximos.
Tanto el asistente de Onboarding como el módulo de configuraciones del número se alinean para referirse exclusivamente a este concepto.

## Requirements
### Requirement: Desactivación Automática de Respuestas en Modo Humano
El webhook orquestador SHALL desactivar las respuestas automáticas del bot si el estado de la conversación cambia a "HUMANO" o si se recibe el comando configurado en stop_trigger.

#### Scenario: Detección de Handoff Automático por Palabra Clave
- **WHEN** El cliente envía un mensaje conteniendo una palabra clave de handoff (ej: "soporte")
- **THEN** El orquestador cambia el estado de la conversación a "HUMANO" y silencia el bot.
