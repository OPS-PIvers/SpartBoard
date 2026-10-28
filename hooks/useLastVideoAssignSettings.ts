import type { VideoActivitySessionSettings } from '@/types';
import {
  resetLastAssignSettingsCache,
  useLastAssignSettings,
  type LastAssignSettings,
  type LastAssignSettingsSpec,
} from '@/hooks/useLastAssignSettings';
import {
  DEFAULT_VIDEO_PLAYER_SETTINGS,
  type VideoAssignRules,
} from '@/components/common/library/assignStepper/VideoRuleStepValues';

/** Profile field holding this teacher's last-used Video Activity rules (va-quiz-alignment V3). */
export const LAST_VIDEO_ASSIGN_SETTINGS_FIELD = 'lastVideoAssignSettings';

const SCORE_VISIBILITIES = new Set([
  'none',
  'score-only',
  'score-and-responses',
  'score-responses-and-answers',
]);

/** Keeps only well-typed values so a malformed profile can't reach an assignment. */
export function parseLastVideoAssignSettings(
  raw: unknown
): VideoAssignRules | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const behavior = r.behavior as Record<string, unknown> | undefined;
  if (!behavior || typeof behavior !== 'object') return null;
  const opts = behavior.sessionOptions;
  if (!opts || typeof opts !== 'object') return null;
  const attemptLimit = behavior.attemptLimit;
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
      (key === 'tabWarningThreshold' && value === 'off') ||
      (key === 'scoreVisibility' &&
        typeof value === 'string' &&
        SCORE_VISIBILITIES.has(value))
    ) {
      sessionOptions[key] = value;
    }
  }
  const p =
    r.player && typeof r.player === 'object'
      ? (r.player as Record<string, unknown>)
      : {};
  const bool = (key: keyof VideoActivitySessionSettings): boolean =>
    typeof p[key] === 'boolean' ? p[key] : DEFAULT_VIDEO_PLAYER_SETTINGS[key];
  return {
    behavior: {
      sessionMode: 'student',
      sessionOptions,
      attemptLimit,
    },
    player: {
      autoPlay: bool('autoPlay'),
      requireCorrectAnswer: bool('requireCorrectAnswer'),
      allowSkipping: bool('allowSkipping'),
    },
  };
}

const VIDEO_SETTINGS_SPEC: LastAssignSettingsSpec<VideoAssignRules> = {
  field: LAST_VIDEO_ASSIGN_SETTINGS_FIELD,
  parse: parseLastVideoAssignSettings,
  logTag: 'useLastVideoAssignSettings',
};

/** Test hook: forget cached reads between cases. */
export function resetLastVideoAssignSettingsCache(): void {
  resetLastAssignSettingsCache(LAST_VIDEO_ASSIGN_SETTINGS_FIELD);
}

/** Reads and writes the teacher's last-used Video Activity rules; inert when `enabled` is false. */
export function useLastVideoAssignSettings(
  uid: string | null | undefined,
  enabled: boolean
): LastAssignSettings<VideoAssignRules> {
  return useLastAssignSettings(VIDEO_SETTINGS_SPEC, uid, enabled);
}
