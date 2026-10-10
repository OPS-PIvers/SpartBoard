# AI models

Moved from the retired GEMINI.md. Code comments in `config/geminiModels.ts` and `functions/src/shared.ts` cite it.

- **Backend:** **Vertex AI** (Google Cloud), not the Gemini Developer API. The SDK is
  constructed with `vertexai: true` and authenticates via Application Default
  Credentials — there is no Gemini API key. See `docs/gemini-api-terms-audit.md`.
- **Location:** `global`. The Gemini 3.x models are served from the global endpoint;
  regional endpoints such as `us-central1` return model-not-found for them.
- **Models:** `gemini-3.8-flash` (High Complexity) and `gemini-3.5-flash-lite` (Standard/OCR).
- **Selection Logic:**
  - `gemini-3.8-flash`: Used for complex code generation (`mini-app`, `widget-builder`) and deep multimodal analysis (`guided-learning`).
  - `gemini-3.5-flash-lite`: Used for standard JSON tasks (polls, quizzes, layouts) and high-speed multimodal tasks like `ocr`.
- **Status:** These models are **REQUIRED**. Older models (e.g., gemini-1.5-flash, gemini-2.0-flash)
  and the superseded `*-preview` 3.x IDs are deprecated and must not be used.

## Routing and Claude

- **One entry point.** Every model call goes through `generateAi` in `functions/src/aiRouter.ts`
  and names an integration from `functions/src/aiIntegrations.ts` (mirrored with labels in
  `config/aiIntegrations.ts`). `aiRouter.test.ts` fails if any other file calls Gemini or the
  Anthropic SDK directly. A new AI feature adds an integration id in both registries.
- **Choosing a model.** Admin Settings > Access > AI stores `allowedModels` and
  `integrationModels` on `global_permissions/gemini-functions.config`, beside the existing
  `advancedModel` / `standardModel` tier defaults, which stay Gemini so a fallback always exists.
  An integration with no choice runs its tier's Gemini model.
- **Claude.** Runs through the Anthropic API with the `ANTHROPIC_API_KEY` secret, adaptive thinking,
  effort `low` (standard tier) or `medium` (advanced tier), and structured outputs converted from
  the Gemini response schema. A missing or placeholder key (anything not starting `sk-ant-`), an
  input Claude can't read (audio, video, YouTube links, Word files), or any Claude failure runs the
  call on the tier's Gemini model instead.
- **Monitoring.** Each call increments `ai_call_log/{date}__{integration}__{model}` (calls, tokens,
  fallbacks, errors), which the AI tab shows for the last 30 days. Quotas still live in `ai_usage`.
