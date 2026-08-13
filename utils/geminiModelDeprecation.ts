/**
 * Client-side mirror of `isDeprecatedModelId` in `functions/src/shared.ts`.
 * Duplicated rather than imported: `functions/` is a separate package and is
 * not resolvable from the client bundle. Keep the two in sync — the server is
 * authoritative, this copy only drives admin-facing validation feedback.
 */

const RETIRED_MODEL_ID_PREFIXES = ['gemini-1.', 'gemini-2.0-'];

/** True for model ids the AI callables reject and silently replace with a default. */
export const isDeprecatedGeminiModelId = (model: string): boolean =>
  RETIRED_MODEL_ID_PREFIXES.some((prefix) => model.startsWith(prefix)) ||
  /-preview(?:-|$)/.test(model);
