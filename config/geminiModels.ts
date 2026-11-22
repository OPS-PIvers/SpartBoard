// Keep in sync with DEFAULT_ADVANCED_MODEL / DEFAULT_STANDARD_MODEL in functions/src/aiModelConfig.ts; the AI tab writes to global_permissions/gemini-functions.
export const KNOWN_GEMINI_MODELS = [
  {
    value: 'gemini-4-hydrogen',
    label: 'Gemini 4 Hydrogen',
    tier: 'advanced',
  },
  {
    value: 'gemini-4-neon',
    label: 'Gemini 4 Neon',
    tier: 'advanced',
  },
  {
    value: 'gemini-3.8-flash',
    label: 'Gemini 3.8 Flash',
    tier: 'advanced',
  },
  {
    value: 'gemini-3.7-flash',
    label: 'Gemini 3.7 Flash',
    tier: 'advanced',
  },
  {
    value: 'gemini-3.5-flash-lite',
    label: 'Gemini 3.5 Flash Lite',
    tier: 'standard',
  },
  {
    value: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    tier: 'advanced',
  },
  {
    value: 'gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash Lite',
    tier: 'standard',
  },
  // gemini-2.0-*/1.5-* dropped: docs/AI_MODELS.md marks them deprecated and normalizeModelName rejects them server-side. 2.5-* kept — Google's Vertex locations doc lists both as global-endpoint models.
] as const;

// Transcription only: offered for audio features, never as a tier default. Mirrors AUDIO_ONLY_MODEL_IDS in functions/src/aiModels.ts.
export const AUDIO_ONLY_GEMINI_MODELS = [
  { value: 'gemini-3.5-transcribe', label: 'Gemini 3.5 Transcribe' },
] as const;

// Taken off the picker; a saved pick runs the replacement. Mirrors RETIRED_GEMINI_REPLACEMENTS in functions/src/shared.ts.
export const RETIRED_GEMINI_MODELS = [
  {
    value: 'gemini-4-argon',
    label: 'Gemini 4 Argon',
    replacement: 'gemini-4-neon',
  },
  {
    value: 'gemini-4-carbon',
    label: 'Gemini 4 Carbon',
    replacement: 'gemini-4-neon',
  },
] as const;

/** The model a saved id runs as now: a retired Gemini id maps to its replacement. */
export const currentModelId = (model: string): string =>
  RETIRED_GEMINI_MODELS.find((m) => m.value === model)?.replacement ?? model;
