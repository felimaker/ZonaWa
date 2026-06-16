-- Add AI model tracking, prompts and response details to the usage_logs table
alter table public.usage_logs
  add column model_name text,
  add column prompt_text text,
  add column response_text text;
