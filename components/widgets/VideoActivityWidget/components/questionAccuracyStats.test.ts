import { describe, it, expect } from 'vitest';
import { VideoActivityQuestion, VideoActivityResponse } from '@/types';
import {
  computeQuestionAccuracy,
  countCorrectAnswers,
} from './questionAccuracyStats';

function makeQuestion(
  overrides: Partial<VideoActivityQuestion> = {}
): VideoActivityQuestion {
  return {
    id: 'q1',
    timeLimit: 0,
    timestamp: 0,
    text: 'What is 2 + 2?',
    type: 'MC',
    correctAnswer: '4',
    incorrectAnswers: ['3', '5'],
    points: 1,
    ...overrides,
  };
}

function makeResponse(
  answers: VideoActivityResponse['answers']
): VideoActivityResponse {
  return {
    studentUid: 'student-1',
    joinedAt: 0,
    answers,
    completedAt: Date.now(),
    score: null,
  };
}

describe('computeQuestionAccuracy', () => {
  it('scores a single correct answer as 100%', () => {
    const q = makeQuestion();
    const responses = [
      makeResponse([{ questionId: 'q1', answer: '4', answeredAt: 1 }]),
    ];
    expect(computeQuestionAccuracy(q, responses)).toBe(100);
  });

  it('scores a single wrong answer as 0%', () => {
    const q = makeQuestion();
    const responses = [
      makeResponse([{ questionId: 'q1', answer: '3', answeredAt: 1 }]),
    ];
    expect(computeQuestionAccuracy(q, responses)).toBe(0);
  });

  it('credits only the FIRST answer when a response has a duplicate entry for the same question', () => {
    const q = makeQuestion();
    // Firestore arrayUnion race: the student's real (first) answer was wrong,
    // but a later duplicate write for the same question happens to be '4'.
    // The authoritative score (computeVideoActivityScorePct) only credits the
    // first entry, so this stat must agree: the response is WRONG, not right.
    const responses = [
      makeResponse([
        { questionId: 'q1', answer: '3', answeredAt: 1 },
        { questionId: 'q1', answer: '4', answeredAt: 2 },
      ]),
    ];
    expect(computeQuestionAccuracy(q, responses)).toBe(0);
  });

  it('does not let a later duplicate answer inflate accuracy above what the first answer earned', () => {
    const q = makeQuestion();
    const responses = [
      // First response: genuinely correct on the first (authoritative) answer.
      makeResponse([{ questionId: 'q1', answer: '4', answeredAt: 1 }]),
      // Second response: first answer is wrong; a duplicate happens to be right.
      makeResponse([
        { questionId: 'q1', answer: '3', answeredAt: 1 },
        { questionId: 'q1', answer: '4', answeredAt: 2 },
      ]),
    ];
    // Only 1 of 2 responses is correct by the first-occurrence rule.
    expect(computeQuestionAccuracy(q, responses)).toBe(50);
  });

  it('returns 0 for a question nobody answered', () => {
    const q = makeQuestion();
    expect(computeQuestionAccuracy(q, [])).toBe(0);
  });
});

describe('countCorrectAnswers', () => {
  it('counts each question at most once even with duplicate correct answers', () => {
    const questions = [makeQuestion({ id: 'q1' })];
    // Two duplicate entries for the SAME question, both happen to be correct.
    const response = makeResponse([
      { questionId: 'q1', answer: '4', answeredAt: 1 },
      { questionId: 'q1', answer: '4', answeredAt: 2 },
    ]);
    // Must never exceed the total number of questions (1), even though the
    // raw answers array has 2 correct-looking entries for that one question.
    expect(countCorrectAnswers(response, questions)).toBe(1);
  });

  it('matches the per-question total across a multi-question set', () => {
    const questions = [
      makeQuestion({ id: 'q1', correctAnswer: '4' }),
      makeQuestion({ id: 'q2', correctAnswer: '9' }),
    ];
    const response = makeResponse([
      { questionId: 'q1', answer: '4', answeredAt: 1 },
      { questionId: 'q2', answer: '8', answeredAt: 2 },
    ]);
    expect(countCorrectAnswers(response, questions)).toBe(1);
  });
});
