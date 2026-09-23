/**
 * Tab-away limit (docs/plans/TAB_AWAY_TIMER.md §2.3-2.4). A session carries
 * `tabAwayLimitSeconds` only when the teacher had the tab-away-timer flag at
 * assign time; without it the student sees today's plain warning.
 * Precedence: per-student override > session value > default.
 */

export const TAB_AWAY_LIMIT_MIN_SECONDS = 5;
export const TAB_AWAY_LIMIT_MAX_SECONDS = 300;
export const DEFAULT_TAB_AWAY_LIMIT_SECONDS = 30;
export const TAB_AWAY_LIMIT_PRESETS = [10, 30, 60, 120, 300] as const;

export function clampTabAwaySeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return DEFAULT_TAB_AWAY_LIMIT_SECONDS;
  return Math.min(
    TAB_AWAY_LIMIT_MAX_SECONDS,
    Math.max(TAB_AWAY_LIMIT_MIN_SECONDS, Math.round(seconds))
  );
}

export interface TabAwayRule {
  limitMs: number;
  /** True: submit at the limit (countdown). False: count up, log over-limit. */
  autoSubmit: boolean;
}

/** Null when the session predates the flag, so the tracker keeps today's behavior. */
export function getEffectiveTabAwayRule(
  session: { tabAwayLimitSeconds?: number; tabAwayAutoSubmit?: boolean },
  overrideLimit?: number | 'off'
): TabAwayRule | null {
  if (typeof session.tabAwayLimitSeconds !== 'number') return null;
  const sessionMs = clampTabAwaySeconds(session.tabAwayLimitSeconds) * 1000;
  if (overrideLimit === 'off') return { limitMs: sessionMs, autoSubmit: false };
  if (typeof overrideLimit === 'number') {
    return {
      limitMs: clampTabAwaySeconds(overrideLimit) * 1000,
      autoSubmit: true,
    };
  }
  return { limitMs: sessionMs, autoSubmit: session.tabAwayAutoSubmit === true };
}

/** Session fields stamped at assign time when the teacher has the flag. */
export function tabAwaySessionFields(
  flagOn: boolean,
  options: { tabAwayLimitSeconds?: number; tabAwayAutoSubmit?: boolean }
): { tabAwayLimitSeconds?: number; tabAwayAutoSubmit?: boolean } {
  if (!flagOn) return {};
  return {
    tabAwayLimitSeconds: clampTabAwaySeconds(
      options.tabAwayLimitSeconds ?? DEFAULT_TAB_AWAY_LIMIT_SECONDS
    ),
    tabAwayAutoSubmit: options.tabAwayAutoSubmit === true,
  };
}

/** "0:07", "1:12", "14:02". */
export function formatAwayDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
