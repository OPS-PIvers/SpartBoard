import { POSTER_LEVELS } from './constants';

export const NOISE_METER_PRO = 'noise-meter-pro';

/** Highest level a target can be; nothing is louder than Outside, so it can't be exceeded. */
export const MAX_TARGET_LEVEL = POSTER_LEVELS.length - 2;
export const DEFAULT_ALERT_DELAY_SECONDS = 3;
export const DEFAULT_ALERT_SOUND = 'Chime';
// The alert stays up until the room has been back under target this long.
export const ALERT_CLEAR_MS = 1500;
// One chime at most per this window, so the chime itself can't re-trigger a run of alerts.
export const ALERT_SOUND_COOLDOWN_MS = 10_000;
// Per-frame weight of the newest reading; lower is steadier.
const SMOOTHING = 0.15;

const isLevel = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= MAX_TARGET_LEVEL;

/** The target in force: the Expectations voice level while synced, else the widget's own. */
export const resolveTargetLevel = (
  targetLevel: unknown,
  syncExpectations: boolean,
  expectationsVoiceLevel: unknown
): number | null => {
  if (
    syncExpectations &&
    typeof expectationsVoiceLevel === 'number' &&
    Number.isInteger(expectationsVoiceLevel)
  ) {
    return isLevel(expectationsVoiceLevel) ? expectationsVoiceLevel : null;
  }
  return isLevel(targetLevel) ? targetLevel : null;
};

/** Volume (0-100) at which the room is over target: where the next level starts. */
export const targetLimit = (target: number | null): number | null =>
  target === null ? null : POSTER_LEVELS[target + 1].threshold;

export const smoothVolume = (previous: number, raw: number): number =>
  previous + (raw - previous) * SMOOTHING;

export const alertDelayMs = (seconds: unknown): number => {
  const value =
    typeof seconds === 'number' && Number.isFinite(seconds)
      ? seconds
      : DEFAULT_ALERT_DELAY_SECONDS;
  return Math.min(30, Math.max(0, value)) * 1000;
};
