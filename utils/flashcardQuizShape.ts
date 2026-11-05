import type {
  FlashcardSession,
  GradeResult,
  QuizData,
  QuizQuestion,
  QuizResponse,
  StaffResponseFields,
} from '@/types';
import {
  flashcardExpectedAnswer,
  flashcardPrompt,
  type FlashcardResultRecord,
} from '@/utils/flashcardResults';

// Flashcards Check results in Quiz's shapes, so its print report, student lines and sheet export can be reused.

/** Each card as a one-point fill-in question: the side shown first and the side typed. */
export const flashcardQuizQuestions = (
  session: FlashcardSession
): QuizQuestion[] =>
  session.cards.map((card) => ({
    id: card.id,
    timeLimit: 0,
    text: flashcardPrompt(session, card),
    type: 'FIB',
    correctAnswer: flashcardExpectedAnswer(session, card),
    incorrectAnswers: [],
    points: 1,
  }));

export const flashcardQuizData = (
  session: FlashcardSession,
  title: string
): QuizData => ({
  id: session.id,
  title,
  questions: flashcardQuizQuestions(session),
  createdAt: 0,
  updatedAt: 0,
});

/** A submitted Check as a completed response, with accepted typos counted right; unfinished work has no answers. */
export const flashcardQuizResponse = (
  result: FlashcardResultRecord & StaffResponseFields,
  classLabel?: string
): QuizResponse => {
  const submitted = typeof result.submittedAt === 'number';
  const accepted = new Set(
    (result.flags ?? [])
      .filter((flag) => flag.accepted === true)
      .map((flag) => flag.cardId)
  );
  const log = submitted ? (result.answerLog ?? []) : [];
  const total = result.total ?? 0;
  return {
    _responseKey: result.studentUid,
    studentUid: result.studentUid,
    pin: '',
    joinedAt: 0,
    status: submitted ? 'completed' : 'in-progress',
    answers: log.map((entry) => ({
      questionId: entry.cardId,
      answer: entry.response,
      answeredAt: result.submittedAt ?? 0,
      isCorrect: entry.correct === true || accepted.has(entry.cardId),
    })),
    score:
      submitted && total > 0
        ? Math.round(((result.score ?? 0) / total) * 100)
        : null,
    submittedAt: submitted ? (result.submittedAt ?? null) : null,
    // A Test serves only some cards, so the others don't read as unanswered.
    ...(submitted && log.length > 0
      ? { servedQuestionIds: log.map((entry) => entry.cardId) }
      : {}),
    ...(classLabel ? { classPeriod: classLabel } : {}),
    tabSwitchWarnings: 0,
    ...(result.staffEmail
      ? { staffEmail: result.staffEmail, staffName: result.staffName ?? '' }
      : {}),
  };
};

/** Grades a card from the student's logged result, never by re-matching text. */
export const flashcardGradeFn = (
  question: QuizQuestion,
  _answer: string,
  response?: QuizResponse
): GradeResult => {
  const entry = response?.answers.find((a) => a.questionId === question.id);
  if (!entry) {
    return {
      isCorrect: false,
      pointsEarned: 0,
      pointsMax: 1,
      state: 'not-attempted',
    };
  }
  const isCorrect = entry.isCorrect === true;
  return {
    isCorrect,
    pointsEarned: isCorrect ? 1 : 0,
    pointsMax: 1,
    state: 'scored',
  };
};
