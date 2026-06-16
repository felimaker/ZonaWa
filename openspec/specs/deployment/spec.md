# ZonaWa - Deployment

## Purpose
Describir los procedimientos para el despliegue del backend en Supabase, la configuración de Evolution API en VPS mediante Docker Compose, y la compilación/despliegue de la SPA del frontend en Vercel.

## 1. Despliegue de la Base de Datos y Backend (Supabase)

### A. Estructura de Base de Datos
1. Accede al Panel de Control de Supabase.
2. Ve al **SQL Editor**.
3. Pega e inicializa el script SQL completo de [database-blueprint/spec.md](file:///Users/carlos/Documents/ZonaWa/openspec/specs/database-blueprint/spec.md).

### B. Despliegue de Edge Functions
Utiliza la CLI de Supabase para subir las funciones de orquestación (Webhook):
1. Inicia sesión en la CLI:
   ```bash
   supabase login
   ```
2. Asocia tu proyecto local con Supabase:
   ```bash
   supabase link --project-ref your-project-ref-id
   ```
3. Sube los secretos de entorno:
   ```bash
   supabase secrets set EVOLUTION_API_URL="https://your-domain.com" EVOLUTION_API_TOKEN="token" ENCRYPTION_KEY="key"
   ```
4. Despliega la función:
   ```bash
   supabase functions deploy whatsapp-webhook
   ```

---

## 2. Hospedaje y Configuración de Evolution API

Evolution API se ejecuta idealmente mediante **Docker** en un servidor virtual privado (VPS) como DigitalOcean, AWS o Hetzner.

### Configuración mediante Docker Compose
Crea un archivo `docker-compose.yml` en tu VPS para levantar Evolution API en conjunto con una base de datos Redis para optimizar el almacenamiento en caché de las sesiones WebSocket:

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
      - CACHE_REDIS_URI=redis://redis:6339
      - CACHE_LOCAL_ENABLED=true
      - WEBSOCKET_ENABLED=true
      - WEBHOOK_GLOBAL_URL=https://your-supabase-project.supabase.co/functions/v1/whatsapp-webhook
      - WEBHOOK_GLOBAL_ENABLED=true
      - WEBHOOK_EVENTS_ERRORS=true
      - WEBHOOK_EVENTS_MESSAGES_UPSERT=true
      - WEBHOOK_EVENTS_CONNECTION_UPDATE=true
      - AUTHENTICATION_API_KEY=your-global-evolution-token-key
    depends_on:
      - redis
    restart: always

  redis:
    image: redis:alpine
    container_name: evolution_redis
    ports:
      - "6339:6379"
    restart: always
```

---

## 3. Despliegue del Frontend (React Vite)

El frontend es una Single Page Application (SPA) estática que puede compilarse y desplegarse en plataformas serverless como **Vercel**, **Netlify** o **Cloudflare Pages**.

### Comando de Compilación Local:
```bash
npm run build
```
Este comando generará el directorio `/dist` que contiene el HTML, JS y CSS optimizados.

### Pasos para Despliegue en Vercel:
1. Conecta tu repositorio de GitHub a Vercel.
2. Agrega las variables de entorno configuradas en [env-variables/spec.md](file:///Users/carlos/Documents/ZonaWa/openspec/specs/env-variables/spec.md) en el panel de Vercel.
3. Vercel detectará la configuración de Vite y compilará la aplicación automáticamente con cada commit realizado a la rama `main`.

## Requirements
### Requirement: Uso de Caché de Sesiones en Evolution API
El despliegue de Evolution API SHALL configurarse utilizando una base de datos Redis como caché de sesiones WebSocket.

#### Scenario: Levantamiento de servicios mediante Docker Compose
- **WHEN** Se ejecuta docker-compose up -d en el VPS
- **THEN** Se inician los contenedores de Redis y Evolution API, exponiendo el puerto 8080 y estableciendo la conexión con la base de datos y caché correspondientes.
