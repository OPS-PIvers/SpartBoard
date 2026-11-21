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
  excludedUsers?: string[];
  minTier?: unknown;
  buildings?: unknown;
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
        'falling back to the current default (see docs/AI_MODELS.md)'
    );
    return undefined;
  }
  return RETIRED_GEMINI_REPLACEMENTS[trimmed] ?? trimmed;
}

// Taken off the AI tab; a saved pick runs the replacement. Mirrors RETIRED_GEMINI_MODELS in config/geminiModels.ts.
export const RETIRED_GEMINI_REPLACEMENTS: Readonly<Record<string, string>> = {
  'gemini-4-argon': 'gemini-4-neon',
  'gemini-4-carbon': 'gemini-4-neon',
};

// Deprecated per docs/AI_MODELS.md; rejecting them makes a stale Firestore override self-heal to the default instead of needing a manual sweep.
const RETIRED_MODEL_ID_PREFIXES = ['gemini-1.', 'gemini-2.0-'];

function isDeprecatedModelId(model: string): boolean {
  return (
    RETIRED_MODEL_ID_PREFIXES.some((prefix) => model.startsWith(prefix)) ||
    /-preview(?:-|$)/.test(model)
  );
}
