import type {
  GuidedLearningSet,
  TourPlaytest,
  TourPlaytestResult,
} from '@/types';
import { tourPlaytestKey } from '@/components/tours/tourPlaytest';
import type { TourEditPlayback } from './tourEditStore';

export type PlayedResult = Exclude<TourPlaytestResult, 'not-reached'>;

/** Folds one playback report into each step's latest result (C9). */
export function notePlayback(
  results: Map<string, PlayedResult>,
  steps: GuidedLearningSet['steps'],
  playback: TourEditPlayback
): void {
  for (const id of playback.missing) results.set(id, 'missing');
  const step = steps[playback.index];
  if (!step) return;
  const prev = results.get(step.id);
  if (playback.anchor === 'missing') results.set(step.id, 'missing');
  else if (playback.anchor === 'found')
    // Autopilot stopping for the admin's click is a step left to the teacher.
    results.set(
      step.id,
      playback.blocked || prev === 'left' ? 'left' : 'found'
    );
}

export const buildPlaytest = (
  set: GuidedLearningSet,
  results: ReadonlyMap<string, PlayedResult>,
  by: string,
  at = Date.now()
): TourPlaytest => ({
  at,
  by,
  fingerprint: tourPlaytestKey(set.steps),
  steps: set.steps.map((s) => ({
    stepId: s.id,
    result: results.get(s.id) ?? 'not-reached',
  })),
});

/** Whether closing should keep an earlier, fuller playtest of the same steps instead. */
export const keepsEarlier = (
  set: GuidedLearningSet,
  results: ReadonlyMap<string, PlayedResult>
): boolean => {
  const earlier = set.tourPlaytest;
  if (!earlier || earlier.fingerprint !== tourPlaytestKey(set.steps))
    return false;
  const reached = earlier.steps.filter((s) => s.result !== 'not-reached');
  return reached.length > results.size;
};
