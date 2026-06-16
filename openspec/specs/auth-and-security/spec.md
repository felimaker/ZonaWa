# ZonaWa - Auth and Security

## Purpose
Describir el flujo de autenticación mediante Supabase Auth y el protocolo de cifrado en reposo para las API Keys de los proveedores de IA.

## 1. Flujo de Autenticación (Supabase Auth)

La seguridad e identidad de ZonaWa se delega a **Supabase Auth**. 

```
[Usuario] ──(Credenciales)──> [Supabase Auth]
                                    │
                         (Retorna Access JWT)
                                    │
                                    ▼
                         [Guardado en Cliente]
                                    │
                         (Adjunto en Cabeceras HTTP)
                                    │
                                    ▼
                         [Supabase RLS / Middleware]
```

### Reglas de Acceso:
* El Frontend almacena de forma segura la sesión (Local Storage / Session Storage gestionado por el SDK `@supabase/supabase-js`).
* Cualquier petición a Supabase (Select, Insert, Update, Delete) valida el JWT del usuario autenticado contra las políticas RLS.

---

## 2. Cifrado de Credenciales de IA (API Keys)

Para evitar almacenar las API Keys de los usuarios (OpenAI, Anthropic, Gemini, Groq) en texto plano en la base de datos, se establece el siguiente protocolo de cifrado en reposo utilizando la extensión `pgcrypto` en Postgres o cifrado a nivel de aplicación (Edge Function) usando una clave maestra.

### Opción A: Cifrado en Base de Datos con pgcrypto
Al inicializar la base de datos, se puede crear una clave simétrica maestra almacenada de forma segura en las variables de entorno de la base de datos o usar una clave global.

```sql
-- Habilitar extensión pgcrypto
create extension if not exists pgcrypto;

-- Función para insertar cifrando
create or replace function public.encrypt_api_key(api_key text, master_key text) 
returns bytea as $$
begin
  return pgp_sym_encrypt(api_key, master_key);
end;
$$ language plpgsql;

-- Función para leer descifrando
create or replace function public.decrypt_api_key(encrypted_key bytea, master_key text)
returns text as $$
begin
  return pgp_sym_decrypt(encrypted_key, master_key);
end;
$$ language plpgsql;
```

### Opción B: Cifrado en la Capa del Servidor (Recomendada para Edge Functions)
Las credenciales se cifran en el backend de Supabase Edge Functions usando AES-256-GCM antes de guardarlas en `ai_connections.api_key`, y se descifran únicamente en memoria de la Edge Function en el momento exacto de llamar al API del proveedor de IA.
* **Clave de Encriptación:** Guardada en la variable de entorno `ENCRYPTION_KEY` dentro del panel de Supabase.

---

## 3. Seguridad en la Integración y Logs

Para cumplir con el estándar de seguridad y privacidad:
* **No Keys en Frontend:** El cliente frontend **nunca** debe consultar la API key descifrada. La interfaz solo debe mostrar que la clave existe enmascarándola como `••••••••••••••••` o mostrando un checkbox de estado.
* **No Logs de Credenciales:** Los logs de auditoría (`audit_logs`) o de llamadas API **nunca** deben capturar el contenido del campo `api_key` o las cabeceras `Authorization` en texto plano.
* **Filtrado de Prompts:** Los prompts del sistema configurados por el usuario se validan antes de guardarse para asegurar que no contengan instrucciones maliciosas o inyecciones de código que puedan comprometer la API.

## Requirements
### Requirement: Protección de Credenciales de IA
La plataforma SHALL enmascarar las llaves de API (API Keys) de IA en el cliente para evitar la filtración de credenciales.

#### Scenario: Consulta de conexiones de IA registradas
- **WHEN** El frontend solicita el listado de conexiones de IA de un usuario
- **THEN** La respuesta de la base de datos no retorna la API Key descifrada y el frontend la muestra enmascarada como "••••••••••••••••".
