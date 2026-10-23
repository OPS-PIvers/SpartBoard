# AI models

Moved from the retired GEMINI.md. Code comments in `config/geminiModels.ts` and `functions/src/shared.ts` cite it.

- **Backend:** **Vertex AI** (Google Cloud), not the Gemini Developer API. The SDK is
  constructed with `vertexai: true` and authenticates via Application Default
  Credentials — there is no Gemini API key. See `docs/gemini-api-terms-audit.md`.
- **Location:** `global`. The Gemini 3.x models are served from the global endpoint;
  regional endpoints such as `us-central1` return model-not-found for them.
- **Models:** `gemini-3.7-flash` (High Complexity, the default; Gemini 3.8 Flash can be picked in the Gemini Models card) and `gemini-3.5-flash-lite` (Standard/OCR).
- **Selection Logic:**
  - `gemini-3.7-flash`: Used for complex code generation (`mini-app`) and deep multimodal analysis (`guided-learning`).
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
  An integration with no choice runs its tier's Gemini model, unless `AI_INTEGRATION_DEFAULT_MODELS`
  (mirrored as `defaultModel` in `config/aiIntegrations.ts`) names one: `web-tour-writing` defaults to Claude Sonnet.
- **Claude.** Runs through the Anthropic API with the `ANTHROPIC_API_KEY` secret, adaptive thinking,
  effort `low` (standard tier) or `medium` (advanced tier), and structured outputs converted from
  the Gemini response schema. A missing or placeholder key (anything not starting `sk-ant-`), an
  input Claude can't read (audio, video, YouTube links, Word files), or any Claude failure runs the
  call on the tier's Gemini model instead.
- **Limits.** The AI tab also stores `integrationLimits` (`maxInputChars`, `maxOutputTokens` per
  integration) on the same config. Defaults and bounds live in `functions/src/aiLimits.ts`, mirrored in
  `config/aiLimits.ts`. The input limit applies to the typed prompt of `generateWithAI` types; the output
  limit, when set, replaces the call's own token budget on Claude and Gemini.
- **Monitoring.** Each call increments `ai_call_log/{date}__{integration}__{model}` (calls, tokens,
  fallbacks, errors), which the AI tab shows for the last 30 days. Quotas still live in `ai_usage`.

## Pronunciation models (the one exception to `generateAi`)

Flashcards Speak (`docs/multilingual-pronunciation-engine.md`, flag `flashcards-speak`) runs speech models that
are not language-model calls, so they don't go through `generateAi` and have no integration id or admin model picker.

- **On the student's device.** A pinned wav2vec2 phoneme model (`config/pronunciationModel.ts`: id, byte size,
  MD5 prefix; upstream Apache-2.0, the ONNX export's licence still to be confirmed) is downloaded from our own Storage bucket (`pronunciation-models/**`,
  public read), never from a third party, and runs in a Web Worker with `onnxruntime-web`. Audio never leaves the
  device. `scripts/upload-pronunciation-model.mjs --project dev|prod` uploads it.
- **On the server, at save time only.** `lookupSpeakReferencesV1` turns each term into reference sounds with
  espeak-ng (GPL-3.0, server-side only, IPA output stored; counsel brief pending, G19) and, since S11a, the same
  model's readings of Cloud TTS voices (`config/pronunciationVoices.ts`). The connector skips the voices.
- **Changing any of them** changes `SPEAK_G2P_VERSION` (`functions/src/pronunciation/g2pVersion.ts`, copied in
  `utils/pronunciation/g2pVersion.ts`), so every card is looked up again on its next editor save.
