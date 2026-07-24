# ZonaWa 🚀
### *Plataforma SaaS Multi-Tenant para Automatización de WhatsApp con Orquestación Multi-IA*

[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Deno Deploy](https://img.shields.io/badge/Deno--Deploy-000000?style=for-the-badge&logo=deno&logoColor=white)](https://deno.com/deploy)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com)
[![WhatsApp API](https://img.shields.io/badge/WhatsApp--API-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://github.com/evolution-api/evolution-api)

**ZonaWa** es una solución SaaS multi-tenant diseñada para automatizar la atención al cliente en WhatsApp, permitiendo conectar múltiples números y asociar cada uno a un agente de Inteligencia Artificial (IA) personalizado. El sistema soporta la orquestación en tiempo real de múltiples proveedores de LLM de primer nivel (**OpenAI, Anthropic Claude, Google Gemini y Groq**).

---

## 💡 El Desafío de Ingeniería y la Solución
**El Problema:** La API de WhatsApp (a través de Evolution API) tiene un límite estricto de tiempo de respuesta para webhooks. Si un LLM tarda más de 5-10 segundos en responder, la API asume que el webhook falló y reintenta el envío del mensaje repetidas veces, lo que genera bucles infinitos de respuestas duplicadas al usuario.

**La Solución:** Una arquitectura asíncrona desacoplada en la capa del backend:
1. **Recepción Inmediata:** La Supabase Edge Function recibe el webhook, valida la autenticidad del mensaje y lo registra en base de datos.
2. **Deduplicación:** La clave primaria única (`whatsapp_message_id`) previene colisiones y reintentos automáticos.
3. **Respuesta Rápida (200 OK):** La función devuelve inmediatamente una respuesta de éxito a Evolution API en menos de **200ms**, liberando la conexión.
4. **Procesamiento en Background:** Usando `EdgeRuntime.waitUntil()`, la función continúa ejecutándose en segundo plano para estructurar la memoria contextual, consultar el LLM seleccionado, despachar la respuesta al cliente y registrar las métricas de costos de tokens.

---

## 🛠️ Características Principales

* 🔐 **Seguridad Multi-Tenant Nativa:** Aislamiento de base de datos a nivel de registro mediante políticas de **Row Level Security (RLS)** en PostgreSQL. Un usuario nunca puede ver la configuración, números o chats de otro.
* 🤖 **Motor de Agentes Flexible:** Asignación independiente de modelos y configuraciones (prompts de sistema, temperatura, tokens máximos) para cada número de WhatsApp.
* 🔄 **Handoff Humano Inteligente (Pausa/Reactivación):**
  - **Pausa Automática:** Si el cliente escribe palabras clave de soporte (ej. *"humano"*, *"asesor"*) o el operador envía un mensaje manual desde su celular, el bot se desactiva instantáneamente (pasa a modo `HUMAN`).
  - **Reactivación Dinámica:** Se reactiva a modo `BOT` mediante una palabra clave configurable o por inactividad prolongada tras un tiempo límite.
* 📊 **Panel de Consumo Financiero:** Dashboard con cálculo de costos estimados de prompts y completados según las tarifas reales de los proveedores (tokens de entrada/salida).
* 🚦 **Reglas de Límite (Triggers de BD):** Control estricto de uso (máximo **6 números registrados** y **5 bots activos** simultáneamente por cuenta).

---

## 📐 Arquitectura de Datos y Ciclo de Vida del Mensaje

```
[ Cliente WhatsApp ]
         │
         ▼ (Mensaje entrante)
  [ Evolution API ]
         │
         ▼ (Webhook HTTPS POST con Secret Token)
 ┌────────────────────────────────────────────────────────┐
 │            Supabase Edge Function (Deno)               │
 ├────────────────────────────────────────────────────────┤
 │ 1. Valida token de seguridad                           │
 │ 2. Deduplica mensaje en BD (retorna 200 OK en <200ms)  │
 │ 3. Ejecuta lógica asíncrona de fondo (waitUntil):     │
 │    - Verifica Handoff Humano                           │
 │    - Carga historial contextual (Últimos 10 mensajes)  │
 │    - Construye e invoca LLM (OpenAI/Claude/Gemini/Groq)│
 │    - Envía respuesta a Evolution API                   │
 │    - Registra consumo financiero e historial           │
 └────────────────────────────────────────────────────────┘
```

---

## 🚀 Guía de Configuración Rápida

### 1. Clonar el repositorio y Preparación local
```bash
git clone https://github.com/tu-usuario/ZonaWa.git
cd ZonaWa
npm install
```

### 2. Base de Datos (Supabase)
1. Ejecuta el esquema completo en el editor SQL de Supabase usando el archivo [20260604055430_remote_schema.sql](file:///c:/Users/Carlos/Documents/Github/ZonaWa/supabase/migrations/20260604055430_remote_schema.sql).
2. **Cifrado en reposo:** El sistema cifra de forma segura las API Keys de los proveedores de IA utilizando una clave simétrica Postgres. Define tu clave secreta de producción ejecutando la siguiente consulta en Supabase:
   ```sql
   ALTER DATABASE postgres SET "app.settings.encryption_key" TO 'mi-clave-secreta-aes-de-32-bytes-aqui';
   ```

### 3. Edge Functions (Backend)
Configura los secretos de Supabase y despliega la función del webhook:
```bash
# Vincular proyecto
supabase link --project-ref tu-project-ref-id

# Definir secretos de entorno
supabase secrets set EVOLUTION_API_URL="https://tu-evolution-api.com" \
                     EVOLUTION_API_TOKEN="tu-token-global" \
                     ENCRYPTION_KEY="tu-clave-aes-de-32-bytes"

# Desplegar
supabase functions deploy whatsapp-webhook
```

### 4. Entorno Frontend
Crea un archivo `.env` en la raíz (usa [.env.example](file:///c:/Users/Carlos/Documents/Github/ZonaWa/.env.example) como guía):
```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key-publica
VITE_APP_URL=http://localhost:5173
```
Levanta el servidor de desarrollo:
```bash
npm run dev
```

---

## 🐳 Despliegue de Evolution API + Redis en VPS
Para producción, se recomienda alojar Evolution API en un VPS con Docker Compose utilizando Redis como almacenamiento en caché de los sockets de sesión:

```yaml
version: '3.8'

services:
  evolution_api:
    image: evoapicloud/evolution-api:latest
    container_name: evolution_api
    ports:
      - "8080:8080"
    environment:
      - PORT=8080
      - DATABASE_CONNECTION_CLIENT=sqlite
      - DATABASE_CONNECTION_USE_NULL_AS_DEFAULT=true
      - CACHE_REDIS_ENABLED=true
      - CACHE_REDIS_URI=redis://redis:6379
      - CACHE_LOCAL_ENABLED=true
      - WEBSOCKET_ENABLED=true
      - WEBHOOK_GLOBAL_URL=https://tu-proyecto.supabase.co/functions/v1/whatsapp-webhook
      - WEBHOOK_GLOBAL_ENABLED=true
      - WEBHOOK_EVENTS_MESSAGES_UPSERT=true
      - WEBHOOK_EVENTS_CONNECTION_UPDATE=true
      - AUTHENTICATION_API_KEY=tu-token-global-de-evolution
    depends_on:
      - redis
    restart: always

  redis:
    image: redis:alpine
    container_name: evolution_redis
    ports:
      - "6379:6379"
    restart: always
```
Levantar servicios:
```bash
docker-compose up -d
```

---

## 🔒 Estándar de Seguridad

1. **Aislamiento por RLS:** Ninguna API Query del frontend puede comprometer el aislamiento entre inquilinos gracias a la validación de tokens JWT administrada directamente por Postgres.
2. **Cero Secretos Hardcodeados:** El control de versiones excluye archivos de entorno locales, y la clave de cifrado de base de datos se almacena en memoria de la base de datos (Postgres GUC), asegurando que el código sea público sin exponer secretos.
3. **Filtro de Privacidad:** El frontend nunca recibe las API Keys de los proveedores en texto plano. Estas viajan enmascaradas y solo se descifran en memoria del backend al momento de efectuar la llamada al proveedor de IA.
