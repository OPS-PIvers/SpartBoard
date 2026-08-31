/**
 * During-taking tab-switch auto-submit threshold (M17 B4). Distinct from
 * `protection.tabWarningThreshold` (results-viewing lockout, PublishScoresModal).
 * Precedence: per-student pointer override > session value > default 3.
 */

export const TAB_WARNING_THRESHOLD_MIN = 1;
export const TAB_WARNING_THRESHOLD_MAX = 10;
export const DEFAULT_TAB_WARNING_THRESHOLD = 3;

/** Resolve the effective threshold from session + optional per-student override. */
export function getEffectiveTabWarningThreshold(
  sessionThreshold: number | 'off' | undefined,
  pointerOverrideThreshold?: number | 'off'
): number | 'off' {
  if (pointerOverrideThreshold !== undefined) return pointerOverrideThreshold;
  if (sessionThreshold !== undefined) return sessionThreshold;
  return DEFAULT_TAB_WARNING_THRESHOLD;
}

/** True once `count` reaches the effective threshold; 'off' never triggers. */
export function hasReachedTabWarningThreshold(
  count: number,
  threshold: number | 'off'
): boolean {
  if (threshold === 'off') return false;
  return count >= threshold;
}

/**
 * Resolve a specific student's effective tab-warning threshold from the
 * teacher's assignment-doc overrides (M17 E2 F2), falling back to the
 * session-level value / default when no override matches. Mirrors the
 * `resolveRubricForResponse` lookup shape (`targetRefKeyByStudentUid` ->
 * `overridesBySourcedId[targetRefKey]`).
 */
export function resolveStudentTabWarningThreshold(
  sessionThreshold: number | 'off' | undefined,
  studentUid: string | null | undefined,
  overridesBySourcedId:
    | Record<string, { tabWarningThreshold?: number | 'off' }>
    | null
    | undefined,
  targetRefKeyByStudentUid: Map<string, string> | null | undefined
): number | 'off' {
  const targetRefKey = studentUid
    ? targetRefKeyByStudentUid?.get(studentUid)
    : undefined;
  const override = targetRefKey
    ? overridesBySourcedId?.[targetRefKey]
    : undefined;
  return getEffectiveTabWarningThreshold(
    sessionThreshold,
    override?.tabWarningThreshold
  );
}
