import { describe, expect, it } from 'vitest';
import type { VideoActivityQuestion } from '@/types';
import { normalizeClip, notesEqual } from '@/utils/videoActivityClip';
import {
  videoActivityAssignBlocker,
  videoActivityIncompleteReason,
} from '@/utils/activityCompleteness';

const q = (timestamp: number): VideoActivityQuestion => ({
  id: `q${timestamp}`,
  timeLimit: 30,
  text: 'Q',
  type: 'MC',
  correctAnswer: 'A',
  incorrectAnswers: ['B'],
  timestamp,
});

describe('normalizeClip', () => {
  it('drops empty, zero and out-of-order bounds', () => {
    expect(normalizeClip(undefined)).toBeUndefined();
    expect(normalizeClip({})).toBeUndefined();
    expect(normalizeClip({ start: 0 })).toBeUndefined();
    expect(normalizeClip({ start: 30, end: 20 })).toEqual({ start: 30 });
    expect(normalizeClip({ start: 10, end: 90 })).toEqual({
      start: 10,
      end: 90,
    });
  });
});

describe('questions outside the clip', () => {
  const base = { title: 'T', youtubeUrl: 'https://youtu.be/abc' };

  it('flags a question before the start or after the end', () => {
    expect(
      videoActivityIncompleteReason({
        ...base,
        questions: [q(20), q(5)],
        clip: { start: 10 },
      })
    ).toBe('Question 2 is outside the start and end times');
    expect(
      videoActivityAssignBlocker({
        ...base,
        questions: [q(20), q(95)],
        clip: { end: 90 },
      })
    ).toBe('question 2 is outside the start and end times');
  });

  it('passes questions inside the clip, and any question with no clip', () => {
    expect(
      videoActivityIncompleteReason({
        ...base,
        questions: [q(10), q(90)],
        clip: { start: 10, end: 90 },
      })
    ).toBeNull();
    expect(
      videoActivityAssignBlocker({ ...base, questions: [q(500)] })
    ).toBeNull();
  });
});

describe('note stops', () => {
  it('requires text on every note', () => {
    expect(
      videoActivityIncompleteReason({
        title: 'T',
        youtubeUrl: 'https://youtu.be/abc',
        questions: [q(10)],
        notes: [
          { id: 'n1', timestamp: 5, text: 'Read this' },
          { id: 'n2', timestamp: 8, text: '  ' },
        ],
      })
    ).toBe('Note 2: text is required');
  });
});

describe('notesEqual', () => {
  it('compares notes by content, not by array identity', () => {
    const n = { id: 'n1', timestamp: 5, text: 'Read this' };
    expect(notesEqual([], [])).toBe(true);
    expect(notesEqual([n], [{ ...n }])).toBe(true);
    expect(notesEqual([n], [{ ...n, text: 'Changed' }])).toBe(false);
    expect(notesEqual([n], [])).toBe(false);
  });
});
