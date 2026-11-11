import { describe, expect, it } from 'vitest';
import type { QuizQuestion } from '@/types';
import { toPublicQuestion } from '@/hooks/useQuizSession';
import {
  buildRevealedExplanations,
  explainableOptions,
  explanationsForQuestion,
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
