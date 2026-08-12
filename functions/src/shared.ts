/**
 * Small cross-cutting helpers + permission types shared by the modules
 * extracted from the old monolithic `index.ts` (F12 split). Pure, no Firebase
 * side effects, so any module can import it without circular-dependency or
 * init-order concerns.
 */

export interface GlobalPermConfig {
  dailyLimit?: number;
  dailyLimitEnabled?: boolean;
  /**
   * Separate, lower daily AI cap for no-org / external (free-tier) callers.
   * Org/internal users always read `dailyLimit`; this field only ever gates
   * a caller whose verified email domain resolves to NO organization. When
   * unset, `DEFAULT_EXTERNAL_DAILY_LIMIT` (aiGeneration.ts) applies. The
   * existing `dailyLimitEnabled` flag governs both caps — if daily limiting
   * is turned off, neither org nor external callers are capped.
   */
  externalDailyLimit?: number;
}

export interface GlobalPermission {
  enabled: boolean;
  accessLevel: 'admin' | 'beta' | 'all';
  betaUsers?: string[];
  config?: GlobalPermConfig;
}

/**
 * Validates and normalises a Gemini model name.
 * Returns `undefined` when the supplied value is falsy or fails the pattern
 * check, so callers can fall back to a default.
 */
export function normalizeModelName(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (!/^gemini-[\w.-]+$/.test(trimmed)) return undefined;
  if (isDeprecatedModelId(trimmed)) {
    console.warn(
      `[gemini] ignoring deprecated model override "${trimmed}" — ` +
        'falling back to the current default (see GEMINI.md)'
    );
    return undefined;
  }
  return trimmed;
}

/**
 * Model IDs that GEMINI.md marks deprecated and must-not-be-used.
 *
 * The pattern check above is deliberately permissive so new model IDs work
 * without a deploy — but that also means a stale
 * `global_permissions/gemini-functions` override written before those models
 * were retired keeps being honoured indefinitely, silently bypassing the
 * current defaults. Rejecting them here makes `normalizeModelName` return
 * `undefined`, which every caller already treats as "use the default", so a
 * stale override self-heals on the next call instead of requiring a
 * one-time Firestore sweep to catch.
 *
 * Superseded `*-preview` 3.x IDs are matched by pattern rather than listed,
 * since preview IDs are minted and retired continuously. The pattern also has
 * to catch date-versioned variants (`gemini-3.0-flash-preview-06-05`), which
 * carry a trailing date segment rather than ending at `-preview`.
 */
const RETIRED_EXACT_MODEL_IDS = new Set([
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
]);

function isDeprecatedModelId(model: string): boolean {
  return RETIRED_EXACT_MODEL_IDS.has(model) || /-preview(?:-|$)/.test(model);
}

/**
 * Splits an array into fixed-size chunks (last chunk may be short).
 * Used to bound fan-out parallelism — both for Firestore `in` queries
 * (10-item limit per query) and for external HTTP fan-outs (ClassLink,
 * etc.) where unbounded `Promise.all` can OOM the function instance or
 * hammer the upstream API.
 */
export function chunk<T>(arr: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
