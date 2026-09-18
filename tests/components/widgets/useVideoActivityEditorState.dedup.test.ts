import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { VideoActivityData, VideoActivityQuestion } from '@/types';
import { useVideoActivityEditorState } from '@/components/widgets/VideoActivityWidget/components/useVideoActivityEditorState';

const question = (
  id: string,
  extra: Partial<VideoActivityQuestion> = {}
): VideoActivityQuestion => ({
  id,
  timeLimit: 30,
  text: id,
  type: 'MC',
  correctAnswer: 'a',
  incorrectAnswers: ['b'],
  timestamp: 0,
  points: 1,
  ...extra,
});

// A Drive-sync/arrayUnion race can write the same question id twice (see utils/videoActivityGrading.ts).
const activityWithDuplicate: VideoActivityData = {
  id: 'va-1',
  title: 'Photosynthesis',
  youtubeUrl: 'https://youtube.com/watch?v=abc',
  questions: [
    question('q1', { points: 3 }),
    question('q2', { points: 2 }),
    question('q1', { points: 3 }), // duplicate id from a sync race
  ],
  createdAt: 1,
  updatedAt: 1,
};

describe('useVideoActivityEditorState — duplicate-id questions', () => {
  it('does not inflate totalPoints for a duplicated question id', () => {
    const { result } = renderHook(() =>
      useVideoActivityEditorState({ activity: activityWithDuplicate })
    );
    // Two distinct questions (3 + 2 = 5), not three copies (3 + 2 + 3 = 8).
    expect(result.current.totalPoints).toBe(5);
    expect(result.current.questions).toHaveLength(2);
  });
});
