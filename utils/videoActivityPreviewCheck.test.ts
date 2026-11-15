import { describe, expect, it } from 'vitest';
import type { VideoActivityQuestion } from '@/types';
import { previewCheckAnswer } from './videoActivityPreviewCheck';

const key = [
  {
    id: 'mc',
    type: 'MC',
    text: 'Q',
    timestamp: 1,
    correctAnswer: 'Melted rock',
    incorrectAnswers: ['Ice'],
  },
  { id: 'sa', type: 'SA', text: 'Q', timestamp: 2, correctAnswer: 'lava' },
] as unknown as VideoActivityQuestion[];

describe('previewCheckAnswer', () => {
  it('grades a multiple choice answer from the key', () => {
    expect(previewCheckAnswer(key, true, 'mc', 'Melted rock').isCorrect).toBe(
      true
    );
    expect(previewCheckAnswer(key, true, 'mc', 'Ice').isCorrect).toBe(false);
  });

  it('hides the result when the session hides it', () => {
    expect(previewCheckAnswer(key, false, 'mc', 'Ice')).toEqual({
      isCorrect: null,
      correctAnswer: 'Melted rock',
    });
  });

  it('never grades short answer or unknown questions', () => {
    expect(previewCheckAnswer(key, true, 'sa', 'lava').isCorrect).toBeNull();
    expect(previewCheckAnswer(key, true, 'nope', 'x')).toEqual({
      isCorrect: null,
      correctAnswer: '',
    });
  });
});
