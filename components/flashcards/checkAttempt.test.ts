import { describe, expect, it } from 'vitest';
import type { FlashcardSession } from '@/types';
import {
  canTryAgain,
  checkDeadline,
  checkOptionsOf,
  checkOverrideOf,
  forcedCheckSubmission,
  withCardSubset,
} from './checkAttempt';

const cards = [
  { id: 'a', term: 'uno', definition: 'one' },
  { id: 'b', term: 'dos', definition: 'two' },
  { id: 'c', term: 'tres', definition: 'three' },
];

const check = (overrides: Partial<FlashcardSession> = {}) =>
  ({
    kind: 'check',
    checkMode: 'write',
    cards,
    ...overrides,
  }) as FlashcardSession;

describe('checkAttempt', () => {
  it('reads rules only from Checks that have them', () => {
    const rules = {
      attemptLimit: 2,
      sessionOptions: { timeLimitMinutes: 10 },
    };
    expect(checkOptionsOf(check({ rules }))).toEqual(rules.sessionOptions);
    expect(checkOptionsOf(check())).toBeNull();
    expect(checkOptionsOf(check({ kind: 'study', rules }))).toBeNull();
  });

  it('works out the deadline from the stamped start', () => {
    expect(checkDeadline({ timeLimitMinutes: 10 }, 1000)).toBe(601_000);
    expect(checkDeadline({ timeLimitMinutes: 10 }, undefined)).toBeNull();
    expect(checkDeadline({}, 1000)).toBeNull();
    expect(checkDeadline(null, 1000)).toBeNull();
  });

  it('stretches the deadline for extended time', () => {
    expect(checkDeadline({ timeLimitMinutes: 10 }, 0, 1.5)).toBe(900_000);
    expect(checkDeadline({ timeLimitMinutes: 10 }, 0, 2)).toBe(1_200_000);
    expect(checkDeadline({ timeLimitMinutes: 10 }, 0, 'unlimited')).toBeNull();
  });

  it('honors accommodations only on Checks with rules', () => {
    const override = { tabWarningThreshold: 'off' as const };
    const rules = { attemptLimit: 1, sessionOptions: {} };
    expect(checkOverrideOf(check({ rules }), override)).toBe(override);
    expect(checkOverrideOf(check(), override)).toBeUndefined();
    expect(checkOverrideOf(check({ kind: 'study', rules }), override)).toBe(
      undefined
    );
  });

  it("keeps only the student's cards, or every card when none match", () => {
    const session = check();
    expect(withCardSubset(session, undefined)).toBe(session);
    expect(
      withCardSubset(session, { questionIds: ['c', 'a', 'gone'] }).cards.map(
        (card) => card.id
      )
    ).toEqual(['a', 'c']);
    expect(withCardSubset(session, { questionIds: ['gone'] })).toBe(session);
  });

  it('keeps every card when a Speak subset has none that can be spoken', () => {
    const speak = check({
      checkMode: 'speak',
      cards: [
        {
          id: 'a',
          term: 'uno',
          definition: 'one',
          speak: { term: 'uno', refs: [{ tokens: ['u'] }] } as never,
        },
        { id: 'b', term: 'dos', definition: 'two' },
      ],
    });
    expect(withCardSubset(speak, { questionIds: ['b'] })).toBe(speak);
    expect(
      withCardSubset(speak, { questionIds: ['a'] }).cards.map((c) => c.id)
    ).toEqual(['a']);
  });

  it('allows Try again while attempts remain', () => {
    const limited = check({ rules: { attemptLimit: 2, sessionOptions: {} } });
    expect(canTryAgain(limited, {})).toBe(true);
    expect(canTryAgain(limited, { completedAttempts: 2 })).toBe(false);
    const unlimited = check({
      rules: { attemptLimit: null, sessionOptions: {} },
    });
    expect(canTryAgain(unlimited, { completedAttempts: 40 })).toBe(true);
    expect(canTryAgain(check(), {})).toBe(false);
    expect(canTryAgain(unlimited, { forcedSubmit: 'tab' })).toBe(false);
    expect(canTryAgain(unlimited, { forcedSubmit: 'time' })).toBe(true);
  });

  it('sends only what was answered when a submit is forced', () => {
    const log = {
      a: { response: 'one', attempts: 1, done: true, flagged: true },
      b: { response: '', attempts: 0, done: false },
      gone: { response: 'x', attempts: 1, done: true },
    };
    expect(forcedCheckSubmission(check(), log)).toEqual({
      answerLog: [{ cardId: 'a', response: 'one', attempts: 1 }],
      flags: [{ cardId: 'a', response: 'one' }],
    });
    const test = forcedCheckSubmission(
      check({
        checkMode: 'test',
        lockedSettings: { testCount: 1 } as FlashcardSession['lockedSettings'],
      }),
      {
        a: { response: 'one', attempts: 0, done: false },
        b: { response: 'two', attempts: 0, done: false },
      }
    );
    expect(test.answerLog).toEqual([{ cardId: 'a', response: 'one' }]);
    const speak = forcedCheckSubmission(check({ checkMode: 'speak' }), {
      a: { response: '', attempts: 2, done: true, passed: true },
      b: { response: '', attempts: 1, done: false },
    });
    expect(speak.answerLog).toEqual([
      { cardId: 'a', response: '', type: 'speak', attempts: 2, passed: true },
    ]);
    expect(
      forcedCheckSubmission(check({ checkMode: 'flashcards' }), log).answerLog
    ).toEqual([]);
  });
});
