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

// Quiz reads a line break in a fill-in key as "also accepted", so card text stays on one line.
const oneLine = (text: string): string => text.replace(/\s*\n\s*/g, ' ').trim();

/** Only Write and Test Checks have a typed answer to compare with a key. */
const hasTypedAnswers = (session: FlashcardSession): boolean =>
  session.checkMode !== 'speak' && session.checkMode !== 'flashcards';

/** Each card as a one-point fill-in question: the side shown first and the side typed. */
export const flashcardQuizQuestions = (
  session: FlashcardSession
): QuizQuestion[] =>
  session.cards.map((card) => ({
    id: card.id,
    timeLimit: 0,
    text: oneLine(flashcardPrompt(session, card)),
    type: 'FIB',
    correctAnswer: hasTypedAnswers(session)
      ? oneLine(flashcardExpectedAnswer(session, card))
      : '',
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

/** Speak saves no text, so a line shows the term said; a mastery Check logs nothing and every card counts as mastered. */
const logFor = (
  result: FlashcardResultRecord,
  session: FlashcardSession
): NonNullable<FlashcardResultRecord['answerLog']> => {
  const log = result.answerLog ?? [];
  const term = new Map(session.cards.map((card) => [card.id, card.term]));
  if (session.checkMode === 'speak')
    return log.map((entry) => ({
      ...entry,
      response: oneLine(term.get(entry.cardId) ?? ''),
    }));
  if (session.checkMode === 'flashcards' && log.length === 0)
    return session.cards.map((card) => ({
      cardId: card.id,
      response: oneLine(flashcardExpectedAnswer(session, card)),
      correct: true,
    }));
  return log;
};

/** A submitted Check as a completed response, with accepted typos counted right; unfinished work has no answers. */
export const flashcardQuizResponse = (
  result: FlashcardResultRecord & StaffResponseFields,
  session: FlashcardSession,
  classLabel?: string
): QuizResponse => {
  const submitted = typeof result.submittedAt === 'number';
  const accepted = new Set(
    (result.flags ?? [])
      .filter((flag) => flag.accepted === true)
      .map((flag) => flag.cardId)
  );
  const log = submitted ? logFor(result, session) : [];
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
