import type { GuidedLearningWatchPace, StudentOverride } from '@/types';
import { applyTimeMultiplier } from '@/utils/applyTimeMultiplier';

/** Camera zoom / pan between steps. */
export const ZOOM_MS = 900;
export const ZOOM_EASE = 'cubic-bezier(0.33, 0, 0.2, 1)';
/** Callout fade plus 6px rise, after the camera settles. */
export const CALLOUT_IN_MS = 280;
/** Slide-to-slide image transition. */
export const SLIDE_MS = 500;
/** Shortest auto-advancing step, in seconds. */
export const WATCH_MIN_STEP_S = 3;
export const READING_WPM = 180;
/** Extra reading time on top of the word count, in seconds. */
export const READING_PAD_S = 1.5;
/** `watchPace: 'calm'` stretches every auto-advance by this much. */
export const CALM_PACE_FACTOR = 1.3;
/** Legacy (player v1) auto-advance when a step sets no duration, in seconds. */
export const LEGACY_STEP_S = 5;

export const LEARNER_SPEEDS = [0.5, 1, 1.5] as const;
export type LearnerSpeed = (typeof LEARNER_SPEEDS)[number];

export interface MotionOptions {
  speed: number;
  reducedMotion: boolean;
}

const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(Math.max(n, lo), hi);

/** Scales a base duration by learner speed; reduced motion cuts it to 0. */
export function motionMs(baseMs: number, opts: MotionOptions): number {
  if (opts.reducedMotion) return 0;
  const speed = opts.speed > 0 ? opts.speed : 1;
  return Math.round(baseMs / speed);
}

/** Cursor glide time for a distance in px: clamp(600, 250 + 0.9d, 1100). */
export function cursorMs(distancePx: number, opts: MotionOptions): number {
  return motionMs(clamp(250 + Math.max(0, distancePx) * 0.9, 600, 1100), opts);
}

export function countWords(text: string | undefined): number {
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

/** Seconds to read a step's words at 180wpm, plus a 1.5s pad. */
export function readingTimeS(text: string | undefined): number {
  return (countWords(text) / READING_WPM) * 60 + READING_PAD_S;
}

export interface StepDurationInput {
  autoAdvanceDuration?: number;
  label?: string;
  text?: string;
}

export interface StepDurationOptions {
  timeMultiplier?: StudentOverride['timeMultiplier'];
  /** Learner speed; v2 only. */
  speed?: number;
  watchPace?: GuidedLearningWatchPace;
  /** false keeps today's timing: the step's duration or 5s. */
  playerV2?: boolean;
}

/** Auto-advance time in ms; 0 means the step waits for the learner. */
export function stepDurationMs(
  step: StepDurationInput,
  opts: StepDurationOptions = {}
): number {
  if (!opts.playerV2) {
    const ms = applyTimeMultiplier(
      (step.autoAdvanceDuration ?? LEGACY_STEP_S) * 1000,
      opts.timeMultiplier
    );
    return Number.isFinite(ms) && ms > 0 ? ms : 0;
  }
  // The editor labels 0 as "manual", so it keeps meaning "wait for Next".
  if (step.autoAdvanceDuration === 0) return 0;
  const baseS = Math.max(
    step.autoAdvanceDuration ??
      readingTimeS([step.label, step.text].filter(Boolean).join(' ')),
    WATCH_MIN_STEP_S
  );
  const scaled = applyTimeMultiplier(baseS * 1000, opts.timeMultiplier);
  if (!Number.isFinite(scaled) || scaled <= 0) return 0;
  const speed = opts.speed && opts.speed > 0 ? opts.speed : 1;
  const pace = opts.watchPace === 'calm' ? CALM_PACE_FACTOR : 1;
  return Math.round((scaled / speed) * pace);
}
