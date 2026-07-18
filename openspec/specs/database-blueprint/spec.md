# ZonaWa - Database Blueprint

## Purpose
Definición detallada de la base de datos SQL de ZonaWa, incluyendo tablas, relaciones, triggers de límite de recursos y políticas RLS para Supabase PostgreSQL.

## 1. Esquema de Base de Datos SQL

Este es el blueprint SQL completo optimizado para ejecutarse en **Supabase PostgreSQL**.

```sql
-- Habilitar extensiones necesarias
create extension if not exists "uuid-ossp";

-- ==========================================
-- 1. TABLA: perfiles (profiles)
-- ==========================================
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  first_name text not null,
  last_name text,
  phone text,
  timezone text default 'UTC',
  company_name text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ==========================================
-- 2. TABLA: conexiones_ia (ai_connections)
-- ==========================================
create table public.ai_connections (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  provider text not null check (provider in ('openai', 'gemini', 'groq', 'claude', 'deepseek', 'openrouter')),
  api_key text not null, -- Almacenada de forma enmascarada o cifrada
  nickname text not null,
  is_active boolean default true not null,
  default_model text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ==========================================
-- 3. TABLA: numeros_whatsapp (whatsapp_numbers)
-- ==========================================
create table public.whatsapp_numbers (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  phone_number text,
  display_name text not null,
  session_name text not null unique, -- Identificador único de instancia en Evolution API
  status text default 'CREATED' check (status in ('CREATED', 'WAITING_QR', 'CONNECTED', 'DISCONNECTED', 'ERROR', 'PAUSED')),
  bot_enabled boolean default false not null,
  webhook_secret text default substring(md5(random()::text) from 1 for 16) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ==========================================
-- 4. TABLA: agentes (agents)
-- ==========================================
create table public.agents (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  role_prompt text not null,
  model text default 'gpt-4o-mini' not null,
  rules jsonb default '[]'::jsonb not null,
  temperature numeric default 0.7 check (temperature >= 0 and temperature <= 2.0),
  max_tokens integer default 300,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ==========================================
-- 5. TABLA: configuraciones_bot (bot_configurations)
-- ==========================================
create table public.bot_configurations (
  id uuid default uuid_generate_v4() primary key,
  number_id uuid references public.whatsapp_numbers(id) on delete cascade unique not null,
  agent_id uuid references public.agents(id) on delete set null,
  connection_id uuid references public.ai_connections(id) on delete set null,
  triggers jsonb default '[]'::jsonb, -- Ejemplo: ["precio", "comprar", "horarios"]
  handoff_triggers jsonb default '["humano", "asesor", "soporte"]'::jsonb, -- Disparadores de intervención humana
  fallback_message text default 'Lo siento, no he podido procesar tu solicitud.',
  trigger_mode text default 'all' check (trigger_mode in ('all', 'exact', 'contains')) not null,
  respond_saved_contacts boolean default true not null,
  unsaved_contacts_action text default 'respond' check (unsaved_contacts_action in ('respond', 'ignore', 'fallback')) not null,
  inactivity_wait_minutes integer default 0 check (inactivity_wait_minutes >= 0) not null,
  stop_trigger text default 'stop' not null,
  bot_trigger text default 'bot' not null,
  continue_ai_after_manual boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ==========================================
-- 6. TABLA: conversaciones (conversations)
-- ==========================================
create table public.conversations (
  id uuid default uuid_generate_v4() primary key,
  number_id uuid references public.whatsapp_numbers(id) on delete cascade not null,
  customer_phone text not null,
  customer_name text,
  status text default 'BOT' check (status in ('BOT', 'HUMAN')), -- Para desactivación temporal por intervención humana
  last_message_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (number_id, customer_phone)
);

-- ==========================================
-- 7. TABLA: mensajes (messages)
-- ==========================================
create table public.messages (
  id uuid default uuid_generate_v4() primary key,
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  whatsapp_message_id text unique, -- Para deduplicar y evitar reintentos fallidos de red de Evolution API
  sender text not null check (sender in ('customer', 'bot', 'agent')),
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ==========================================
-- 8. TABLA: logs_consumo (usage_logs)
-- ==========================================
create table public.usage_logs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  number_id uuid references public.whatsapp_numbers(id) on delete cascade not null,
  provider text not null,
  tokens_prompt integer not null default 0,
  tokens_completion integer not null default 0,
  estimated_cost numeric(10,6) not null default 0.000000,
  model_name text,
  prompt_text text,
  response_text text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ==========================================
-- 9. TABLA: logs_auditoria (audit_logs)
-- ==========================================
create table public.audit_logs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  number_id uuid references public.whatsapp_numbers(id) on delete cascade,
  event_type text not null,
  details text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
```

---

## 2. Restricciones de Negocio mediante Triggers

Para garantizar el cumplimiento estricto de las reglas del plan básico multi-usuario, se configuran disparadores a nivel de base de datos.

### A. Límite de 6 Números Máximo por Usuario
```sql
create or replace function public.check_max_whatsapp_numbers() 
returns trigger as $$
begin
  if (select count(*) from public.whatsapp_numbers where user_id = new.user_id) >= 6 then
    raise exception 'Límite excedido: Solo puedes registrar un máximo de 6 números de WhatsApp.';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger tr_check_max_whatsapp_numbers
  before insert on public.whatsapp_numbers
  for each row execute function public.check_max_whatsapp_numbers();
```

### B. Límite de 5 Bots Activos Simultáneamente
```sql
create or replace function public.check_max_active_bots()
returns trigger as $$
begin
  if new.bot_enabled = true then
    if (select count(*) from public.whatsapp_numbers where user_id = new.user_id and bot_enabled = true and id != new.id) >= 5 then
      raise exception 'Límite activo excedido: Solo puedes tener un máximo de 5 bots activos simultáneamente.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger tr_check_max_active_bots
  before insert or update of bot_enabled on public.whatsapp_numbers
  for each row execute function public.check_max_active_bots();

### C. Cifrado Automático de API Keys
```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.encrypt_api_key_trigger()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (NEW.api_key <> OLD.api_key) THEN
    IF NEW.api_key NOT LIKE 'hQ%' AND NEW.api_key NOT LIKE 'y2h%' AND NEW.api_key NOT LIKE 'ww0E%' THEN
      NEW.api_key := encode(extensions.pgp_sym_encrypt(NEW.api_key, 'super-secret-vault-key-123'), 'base64');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_encrypt_api_key
  BEFORE INSERT OR UPDATE ON public.ai_connections
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_api_key_trigger();
```

### D. Vista Segura de Descifrado
```sql
CREATE OR REPLACE VIEW public.decrypted_ai_connections 
WITH (security_invoker = true) AS
SELECT 
  id,
  user_id,
  provider,
  CASE 
    WHEN user_id = auth.uid() OR auth.role() = 'service_role' 
      THEN extensions.pgp_sym_decrypt(decode(api_key, 'base64'), 'super-secret-vault-key-123')
    ELSE '***'
  END AS api_key,
  nickname,
  is_active,
  created_at
FROM public.ai_connections;
```

---

## 3. Políticas de Row Level Security (RLS)

Toda consulta pasa obligatoriamente por el filtro de seguridad de Supabase Auth, asegurando el aislamiento absoluto de los datos por inquilino.

```sql
alter table public.profiles enable row level security;
alter table public.ai_connections enable row level security;
alter table public.whatsapp_numbers enable row level security;
alter table public.agents enable row level security;
alter table public.bot_configurations enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.usage_logs enable row level security;
alter table public.audit_logs enable row level security;

-- Políticas de lectura/escritura restringidas al uid del usuario autenticado
create policy "Propietario de Perfil" on public.profiles
  for all using (auth.uid() = id);

create policy "Propietario de Conexiones IA" on public.ai_connections
  for all using (auth.uid() = user_id);

create policy "Propietario de Números WhatsApp" on public.whatsapp_numbers
  for all using (auth.uid() = user_id);

create policy "Propietario de Agentes IA" on public.agents
  for all using (auth.uid() = user_id);

create policy "Propietario de Configuración de Bot" on public.bot_configurations
  for all using (
    exists (
      select 1 from public.whatsapp_numbers 
      where whatsapp_numbers.id = bot_configurations.number_id 
      and whatsapp_numbers.user_id = auth.uid()
    )
  );

create policy "Propietario de Conversaciones" on public.conversations
  for all using (
    exists (
      select 1 from public.whatsapp_numbers 
      where whatsapp_numbers.id = conversations.number_id 
      and whatsapp_numbers.user_id = auth.uid()
    )
  );

create policy "Propietario de Mensajes" on public.messages
  for all using (
    exists (
      select 1 from public.conversations
      join public.whatsapp_numbers on whatsapp_numbers.id = conversations.number_id
      where conversations.id = messages.conversation_id
      and whatsapp_numbers.user_id = auth.uid()
    )
  );

create policy "Propietario de Logs de Consumo" on public.usage_logs
  for all using (auth.uid() = user_id);

create policy "Propietario de Logs de Auditoría" on public.audit_logs
  for all using (auth.uid() = user_id);
```

## Requirements
### Requirement: Aislamiento estricto de Datos con RLS y Triggers
La base de datos SHALL forzar el aislamiento por tenant/user mediante políticas RLS y limitar a un máximo de 6 números registrados y 5 bots activos.

#### Scenario: Inserción de un número de WhatsApp que excede el límite
- **WHEN** Un usuario intenta registrar un séptimo número de WhatsApp
- **THEN** El trigger tr_check_max_whatsapp_numbers arroja una excepción de base de datos y rechaza la inserción.

### Requirement: Almacenamiento de Tráfico y Metadatos de IA
La tabla `usage_logs` SHALL almacenar la información detallada del tráfico de IA, incluyendo el modelo utilizado, el prompt y la respuesta.

#### Scenario: Inserción de un log de consumo con detalles de tráfico de IA
- **WHEN** El webhook de WhatsApp realiza una llamada exitosa a un LLM
- **THEN** Se inserta una fila en `usage_logs` conteniendo `provider`, `model_name`, `prompt_text`, `response_text`, tokens e `estimated_cost`.
