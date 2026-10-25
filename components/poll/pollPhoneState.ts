import type { PollSessionDoc, PollSessionQuestion } from '@/types';
import { clampQuestionIndex } from '@/utils/pollQuestions';
import { aggregateVotes, type PollVoteEntry } from './pollSession';

export type PollVoteStatus = 'idle' | 'submitting' | 'rejected';

export type PollPhoneState =
  | { phase: 'loading' }
  | { phase: 'unavailable' }
  | {
      phase: 'ready';
      sessionId: string;
      session: PollSessionDoc;
      votes: PollVoteEntry[];
      vote: PollVoteStatus;
    };

export type PollPhoneEvent =
  | { type: 'lookupSucceeded'; sessionId: string; session: PollSessionDoc }
  | { type: 'lookupFailed' }
  | { type: 'sessionSnapshot'; session: PollSessionDoc }
  | { type: 'votesSnapshot'; votes: PollVoteEntry[] }
  | { type: 'voteStarted' }
  | { type: 'voteSaved' }
  | { type: 'voteRejected' }
  | { type: 'voteFailed' };

export const initialPollPhoneState: PollPhoneState = { phase: 'loading' };

const isQuestionLocked = (session: PollSessionDoc): boolean =>
  (session.lockedQuestions ?? []).includes(
    clampQuestionIndex(
      session.currentQuestionIndex,
      (session.questions ?? []).length
    )
  );

const canVote = (session: PollSessionDoc): boolean =>
  session.startedAt != null &&
  session.active === true &&
  !isQuestionLocked(session);

export const pollPhoneReducer = (
  state: PollPhoneState,
  event: PollPhoneEvent
): PollPhoneState => {
  if (state.phase === 'loading') {
    switch (event.type) {
      case 'lookupSucceeded':
        return {
          phase: 'ready',
          sessionId: event.sessionId,
          session: event.session,
          votes: [],
          vote: 'idle',
        };
      case 'lookupFailed':
        return { phase: 'unavailable' };
      default:
        return state;
    }
  }
  if (state.phase === 'unavailable') return state;

  switch (event.type) {
    case 'sessionSnapshot':
      // A live session means any earlier rejected vote no longer applies.
      return {
        ...state,
        session: event.session,
        vote:
          event.session.active === true && state.vote === 'rejected'
            ? 'idle'
            : state.vote,
      };
    case 'votesSnapshot':
      return { ...state, votes: event.votes };
    case 'voteStarted':
      return state.vote === 'idle' && canVote(state.session)
        ? { ...state, vote: 'submitting' }
        : state;
    case 'voteSaved':
    case 'voteFailed':
      return state.vote === 'submitting' ? { ...state, vote: 'idle' } : state;
    case 'voteRejected':
      return state.vote === 'submitting'
        ? { ...state, vote: 'rejected' }
        : state;
    default:
      return state;
  }
};

export interface PollBallot {
  questions: PollSessionQuestion[];
  questionIndex: number;
  question: PollSessionQuestion;
  options: PollSessionQuestion['options'];
  tally: number[];
  total: number;
  votedIndex: number | null;
  submitting: boolean;
  /** Tallies are held back until the teacher reveals this question. */
  resultsHidden: boolean;
  /** The teacher revealed this question's results to everyone, voted or not. */
  resultsRevealed: boolean;
  /** Correct option indexes once the teacher shows the answer; null until then. */
  correctIndexes: number[] | null;
}

export type PollPhoneView =
  | { k: 'loading' }
  | { k: 'unavailable' }
  | { k: 'waiting' }
  | { k: 'open'; ballot: PollBallot }
  | {
      k: 'closed';
      reason: 'teacher' | 'locked' | 'rejected';
      ballot: PollBallot;
    };

export const derivePollPhoneView = (
  state: PollPhoneState,
  uid: string
): PollPhoneView => {
  if (state.phase === 'loading') return { k: 'loading' };
  if (state.phase === 'unavailable') return { k: 'unavailable' };

  const { session, votes, vote } = state;
  const questions = session.questions ?? [];
  const questionIndex = clampQuestionIndex(
    session.currentQuestionIndex,
    questions.length
  );
  const question = questions[questionIndex];
  if (!question) return { k: 'unavailable' };
  if (session.startedAt == null) return { k: 'waiting' };

  const options = question.options ?? [];
  const revealed = (session.revealedQuestions ?? []).includes(questionIndex);
  // Matched by id, so an edit after the session snapshot can't move a tick.
  const shown = new Set(session.shownAnswers ?? []);
  const shownCorrect = options.flatMap((o, i) =>
    shown.has(`${question.id}:${o.id}`) ? [i] : []
  );
  const tally = aggregateVotes(votes, questionIndex, options.length);
  const mine = votes.find((v) => v.id === `${questionIndex}_${uid}`);
  const ballot: PollBallot = {
    questions,
    questionIndex,
    question,
    options,
    tally,
    total: tally.reduce((sum, n) => sum + n, 0),
    votedIndex: mine?.optionIndex ?? null,
    submitting: vote === 'submitting',
    resultsHidden: session.hideResults === true && !revealed,
    resultsRevealed: session.hideResults === true && revealed,
    correctIndexes: shownCorrect.length > 0 ? shownCorrect : null,
  };
  if (session.active !== true)
    return { k: 'closed', reason: 'teacher', ballot };
  if (isQuestionLocked(session))
    return { k: 'closed', reason: 'locked', ballot };
  if (vote === 'rejected') return { k: 'closed', reason: 'rejected', ballot };
  return { k: 'open', ballot };
};
