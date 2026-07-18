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

---

## 4. Google Login e Identidad Unificada (Vincular Cuentas)

Para agilizar el registro e inicio de sesión, se implementa inicio de sesión social con Google OAuth y vinculación automática:
* **Identidad Unificada:** Si un usuario se registra con email y contraseña, y posteriormente inicia sesión con Google usando el mismo email (o viceversa), Supabase Auth vinculará automáticamente ambas identidades al mismo ID de usuario.
* **Flujo de Recuperación/Definición de Contraseña:** Un usuario que se registre a través de Google no tendrá contraseña local asignada. Si posteriormente intenta ingresar mediante credenciales clásicas, la aplicación le ofrecerá un flujo para definir su contraseña de forma segura mediante un correo de restablecimiento de contraseña.

---

## Requirements
### Requirement: Protección de Credenciales de IA
La plataforma SHALL enmascarar las llaves de API (API Keys) de IA en el cliente para evitar la filtración de credenciales.

#### Scenario: Consulta de conexiones de IA registradas
- **WHEN** El frontend solicita el listado de conexiones de IA de un usuario
- **THEN** La respuesta de la base de datos no retorna la API Key descifrada y el frontend la muestra enmascarada como "••••••••••••••••".

### Requirement: Autenticación Social y Vinculación por Email
La plataforma SHALL permitir inicio de sesión clásico y mediante Google OAuth, unificando de forma segura ambas credenciales bajo la misma cuenta cuando compartan el mismo email verificado.

#### Scenario: Inicio de sesión con Google usando un email ya registrado con contraseña
- **WHEN** El usuario inicia sesión con Google OAuth usando un correo registrado previamente en el sistema
- **THEN** Supabase asocia la identidad social a la cuenta existente, inicia sesión y carga el perfil unificado del usuario.

### Requirement: Recuperación de Acceso de Cuentas OAuth
La plataforma SHALL ofrecer un flujo de recuperación de contraseña para permitir que usuarios creados originalmente vía Google OAuth puedan establecer una contraseña local e iniciar sesión con credenciales clásicas.

#### Scenario: Usuario OAuth define contraseña
- **WHEN** El usuario solicita el restablecimiento de contraseña e ingresa su correo de Google, y sigue el enlace recibido
- **THEN** La plataforma le permite definir una contraseña local, habilitando el acceso por credenciales y conservando el acceso por Google.

