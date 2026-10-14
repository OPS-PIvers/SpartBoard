import { describe, expect, it } from 'vitest';
import type { QuizSessionBankSlot } from '@/types';
import {
  DEALT_HISTORY_CAP,
  balancedPeriodKey,
  bankDealDocId,
  dealFromRotation,
  hasBalancedSlots,
  planBalancedDeal,
  servedVersionLabels,
} from './quizBalancedDeal';
import { isValidDraw } from './questionBanks';

const slot = (
  over: Partial<QuizSessionBankSlot> = {}
): QuizSessionBankSlot => ({
  id: 's1',
  count: 1,
  points: 10,
  poolQuestionIds: ['va', 'vb'],
  position: 1,
  dealing: 'balanced',
  ...over,
});

const PUBLIC = ['q1', 'va', 'vb', 'q2'];

describe('dealFromRotation', () => {
  it('alternates versions as the counter advances', () => {
    const pool = ['va', 'vb', 'vc'];
    const dealt = [0, 1, 2, 3, 4, 5].map(
      (n) => dealFromRotation(pool, 1, n, new Set())[0]
    );
    expect(dealt).toEqual(['va', 'vb', 'vc', 'va', 'vb', 'vc']);
  });

  it('splits a class evenly', () => {
    const counts = new Map<string, number>();
    for (let n = 0; n < 25; n++) {
      const [id] = dealFromRotation(['va', 'vb'], 1, n, new Set());
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    expect(counts.get('va')).toBe(13);
    expect(counts.get('vb')).toBe(12);
  });

  it('skips a version the student already had', () => {
    expect(dealFromRotation(['va', 'vb'], 1, 0, new Set(['va']))).toEqual([
      'vb',
    ]);
  });

  it('reuses seen versions only when none are left', () => {
    expect(dealFromRotation(['va', 'vb'], 1, 1, new Set(['va', 'vb']))).toEqual(
      ['vb']
    );
  });

  it('deals count questions without repeats', () => {
    const ids = dealFromRotation(['a', 'b', 'c', 'd'], 3, 1, new Set());
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
  });
});

describe('planBalancedDeal', () => {
  it('returns null when the response already holds a valid draw', () => {
    const plan = planBalancedDeal(
      PUBLIC,
      [slot()],
      { servedQuestionIds: ['q1', 'vb', 'q2'] },
      new Map()
    );
    expect(plan).toBeNull();
  });

  it('deals from the counter, advances it and records history', () => {
    const plan = planBalancedDeal(PUBLIC, [slot()], {}, new Map([['s1', 1]]));
    expect(plan).not.toBeNull();
    expect(plan?.ids).toEqual(['q1', 'vb', 'q2']);
    expect(plan?.counters).toEqual([{ slotId: 's1', dealt: 2 }]);
    expect(plan?.history).toEqual(['vb']);
    expect(isValidDraw(PUBLIC, [slot()], plan?.ids ?? [])).toBe(true);
  });

  it('gives a retake the version the student has not had', () => {
    const plan = planBalancedDeal(
      PUBLIC,
      [slot()],
      { dealtQuestionIds: ['vb'] },
      new Map([['s1', 1]])
    );
    expect(plan?.ids).toEqual(['q1', 'va', 'q2']);
    expect(plan?.history).toEqual(['vb', 'va']);
  });

  it('leaves random slots alone', () => {
    const random = slot({ id: 's2', dealing: undefined });
    const plan = planBalancedDeal(PUBLIC, [random], {}, new Map());
    expect(plan?.counters).toEqual([]);
    expect(plan?.ids).toHaveLength(3);
  });
});

describe('helpers', () => {
  it('keys rotations by class period', () => {
    expect(balancedPeriodKey({ classPeriod: 'Period 1' })).toBe('period_1');
    expect(balancedPeriodKey({ classId: 'abc' })).toBe('abc');
    expect(balancedPeriodKey({})).toBe('default');
    expect(bankDealDocId('s1', 'period_1')).toBe('s1__period_1');
  });

  it('detects balanced slots', () => {
    expect(hasBalancedSlots([slot()])).toBe(true);
    expect(hasBalancedSlots([slot({ dealing: undefined })])).toBe(false);
    expect(hasBalancedSlots(undefined)).toBe(false);
  });

  it('labels the served version by bank order', () => {
    expect(servedVersionLabels([slot()], ['q1', 'vb', 'q2'])).toEqual([
      'Version B',
    ]);
    expect(
      servedVersionLabels([slot({ dealing: undefined })], ['q1', 'vb'])
    ).toEqual([]);
  });
});

describe('dealt history cap', () => {
  it('keeps the newest ids within the rules cap', () => {
    const pool = Array.from({ length: 200 }, (_, i) => `p${i}`);
    const plan = planBalancedDeal(
      ['q1', ...pool],
      [slot({ poolQuestionIds: pool })],
      { dealtQuestionIds: pool.slice(0, 199) },
      new Map()
    );
    expect(plan?.history).toHaveLength(DEALT_HISTORY_CAP);
    expect(plan?.history.at(-1)).toBe('p199');
  });
});
