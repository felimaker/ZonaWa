## 1. Database Schema Migration

- [ ] 1.1 Create migration SQL file to add model_name, prompt_text, and response_text to usage_logs table
- [ ] 1.2 Deploy migration to Supabase remote database
- [ ] 1.3 Update global database-blueprint spec with the new schema columns

## 2. Backend Deno Edge Function

- [ ] 2.1 Update whatsapp-webhook Deno function to extract modelName, serialize messagesPayload, and capture responses
- [ ] 2.2 Insert prompt_text, response_text, and model_name columns on usage_logs insertion
- [ ] 2.3 Deploy updated whatsapp-webhook function via Supabase CLI

## 3. Frontend Dashboard UI

- [ ] 3.1 Modify Consumption.jsx data fetching to request prompt_text, response_text, and model_name from usage_logs
- [ ] 3.2 Create "Historial de Tránsito de IA" visual list with interactive filtering/sorting
- [ ] 3.3 Design expandable drawer or modal to inspect and copy full prompt and response details
- [ ] 3.4 Add token consumption metrics grouped by selected AI provider and model
