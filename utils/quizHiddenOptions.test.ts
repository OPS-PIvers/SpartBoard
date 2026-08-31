import { describe, it, expect } from 'vitest';
import { translateHiddenOptionIdsToText } from './quizHiddenOptions';
import { applyHiddenOptions } from './quizOverrideServing';
import type {
  QuizPublicQuestion,
  QuizQuestion,
  StudentOverride,
} from '@/types';

const QUESTIONS: QuizQuestion[] = [
  {
    id: 'q1',
    type: 'MC',
    text: 'What is 2 + 2?',
    timeLimit: 30,
    correctAnswer: '4',
    incorrectAnswers: ['3', '5', '22'],
  },
  {
    id: 'q2',
    type: 'MC',
    text: 'Capital of France?',
    timeLimit: 0,
    correctAnswer: 'Paris',
    // A distractor whose text duplicates the key — hiding it by text would
    // take the correct answer down with it.
    incorrectAnswers: ['London', 'Berlin', 'Paris'],
  },
  {
    id: 'q3',
    type: 'short',
    text: 'Explain.',
    timeLimit: 0,
    correctAnswer: '',
    incorrectAnswers: [],
  },
];

const wrap = (
  hidden: Record<string, string[]>,
  rest: Partial<StudentOverride> = {}
): Record<string, StudentOverride> => ({
  s1: { ...rest, hiddenOptionIdsByQuestion: hidden },
});

describe('translateHiddenOptionIdsToText', () => {
  it('resolves editor option ids to option text', () => {
    const { overridesByKey } = translateHiddenOptionIdsToText(
      QUESTIONS,
      wrap({ q1: ['q1-incorrect-0', 'q1-incorrect-2'] })
    );
    expect(overridesByKey.s1.hiddenOptionIdsByQuestion).toEqual({
      q1: ['3', '22'],
    });
  });

  it('never emits a structured id (answer-key leak guard)', () => {
    const { overridesByKey } = translateHiddenOptionIdsToText(
      QUESTIONS,
      wrap({ q1: ['q1-incorrect-1'] })
    );
    const serialized = JSON.stringify(overridesByKey);
    expect(serialized).not.toContain('-incorrect-');
    expect(serialized).not.toContain('-correct');
  });

  it('refuses to hide the correct answer and warns', () => {
    const { overridesByKey, warnings } = translateHiddenOptionIdsToText(
      QUESTIONS,
      wrap({ q1: ['q1-correct'] })
    );
    expect(overridesByKey.s1.hiddenOptionIdsByQuestion).toBeUndefined();
    expect(warnings).toHaveLength(1);
  });

  it('refuses a distractor whose text duplicates the correct answer', () => {
    const { overridesByKey, warnings } = translateHiddenOptionIdsToText(
      QUESTIONS,
      wrap({ q2: ['q2-incorrect-0', 'q2-incorrect-2'] })
    );
    expect(overridesByKey.s1.hiddenOptionIdsByQuestion).toEqual({
      q2: ['London'],
    });
    expect(warnings).toHaveLength(1);

    // The served question still shows the key.
    const served = applyHiddenOptions(
      {
        id: 'q2',
        type: 'MC',
        text: 'Capital of France?',
        timeLimit: 0,
        choices: ['London', 'Paris', 'Berlin', 'Madrid'],
      } as QuizPublicQuestion,
      overridesByKey.s1.hiddenOptionIdsByQuestion
    );
    expect(served.choices).toEqual(['Paris', 'Berlin', 'Madrid']);
  });

  it('dedupes repeated ids resolving to the same text', () => {
    const { overridesByKey } = translateHiddenOptionIdsToText(
      QUESTIONS,
      wrap({ q1: ['q1-incorrect-0', 'q1-incorrect-0'] })
    );
    expect(overridesByKey.s1.hiddenOptionIdsByQuestion).toEqual({ q1: ['3'] });
  });

  it('drops unknown question ids and unresolvable option ids', () => {
    const { overridesByKey } = translateHiddenOptionIdsToText(
      QUESTIONS,
      wrap({ gone: ['gone-incorrect-0'], q1: ['q1-incorrect-9'], q3: ['x'] })
    );
    expect(overridesByKey.s1.hiddenOptionIdsByQuestion).toBeUndefined();
  });

  it('preserves the override’s other accommodation fields', () => {
    const { overridesByKey } = translateHiddenOptionIdsToText(
      QUESTIONS,
      wrap({ q1: ['q1-incorrect-0'] }, { timeMultiplier: 2, openAt: 5 })
    );
    expect(overridesByKey.s1).toEqual({
      timeMultiplier: 2,
      openAt: 5,
      hiddenOptionIdsByQuestion: { q1: ['3'] },
    });
  });

  it('passes overrides with no hidden-option map through untouched', () => {
    const input = { s1: { timeMultiplier: 1.5 } as StudentOverride };
    const { overridesByKey } = translateHiddenOptionIdsToText(QUESTIONS, input);
    expect(overridesByKey.s1).toBe(input.s1);
  });
});
