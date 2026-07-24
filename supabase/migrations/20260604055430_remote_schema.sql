-- Habilitar extensiones necesarias
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto" with schema extensions;

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

-- Trigger para sincronizar automáticamente el perfil al registrar un usuario en auth.users
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, first_name, last_name, timezone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'given_name', split_part(new.email, '@', 1), 'Usuario'),
    coalesce(new.raw_user_meta_data->>'last_name', new.raw_user_meta_data->>'family_name', ''),
    'UTC'
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ==========================================
-- 2. TABLA: conexiones_ia (ai_connections)
-- ==========================================
create table public.ai_connections (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  provider text not null check (provider in ('openai', 'gemini', 'groq', 'claude', 'deepseek', 'openrouter')),
  api_key text not null,
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
  session_name text not null unique,
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
  triggers jsonb default '[]'::jsonb,
  handoff_triggers jsonb default '["humano", "asesor", "soporte"]'::jsonb,
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
  status text default 'BOT' check (status in ('BOT', 'HUMAN')),
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
  whatsapp_message_id text unique,
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

-- ==========================================
-- TRIGGERS DE LÍMITES DE NEGOCIO
-- ==========================================

-- Límite de 6 Números Máximo por Usuario
create or replace function public.check_max_whatsapp_numbers() 
returns trigger as $$
begin
  if (select count(*) from public.whatsapp_numbers where user_id = new.user_id) >= 6 then
    raise exception 'Límite excedido: Solo puedes registrar un máximo de 6 números de WhatsApp.';
  end if;
  return new;
end;
$$ language plpgsql;

create or replace trigger tr_check_max_whatsapp_numbers
  before insert on public.whatsapp_numbers
  for each row execute function public.check_max_whatsapp_numbers();

-- Límite de 5 Bots Activos Simultáneamente
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

create or replace trigger tr_check_max_active_bots
  before insert or update of bot_enabled on public.whatsapp_numbers
  for each row execute function public.check_max_active_bots();

-- ==========================================
-- CIFRADO AUTOMÁTICO DE API KEYS
-- ==========================================

create or replace function public.encrypt_api_key_trigger()
returns trigger as $$
begin
  if TG_OP = 'INSERT' or (NEW.api_key <> OLD.api_key) then
    -- Evitar re-cifrar si ya empieza por los prefijos de cifrado ('hQ', 'y2h', 'ww0E')
    if NEW.api_key not like 'hQ%' and NEW.api_key not like 'y2h%' and NEW.api_key not like 'ww0E%' then
      NEW.api_key := encode(extensions.pgp_sym_encrypt(NEW.api_key, coalesce(nullif(current_setting('app.settings.encryption_key', true), ''), 'fallback-development-encryption-key')), 'base64');
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger tr_encrypt_api_key
  before insert or update on public.ai_connections
  for each row execute function public.encrypt_api_key_trigger();

-- Vista segura de descifrado
create or replace view public.decrypted_ai_connections 
with (security_invoker = true) as
select 
  id,
  user_id,
  provider,
  case 
    when user_id = auth.uid() or auth.role() = 'service_role' 
      then extensions.pgp_sym_decrypt(decode(api_key, 'base64'), coalesce(nullif(current_setting('app.settings.encryption_key', true), ''), 'fallback-development-encryption-key'))
    else '***'
  end as api_key,
  nickname,
  is_active,
  created_at
from public.ai_connections;

grant select on public.decrypted_ai_connections to authenticated, service_role;

-- ==========================================
-- POLÍTICAS DE ROW LEVEL SECURITY (RLS)
-- ==========================================

alter table public.profiles enable row level security;
alter table public.ai_connections enable row level security;
alter table public.whatsapp_numbers enable row level security;
alter table public.agents enable row level security;
alter table public.bot_configurations enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.usage_logs enable row level security;
alter table public.audit_logs enable row level security;

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

-- ==========================================
-- REPLICACIÓN EN TIEMPO REAL (SUPABASE REALTIME)
-- ==========================================

begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime;
commit;

alter publication supabase_realtime add table public.whatsapp_numbers;
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.usage_logs;
