-- Migración: Agregar columna default_model a ai_connections
ALTER TABLE public.ai_connections ADD COLUMN IF NOT EXISTS default_model text;
