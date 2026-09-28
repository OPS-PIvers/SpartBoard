import type {
  VideoActivityAnswer,
  VideoActivityPublicQuestion,
  VideoActivitySession,
} from '@/types';

/** Mirrors QUESTION_CLOSED_REASON in functions/src/videoActivityKey.ts. */
export const QUESTION_CLOSED_REASON = 'question-closed';

/** checkVideoActivityAnswerV1 refused a live answer because its question is not open (D20). */
export function isQuestionClosedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const details = (err as { details?: unknown }).details;
  return (
    typeof details === 'object' &&
    details !== null &&
    (details as { reason?: unknown }).reason === QUESTION_CLOSED_REASON
  );
}

export type LiveStudentScreen =
  | { kind: 'waiting' }
  | { kind: 'watch' }
  | { kind: 'ended' }
  | { kind: 'question'; question: VideoActivityPublicQuestion }
  | {
      kind: 'submitted';
      question: VideoActivityPublicQuestion;
      answer: string;
    }
  | {
      kind: 'revealed';
      question: VideoActivityPublicQuestion;
      /** Null when the student missed the question. */
      answer: VideoActivityAnswer | null;
    }
  | { kind: 'closed'; question: VideoActivityPublicQuestion };

/** What a live student sees, from session state and their own answers only (§6). */
export function liveStudentScreen(
  session: Pick<VideoActivitySession, 'status' | 'live'>,
  questions: VideoActivityPublicQuestion[],
  answers: VideoActivityAnswer[],
  closedQuestionId: string | null = null
): LiveStudentScreen {
  if (session.status === 'ended') return { kind: 'ended' };
  if (session.status === 'waiting') return { kind: 'waiting' };
  const live = session.live;
  const question = live?.currentQuestionId
    ? questions.find((q) => q.id === live.currentQuestionId)
    : undefined;
  if (!live || !question) return { kind: 'watch' };
  const answer = answers.find((a) => a.questionId === question.id) ?? null;
  if (live.answerRevealed) return { kind: 'revealed', question, answer };
  if (answer) return { kind: 'submitted', question, answer: answer.answer };
  if (live.questionPhase === 'open' && closedQuestionId !== question.id)
    return { kind: 'question', question };
  return { kind: 'closed', question };
}
