import { describe, expect, it } from 'vitest';
import type { QuizQuestion } from '@/types';
import {
  fibPromptUpdate,
  questionTypeChangeUpdates,
} from './questionFieldUpdates';

const base: QuizQuestion = {
  id: 'q1',
  type: 'MC',
  text: 'Pick one',
  timeLimit: 0,
  correctAnswer: 'a',
  incorrectAnswers: ['b'],
  points: 3,
};

describe('questionTypeChangeUpdates', () => {
  it('does nothing for Multiple Choice on a choose-all question', () => {
    expect(
      questionTypeChangeUpdates({ ...base, type: 'MA' }, 'MC', {
        mediaResponseAllowed: false,
      })
    ).toBeNull();
  });

  it('resets the key for the new type', () => {
    expect(
      questionTypeChangeUpdates(base, 'FIB', { mediaResponseAllowed: false })
    ).toMatchObject({
      type: 'FIB',
      correctAnswer: '',
      incorrectAnswers: [],
      alternateAnswers: undefined,
    });
  });

  it('restores stashed points when a rubric is dropped', () => {
    const written: QuizQuestion = {
      ...base,
      type: 'free-response',
      points: 8,
      rubricSnapshot: { id: 'r', title: 'R', criteria: [] } as never,
    };
    expect(
      questionTypeChangeUpdates(written, 'MC', {
        mediaResponseAllowed: false,
        stashedPoints: 2,
      })
    ).toMatchObject({ points: 2, rubricSnapshot: undefined });
  });

  it('keeps points when no rubric is attached', () => {
    expect(
      questionTypeChangeUpdates(base, 'FIB', { mediaResponseAllowed: false })
    ).not.toHaveProperty('points');
  });
});

describe('fibPromptUpdate', () => {
  it('only changes text off FIB', () => {
    expect(fibPromptUpdate(base, 'New ___ ___')).toEqual({
      text: 'New ___ ___',
    });
  });
});
