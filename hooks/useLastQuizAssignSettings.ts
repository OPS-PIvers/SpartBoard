import type { QuizBehaviorSettings, QuizSessionOptions } from '@/types';
import {
  resetLastAssignSettingsCache,
  useLastAssignSettings,
  type LastAssignSettings,
  type LastAssignSettingsSpec,
} from '@/hooks/useLastAssignSettings';

/** Profile field holding this teacher's last-used Quiz assign settings (plan D11). */
export const LAST_QUIZ_ASSIGN_SETTINGS_FIELD = 'lastQuizAssignSettings';

/** Keeps only well-typed option values so a malformed profile can't reach an assignment. */
export function parseLastQuizAssignSettings(
  raw: unknown
): QuizBehaviorSettings | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const opts = r.sessionOptions;
  if (!opts || typeof opts !== 'object') return null;
  const attemptLimit = r.attemptLimit;
  if (
    attemptLimit !== null &&
    !(
      typeof attemptLimit === 'number' &&
      Number.isInteger(attemptLimit) &&
      attemptLimit > 0
    )
  ) {
    return null;
  }
  const sessionOptions: Record<string, boolean | number | string> = {};
  for (const [key, value] of Object.entries(opts as Record<string, unknown>)) {
    if (
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value)) ||
      (key === 'tabWarningThreshold' && value === 'off')
    ) {
      sessionOptions[key] = value;
    }
  }
  return {
    sessionMode: 'student',
    sessionOptions: sessionOptions as QuizSessionOptions,
    attemptLimit,
  };
}

const QUIZ_SPEC: LastAssignSettingsSpec<QuizBehaviorSettings> = {
  field: LAST_QUIZ_ASSIGN_SETTINGS_FIELD,
  parse: parseLastQuizAssignSettings,
  logTag: 'useLastQuizAssignSettings',
};

/** Test hook: forget cached reads between cases. */
export function resetLastQuizAssignSettingsCache(): void {
  resetLastAssignSettingsCache(LAST_QUIZ_ASSIGN_SETTINGS_FIELD);
}

export type LastQuizAssignSettings = LastAssignSettings<QuizBehaviorSettings>;

/** Reads and writes the teacher's last-used Quiz assign settings; inert when `enabled` is false. */
export function useLastQuizAssignSettings(
  uid: string | null | undefined,
  enabled: boolean
): LastQuizAssignSettings {
  return useLastAssignSettings(QUIZ_SPEC, uid, enabled);
}
