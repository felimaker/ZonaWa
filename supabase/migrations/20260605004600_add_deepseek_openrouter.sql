-- Migración: Habilitar proveedores DeepSeek y OpenRouter
ALTER TABLE public.ai_connections DROP CONSTRAINT IF EXISTS ai_connections_provider_check;
ALTER TABLE public.ai_connections ADD CONSTRAINT ai_connections_provider_check CHECK (provider IN ('openai', 'gemini', 'groq', 'claude', 'deepseek', 'openrouter'));
