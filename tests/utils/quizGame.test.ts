// Self-paced Review game engine (docs/plans/QUIZ_REVIEW_SPLIT.md D18, D22, D23).

import { describe, it, expect } from 'vitest';
import {
  addGameTimePatch,
  avoidBackToBack,
  EMPTY_GAME_STATE,
  findMyGameRank,
  formatGameClock,
  gamePlayOrder,
  nextGameQuestion,
  readGameClock,
  resumedEndsAt,
  startGamePatch,
} from '@/utils/quizGame';
import type { QuizGameState } from '@/types';

const played = (
  firstTry: Record<string, boolean>,
  lastCorrect: Record<string, boolean>,
  lastId: string | null
): QuizGameState => ({
  ...EMPTY_GAME_STATE,
  firstTry,
  lastCorrect,
  last: lastId
    ? {
        questionId: lastId,
        answer: '',
        isCorrect: lastCorrect[lastId] ?? false,
        points: 0,
        speedBonus: 0,
        firstTry: false,
        at: 0,
      }
    : null,
});

describe('readGameClock', () => {
  it('waits with the launch length before the teacher starts', () => {
    expect(
      readGameClock({ status: 'waiting', gameDurationMs: 600_000 }, 5)
    ).toEqual({ phase: 'waiting', remainingMs: 600_000 });
  });

  it('runs, freezes while paused, and ends at zero or on End', () => {
    const base = { status: 'active' as const, gameEndsAt: 100_000 };
    expect(readGameClock(base, 40_000)).toEqual({
      phase: 'running',
      remainingMs: 60_000,
    });
    expect(readGameClock({ ...base, gamePausedAt: 70_000 }, 99_999)).toEqual({
      phase: 'paused',
      remainingMs: 30_000,
    });
    expect(readGameClock(base, 100_000).phase).toBe('over');
    expect(readGameClock({ ...base, status: 'ended' }, 0).phase).toBe('over');
  });

  it('reads Firestore Timestamps', () => {
    expect(
      readGameClock(
        { status: 'active', gameEndsAt: { toMillis: () => 10_000 } },
        4_000
      ).remainingMs
    ).toBe(6_000);
  });
});

describe('formatGameClock', () => {
  it('rounds up to whole seconds', () => {
    expect(formatGameClock(600_000)).toBe('10:00');
    expect(formatGameClock(61_001)).toBe('1:02');
    expect(formatGameClock(0)).toBe('0:00');
  });
});

describe('nextGameQuestion', () => {
  const order = ['a', 'b', 'c'];

  it('walks pass 1 in order before repeating anything', () => {
    expect(
      nextGameQuestion(order, played({ a: true }, { a: true }, 'a'), [], 0, 's')
        .questionId
    ).toBe('b');
  });

  it('serves misses first after pass 1, never the same question twice in a row', () => {
    const game = played(
      { a: false, b: true, c: false },
      { a: false, b: true, c: false },
      'c'
    );
    const step = nextGameQuestion(order, game, [], 0, 's');
    expect(step.questionId).toBe('a');
    expect(step.cycles).toBe(1);
    // Misses (a, c) lead, then every question reshuffled.
    const cycle = [step.questionId, ...step.queue];
    expect(cycle.slice(0, 2).sort()).toEqual(['a', 'c']);
    expect(cycle).toHaveLength(5);
    for (let i = 1; i < cycle.length; i++)
      expect(cycle[i]).not.toBe(cycle[i - 1]);
  });

  it('keeps using its queue, then rebuilds it', () => {
    const game = played({ a: true, b: true, c: true }, {}, 'a');
    expect(nextGameQuestion(order, game, ['b', 'c'], 1, 's')).toEqual({
      questionId: 'b',
      queue: ['c'],
      cycles: 1,
    });
    expect(nextGameQuestion(order, game, [], 1, 's').cycles).toBe(2);
  });

  it('has nothing to serve for a one-question game', () => {
    expect(
      nextGameQuestion(['a'], played({ a: true }, { a: true }, 'a'), [], 0, 's')
        .questionId
    ).toBeNull();
  });
});

describe('avoidBackToBack', () => {
  it('drops what would have to repeat', () => {
    expect(avoidBackToBack(['a', 'a', 'b'], 'a')).toEqual(['b', 'a']);
  });
});

describe('gamePlayOrder', () => {
  it('keeps only picks in a choose-N section once made', () => {
    const sections = [
      { id: 's1', title: 'Part A', chooseCount: 1, questionIds: ['b', 'c'] },
    ];
    expect(gamePlayOrder(['a', 'b', 'c'], sections, {})).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(gamePlayOrder(['a', 'b', 'c'], sections, { s1: ['c'] })).toEqual([
      'a',
      'c',
    ]);
  });
});

describe('clock patches', () => {
  it('starts with the launch length', () => {
    expect(startGamePatch({ gameDurationMs: 300_000 }, 1_000, 600_000)).toEqual(
      { status: 'active', startedAt: 1_000, gameEndsAt: 301_000 }
    );
  });

  it('pushes the end out by the paused span on resume', () => {
    expect(
      resumedEndsAt({ gameEndsAt: 100_000, gamePausedAt: 40_000 }, 70_000)
    ).toBe(130_000);
  });

  it('adds a minute, restarting a clock that ran out', () => {
    expect(
      addGameTimePatch(
        { status: 'active', gameEndsAt: 100_000, gameAddedMs: 60_000 },
        50_000
      )
    ).toEqual({ gameEndsAt: 160_000, gameAddedMs: 120_000 });
    expect(
      addGameTimePatch({ status: 'active', gameEndsAt: 100_000 }, 150_000)
    ).toEqual({ gameEndsAt: 210_000, gameAddedMs: 60_000 });
    expect(addGameTimePatch({ status: 'waiting' }, 0)).toBeNull();
  });
});

describe('findMyGameRank', () => {
  it('finds a PIN or SSO row', () => {
    const entries = [
      { pin: '12', score: 30, rank: 1 },
      { studentUid: 'u2', score: 20, rank: 2 },
    ];
    expect(findMyGameRank(entries, { studentUid: 'u2' })).toEqual({
      rank: 2,
      score: 20,
      of: 2,
    });
    expect(findMyGameRank(entries, { pin: '99' })).toBeNull();
  });
});
