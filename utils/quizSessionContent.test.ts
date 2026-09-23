import { describe, expect, it } from 'vitest';
import type { QuizSession } from '@/types';
import { mergeQuizSessionContent } from './quizSessionContent';

const base = {
  id: 's',
  publicQuestions: [],
  stimuli: undefined,
} as unknown as QuizSession;

describe('mergeQuizSessionContent', () => {
  it('passes a session with inline questions through', () => {
    const content = { publicQuestions: [{ id: 'q1' }] } as never;
    expect(mergeQuizSessionContent(base, content)).toBe(base);
    expect(mergeQuizSessionContent(null, content)).toBeNull();
  });

  it('waits for the content doc on a per-period session', () => {
    const session = { ...base, questionsInContent: true };
    expect(mergeQuizSessionContent(session, null)).toBe(session);
  });

  it('folds the content doc in', () => {
    const session = { ...base, questionsInContent: true };
    const merged = mergeQuizSessionContent(session, {
      publicQuestions: [
        { id: 'q1', type: 'MC', text: 'Q', timeLimit: 0, choices: ['a'] },
      ],
      stimuli: [{ id: 'st1' }] as never,
    });
    expect(merged?.publicQuestions.map((q) => q.id)).toEqual(['q1']);
    expect(merged?.stimuli).toEqual([{ id: 'st1' }]);
  });
});
