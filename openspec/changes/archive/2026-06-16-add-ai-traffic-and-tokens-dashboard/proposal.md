## Why

Currently, users cannot inspect the inputs sent to the AI providers (prompts and context) or the exact completions returned in the messaging flows. Furthermore, although token consumption is calculated, there is no centralized panel to view model-specific token counts and costs. This feature introduces a traffic dashboard that bridges this visibility gap without adding redundant database tables.

## What Changes

- Add logging of AI models, prompts, and completions directly to the existing `usage_logs` table.
- Implement an interactive AI traffic inspector within the "Consumption" dashboard in the frontend.
- Show detailed token usage (prompt, completion, and total) and estimated financial cost.
- Provide visual graphs and summaries of token consumption grouped by active AI provider and model.

## Capabilities

### New Capabilities
- `ai-traffic-monitoring`: Monitoring and inspection of prompts, model calls, completions, and token usages.

### Modified Capabilities
- `database-blueprint`: Extending the schema of the `usage_logs` table to store model name, prompt text, and response text.

## Impact

- **Database**: Adds columns to `public.usage_logs` and updates its specification.
- **Backend**: Modifies the Deno Edge Function `whatsapp-webhook` to log model names and serialized JSON prompt histories/responses.
- **Frontend**: Adds UI list views, detailed modal views, and aggregations inside `Consumption.jsx`.
