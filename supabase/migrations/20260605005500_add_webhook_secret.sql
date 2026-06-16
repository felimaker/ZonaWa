-- Migración: Agregar columna webhook_secret a whatsapp_numbers
-- Fecha: 2026-06-15

ALTER TABLE public.whatsapp_numbers
ADD COLUMN webhook_secret text DEFAULT substring(md5(random()::text) from 1 for 16) NOT NULL;
