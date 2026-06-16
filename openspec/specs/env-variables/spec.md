# ZonaWa - Environment Variables

## Purpose
Describir las variables de entorno requeridas en el frontend (React/Vite) y en el backend (Supabase Edge Functions), destacando las medidas de seguridad para proteger secretos.

## 1. Variables de Entorno del Frontend (React + Vite)

Crear un archivo `.env` en la raíz del proyecto React para desarrollo local.

```bash
# URL del proyecto de Supabase
VITE_SUPABASE_URL=https://your-supabase-project-id.supabase.co

# Llave pública anónima de Supabase
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your-anon-key...

# URL base del panel del cliente (opcional para redireccionamientos)
VITE_APP_URL=http://localhost:5173
```

---

## 2. Variables de Entorno del Backend (Supabase Edge Functions)

Estas variables deben ser configuradas en el panel de control de Supabase (Settings -> API -> Edge Function Secrets) o mediante la CLI de Supabase ejecutando `supabase secrets set`.

```bash
# URL Base de Evolution API
EVOLUTION_API_URL=https://your-evolution-api-domain.com

# API Key Global de Evolution API (para crear y administrar instancias)
EVOLUTION_API_TOKEN=your-global-evolution-token-key

# Clave Maestra de Encriptación (para cifrar/descifrar API Keys de usuarios)
# Debe ser una cadena aleatoria de 32 bytes en formato hexadecimal o base64
ENCRYPTION_KEY=your-32-byte-hex-encryption-key-for-aes-256

# Llave de Servicio de Supabase (Service Role Key - usar con precaución)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your-service-role-key...
```

---

## 3. Seguridad e Inclusión en Control de Versiones

> [!WARNING]
> * **Nunca subir `.env` a GitHub:** Asegúrate de agregar `.env` y `.env.local` al archivo `.gitignore` del proyecto React.
> * **Nunca exponer la `SUPABASE_SERVICE_ROLE_KEY` o `EVOLUTION_API_TOKEN` en el cliente:** Estas llaves otorgan acceso administrativo y control total sobre el servidor de base de datos y la instancia de WhatsApp. Deben permanecer exclusivamente en la capa del backend.

## Requirements
### Requirement: Protección contra Exposición de Variables Confidenciales
La configuración del proyecto SHALL prohibir la exposición de variables confidenciales como SUPABASE_SERVICE_ROLE_KEY o EVOLUTION_API_TOKEN en el código del cliente.

#### Scenario: Carga de variables de entorno en el frontend
- **WHEN** Se compila o ejecuta el cliente de React + Vite
- **THEN** Únicamente se accede a las variables con el prefijo VITE_ y las claves confidenciales se mantienen inaccesibles para el cliente.
