import { describe, expect, it } from 'vitest';
import type { GuidedLearningStep } from '@/types';
import {
  playOrderInsertIndex,
  remapStepSlides,
  stepsFollowSlide,
  stepsInIdOrder,
} from './timelineOrder';

const step = (id: string, imageIndex: number) =>
  ({ id, imageIndex, xPct: 0, yPct: 0 }) as GuidedLearningStep;
const ids = (steps: GuidedLearningStep[]) => steps.map((s) => s.id);

describe('playOrderInsertIndex', () => {
  const steps = [step('a', 0), step('b', 1), step('c', 0), step('d', 2)];
  it('goes after the slide’s last step, including a late revisit', () => {
    expect(playOrderInsertIndex(steps, 0)).toBe(3);
    expect(playOrderInsertIndex(steps, 1)).toBe(2);
  });
  it('goes after earlier slides’ steps when the slide has none', () => {
    expect(playOrderInsertIndex([step('a', 0), step('d', 2)], 1)).toBe(1);
    expect(playOrderInsertIndex([step('d', 2)], 0)).toBe(0);
    expect(playOrderInsertIndex([], 0)).toBe(0);
  });
});

describe('stepsFollowSlide', () => {
  it('moves the slide’s runs before the first step on a later slide', () => {
    const steps = [step('b', 0), step('c', 2), step('a', 1), step('a2', 1)];
    expect(ids(stepsFollowSlide(steps, 1))).toEqual(['b', 'a', 'a2', 'c']);
  });
  it('moves them to the end when no later slide has steps', () => {
    const steps = [step('a', 2), step('b', 0), step('c', 1)];
    expect(ids(stepsFollowSlide(steps, 2))).toEqual(['b', 'c', 'a']);
  });
  it('returns the same array when nothing moves', () => {
    const steps = [step('a', 0), step('b', 1)];
    expect(stepsFollowSlide(steps, 1)).toBe(steps);
  });
});

describe('remapStepSlides', () => {
  it('renumbers steps to their slide’s new position', () => {
    const next = remapStepSlides([step('a', 0), step('b', 2)], [2, 0, 1]);
    expect(next.map((s) => s.imageIndex)).toEqual([1, 0]);
  });
});

describe('stepsInIdOrder', () => {
  it('orders steps by id and keeps any the list missed', () => {
    const steps = [step('a', 0), step('b', 1), step('c', 0)];
    expect(ids(stepsInIdOrder(steps, ['c', 'a']))).toEqual(['c', 'a', 'b']);
    expect(stepsInIdOrder(steps, ['a', 'b', 'c'])).toBe(steps);
  });
});
