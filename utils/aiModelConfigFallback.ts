/**
 * Shared "AI model config used fallback" surface.
 *
 * The `generateWithAI` Cloud Function (and its siblings) reads admin-configured
 * Gemini model overrides from Firestore. When that read throws — Firestore
 * brownout, transient outage — the function silently falls back to hardcoded
 * default model names and proceeds with generation. Without a signal, admins
 * who've tuned overrides have no idea their settings were ignored.
 *
 * Every AI callable now returns `_modelConfigUsedFallback: boolean` on its
 * response. Client-side callers route that flag through `reportAiModelConfigFallback`,
 * which de-dupes via a module-level latch and dispatches a registered toast
 * handler — surfacing the notice exactly once until the latch is reset.
 *
 * Mirrors the `driveAuthErrors` singleton-dispatch pattern so we don't have to
 * thread context through every AI-calling component.
 */

type AiModelConfigFallbackHandler = () => void;

let handler: AiModelConfigFallbackHandler | null = null;
let latched = false;

/**
 * Register (or clear) the toast/banner dispatcher. Called once by the auth
 * provider so the dispatch is available before any AI call fires.
 */
export const setAiModelConfigFallbackHandler = (
  next: AiModelConfigFallbackHandler | null
): void => {
  handler = next;
};

/**
 * Called by every AI helper with the `_modelConfigUsedFallback` flag from the
 * Cloud Function response. Fires the toast exactly once per latch lifetime.
 * Returns `true` iff the toast was actually dispatched on this call.
 *
 * If no handler is registered yet, we leave the latch open so the next report
 * — once a handler exists — still surfaces a toast.
 */
export const reportAiModelConfigFallback = (
  usedFallback: boolean | undefined
): boolean => {
  if (!usedFallback) return false;
  if (latched) return false;
  if (!handler) return false;
  handler();
  latched = true;
  return true;
};

/**
 * Reset the latch so the next fallback report fires the toast again. Intended
 * to be called from a "Reload to retry" action or on a fresh sign-in.
 */
export const resetAiModelConfigFallbackLatch = (): void => {
  latched = false;
};

/** Test-only: clear all module-level state. */
export const __resetAiModelConfigFallbackForTests = (): void => {
  handler = null;
  latched = false;
};
