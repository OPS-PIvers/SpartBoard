import { describe, expect, it } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import { tourPlaytestKey } from '@/components/tours/tourPlaytest';
import { IDLE_PLAYBACK, type TourEditPlayback } from './tourEditStore';
import {
  buildPlaytest,
  keepsEarlier,
  notePlayback,
  type PlayedResult,
} from './playtest';

const set = {
  id: 's',
  steps: ['a', 'b', 'c', 'd'].map((id) => ({
    id,
    tour: { anchor: 'sidebar.boards', action: 'click' },
  })),
} as unknown as GuidedLearningSet;

const at = (over: Partial<TourEditPlayback>): TourEditPlayback => ({
  ...IDLE_PLAYBACK,
  ...over,
});

describe('editor playtest', () => {
  it('keeps each step’s latest result and marks the rest not reached', () => {
    const results = new Map<string, PlayedResult>();
    notePlayback(results, set.steps, at({ index: 0, anchor: 'searching' }));
    notePlayback(results, set.steps, at({ index: 0, anchor: 'found' }));
    notePlayback(
      results,
      set.steps,
      at({ index: 1, anchor: 'found', blocked: true })
    );
    notePlayback(results, set.steps, at({ index: 1, anchor: 'found' }));
    notePlayback(
      results,
      set.steps,
      at({ index: 2, anchor: 'missing', missing: ['c'] })
    );
    const playtest = buildPlaytest(set, results, 'admin@school.org', 9);
    expect(playtest).toEqual({
      at: 9,
      by: 'admin@school.org',
      fingerprint: tourPlaytestKey(set.steps),
      steps: [
        { stepId: 'a', result: 'found' },
        { stepId: 'b', result: 'left' },
        { stepId: 'c', result: 'missing' },
        { stepId: 'd', result: 'not-reached' },
      ],
    });
  });

  it('lets a step that turns up later count as found', () => {
    const results = new Map<string, PlayedResult>();
    notePlayback(results, set.steps, at({ index: 0, anchor: 'missing' }));
    notePlayback(results, set.steps, at({ index: 0, anchor: 'found' }));
    expect(results.get('a')).toBe('found');
  });

  it('keeps an earlier, fuller playtest of the same steps on close', () => {
    const fuller = new Map<string, PlayedResult>([
      ['a', 'found'],
      ['b', 'found'],
    ]);
    const saved = { ...set, tourPlaytest: buildPlaytest(set, fuller, 'x') };
    expect(keepsEarlier(saved, new Map([['a', 'found']]))).toBe(true);
    expect(keepsEarlier(saved, fuller)).toBe(false);
    const changed = { ...saved, steps: [...set.steps].reverse() };
    expect(keepsEarlier(changed, new Map([['a', 'found']]))).toBe(false);
  });
});
