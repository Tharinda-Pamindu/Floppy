# AI features (on hold)

The original Floppy had two AI features. Both are rebuilt, but **switched off** until `AI_API_KEY` is set.

1. **Plan review.**
   - A demanding-lead rubric flags these issues:
     - `not_checkable`: activity instead of a result.
     - `missing_why`.
     - `missing_gtm`.
     - `scope_too_big`: about 30 focused hours a week.
     - `carried_over`: the same unfinished work as one of the author's last two plans.
     - `unclear`.
   - Each finding targets a task and comes with a ready-to-apply rewrite. The UI shows findings beside their task with **Apply** or **Add this task**.
2. **Draft from notes.** Messy notes become a draft: a main task with a why, up to 6 sub-goals, up to 4 go-to-market goals, and a "left out" list. The draft only fills the form, and nothing is saved until the author saves.

With AI off:

- `GET /ai/status` returns `{enabled:false}` and the buttons are hidden.
- The AI endpoints return `503 AI_UNAVAILABLE` with a plain-words message, and the call is still logged.

## Switching it on

Set these in `apps/api/.env` and restart the API:

| Provider | `AI_BASE_URL` | `AI_MODEL` (example) |
| --- | --- | --- |
| Groq | `https://api.groq.com/openai/v1` | `openai/gpt-oss-120b` |
| xAI (Grok) | `https://api.x.ai/v1` | `grok-3-mini` |

```
AI_API_KEY=…
AI_BASE_URL=https://api.groq.com/openai/v1
AI_MODEL=openai/gpt-oss-120b
```

## Design

- **Provider interface** (`ports.ts` → `AiProvider.generateObject`). The OpenAI-compatible adapter (`ai/openai-compatible.ts`) asks for a JSON object described by the zod schema, converted to JSON Schema. The reply is **validated with zod**, never trusted as-is.
- **Prompts** (`ai/prompts.ts`) and **output schemas** (`ai/schemas.ts`) carry the original's rubric.
- **Privacy and grounding:**
  - Tasks are rendered with refs (`MAIN`, `SG1`, `GTM2`) and estimates only, with no names, emails or ids.
  - The author's two previous plans (scoped by the server) are included, so `carried_over` works without tool calls.
  - The model is told to use `[placeholders]` instead of inventing facts.
- **Mapping:**
  - Refs map back to real task ids, and unknown refs are dropped.
  - A `must_fix` finding forces the verdict to `adjust`.
  - The review is stored with a content hash, so the UI marks it stale after edits.
- **Failures:** every call writes an `ai_usage_events` row, whether it succeeds or fails.

| Failure | Status | Recorded as |
| --- | --- | --- |
| No key | 503 | `not_configured` |
| Per-user limit (6 a minute) | 429 | `local_limit` |
| Provider 429 | 429 | `provider_rate_limit` |
| Provider HTTP error | 503 | `provider_http_<code>` |
| Network error | 503 | `provider_unreachable` |
| Timeout (`AI_TIMEOUT_SECONDS`) | 504 | `timeout` |
| Unusable output | 502 | `invalid_output` |

- **Tests:** `apps/api/test/plans.test.ts` covers ref mapping, staleness, failure codes, rate limits and "drafts save nothing", using a scripted fake provider.
