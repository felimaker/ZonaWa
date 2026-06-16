# ZonaWa - Canonical Architecture

## Purpose
Describir la arquitectura en capas (Layers) de ZonaWa para garantizar desacoplamiento y escalabilidad, separando la interfaz, autenticación, orquestación, motores de IA y capas de WhatsApp.

## 1. Capas del Sistema

La arquitectura global de ZonaWa se organiza en capas desacopladas para garantizar el mantenimiento, escalabilidad y la fácil sustitución de componentes (por ejemplo, cambiar de proveedor de WhatsApp o de IA sin afectar la lógica del negocio).

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend Layer                      │
│                  (React / Tailwind SPA)                 │
└────────────────────────────┬────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────┐
│                  Authentication Layer                   │
│                     (Supabase Auth)                     │
└────────────────────────────┬────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────┐
│                    Application Layer                    │
│            (Supabase Client & Business Rules)           │
└────────────────────────────┬────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────┐
│                   Agent Engine Layer                    │
│            (Trigger Engine & Memory Pipeline)           │
└────────────────────────────┬────────────────────────────┘
                             ▼
┌────────────────────────────┴────────────────────────────┐
│                                                         │
│                            ▼                            │
┌─────────────────────────────────────────────────────────┐
│                   AI Providers Layer                    │
│             (OpenAI, Gemini, Claude, Groq)              │
└────────────────────────────┬────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────┐
│                     WhatsApp Layer                      │
│              (Evolution API / WebSockets)               │
└────────────────────────────┬────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────┐
│                    Persistence Layer                    │
│                (Supabase PostgreSQL + RLS)              │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Principios de Arquitectura

* **Provider Agnostic:** El motor de agentes e IA debe estar desacoplado para soportar cualquier modelo LLM comercial o local sin reescribir la lógica de triggers y memoria.
* **Event-Driven:** El flujo de mensajes se gestiona mediante eventos asíncronos iniciados por Webhooks de la capa de WhatsApp (Evolution API).
* **Secure by Default:** Todo acceso a la base de datos se rige por Row Level Security (RLS) en Supabase. Las API keys de IA se protegen en tránsito y en reposo.
* **API-First:** Toda interacción entre el frontend y el backend se realiza mediante REST APIs estándar de Supabase y Evolution API.

---

## 3. Flujo del Ciclo de Vida del Mensaje (Procesamiento Asíncrono)

Para evitar reintentos duplicados por parte de Evolution API debido a retrasos en las respuestas de los LLM (que pueden tardar hasta 10 segundos), el ciclo de vida se gestiona de forma asíncrona:

1. **Recepción:** El cliente envía un mensaje. Evolution API procesa el mensaje y genera una petición HTTP POST (Webhook) a la Edge Function de ZonaWa.
2. **Identificación y Validación Inmediata:** La Edge Function extrae el identificador de la instancia (`session_name`), verifica el estado del bot (`bot_enabled = true`) y valida la firma de seguridad.
3. **Persistencia e Interrupción Temprana:** 
   * Se inserta el mensaje entrante en la tabla `messages` usando el ID único de mensaje (`whatsapp_message_id`). Si el mensaje ya existe (reintento), la base de datos lo ignora y la función finaliza inmediatamente.
   * Se verifica el estado de la conversación (`conversations.status`). Si está en modo `'HUMAN'`, la ejecución se detiene aquí.
4. **Respuesta Rápida (200 OK):** Si la solicitud es válida y el bot está activo para este chat, la Edge Function responde inmediatamente `200 OK` (liberando el hilo de Evolution API para evitar reintentos).
5. **Ejecución en Segundo Plano (Background Task):** 
   Utilizando `EdgeRuntime.waitUntil()` en Deno Deploy, la ejecución continúa en segundo plano:
   * **Evaluación de Triggers:** Se verifica si el mensaje entrante cumple con las palabras clave o reglas configuradas. Si no coincide, se suspende la ejecución.
   * **Recuperación de Memoria:** Se consultan los mensajes recientes de la conversación (filtrando para incluir únicamente mensajes de las últimas 24 horas) para construir el historial contextual.
   * **Ensamblador del Prompt:** Se fusionan el Prompt de Sistema del Agente, la Memoria Contextual estructurada y el Mensaje del Usuario.
   * **Llamada a IA:** Se realiza la llamada HTTP asíncrona al API del proveedor de IA.
   * **Envío de Respuesta:** Se envía el texto generado de vuelta al cliente mediante la API de Evolution API (`POST /message/sendText`).
   * **Registro de Métricas:** Se registra la respuesta en la tabla `messages` y se calcula/guarda el uso de tokens en `usage_logs`.

## Requirements
### Requirement: Procesamiento Asíncrono de Mensajes
El sistema SHALL procesar los mensajes de forma asíncrona para evitar reintentos duplicados por parte de la API de WhatsApp.

#### Scenario: Recepción de Webhook
- **WHEN** Se recibe un webhook de Evolution API
- **THEN** Se valida la firma, se inserta el mensaje en base de datos y se responde con 200 OK inmediatamente, continuando el procesamiento en segundo plano.
