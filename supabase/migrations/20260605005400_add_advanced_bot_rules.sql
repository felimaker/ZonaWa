-- Migración: Agregar reglas avanzadas de control del bot a bot_configurations
-- Fecha: 2026-06-05

ALTER TABLE public.bot_configurations
ADD COLUMN inactivity_wait_minutes integer DEFAULT 0 CHECK (inactivity_wait_minutes >= 0) NOT NULL,
ADD COLUMN stop_trigger text DEFAULT 'stop' NOT NULL,
ADD COLUMN bot_trigger text DEFAULT 'bot' NOT NULL;
