## Context

The system has a webhook-triggered Edge Function (`whatsapp-webhook`) that interfaces with multiple LLM providers (OpenAI, Claude, Gemini, Groq) and logs token counts to the `usage_logs` table. However, it lacks storage of model metadata and prompt/completion content, which prevents users from verifying AI transactions or doing in-depth token consumption analysis in the web interface.

## Goals / Non-Goals

**Goals:**
- Add `model_name`, `prompt_text`, and `response_text` columns to the `usage_logs` table.
- Update the Deno Edge Function (`whatsapp-webhook`) to store the AI model, input message history payload (prompt), and output text.
- Build a beautiful, responsive, and real-time dashboard UI within `Consumption.jsx` to list AI logs, details, and inspect prompts and completions.
- Provide token cost graphs and aggregates broken down by model/provider.

**Non-Goals:**
- Creating a separate table for AI conversation logs (which would require new RLS policies and complex joins).
- Designing a chatbot test sandbox (this dashboard only monitors actual production messaging traffic).

## Decisions

### 1. Schema Extension of `usage_logs`
- **Decision**: Add `model_name` (text), `prompt_text` (text), and `response_text` (text) to the existing `usage_logs` table rather than creating a new `ai_logs` table.
- **Rationale**: Reuses existing security policies, RLS, indexes, and real-time publications, minimizing overhead and keeping database footprint minimal.

### 2. Prompt Format Serialization
- **Decision**: Serialize the full `messagesPayload` array (system prompt + historical user/assistant messages) as a formatted JSON string in `prompt_text`.
- **Rationale**: Captures exactly what was sent to the model (including the role prompt and context history) for accurate debugging and auditability.

### 3. Frontend Token Visualization
- **Decision**: Update `Consumption.jsx` to parse and aggregate `usage_logs` using charts/summaries by model and provider, and add a side panel / modal to copy prompts and completions.

## Risks / Trade-offs

- **Risk**: Increased storage consumption due to storing large prompt/completion texts.
  - *Mitigation*: The system's agents have a relatively small `max_tokens` (300 by default), so text lengths are manageable. In the future, we can add cleanup jobs or text truncation if tables grow excessively.
