import { describe, it, expect } from 'vitest';
import {
  quizAssignBlocker,
  quizIncompleteReason,
  videoActivityAssignBlocker,
  videoActivityIncompleteReason,
} from '@/utils/activityCompleteness';
import type { QuizQuestion, VideoActivityQuestion } from '@/types';

const question = (over: Partial<QuizQuestion> = {}): QuizQuestion =>
  ({
    id: 'q1',
    text: 'What is 2 + 2?',
    type: 'MC',
    correctAnswer: '4',
    incorrectAnswers: ['3'],
    points: 1,
    ...over,
  }) as QuizQuestion;

const vaQuestion = (
  over: Partial<VideoActivityQuestion> = {}
): VideoActivityQuestion =>
  ({
    id: 'q1',
    text: 'What happened?',
    type: 'MC',
    correctAnswer: 'A',
    incorrectAnswers: ['B'],
    timestamp: 10,
    points: 1,
    ...over,
  }) as VideoActivityQuestion;

describe('quizIncompleteReason', () => {
  it('passes a finished quiz', () => {
    expect(
      quizIncompleteReason({ title: 'Unit 3', questions: [question()] })
    ).toBeNull();
  });

  it('names the missing title, and calls it a bank for a bank', () => {
    expect(quizIncompleteReason({ title: ' ', questions: [question()] })).toBe(
      'Quiz title is required'
    );
    expect(
      quizIncompleteReason({ title: '', questions: [question()] }, true)
    ).toBe('Bank title is required');
  });

  it('wants at least one question or bank slot', () => {
    expect(quizIncompleteReason({ title: 'Unit 3', questions: [] })).toBe(
      'Add at least one question'
    );
  });

  it('names the question that is missing text or a key', () => {
    expect(
      quizIncompleteReason({
        title: 'Unit 3',
        questions: [question(), question({ id: 'q2', text: '  ' })],
      })
    ).toBe('Question 2: text is required');
    expect(
      quizIncompleteReason({
        title: 'Unit 3',
        questions: [question({ correctAnswer: '' })],
      })
    ).toBe('Question 1: correct answer is required');
  });

  // Free-response is graded by hand, and `needsKey` defers the key on purpose.
  it('lets a free-response or needs-key question through without a key', () => {
    expect(
      quizIncompleteReason({
        title: 'Unit 3',
        questions: [question({ type: 'free-response', correctAnswer: '' })],
      })
    ).toBeNull();
    expect(
      quizIncompleteReason({
        title: 'Unit 3',
        questions: [question({ needsKey: true, correctAnswer: '' })],
      })
    ).toBeNull();
  });

  it('rejects a random bank slot that draws nothing', () => {
    expect(
      quizIncompleteReason({
        title: 'Unit 3',
        questions: [],
        bankSlots: [
          {
            id: 's1',
            mode: 'random',
            count: 0,
            bankTitle: 'Fractions',
          } as never,
        ],
      })
    ).toContain('draws 0 questions');
  });
});

describe('videoActivityIncompleteReason', () => {
  const base = {
    title: 'Photosynthesis',
    youtubeUrl: 'https://youtu.be/abc',
    questions: [vaQuestion()],
  };

  it('passes a finished activity', () => {
    expect(videoActivityIncompleteReason(base)).toBeNull();
  });

  it('wants a title, a video and a question', () => {
    expect(videoActivityIncompleteReason({ ...base, title: '' })).toBe(
      'Activity title is required'
    );
    expect(videoActivityIncompleteReason({ ...base, youtubeUrl: '' })).toBe(
      'YouTube URL is required'
    );
    expect(videoActivityIncompleteReason({ ...base, questions: [] })).toBe(
      'Add at least one question'
    );
  });

  it('checks multi-answer options, including the pipe separator', () => {
    expect(
      videoActivityIncompleteReason({
        ...base,
        questions: [
          vaQuestion({ type: 'MA', correctAnswer: '', incorrectAnswers: [] }),
        ],
      })
    ).toBe('Question 1: add at least one option');
    expect(
      videoActivityIncompleteReason({
        ...base,
        questions: [
          vaQuestion({
            type: 'MA',
            correctAnswer: '',
            incorrectAnswers: ['B'],
          }),
        ],
      })
    ).toBe('Question 1: select at least one correct option');
    expect(
      videoActivityIncompleteReason({
        ...base,
        questions: [vaQuestion({ type: 'MA', correctAnswer: 'A|B' })],
      })
    ).toBeNull();
  });
});

// The assign gates are deliberately narrower than the editor's notice: they
// block only what leaves a student stuck, not everything still unpolished.
describe('assign gates', () => {
  it('lets an untitled quiz through — ugly, not broken', () => {
    expect(quizAssignBlocker({ questions: [question()] })).toBeNull();
  });

  it('blocks a quiz with nothing to answer or nothing to grade', () => {
    expect(quizAssignBlocker({ questions: [] })).toBe('it has no questions');
    expect(
      quizAssignBlocker({ questions: [question({ correctAnswer: '' })] })
    ).toBe('question 1 has no correct answer');
    expect(quizAssignBlocker({ questions: [question({ text: ' ' })] })).toBe(
      'question 1 has no text'
    );
  });

  it('still allows free-response and needs-key questions', () => {
    expect(
      quizAssignBlocker({
        questions: [question({ type: 'free-response', correctAnswer: '' })],
      })
    ).toBeNull();
    expect(
      quizAssignBlocker({
        questions: [question({ needsKey: true, correctAnswer: '' })],
      })
    ).toBeNull();
  });

  // A video with no questions is a watch-only assignment, which is a real
  // thing teachers hand out.
  it('lets a question-free video activity be assigned', () => {
    expect(videoActivityAssignBlocker({ questions: [] })).toBeNull();
  });

  it('blocks a video activity question that cannot be graded', () => {
    expect(
      videoActivityAssignBlocker({
        questions: [vaQuestion({ correctAnswer: '' })],
      })
    ).toBe('question 1 has no correct answer');
    expect(
      videoActivityAssignBlocker({
        questions: [vaQuestion({ type: 'MA', correctAnswer: ' | ' })],
      })
    ).toBe('question 1 has no correct answer');
    expect(
      videoActivityAssignBlocker({
        questions: [vaQuestion({ type: 'MA', correctAnswer: 'A|B' })],
      })
    ).toBeNull();
  });
});
