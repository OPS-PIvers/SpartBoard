import type { StudentOverride } from '@/types';
import { applyTimeMultiplier } from './applyTimeMultiplier';

export const QUIZ_TIME_LIMIT_FEATURE = 'quiz-time-limit';
export const QUIZ_TIME_LIMIT_MIN_MINUTES = 1;
export const QUIZ_TIME_LIMIT_MAX_MINUTES = 240;
export const DEFAULT_QUIZ_TIME_LIMIT_MINUTES = 30;
/** Under this much time left the clock switches to its warning look. */
export const QUIZ_TIME_LIMIT_WARN_MS = 60_000;

/** Whole minutes in range, or null when the value is not a usable limit. */
export function clampQuizTimeLimitMinutes(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(
    QUIZ_TIME_LIMIT_MAX_MINUTES,
    Math.max(QUIZ_TIME_LIMIT_MIN_MINUTES, Math.round(n))
  );
}

/** Epoch ms when this attempt runs out; null when there is no limit for this student. */
export function resolveAttemptDeadline(
  startedAtMs: number | null | undefined,
  limitMinutes: number | null | undefined,
  multiplier: StudentOverride['timeMultiplier']
): number | null {
  const minutes = clampQuizTimeLimitMinutes(limitMinutes);
  if (minutes == null || typeof startedAtMs !== 'number') return null;
  const allowed = applyTimeMultiplier(minutes * 60_000, multiplier);
  return Number.isFinite(allowed) ? startedAtMs + allowed : null;
}

/** True when an attempt's base time limit has run out, so an unlock should restart its clock. */
export function attemptClockRanOut(
  timeUp: boolean | undefined,
  startedAtMs: number | null,
  limitMinutes: number | null | undefined,
  now: number
): boolean {
  if (timeUp === true) return true;
  const minutes = clampQuizTimeLimitMinutes(limitMinutes);
  return (
    minutes != null &&
    startedAtMs != null &&
    now - startedAtMs >= minutes * 60_000
  );
}

/** `m:ss`, or `h:mm:ss` from an hour up. */
export function formatTimeLeft(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** Reads a Firestore Timestamp-like value (or epoch ms) as epoch ms. */
export function timestampMillis(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (
    value &&
    typeof (value as { toMillis?: unknown }).toMillis === 'function'
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }
  return null;
}
