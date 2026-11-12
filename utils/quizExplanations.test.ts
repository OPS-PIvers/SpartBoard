import { describe, expect, it } from 'vitest';
import type { QuizQuestion } from '@/types';
import { toPublicQuestion } from '@/hooks/useQuizSession';
import {
  buildRevealedExplanations,
  explainableOptions,
  explanationsForQuestion,
  rekeyOptionExplanations,
  withoutBlankOptionKeys,
} from '@/utils/quizExplanations';
import { resolveResultsVisibility } from '@/utils/quizResultsVisibility';

const mc: QuizQuestion = {
  id: 'q1',
  type: 'MC',
  text: 'Capital of France?',
  timeLimit: 30,
  correctAnswer: 'Paris',
  incorrectAnswers: ['London', 'Rome'],
  explanation: 'Paris has been the capital since 987.',
  optionExplanations: {
    Paris: 'Right.',
    London: 'The capital of England.',
    Gone: 'An option that was deleted.',
    Rome: '   ',
  },
};

describe('explanations stay off the student question', () => {
  it('toPublicQuestion carries no explanation fields', () => {
    const json = JSON.stringify(toPublicQuestion(mc));
    expect(json).not.toContain('explanation');
    expect(json).not.toContain('Paris has been');
    expect(json).not.toContain('The capital of England');
  });
});

describe('buildRevealedExplanations', () => {
  it('lists the question and option explanations, dropping blanks and deleted options', () => {
    expect(buildRevealedExplanations({ questions: [mc] })).toEqual({
      q1: {
        explanation: 'Paris has been the capital since 987.',
        options: { Paris: 'Right.', London: 'The capital of England.' },
      },
    });
  });

  it('is null when no question has one', () => {
    const bare: QuizQuestion = { ...mc, explanation: undefined };
    delete bare.optionExplanations;
    expect(buildRevealedExplanations({ questions: [bare] })).toBeNull();
  });

  it('reads Multiple Answer options from the key and the wrong list', () => {
    const ma: QuizQuestion = {
      ...mc,
      type: 'MA',
      correctAnswer: 'Paris|Lyon',
      incorrectAnswers: ['London'],
    };
    expect(explainableOptions(ma)).toEqual(['Paris', 'Lyon', 'London']);
  });

  it('keeps only the question explanation for types without options', () => {
    const fib: QuizQuestion = {
      ...mc,
      type: 'FIB',
      correctAnswer: 'Paris',
      incorrectAnswers: [],
    };
    expect(explanationsForQuestion(fib)).toEqual({
      explanation: 'Paris has been the capital since 987.',
    });
  });
});

describe('resolveResultsVisibility and explanations', () => {
  const revealedExplanations = { q1: { explanation: 'Because.' } };
  const session = {
    scoreVisibility: 'score-responses-and-answers' as const,
    scorePublishedAt: 10,
  };

  it('shows nothing before a publish', () => {
    const out = resolveResultsVisibility({}, { revealedExplanations });
    expect(out.revealedExplanations).toBeUndefined();
  });

  it('passes the class publish through at the answers level', () => {
    const out = resolveResultsVisibility(session, {
      revealedExplanations,
    });
    expect(out.revealedExplanations).toEqual(revealedExplanations);
  });

  it('withholds them below the answers level', () => {
    const out = resolveResultsVisibility(
      { ...session, scoreVisibility: 'score-and-responses' },
      { revealedExplanations }
    );
    expect(out.revealedExplanations).toBeUndefined();
  });

  it('is absent when the publish wrote none (Show explanations off)', () => {
    const out = resolveResultsVisibility(session, {});
    expect(out.revealedExplanations).toBeUndefined();
  });

  it('reads a per-student publish from the override', () => {
    const out = resolveResultsVisibility({}, {
      resultsOverride: {
        mode: 'shown',
        visibility: 'score-responses-and-answers',
        publishedAt: 5,
        revealedExplanations,
      },
    } as never);
    expect(out.revealedExplanations).toEqual(revealedExplanations);
  });

  it('clears them when a student is hidden', () => {
    const out = resolveResultsVisibility(session, {
      revealedExplanations,
      resultsOverride: { mode: 'hidden', publishedAt: 5 },
    } as never);
    expect(out.revealedExplanations).toBeUndefined();
  });
});

describe('rekeyOptionExplanations', () => {
  const base = {
    type: 'MC' as const,
    correctAnswer: 'Paris',
    incorrectAnswers: ['London', 'Rome'],
    optionExplanations: { Paris: 'Right.', London: 'England.' },
  };

  it('moves an explanation to the renamed option', () => {
    const next = { ...base, incorrectAnswers: ['Londres', 'Rome'] };
    expect(rekeyOptionExplanations(base, next)).toEqual({
      Paris: 'Right.',
      Londres: 'England.',
    });
  });

  it('follows the text through a clear and retype', () => {
    const cleared = { ...base, correctAnswer: '' };
    const step = rekeyOptionExplanations(base, cleared);
    expect(step).toEqual({ '': 'Right.', London: 'England.' });
    const retyped = { ...cleared, correctAnswer: 'Paris' };
    expect(
      rekeyOptionExplanations({ ...cleared, optionExplanations: step }, retyped)
    ).toEqual({ Paris: 'Right.', London: 'England.' });
  });

  it('follows a clear and retype when another option is blank too', () => {
    const withBlank = { ...base, incorrectAnswers: ['London', ''] };
    const cleared = { ...withBlank, correctAnswer: '' };
    const step = rekeyOptionExplanations(withBlank, cleared);
    expect(step).toEqual({ '': 'Right.', London: 'England.' });
    const retyped = { ...cleared, correctAnswer: 'Paris' };
    expect(
      rekeyOptionExplanations({ ...cleared, optionExplanations: step }, retyped)
    ).toEqual({ Paris: 'Right.', London: 'England.' });
  });

  it('never saves an explanation under a blank option', () => {
    expect(
      withoutBlankOptionKeys({
        optionExplanations: { '': 'Right.', ' ': 'x', London: 'England.' },
      })
    ).toEqual({ optionExplanations: { London: 'England.' } });
    expect(withoutBlankOptionKeys({ optionExplanations: { '': 'x' } })).toEqual(
      {}
    );
    const q = { optionExplanations: { London: 'England.' } };
    expect(withoutBlankOptionKeys(q)).toBe(q);
  });

  it('drops the explanation of a deleted option', () => {
    const next = { ...base, incorrectAnswers: ['Rome'] };
    expect(rekeyOptionExplanations(base, next)).toEqual({ Paris: 'Right.' });
  });

  it('keeps explanations when a Multiple Answer option changes sides', () => {
    const ma = {
      type: 'MA' as const,
      correctAnswer: 'Paris|Lyon',
      incorrectAnswers: ['London'],
      optionExplanations: { London: 'England.', Lyon: 'Second.' },
    };
    const next = {
      ...ma,
      correctAnswer: 'Paris|London',
      incorrectAnswers: ['Lyon'],
    };
    expect(rekeyOptionExplanations(ma, next)).toEqual({
      London: 'England.',
      Lyon: 'Second.',
    });
  });

  it('is undefined when nothing remains or nothing was written', () => {
    expect(
      rekeyOptionExplanations(base, {
        ...base,
        correctAnswer: 'X',
        incorrectAnswers: [],
      })
    ).toBeUndefined();
    expect(
      rekeyOptionExplanations({ ...base, optionExplanations: undefined }, base)
    ).toBeUndefined();
  });
});
