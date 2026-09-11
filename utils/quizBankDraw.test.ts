import { describe, expect, it } from 'vitest';
import type { QuizSessionBankSlot } from '@/types';
import { chooseServedDraw, sessionTotalQuestions } from './quizBankDraw';
import { isValidDraw } from './questionBanks';

const slot = (
  id: string,
  poolQuestionIds: string[],
  count: number,
  position = 0
): QuizSessionBankSlot => ({ id, count, points: 1, poolQuestionIds, position });

const PUBLIC_IDS = ['f1', 'f2', 'p1', 'p2', 'p3', 'p4', 'q1', 'q2'];
const SLOTS = [
  slot('s1', ['p1', 'p2', 'p3', 'p4'], 2, 1),
  slot('s2', ['q1', 'q2'], 1, 2),
];

describe('sessionTotalQuestions', () => {
  it('counts fixed questions plus each slot count, not the pool size', () => {
    expect(sessionTotalQuestions(PUBLIC_IDS, SLOTS)).toBe(2 + 2 + 1);
  });

  it('falls back to the plain question count without slots', () => {
    expect(sessionTotalQuestions(PUBLIC_IDS, [])).toBe(PUBLIC_IDS.length);
  });

  it('ignores pool ids missing from the question list', () => {
    expect(
      sessionTotalQuestions(['f1'], [slot('s', ['gone-1', 'gone-2'], 1)])
    ).toBe(2);
  });
});

describe('chooseServedDraw', () => {
  const firstIndex = () => 0;

  it('returns the persisted draw when it is still legal', () => {
    const persisted = ['f1', 'p3', 'p1', 'f2', 'q2'];
    const chosen = chooseServedDraw(persisted, PUBLIC_IDS, SLOTS, firstIndex);
    expect(chosen.persisted).toBe(true);
    expect(chosen.ids).toEqual(persisted);
    expect(chosen.ids).not.toBe(persisted);
  });

  it('rolls a fresh legal draw when nothing is persisted', () => {
    const chosen = chooseServedDraw(undefined, PUBLIC_IDS, SLOTS, firstIndex);
    expect(chosen.persisted).toBe(false);
    expect(chosen.ids).toHaveLength(sessionTotalQuestions(PUBLIC_IDS, SLOTS));
    expect(isValidDraw(PUBLIC_IDS, SLOTS, chosen.ids)).toBe(true);
  });

  it('rolls a fresh draw when the persisted one no longer fits the slots', () => {
    const stale = ['f1', 'p1', 'f2'];
    const chosen = chooseServedDraw(stale, PUBLIC_IDS, SLOTS, firstIndex);
    expect(chosen.persisted).toBe(false);
    expect(isValidDraw(PUBLIC_IDS, SLOTS, chosen.ids)).toBe(true);
  });

  it('treats an empty persisted list as absent', () => {
    const chosen = chooseServedDraw([], PUBLIC_IDS, SLOTS, firstIndex);
    expect(chosen.persisted).toBe(false);
  });
});
