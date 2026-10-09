import { describe, it, expect } from 'vitest';
import { QuizQuestion, QuizResponse } from '@/types';
import {
  joinCodesAllowedForBuildings,
  STUCK_THRESHOLD_MS,
  compareStudents,
  isStuck,
  matchesFilter,
  studentFlags,
  proficiencyBand,
} from './monitorUtils';
import { buildDistribution } from '@/utils/answerDistribution';

const NOW = 1_000_000_000;

function ts(ms: number): import('firebase/firestore').Timestamp {
  return {
    toMillis: () => ms,
  } as import('firebase/firestore').Timestamp;
}

function response(overrides: Partial<QuizResponse>): QuizResponse {
  return {
    studentUid: 'u1',
    joinedAt: 0,
    status: 'in-progress',
    answers: [],
    score: null,
    submittedAt: null,
    ...overrides,
  };
}

describe('proficiencyBand', () => {
  it('maps the approved 4-band scale', () => {
    expect(proficiencyBand(100)).toBe('hi');
    expect(proficiencyBand(80)).toBe('hi');
    expect(proficiencyBand(79)).toBe('mid');
    expect(proficiencyBand(60)).toBe('mid');
    expect(proficiencyBand(59)).toBe('low');
    expect(proficiencyBand(40)).toBe('low');
    expect(proficiencyBand(39)).toBe('crit');
    expect(proficiencyBand(0)).toBe('crit');
  });
});

describe('isStuck / studentFlags', () => {
  it('flags in-progress students idle past the threshold (floored at 2 min)', () => {
    const stuck = response({
      lastWriteAt: ts(NOW - STUCK_THRESHOLD_MS - 1),
    });
    expect(isStuck(stuck, NOW)).toBe(true);
    expect(studentFlags(stuck, NOW)).toEqual({
      handMinutes: null,
      idleMinutes: 2,
    });
    expect(
      studentFlags(response({ lastWriteAt: ts(NOW - 5 * 60_000) }), NOW)
        .idleMinutes
    ).toBe(5);
  });

  it('does not flag recent activity, completed rows, or missing lastWriteAt', () => {
    expect(isStuck(response({ lastWriteAt: ts(NOW - 30_000) }), NOW)).toBe(
      false
    );
    expect(
      isStuck(
        response({
          status: 'completed',
          lastWriteAt: ts(NOW - STUCK_THRESHOLD_MS * 2),
        }),
        NOW
      )
    ).toBe(false);
    expect(isStuck(response({}), NOW)).toBe(false);
  });

  it('reports a raised hand and idleness independently', () => {
    const both = response({
      handRaisedAt: ts(NOW - 60_000),
      lastWriteAt: ts(NOW - STUCK_THRESHOLD_MS * 2),
    });
    expect(studentFlags(both, NOW)).toEqual({ handMinutes: 1, idleMinutes: 4 });
    expect(
      studentFlags(
        response({ handRaisedAt: ts(NOW - 30_000), lastWriteAt: ts(NOW) }),
        NOW
      )
    ).toEqual({ handMinutes: 0, idleMinutes: null });
  });

  it('treats a lowered hand (null) and recent activity as no flags', () => {
    expect(
      studentFlags(
        response({ handRaisedAt: null, lastWriteAt: ts(NOW - 10_000) }),
        NOW
      )
    ).toEqual({ handMinutes: null, idleMinutes: null });
  });
});

describe('compareStudents', () => {
  const a = {
    name: 'Ann Zed',
    status: 'completed' as const,
    score: 50,
    tabWarnings: 0,
  };
  const b = {
    name: 'Bo Alder',
    status: 'in-progress' as const,
    score: 90,
    tabWarnings: 2,
  };

  it('sorts by first name by default', () => {
    expect(compareStudents(a, b, 'first')).toBeLessThan(0);
  });

  it('sorts by last name', () => {
    expect(compareStudents(a, b, 'last')).toBeGreaterThan(0);
  });

  it('sorts in-progress before joined before completed for status', () => {
    expect(compareStudents(a, b, 'status')).toBeGreaterThan(0);
  });

  it('sorts by score descending with null scores last', () => {
    expect(compareStudents(a, b, 'score')).toBeGreaterThan(0);
    expect(compareStudents({ ...a, score: null }, b, 'score')).toBeGreaterThan(
      0
    );
  });
});

describe('matchesFilter', () => {
  const base = { name: 'x', status: 'completed' as const, tabWarnings: 0 };
  it('filters by score bands', () => {
    expect(matchesFilter({ ...base, score: 85 }, 'hi')).toBe(true);
    expect(matchesFilter({ ...base, score: 70 }, 'hi')).toBe(false);
    expect(matchesFilter({ ...base, score: 70 }, 'mid')).toBe(true);
    expect(matchesFilter({ ...base, score: 40 }, 'low')).toBe(true);
    expect(matchesFilter({ ...base, score: null }, 'low')).toBe(false);
  });
  it('filters by tab warnings', () => {
    expect(
      matchesFilter({ ...base, score: null, tabWarnings: 2 }, 'tabs')
    ).toBe(true);
    expect(matchesFilter({ ...base, score: null }, 'tabs')).toBe(false);
  });
  it('passes everyone through "all"', () => {
    expect(matchesFilter({ ...base, score: null }, 'all')).toBe(true);
  });
});

describe('buildDistribution', () => {
  const q: QuizQuestion = {
    id: 'q1',
    timeLimit: 0,
    text: 'What is 1/2 + 1/4?',
    type: 'MC',
    correctAnswer: '3/4',
    incorrectAnswers: ['1/4', '2/4', ''],
  };
  const grade = (question: QuizQuestion, answer: string) => ({
    isCorrect: answer === question.correctAnswer,
  });
  const responses = [
    response({ answers: [{ questionId: 'q1', answer: '3/4', answeredAt: 1 }] }),
    response({ answers: [{ questionId: 'q1', answer: '3/4', answeredAt: 1 }] }),
    response({ answers: [{ questionId: 'q1', answer: '1/4', answeredAt: 1 }] }),
    response({ answers: [] }),
  ];

  it('counts MC options in option order and marks the correct one', () => {
    const dist = buildDistribution(q, responses, grade);
    expect(dist.totalAnswered).toBe(3);
    expect(dist.rows).toEqual([
      { label: '3/4', count: 2, isCorrect: true },
      { label: '1/4', count: 1, isCorrect: false },
      { label: '2/4', count: 0, isCorrect: false },
    ]);
  });

  it('aggregates raw answers for non-MC questions, most common first', () => {
    const fib: QuizQuestion = { ...q, type: 'FIB', incorrectAnswers: [] };
    const dist = buildDistribution(fib, responses, grade);
    expect(dist.rows[0]).toEqual({ label: '3/4', count: 2, isCorrect: true });
    expect(dist.rows[1]).toEqual({ label: '1/4', count: 1, isCorrect: false });
  });
});

describe('joinCodesAllowedForBuildings', () => {
  it('allows join codes with no permission record or no building list', () => {
    expect(joinCodesAllowedForBuildings(undefined, [])).toBe(true);
    expect(
      joinCodesAllowedForBuildings({ enabled: true, buildings: [] }, ['x'])
    ).toBe(true);
  });

  it('blocks join codes when turned off or the teacher has no listed building', () => {
    expect(joinCodesAllowedForBuildings({ enabled: false }, [])).toBe(false);
    expect(
      joinCodesAllowedForBuildings({ enabled: true, buildings: ['a'] }, ['b'])
    ).toBe(false);
    expect(
      joinCodesAllowedForBuildings({ enabled: true, buildings: ['a'] }, ['a'])
    ).toBe(true);
  });
});
