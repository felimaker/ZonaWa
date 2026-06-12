-- ============================================================
-- ZonaWa - Migración para continuar IA tras mensaje manual
-- Ejecutar en: Supabase Dashboard > SQL Editor > New Query
-- ============================================================

ALTER TABLE public.bot_configurations
ADD COLUMN continue_ai_after_manual BOOLEAN DEFAULT false NOT NULL;

-- Habilitar Realtime para las tablas clave de manera de evitar duplicados
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' 
    and schemaname = 'public' 
    and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
  
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' 
    and schemaname = 'public' 
    and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
  
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' 
    and schemaname = 'public' 
    and tablename = 'usage_logs'
  ) then
    alter publication supabase_realtime add table public.usage_logs;
  end if;
end;
$$;

-- Trigger para actualizar de forma automática last_message_at en la tabla conversations
create or replace function public.update_conversation_last_message_at()
returns trigger as $$
begin
  update public.conversations
  set last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists tr_update_conversation_last_message_at on public.messages;
create trigger tr_update_conversation_last_message_at
  after insert on public.messages
  for each row execute function public.update_conversation_last_message_at();
