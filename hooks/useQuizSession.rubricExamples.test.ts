import { describe, it, expect } from 'vitest';
import type { QuizQuestion, Rubric } from '@/types';
import { toPublicQuestion } from './useQuizSession';
import { buildRevealedRubricExamples } from './useQuizAssignments';

const rubric: Rubric = {
  id: 'r1',
  title: 'Scoring guide',
  criteria: [
    {
      id: 'a',
      name: '(A) Research method',
      description: 'Identifies a meta-analysis.',
      levels: [
        { id: 'a0', label: 'Not earned', points: 0 },
        { id: 'a1', label: 'Earned', points: 1 },
      ],
      guide: { examples: ['The study is a meta-analysis.'] },
    },
  ],
  createdAt: 1,
  updatedAt: 2,
};

const fr: QuizQuestion = {
  id: 'q-fr',
  timeLimit: 0,
  type: 'free-response',
  text: 'Identify the method.',
  correctAnswer: '',
  incorrectAnswers: [],
  rubricSnapshot: rubric,
};

describe('scoring-guide examples stay off the student session', () => {
  it('strips examples from a rubric shown to students, in every language', () => {
    const projected = toPublicQuestion(
      { ...fr, rubricVisibleToStudents: true },
      { es: { text: 'Identifica.', rubricSnapshot: rubric } },
      { hideRubricUnlessShown: true }
    );
    expect(projected.rubricSnapshot?.criteria[0].guide).toEqual({});
    expect(projected.rubricSnapshot?.criteria[0].description).toBe(
      'Identifies a meta-analysis.'
    );
    expect(projected.localized?.es.rubricSnapshot?.criteria[0].guide).toEqual(
      {}
    );
  });

  it('strips examples when the visibility gate is off', () => {
    expect(JSON.stringify(toPublicQuestion(fr))).not.toContain(
      'The study is a meta-analysis.'
    );
  });
});

describe('buildRevealedRubricExamples', () => {
  it('publishes examples by question and criterion', () => {
    expect(buildRevealedRubricExamples({ questions: [fr] } as never)).toEqual({
      'q-fr': { a: ['The study is a meta-analysis.'] },
    });
  });

  it('returns null when no question has examples', () => {
    const plain = { ...fr, rubricSnapshot: undefined };
    expect(buildRevealedRubricExamples({ questions: [plain] } as never)).toBe(
      null
    );
  });
});
