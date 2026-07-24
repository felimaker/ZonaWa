# ZonaWa 🚀

**ZonaWa** es una plataforma SaaS multi-tenant diseñada para automatizar, orquestar y administrar la atención al cliente en WhatsApp utilizando múltiples proveedores de Inteligencia Artificial (IA) en paralelo. 

La plataforma permite a los usuarios conectar sus propios números de WhatsApp (a través de **Evolution API**) y asociar cada número a un agente de IA personalizado, configurado con prompts de sistema, roles de negocio, disparadores específicos y control de handoff humano.

---

## ✨ Características Principales

- 🔐 **SaaS Multi-tenant Seguro:** Aislamiento absoluto de datos por inquilino mediante políticas estrictas de **Row Level Security (RLS)** en Supabase.
- 🤖 **Control Multi-Agente & Multi-Proveedor:** Cada número de WhatsApp puede trabajar con un proveedor y modelo de IA diferente de forma independiente (soporte para **OpenAI, Anthropic Claude, Google Gemini y Groq**).
- 🔄 **Procesamiento de Mensajes Asíncrono:** Arquitectura basada en webhooks que responde inmediatamente con `200 OK` a Evolution API para evitar reintentos duplicados de red, procesando la lógica de IA en segundo plano (`EdgeRuntime.waitUntil`).
- 💬 **Handoff Humano Inteligente:** Capacidad de pausar/reactivar el bot automáticamente por inactividad de tiempo, palabras clave del cliente o mensajes manuales del operador desde su celular.
- 📊 **Dashboard de Consumo y Costos:** Panel detallado en tiempo real para visualizar el gasto de tokens, cantidad de mensajes e historial financiero derivado del uso de la IA.
- 🚦 **Límites de Negocio Incorporados:** Control nativo a nivel de base de datos (mediante triggers) que limita a **6 números de WhatsApp** y **5 bots activos** simultáneamente por cuenta.

---

## 🏗️ Arquitectura del Sistema

El sistema está estructurado en capas desacopladas para garantizar el mantenimiento y la escalabilidad:

1. **Frontend Layer:** Single Page Application (SPA) construida con React + Vite.
2. **Authentication Layer:** Registro, inicio de sesión y sesión segura provistos por Supabase Auth.
3. **Application & Persistence Layer:** Base de datos PostgreSQL alojada en Supabase con RLS activo para aislar los datos de los usuarios.
4. **Agent Engine Layer:** Supabase Edge Function (`whatsapp-webhook`) encargada de la deduplicación, validación de firmas, carga de memoria contextual de conversación, llamada a LLMs y envío de respuestas.
5. **WhatsApp Layer:** Evolution API expuesta en un VPS administrando las conexiones y WebSockets de WhatsApp.

---

## 🛠️ Requisitos e Instalación

### 1. Clonar el repositorio
```bash
git clone https://github.com/tu-usuario/ZonaWa.git
cd ZonaWa
```

### 2. Configuración de la Base de Datos (Supabase)
1. Crea un proyecto en [Supabase](https://supabase.com).
2. Abre el **SQL Editor** en la consola de tu proyecto.
3. Copia el contenido del archivo de migración ubicado en `supabase/migrations/20260604055430_remote_schema.sql` y ejecútalo para crear las tablas, vistas, triggers y políticas RLS.
4. Habilita el módulo de Realtime en las tablas deseadas (incluido al final del script de migración).
5. **Configura tu clave de encriptación de producción:** 
   El sistema cifra las API Keys de IA en reposo utilizando un parámetro de configuración personalizado en la base de datos (`app.settings.encryption_key`).
   - *Desarrollo Local:* Funciona de manera automática con un fallback de desarrollo (`fallback-development-encryption-key`) sin requerir acciones adicionales.
   - *Producción:* Ejecuta la siguiente sentencia en tu editor SQL de Supabase para fijar tu clave secreta de producción (no se subirá al control de versiones):
     ```sql
     ALTER DATABASE postgres SET "app.settings.encryption_key" TO 'tu-clave-secreta-robusta-y-aleatoria-aqui';
     ```

> [!IMPORTANT]  
> Mantén tu clave de encriptación de producción a resguardo. Si se altera o se pierde, las API Keys de los proveedores de IA previamente guardadas por tus usuarios no podrán descifrarse, forzándolos a actualizar su configuración.

---

### 3. Configuración y Despliegue de Supabase Edge Functions
1. Instala la CLI de Supabase de forma local e inicia sesión:
   ```bash
   supabase login
   ```
2. Enlaza tu proyecto local con el ID de tu proyecto en Supabase:
   ```bash
   supabase link --project-ref tu-project-ref-id
   ```
3. Configura los secretos requeridos por la Edge Function de webhook:
   ```bash
   supabase secrets set EVOLUTION_API_URL="https://tu-evolution-api-domain.com" \
                        EVOLUTION_API_TOKEN="tu-token-global-de-evolution" \
                        ENCRYPTION_KEY="tu-clave-aes-de-32-bytes"
   ```
4. Despliega la Edge Function:
   ```bash
   supabase functions deploy whatsapp-webhook
   ```

---

### 4. Ejecución del Frontend (React + Vite)
1. Instala las dependencias del proyecto:
   ```bash
   npm install
   ```
2. Crea un archivo `.env` en la raíz del proyecto basándote en `.env.example`:
   ```bash
   VITE_SUPABASE_URL=https://tu-proyecto-id.supabase.co
   VITE_SUPABASE_ANON_KEY=tu-anon-key-publica
   VITE_APP_URL=http://localhost:5173
   ```
3. Inicia el servidor de desarrollo:
   ```bash
   npm run dev
   ```
4. Para compilar la aplicación para producción (listo para subir a Vercel, Netlify o Cloudflare Pages):
   ```bash
   npm run build
   ```

---

### 5. Configuración de Evolution API (VPS)
Para levantar Evolution API junto con Redis (usado para almacenar en caché las sesiones de WebSocket y evitar la pérdida de emparejamientos), puedes utilizar el siguiente archivo `docker-compose.yml` en tu VPS:

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
      - WEBHOOK_GLOBAL_URL=https://tu-proyecto-id.supabase.co/functions/v1/whatsapp-webhook
      - WEBHOOK_GLOBAL_ENABLED=true
      - WEBHOOK_EVENTS_ERRORS=true
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

Ejecuta el inicio de los contenedores en tu VPS:
```bash
docker-compose up -d
```

---

## 🔒 Consideraciones de Seguridad para Producción

1. **Variables de Entorno:** El archivo `.gitignore` está configurado para excluir archivos `.env` y `.local` de manera que nunca se suban credenciales al repositorio público.
2. **Cifrado de API Keys:** Las llaves de API provistas por los usuarios finales para conectar sus modelos de OpenAI/Claude/etc. se cifran antes de guardarse en la base de datos usando `pgp_sym_encrypt` y solo se descifran en la base de datos cuando la Edge Function autorizada las solicita.
3. **Rol de servicio (Service Role Key):** La variable `SUPABASE_SERVICE_ROLE_KEY` del backend otorga privilegios de administrador y supera las políticas RLS. **Nunca** la expongas en el frontend. La comunicación del cliente siempre debe hacerse utilizando la clave anónima (`VITE_SUPABASE_ANON_KEY`) y el token JWT del usuario logueado.
