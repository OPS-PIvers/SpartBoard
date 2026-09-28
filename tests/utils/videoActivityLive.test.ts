import { describe, it, expect } from 'vitest';
import type { VideoActivityQuestion } from '@/types';
import {
  initialVideoActivityLiveState,
  isLiveVideoActivitySession,
  scoredVideoActivityQuestions,
} from '@/utils/videoActivityLive';
import { computeVideoActivityScorePct } from '@/utils/videoActivityGrading';

const q = (id: string, correctAnswer = 'A'): VideoActivityQuestion => ({
  id,
  timestamp: 0,
  text: id,
  type: 'MC',
  correctAnswer,
  incorrectAnswers: ['B'],
  timeLimit: 0,
  points: 1,
});

const questions = [q('q1'), q('q2'), q('q3')];

describe('videoActivityLive', () => {
  it('treats sessions without sessionMode as self-paced', () => {
    expect(isLiveVideoActivitySession({})).toBe(false);
    expect(isLiveVideoActivitySession({ sessionMode: 'student' })).toBe(false);
    expect(isLiveVideoActivitySession({ sessionMode: 'teacher' })).toBe(true);
    expect(isLiveVideoActivitySession(null)).toBe(false);
  });

  it('scores self-paced sessions over every question', () => {
    expect(scoredVideoActivityQuestions({}, questions)).toBe(questions);
  });

  it('scores live sessions over asked questions only', () => {
    const live = {
      ...initialVideoActivityLiveState(0),
      askedQuestionIds: ['q1', 'q3'],
      skippedQuestionIds: ['q2'],
    };
    const scored = scoredVideoActivityQuestions(
      { sessionMode: 'teacher', live },
      questions
    );
    expect(scored.map((x) => x.id)).toEqual(['q1', 'q3']);
    // Asked-but-missed q3 scores 0; skipped q2 is not in the denominator.
    expect(
      computeVideoActivityScorePct(scored, [{ questionId: 'q1', answer: 'A' }])
    ).toBe(50);
  });

  it('scores a live session with nothing asked over no questions', () => {
    expect(
      scoredVideoActivityQuestions(
        { sessionMode: 'teacher', live: initialVideoActivityLiveState(0) },
        questions
      )
    ).toEqual([]);
  });
});
