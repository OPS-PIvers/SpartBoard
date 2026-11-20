import { describe, expect, it } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import { targetsSignature } from './webStepReview';
import { webFieldStatsOf } from './webTourHealth';
import { stepStatusRows, tourStatus } from './webTourStatus';

const set = (results?: Record<string, 'found' | 'none' | 'weak'>) => {
  const base = {
    id: 't',
    title: 'T',
    surface: 'web',
    steps: ['s1', 's2'].map((id) => ({
      id,
      label: id,
      web: {
        urlPattern: 'https://x.test/*',
        action: 'click',
        locator: { name: id },
      },
    })),
  } as unknown as GuidedLearningSet;
  return results
    ? {
        ...base,
        webTourChecked: {
          by: 'u',
          at: 1,
          sig: targetsSignature(base),
          results,
        },
      }
    : base;
};

const run = (misses: string[]) => ({
  v: 5,
  startedAt: 1,
  furthest: 1,
  done: true,
  surface: 'web' as const,
  misses,
});

describe('web tour status', () => {
  it('is unchecked with no check and no real-run problems', () => {
    const s = set();
    expect(tourStatus(s, stepStatusRows(s, null))).toBe('unchecked');
  });

  it('passes when every step was found', () => {
    const s = set({ s1: 'found', s2: 'found' });
    expect(tourStatus(s, stepStatusRows(s, null))).toBe('passed');
  });

  it('flags a step the check could not find', () => {
    const s = set({ s1: 'found', s2: 'none' });
    const rows = stepStatusRows(s, null);
    expect(rows.map((r) => r.problem)).toEqual([null, 'not-found']);
    expect(tourStatus(s, rows)).toBe('issues');
  });

  it('flags a step missed in more than one real run, even after a passed check', () => {
    const s = set({ s1: 'found', s2: 'found' });
    const field = webFieldStatsOf([run(['s1']), run(['s1']), run([])], 5);
    const rows = stepStatusRows(s, field);
    expect(rows[0]).toMatchObject({
      problem: 'missed',
      runs: { hit: 2, of: 3 },
    });
    expect(tourStatus(s, rows)).toBe('issues');
    const once = stepStatusRows(s, webFieldStatsOf([run(['s1'])], 5));
    expect(once[0].problem).toBeNull();
  });
});
