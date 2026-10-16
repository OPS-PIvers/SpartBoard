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

const canVote = (session: PollSessionDoc): boolean =>
  session.startedAt != null && session.active === true;

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
}

export type PollPhoneView =
  | { k: 'loading' }
  | { k: 'unavailable' }
  | { k: 'waiting' }
  | { k: 'open'; ballot: PollBallot }
  | { k: 'closed'; reason: 'teacher' | 'rejected'; ballot: PollBallot };

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
  const tally = aggregateVotes(votes, questionIndex, options.length);
  const ballot: PollBallot = {
    questions,
    questionIndex,
    question,
    options,
    tally,
    total: tally.reduce((sum, n) => sum + n, 0),
    votedIndex:
      votes.find((v) => v.id === `${questionIndex}_${uid}`)?.optionIndex ??
      null,
    submitting: vote === 'submitting',
  };
  if (session.active !== true)
    return { k: 'closed', reason: 'teacher', ballot };
  if (vote === 'rejected') return { k: 'closed', reason: 'rejected', ballot };
  return { k: 'open', ballot };
};
