import type {
  FlashcardAnswerLogEntry,
  FlashcardCheckSessionOptions,
  FlashcardCheckWriteEntry,
  FlashcardFlag,
  FlashcardProgress,
  FlashcardSession,
} from '@/types';
import type { FlashcardCheckSubmission } from './FlashcardPlayer';

/** The Quiz-style rules a Check enforces on the student; none on Checks assigned before them. */
export const checkOptionsOf = (
  session: Pick<FlashcardSession, 'kind' | 'rules'>
): FlashcardCheckSessionOptions | null =>
  session.kind === 'check' ? (session.rules?.sessionOptions ?? null) : null;

/** When this attempt's time runs out, or null without a time limit. */
export const checkDeadline = (
  options: FlashcardCheckSessionOptions | null,
  startedAt: number | undefined
): number | null => {
  const minutes = options?.timeLimitMinutes;
  if (typeof minutes !== 'number' || minutes <= 0) return null;
  if (typeof startedAt !== 'number') return null;
  return startedAt + minutes * 60_000;
};

/** Whether the student may start another attempt themselves. */
export const canTryAgain = (
  session: Pick<FlashcardSession, 'kind' | 'rules'>,
  progress: Pick<FlashcardProgress, 'completedAttempts' | 'forcedSubmit'>
): boolean => {
  if (session.kind !== 'check' || !session.rules) return false;
  // Leaving the tab too often waits for the teacher's Unlock attempt, as in Quiz.
  if (progress.forcedSubmit === 'tab') return false;
  const limit = session.rules.attemptLimit;
  return limit === null || (progress.completedAttempts ?? 1) < limit;
};

/** What was answered so far, for a submission the time limit or the tab rule forces. */
export const forcedCheckSubmission = (
  session: Pick<FlashcardSession, 'checkMode' | 'cards' | 'lockedSettings'>,
  checkLog: Record<string, FlashcardCheckWriteEntry>
): FlashcardCheckSubmission => {
  const known = new Set(session.cards.map((card) => card.id));
  const entries = Object.entries(checkLog).filter(([cardId]) =>
    known.has(cardId)
  );
  let answerLog: FlashcardAnswerLogEntry[] = [];
  if (session.checkMode === 'write') {
    answerLog = entries
      .filter(([, e]) => e.attempts > 0)
      .map(([cardId, e]) => ({
        cardId,
        response: e.response,
        attempts: e.attempts,
      }));
  } else if (session.checkMode === 'test') {
    const count = session.lockedSettings?.testCount;
    const total =
      typeof count === 'number'
        ? Math.min(count, session.cards.length)
        : session.cards.length;
    answerLog = entries
      .filter(([, e]) => e.response.trim() !== '')
      .slice(0, total)
      .map(([cardId, e]) => ({ cardId, response: e.response }));
  } else if (session.checkMode === 'speak') {
    answerLog = entries
      .filter(([, e]) => e.done)
      .map(([cardId, e]) => ({
        cardId,
        response: '',
        type: 'speak' as const,
        attempts: Math.max(1, e.attempts),
        passed: e.passed === true,
      }));
  }
  const logged = new Set(answerLog.map((e) => e.cardId));
  const flags: FlashcardFlag[] = entries
    .filter(([cardId, e]) => e.flagged && logged.has(cardId))
    .map(([cardId, e]) => ({ cardId, response: e.response }));
  return { answerLog, flags };
};
