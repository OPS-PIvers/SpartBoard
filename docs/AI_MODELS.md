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
