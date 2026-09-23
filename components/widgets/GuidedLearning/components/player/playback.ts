import type { GuidedLearningMode, GuidedLearningPublicStep } from '@/types';
import type { PlaybackMode } from '../../types/stage';

/** Try mode waits this long before the hint cursor shows the target. */
export const TRY_HINT_MS = 5000;

/** The author's mode picks the learner's starting Watch/Try choice. */
export function defaultPlayback(mode: GuidedLearningMode): PlaybackMode {
  return mode === 'guided' ? 'watch' : 'try';
}

/** Whether a step points at something on screen a cursor can move to or a learner can click. */
export function hasStepTarget(step: GuidedLearningPublicStep | null): boolean {
  if (!step) return false;
  const t = step.interactionType;
  if (t === 'audio' || t === 'video' || t === 'question') return false;
  if (t === 'text-popover' && !step.region) return false;
  return true;
}

/** Point on the gentle quadratic curve from `a` to `b` at t (control bowed up-left). */
export function curvePoint(
  a: { x: number; y: number },
  b: { x: number; y: number },
  t: number
): { x: number; y: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const c = { x: a.x + dx / 2 + dy * 0.2, y: a.y + dy / 2 - dx * 0.2 };
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
  };
}
