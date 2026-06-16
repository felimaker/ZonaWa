# ZonaWa - API Spec

## Purpose
Describir los endpoints e integraciones con Evolution API para control de WhatsApp y con OpenAI API para generación de respuestas y estimación de costos.

## 1. Integración con Evolution API

Toda comunicación hacia Evolution API requiere una cabecera de autenticación global (`apikey`) configurada en el servidor de Evolution.

### A. Crear Instancia de WhatsApp
Permite crear un contenedor/sesión aislado de WhatsApp.
* **Endpoint:** `POST /instance/create`
* **Headers:**
  ```http
  Content-Type: application/json
  apikey: EVOLUTION_GLOBAL_API_KEY
  ```
* **Request Body:**
  ```json
  {
    "instanceName": "session_uuid_or_name",
    "token": "opcional_token_instancia",
    "qrcode": true
  }
  ```
* **Response (201 Created):**
  ```json
  {
    "instance": {
      "instanceName": "session_uuid_or_name",
      "status": "created"
    },
    "qrcode": {
      "code": "base64_string_del_qr_o_string_de_conexion"
    }
  }
  ```

### B. Obtener Estado del QR y Conexión
Permite leer el código QR para renderizarlo en pantalla o verificar si ya se sincronizó.
* **Endpoint:** `GET /instance/connect/session_uuid_or_name`
* **Response (200 OK):**
  ```json
  {
    "status": "qrcode",
    "qrcode": "base64_string..."
  }
  ```

### C. Cerrar Sesión e Instancia
Cierra la conexión WebSocket y remueve la sesión de WhatsApp del teléfono.
* **Endpoint:** `DELETE /instance/logout/session_uuid_or_name`
* **Response (200 OK):**
  ```json
  {
    "status": "success",
    "message": "Instance logged out successfully"
  }
  ```

### D. Enviar Mensaje de Texto
Envía una respuesta generada por la IA al cliente de WhatsApp.
* **Endpoint:** `POST /message/sendText/session_uuid_or_name`
* **Request Body:**
  ```json
  {
    "number": "573000000000",
    "options": {
      "delay": 1200,
      "presence": "composing"
    },
    "textMessage": {
      "text": "Hola, este es el mensaje generado por el agente de IA."
    }
  }
  ```

### E. Configurar Webhook por Instancia (Dinámico)
Registra la URL del webhook de ZonaWa en la instancia de WhatsApp de forma individual (si no se utiliza configuración global en el servidor).
* **Endpoint:** `POST /webhook/set/session_uuid_or_name`
* **Request Body:**
  ```json
  {
    "webhook": {
      "enabled": true,
      "url": "https://your-supabase-project.supabase.co/functions/v1/whatsapp-webhook",
      "byEvents": false,
      "events": [
        "MESSAGES_UPSERT",
        "CONNECTION_UPDATE"
      ]
    }
  }
  ```

---

## 2. Especificación del Webhook (Mensajes Entrantes)

Evolution API debe enviar los webhooks al endpoint expuesto por ZonaWa (ej. `/functions/v1/whatsapp-webhook`).

### Evento: `MESSAGES_UPSERT` (Mensaje Recibido)
```json
{
  "event": "messages.upsert",
  "instance": "session_uuid_or_name",
  "data": {
    "key": {
      "remoteJid": "573000000000@s.whatsapp.net",
      "fromMe": false,
      "id": "MSG_ID_12345"
    },
    "message": {
      "conversation": "Hola, ¿qué costo tiene el servicio?"
    },
    "messageType": "conversation",
    "messageTimestamp": 1717387200,
    "pushName": "Carlos Pérez"
  }
}
```

### Algoritmo de Extracción de Texto Multiformato
Debido a que WhatsApp envía textos en distintos campos según el formato, el orquestador debe utilizar la siguiente lógica de extracción:

```typescript
function extractMessageText(data: any): string | null {
  const message = data?.message;
  if (!message) return null;

  // 1. Mensaje de Texto Simple
  if (message.conversation) {
    return message.conversation;
  }
  
  // 2. Mensajes con Enlaces o Respuestas (Quotes)
  if (message.extendedTextMessage?.text) {
    return message.extendedTextMessage.text;
  }
  
  // 3. Imágenes con Texto
  if (message.imageMessage?.caption) {
    return message.imageMessage.caption;
  }
  
  // 4. Videos con Texto
  if (message.videoMessage?.caption) {
    return message.videoMessage.caption;
  }

  // 5. Documentos con Texto
  if (message.documentMessage?.caption) {
    return message.documentMessage.caption;
  }

  return null;
}
```

---

## 3. Integración con OpenAI API

El orquestador envía las peticiones a OpenAI utilizando la siguiente estructura.

* **Endpoint:** `POST https://api.openai.com/v1/chat/completions`
* **Headers:**
  ```http
  Authorization: Bearer USER_DECRYPTED_OPENAI_API_KEY
  Content-Type: application/json
  ```
* **Request Body:**
  ```json
  {
    "model": "gpt-4o-mini",
    "messages": [
      { "role": "system", "content": "Prompt del agente..." },
      { "role": "user", "content": "Mensaje del cliente..." }
    ],
    "temperature": 0.7,
    "max_tokens": 500
  }
  ```
* **Response (200 OK) y Lectura de Consumo:**
  ```json
  {
    "id": "chatcmpl-98765",
    "choices": [
      {
        "message": {
          "role": "assistant",
          "content": "El costo del servicio es..."
        }
      }
    ],
    "usage": {
      "prompt_tokens": 150,
      "completion_tokens": 45,
      "total_tokens": 195
    }
  }
  ```
* **Cálculo de Costo en Backend:**
  $$\text{Costo Estimado} = (\text{prompt\_tokens} \times 0.00000015) + (\text{completion\_tokens} \times 0.00000060)$$

## Requirements
### Requirement: Extracción de Texto Multiformato
El webhook orquestador SHALL extraer el texto del mensaje usando el algoritmo multiformato para dar soporte a texto simple, quotes, captions de imágenes, videos y documentos.

#### Scenario: Recepción de un mensaje con imagen y leyenda (caption)
- **WHEN** Se recibe un webhook con un objeto imageMessage que contiene un caption
- **THEN** El algoritmo de extracción retorna el texto del caption para ser procesado por el bot de IA.
