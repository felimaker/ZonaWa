# ZonaWa - Migrations

## Purpose
Describir la estrategia de control de versiones y el historial de migraciones incrementales del esquema de base de datos de ZonaWa en Supabase.

Este documento define la estructura y el control de versiones de la base de datos de **ZonaWa**, sirviendo como el registro histórico y la guía de despliegue para cualquier cambio de esquema.

---

## 1. Estrategia y Control de Versiones de Base de Datos

Para garantizar la estabilidad y la consistencia en todos los entornos (desarrollo, pruebas y producción), seguimos un enfoque de **migraciones incrementales basadas en código**:

1. **Inmutabilidad:** Las migraciones ya ejecutadas nunca deben ser modificadas directamente en su archivo original. Cualquier cambio posterior (añadir columnas, modificar restricciones, etc.) debe ser una nueva migración con un número de versión secuencial.
2. **Numeración Secuencial:** Cada archivo de migración reside en la carpeta `database/migrations/` (o se documenta aquí secuencialmente) con el formato `V[Version]__[Nombre_Descriptivo].sql` (ej. `V1.0.0__esquema_inicial.sql`).
3. **Estrategia de Rollback:** Cada migración debe planificarse con un script de reversión (Rollback) documentado para deshacer los cambios en caso de fallos críticos durante el despliegue.

---

## 2. Migración Inicial (v1.0.0) - Esquema Base de la Aplicación

La versión **v1.0.0** representa el punto de partida completo del proyecto e inicializa el modelo relacional, las políticas RLS y los triggers de negocio.

- **Archivo Fuente:** [schema.sql](file:///Users/carlos/Documents/ZonaWa/database/schema.sql)
- **Fecha de Creación:** 2026-06-03
- **Estado:** Pendiente de ejecución en producción.

### Resumen de Tablas Creadas
1. `profiles`: Almacena la información de perfil de los usuarios autenticados.
2. `ai_connections`: Credenciales y llaves de API para proveedores de IA (OpenAI, Gemini, Claude, Groq) asociadas a cada usuario.
3. `whatsapp_numbers`: Configuración de instancias de WhatsApp (máximo 6 por usuario).
4. `agents`: Prompts de sistema y configuraciones de agentes (temperatura, max tokens).
5. `bot_configurations`: Asociación de números de WhatsApp con agentes de IA y palabras clave de activación/handoff.
6. `conversations`: Estado de la conversación con el cliente final (modo `BOT` o `HUMAN`).
7. `messages`: Registro histórico de mensajes enviados/recibidos.
8. `usage_logs`: Auditoría de consumo de tokens y costos estimados por llamada.
9. `audit_logs`: Registro general de eventos de seguridad y configuración.

### Triggers y Reglas de Negocio en la Base de Datos
- **`on_auth_user_created`**: Escucha el registro en `auth.users` de Supabase y crea de forma automática la fila correspondiente en `public.profiles`, extrayendo los nombres provistos en los metadatos del usuario.
- **`tr_check_max_whatsapp_numbers`**: Valida antes de insertar en `public.whatsapp_numbers` que el usuario no exceda el límite de **6 números registrados**.
- **`tr_check_max_active_bots`**: Valida antes de activar un bot (`bot_enabled = true`) que el usuario no exceda el límite de **5 bots activos simultáneamente**.

---

## 3. Instrucciones de Ejecución

### A. Manualmente (Recomendado para el error de consola actual)
Para reparar los errores de carga en el frontend (códigos 404 en endpoints de Supabase REST):

1. Abre el panel de control de Supabase de este proyecto: [Dashboard Supabase - bekqrkvuwloicbuygdia](https://supabase.com/dashboard/project/bekqrkvuwloicbuygdia).
2. Ve a la barra lateral izquierda y haz clic en **SQL Editor**.
3. Haz clic en **New Query**.
4. Abre localmente el archivo [schema.sql](file:///Users/carlos/Documents/ZonaWa/database/schema.sql) y copia su contenido completo.
5. Pégalo en el editor de SQL y haz clic en el botón **Run** (esquina inferior derecha).
6. Verifica que la consola indique "Success. No rows returned."

### B. Vía Supabase CLI (Para entornos locales o pipelines CI/CD)
Si estás desarrollando localmente con la CLI de Supabase:
```bash
# Iniciar Supabase localmente (si aplica)
supabase start

# Crear un archivo de migración vacío
supabase migration new esquema_inicial

# Copiar el contenido de database/schema.sql al archivo recién creado en supabase/migrations/
# Y finalmente aplicar las migraciones localmente:
supabase db reset
```

---

## 4. Guía para Futuras Migraciones

Cuando sea necesario realizar cambios estructurales (por ejemplo, añadir un nuevo proveedor de IA o cambiar tipos de datos), sigue estos pasos:

### Paso 1: Diseño de la Migración
Crea un archivo SQL secuencial con las modificaciones. Ejemplo de contenido para añadir una columna:
```sql
-- database/migrations/V1.1.0__add_model_name_to_bot_configurations.sql
-- Propósito: Añadir selección de modelo específico al bot.

ALTER TABLE public.bot_configurations 
ADD COLUMN model_name text DEFAULT 'gpt-4o' NOT NULL;

-- Documentación en el archivo del plan.
```

### Paso 2: Planificar el Rollback
Define cómo revertir la migración en caso de error. Ejemplo:
```sql
-- Rollback de V1.1.0
ALTER TABLE public.bot_configurations DROP COLUMN model_name;
```

### Paso 3: RLS (Row Level Security) y Permisos
Si se crea una nueva tabla, es obligatorio:
1. Activar RLS:
   ```sql
   ALTER TABLE public.nueva_tabla ENABLE ROW LEVEL SECURITY;
   ```
2. Declarar las políticas de acceso para el propietario basándose en su `user_id` o ID de perfil:
   ```sql
   CREATE POLICY "Propietario puede gestionar sus datos" ON public.nueva_tabla
     FOR ALL USING (auth.uid() = user_id);
   ```

### Paso 4: Pruebas y Validación
- Siempre ejecuta el script de migración primero en un entorno de desarrollo o base de datos de pruebas (staging) antes de aplicarlo en la base de datos de producción.
- Valida que las consultas de lectura y escritura del frontend sigan funcionando correctamente y no generen errores de base de datos o restricciones rotas.

---

## 5. Historial de Migraciones del Proyecto

### Migración v1.2.0 - Activadores Avanzados y Filtros de Destinatarios
- **Fecha:** 2026-06-04
- **Propósito:** Agregar columnas a la tabla `bot_configurations` para permitir al usuario configurar cómo se evalúan las palabras clave de activación y a qué remitentes debe responder el bot.
- **Script SQL (Ejecutar en Supabase SQL Editor):**
  ```sql
  ALTER TABLE public.bot_configurations
  ADD COLUMN trigger_mode text DEFAULT 'all' CHECK (trigger_mode IN ('all', 'exact', 'contains')) NOT NULL,
  ADD COLUMN respond_saved_contacts boolean DEFAULT true NOT NULL,
  ADD COLUMN unsaved_contacts_action text DEFAULT 'respond' CHECK (unsaved_contacts_action IN ('respond', 'ignore', 'fallback')) NOT NULL;
  ```
- **Rollback SQL:**
  ```sql
  ALTER TABLE public.bot_configurations
  DROP COLUMN trigger_mode,
  DROP COLUMN respond_saved_contacts,
  DROP COLUMN unsaved_contacts_action;
  ```

### Migración v1.3.0 - Modelo Dinámico de IA, Costos y Reglas de Agente
- **Fecha:** 2026-06-04
- **Propósito:** Agregar columnas de modelo dinámico y reglas en la tabla `agents` y optimizar la cantidad máxima de tokens por defecto.
- **Script SQL (Ejecutar en Supabase SQL Editor):**
  ```sql
  ALTER TABLE public.agents ADD COLUMN model text DEFAULT 'gpt-4o-mini' NOT NULL;
  ALTER TABLE public.agents ADD COLUMN rules jsonb DEFAULT '[]'::jsonb NOT NULL;
  ALTER TABLE public.agents ALTER COLUMN max_tokens SET DEFAULT 300;
  ```
- **Rollback SQL:**
  ```sql
  ALTER TABLE public.agents DROP COLUMN model;
  ALTER TABLE public.agents DROP COLUMN rules;
  ALTER TABLE public.agents ALTER COLUMN max_tokens SET DEFAULT 1000;
  ```

### Migración v1.4.0 - Reglas de Control Avanzadas de Bot en Chat
- **Fecha:** 2026-06-05
- **Propósito:** Agregar columnas `inactivity_wait_minutes`, `stop_trigger`, y `bot_trigger` a la tabla `bot_configurations` para soportar retomar la conversación por inactividad y triggers de pausa/activación en chat.
- **Script SQL (Ejecutar en Supabase SQL Editor):**
  ```sql
  ALTER TABLE public.bot_configurations
  ADD COLUMN inactivity_wait_minutes integer DEFAULT 0 CHECK (inactivity_wait_minutes >= 0) NOT NULL,
  ADD COLUMN stop_trigger text DEFAULT 'stop' NOT NULL,
  ADD COLUMN bot_trigger text DEFAULT 'bot' NOT NULL;
  ```
- **Rollback SQL:**
  ```sql
  ALTER TABLE public.bot_configurations
  DROP COLUMN inactivity_wait_minutes,
  DROP COLUMN stop_trigger,
  DROP COLUMN bot_trigger;
  ```

## Requirements
### Requirement: Inmutabilidad de las Migraciones Ejecutadas
Cualquier cambio estructural en la base de datos SHALL ejecutarse mediante un script de migración inmutable y secuencial acompañado de su correspondiente script de rollback.

#### Scenario: Ejecución de una nueva migración base
- **WHEN** Se crea el archivo V1.0.0__esquema_inicial.sql
- **THEN** Se aplica el script en Supabase SQL Editor o CLI, validando que se creen correctamente las tablas profiles, ai_connections y whatsapp_numbers con sus restricciones.
