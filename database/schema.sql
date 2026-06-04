-- ============================================================
-- ZonaWa - Schema SQL Completo para Supabase
-- Ejecutar en: Supabase Dashboard > SQL Editor > New Query
-- ============================================================

-- Extensiones
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLAS
-- ============================================================

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

create table public.ai_connections (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  provider text not null check (provider in ('openai', 'gemini', 'groq', 'claude')),
  api_key text not null,
  nickname text not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.whatsapp_numbers (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  phone_number text,
  display_name text not null,
  session_name text not null unique,
  status text default 'CREATED' check (status in ('CREATED', 'WAITING_QR', 'CONNECTED', 'DISCONNECTED', 'ERROR', 'PAUSED')),
  bot_enabled boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

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
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

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

create table public.messages (
  id uuid default uuid_generate_v4() primary key,
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  whatsapp_message_id text unique,
  sender text not null check (sender in ('customer', 'bot', 'agent')),
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.usage_logs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  number_id uuid references public.whatsapp_numbers(id) on delete cascade not null,
  provider text not null,
  tokens_prompt integer not null default 0,
  tokens_completion integer not null default 0,
  estimated_cost numeric(10,6) not null default 0.000000,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.audit_logs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  number_id uuid references public.whatsapp_numbers(id) on delete cascade,
  event_type text not null,
  details text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ============================================================
-- TRIGGER: Auto-crear perfil al registrarse
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, first_name, last_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'last_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- TRIGGER: Máximo 6 números por usuario
-- ============================================================
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

-- ============================================================
-- TRIGGER: Máximo 5 bots activos
-- ============================================================
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

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
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

create policy "Propietario de Configuracion de Bot" on public.bot_configurations
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

create policy "Propietario de Logs de Auditoria" on public.audit_logs
  for all using (auth.uid() = user_id);
