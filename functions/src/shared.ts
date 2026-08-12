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

// Deprecated per GEMINI.md; rejecting them makes a stale Firestore override self-heal to the default instead of needing a manual sweep.
const RETIRED_MODEL_ID_PREFIXES = ['gemini-1.', 'gemini-2.0-'];

function isDeprecatedModelId(model: string): boolean {
  return (
    RETIRED_MODEL_ID_PREFIXES.some((prefix) => model.startsWith(prefix)) ||
    /-preview(?:-|$)/.test(model)
  );
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
