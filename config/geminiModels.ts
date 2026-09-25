// Keep in sync with DEFAULT_ADVANCED_MODEL / DEFAULT_STANDARD_MODEL in aiGeneration.ts — this picker writes to global_permissions/gemini-functions.
export const KNOWN_GEMINI_MODELS = [
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
  // gemini-2.0-*/1.5-* dropped: GEMINI.md marks them deprecated and normalizeModelName rejects them server-side. 2.5-* kept — Google's Vertex locations doc lists both as global-endpoint models.
] as const;
