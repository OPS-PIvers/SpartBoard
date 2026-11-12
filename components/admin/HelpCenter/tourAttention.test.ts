import { describe, expect, it } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import { tourNeedsAttention } from './tourAttention';

const setWith = (
  steps: unknown[],
  tourSetup?: GuidedLearningSet['tourSetup']
): GuidedLearningSet =>
  ({
    id: 'set-1',
    title: 'Tour',
    imageUrls: [],
    steps,
    tourSetup,
  }) as unknown as GuidedLearningSet;

describe('tourNeedsAttention', () => {
  it('is false when every step is fine', () => {
    const set = setWith([
      { id: 'intro', label: 'Welcome' },
      { id: 'a', tour: { anchor: 'sidebar.boards', action: 'click' } },
    ]);
    expect(tourNeedsAttention(set)).toBe(false);
  });

  it('is true for an anchor missing from the registry', () => {
    const set = setWith([
      { id: 'a', tour: { anchor: 'sidebar.retired', action: 'click' } },
    ]);
    expect(tourNeedsAttention(set)).toBe(true);
  });

  it('is true for a widget step the tour never adds', () => {
    const set = setWith([
      { id: 'w', tour: { anchor: 'widget.title', action: 'observe' } },
    ]);
    expect(tourNeedsAttention(set)).toBe(true);
    expect(
      tourNeedsAttention({ ...set, tourSetup: { widgets: ['clock'] } })
    ).toBe(false);
  });

  it('is true when real runs missed a step', () => {
    const set = setWith([
      { id: 'a', tour: { anchor: 'sidebar.boards', action: 'click' } },
    ]);
    const field = { runs: 2, done: 1, misses: new Map([['a', 1]]) };
    expect(tourNeedsAttention(set, field)).toBe(true);
  });

  it('is false for a set with no tour steps', () => {
    expect(tourNeedsAttention(setWith([{ id: 'x', label: 'Slide' }]))).toBe(
      false
    );
  });
});
