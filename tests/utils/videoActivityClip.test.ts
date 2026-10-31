import { describe, expect, it } from 'vitest';
import type { VideoActivityQuestion } from '@/types';
import {
  normalizeClip,
  notesEqual,
  syncedPlayback,
  syncedPlaybackFields,
  videoActivityPlayback,
} from '@/utils/videoActivityClip';
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
      videoActivityIncompleteReason({
        ...base,
        questions: [q(20)],
        clip: { end: 90 },
        notes: [{ id: 'n1', timestamp: 95, text: 'Late' }],
      })
    ).toBe('Note 1 is outside the start and end times');
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

describe('videoActivityPlayback', () => {
  it('drops blank notes and widens the clip to cover every stop', () => {
    expect(
      videoActivityPlayback({
        clip: { start: 60, end: 120 },
        questions: [q(30), q(90)],
        notes: [
          { id: 'n1', timestamp: 150, text: 'After' },
          { id: 'n2', timestamp: 70, text: ' ' },
        ],
      })
    ).toEqual({
      clip: { start: 30, end: 150 },
      notes: [{ id: 'n1', timestamp: 150, text: 'After' }],
    });
  });

  it('leaves out absent fields', () => {
    expect(videoActivityPlayback({ questions: [q(10)] })).toEqual({});
  });
});

describe('syncedPlaybackFields', () => {
  it('always writes notes, empty when there are none', () => {
    expect(syncedPlaybackFields({ questions: [q(10)] })).toEqual({ notes: [] });
    expect(
      syncedPlaybackFields({
        clip: { start: 5, end: 60 },
        notes: [
          { id: 'n1', timestamp: 20, text: 'Look' },
          { id: 'n2', timestamp: 30, text: '' },
        ],
        questions: [q(10)],
      })
    ).toEqual({
      clip: { start: 5, end: 60 },
      notes: [{ id: 'n1', timestamp: 20, text: 'Look' }],
    });
  });
});

describe('syncedPlayback', () => {
  const local = {
    clip: { start: 1, end: 200 },
    notes: [{ id: 'local', timestamp: 50, text: 'Mine' }],
  };

  it('takes the canonical clip and notes when the doc carries notes', () => {
    expect(
      syncedPlayback(
        {
          clip: { start: 40, end: 80 },
          notes: [{ id: 'peer', timestamp: 60, text: 'Peer' }],
          questions: [q(30)],
        },
        local
      )
    ).toEqual({
      clip: { start: 30, end: 80 },
      notes: [{ id: 'peer', timestamp: 60, text: 'Peer' }],
    });
  });

  it('clears the local clip and notes when the canonical doc has empty notes', () => {
    expect(syncedPlayback({ notes: [], questions: [q(30)] }, local)).toEqual(
      {}
    );
  });

  it('keeps the fallback when the canonical doc predates synced playback', () => {
    expect(syncedPlayback({ questions: [q(30)] }, local)).toEqual(local);
    expect(syncedPlayback({ questions: [q(30)] })).toEqual({});
  });
});
