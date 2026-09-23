import { describe, expect, it } from 'vitest';
import type { GuidedLearningStep } from '@/types';
import { reorderSlideSteps } from './timelineOrder';

const step = (id: string, imageIndex: number) =>
  ({ id, imageIndex, xPct: 0, yPct: 0 }) as GuidedLearningStep;

describe('reorderSlideSteps', () => {
  it('permutes one slide’s steps within their own slots', () => {
    const all = [step('a', 0), step('x', 1), step('b', 0), step('c', 0)];
    const next = reorderSlideSteps(all, [all[3], all[0], all[2]]);
    expect(next.map((s) => s.id)).toEqual(['c', 'x', 'a', 'b']);
  });
});
