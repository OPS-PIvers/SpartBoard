// Mirrors the authoritative isDeprecatedModelId in functions/src/shared.ts; duplicated because functions/ isn't resolvable from the client bundle — keep in sync.
const RETIRED_MODEL_ID_PREFIXES = ['gemini-1.', 'gemini-2.0-'];

/** True for model ids the AI callables reject and silently replace with a default. */
export const isDeprecatedGeminiModelId = (model: string): boolean =>
  RETIRED_MODEL_ID_PREFIXES.some((prefix) => model.startsWith(prefix)) ||
  /-preview(?:-|$)/.test(model);
