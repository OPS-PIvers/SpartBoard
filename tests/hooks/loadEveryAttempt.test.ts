import { describe, it, expect, vi } from 'vitest';
import type { QuizResponse } from '@/types';

vi.mock('@/config/firebase', () => ({ db: {}, functions: {} }));

import {
  attemptAsResponse,
  hasEarlierAttempts,
  loadEveryAttempt,
  type QuizAttemptSource,
} from '@/hooks/useQuizResponseAttempts';

const live = (over: Partial<QuizResponse>) =>
  ({
    studentUid: 'u1',
    status: 'completed',
    answers: [],
    ...over,
  }) as unknown as QuizResponse;

const source: QuizAttemptSource = () => [
  { n: 1, closed: true, answers: [], score: 50 },
  { n: 2, closed: false, answers: [] },
];

describe('loadEveryAttempt', () => {
  it('counts a retake in progress as having an earlier attempt', () => {
    expect(hasEarlierAttempts(live({ completedAttempts: 1 }))).toBe(false);
    expect(
      hasEarlierAttempts(live({ completedAttempts: 1, status: 'in-progress' }))
    ).toBe(true);
    expect(hasEarlierAttempts(live({ completedAttempts: 2 }))).toBe(true);
  });

  it('numbers closed copies and the live attempt in order', async () => {
    const every = await loadEveryAttempt(
      's1',
      [live({ completedAttempts: 1, status: 'in-progress' })],
      () => 'u1',
      source
    );
    const list = every.get('u1') ?? [];
    expect(list.map((r) => [r.completedAttempts, r.status])).toEqual([
      [1, 'completed'],
      [2, 'in-progress'],
    ]);
  });
});

describe('attemptAsResponse', () => {
  it("uses the copy's own choose-N picks and tab exits, not the live attempt's", () => {
    const sections = [
      { id: 's1', title: 'A', chooseCount: 1, questionIds: ['q1', 'q2'] },
    ];
    const r = attemptAsResponse(
      live({
        answers: [{ questionId: 'q2', answer: 'x' }],
        _notChosen: ['q1'],
        tabSwitchWarnings: 4,
        autoSubmitted: true,
      } as Partial<QuizResponse>),
      {
        n: 1,
        closed: true,
        answers: [{ questionId: 'q1', answer: 'y' }],
        tabSwitchWarnings: 0,
      } as never,
      sections
    );
    expect(r._notChosen).toEqual(['q2']);
    expect(r.tabSwitchWarnings).toBe(0);
    expect(r.autoSubmitted).toBeUndefined();
  });
});
