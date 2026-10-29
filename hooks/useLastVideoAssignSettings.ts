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
  type VideoBehaviorOptions,
} from '@/components/common/library/assignStepper/VideoRuleStepValues';
import {
  TAB_WARNING_THRESHOLD_MAX,
  TAB_WARNING_THRESHOLD_MIN,
} from '@/utils/tabWarningThreshold';
import {
  TAB_AWAY_LIMIT_MAX_SECONDS,
  TAB_AWAY_LIMIT_MIN_SECONDS,
} from '@/utils/tabAwayLimit';
import { isFocusLevel } from '@/utils/pageProtections';

/** Profile field holding this teacher's last-used Video Activity rules (va-quiz-alignment V3). */
export const LAST_VIDEO_ASSIGN_SETTINGS_FIELD = 'lastVideoAssignSettings';

const inRange = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

// Only the rows the VA rule steps edit; other fields come from the activity being assigned.
const BOOLEAN_KEYS = [
  'tabWarningsEnabled',
  'tabAwayAutoSubmit',
  'shuffleAnswerOptions',
  'showResultToStudent',
  'showCorrectAnswerToStudent',
  'blockCopyPaste',
  'blockPrint',
] as const;

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
  const o = opts as Record<string, unknown>;
  const sessionOptions: VideoBehaviorOptions = {};
  for (const key of BOOLEAN_KEYS) {
    const v = o[key];
    if (typeof v === 'boolean') sessionOptions[key] = v;
  }
  if (isFocusLevel(o.focusLevel)) sessionOptions.focusLevel = o.focusLevel;
  const threshold = o.tabWarningThreshold;
  if (
    threshold === 'off' ||
    inRange(threshold, TAB_WARNING_THRESHOLD_MIN, TAB_WARNING_THRESHOLD_MAX)
  )
    sessionOptions.tabWarningThreshold = threshold;
  if (
    inRange(
      o.tabAwayLimitSeconds,
      TAB_AWAY_LIMIT_MIN_SECONDS,
      TAB_AWAY_LIMIT_MAX_SECONDS
    )
  )
    sessionOptions.tabAwayLimitSeconds = o.tabAwayLimitSeconds;
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
