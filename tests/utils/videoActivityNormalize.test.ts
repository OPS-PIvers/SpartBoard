import { describe, it, expect } from 'vitest';
import {
  normalizeVideoActivityQuestion,
  normalizeVideoActivityQuestions,
} from '@/utils/videoActivityNormalize';
import type { VideoActivityQuestion } from '@/types';

describe('normalizeVideoActivityQuestion', () => {
  it('defaults missing type to MC', () => {
    const result = normalizeVideoActivityQuestion({
      id: 'q1',
      text: 'pre-PR2a question',
      timestamp: 5,
      timeLimit: 30,
      // type intentionally omitted — pre-PR2a shape
      correctAnswer: 'Mars',
      incorrectAnswers: ['Earth', 'Jupiter'],
    } as unknown as VideoActivityQuestion);
    expect(result.type).toBe('MC');
  });

  it('defaults missing points to 1', () => {
    const result = normalizeVideoActivityQuestion({
      id: 'q1',
      text: '',
      timestamp: 0,
      timeLimit: 30,
      type: 'MC',
      correctAnswer: 'a',
      incorrectAnswers: [],
      // points intentionally omitted
    } as VideoActivityQuestion);
    expect(result.points).toBe(1);
  });

  it('preserves PR2a-shape questions unchanged', () => {
    const original: VideoActivityQuestion = {
      id: 'q1',
      text: 'multi answer',
      timestamp: 10,
      timeLimit: 60,
      type: 'MA',
      correctAnswer: 'a|b',
      incorrectAnswers: ['c'],
      points: 3,
      allowPartialCredit: true,
    };
    const result = normalizeVideoActivityQuestion(original);
    expect(result).toEqual(original);
  });

  it('idempotent', () => {
    const once = normalizeVideoActivityQuestion({
      id: 'q1',
      text: '',
      timestamp: 0,
      timeLimit: 30,
      correctAnswer: '',
      incorrectAnswers: [],
    } as unknown as VideoActivityQuestion);
    const twice = normalizeVideoActivityQuestion(once);
    expect(twice).toEqual(once);
  });
});

describe('normalizeVideoActivityQuestions', () => {
  it('handles undefined input', () => {
    expect(normalizeVideoActivityQuestions(undefined)).toEqual([]);
  });

  it('normalizes every question in the array', () => {
    const result = normalizeVideoActivityQuestions([
      {
        id: 'q1',
        text: 'a',
        timestamp: 0,
        timeLimit: 30,
        correctAnswer: 'x',
        incorrectAnswers: [],
      },
      {
        id: 'q2',
        text: 'b',
        timestamp: 5,
        timeLimit: 30,
        type: 'FIB',
        correctAnswer: 'y',
        incorrectAnswers: [],
        points: 5,
      },
    ] as unknown as VideoActivityQuestion[]);
    expect(result[0].type).toBe('MC');
    expect(result[0].points).toBe(1);
    expect(result[1].type).toBe('FIB');
    expect(result[1].points).toBe(5);
  });
});
