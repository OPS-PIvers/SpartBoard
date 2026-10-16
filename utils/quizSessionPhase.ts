// Quiz session phase: one union derived from the stored session fields, and the writes each teacher event makes from it.

import { deleteField } from 'firebase/firestore';
import type { QuizSession } from '@/types';
import {
  deriveRunState,
  endSessionPatch,
  type RunState,
} from '@/utils/sessionLifecycle';

export type QuestionStep = 'answering' | 'reviewing';

export type QuizSessionPhase =
  | { kind: 'lobby'; index: number }
  | {
      kind: 'question';
      pacing: 'teacher' | 'auto';
      index: number;
      step: QuestionStep;
      autoAdvanceAt: number | null;
    }
  | { kind: 'selfPaced'; index: number }
  | { kind: 'game'; index: number; step: QuestionStep }
  | { kind: 'paused'; resumeTo: 'lobby' | 'question'; index: number }
  | { kind: 'ended'; natural: boolean };

export type QuizSessionPhaseFields = Pick<
  QuizSession,
  | 'status'
  | 'sessionMode'
  | 'currentQuestionIndex'
  | 'totalQuestions'
  | 'startedAt'
  | 'questionPhase'
  | 'autoProgressAt'
  | 'showPodiumBetweenQuestions'
>;

export type QuizSessionEvent =
  { type: 'advance' } | { type: 'end' } | { type: 'everyoneAnswered' };

/** A session write; `finalize` asks the caller to turn in every unfinished response afterwards. */
export interface QuizSessionWrite {
  patch: Record<string, unknown>;
  finalize: boolean;
}

export const AUTO_ADVANCE_DELAY_MS = 5000;

/** The phase a session's stored fields describe, or null for a status Quiz never writes. */
export function deriveQuizSessionPhase(
  session: QuizSessionPhaseFields
): QuizSessionPhase | null {
  const index = session.currentQuestionIndex;
  const step: QuestionStep =
    session.questionPhase === 'reviewing' ? 'reviewing' : 'answering';
  const run = deriveRunState('quiz', session);
  if (!run) return null;
  switch (run.phase) {
    case 'waiting':
      return { kind: 'lobby', index };
    case 'paused':
      return {
        kind: 'paused',
        resumeTo: run.resumeTo === 'waiting' ? 'lobby' : 'question',
        index,
      };
    case 'ended':
      return { kind: 'ended', natural: index >= session.totalQuestions };
    case 'active':
      if (session.sessionMode === 'student')
        return { kind: 'selfPaced', index };
      if (session.sessionMode === 'game') return { kind: 'game', index, step };
      return {
        kind: 'question',
        pacing: session.sessionMode === 'auto' ? 'auto' : 'teacher',
        index,
        step,
        // A stored 0 reads as unarmed, as the old `!autoProgressAt` check did.
        autoAdvanceAt:
          session.autoProgressAt === 0
            ? null
            : (session.autoProgressAt ?? null),
      };
  }
}

/** The shared run state a quiz phase sits in. */
export function quizRunState(phase: QuizSessionPhase): RunState {
  switch (phase.kind) {
    case 'lobby':
      return { phase: 'waiting' };
    case 'paused':
      return {
        phase: 'paused',
        resumeTo: phase.resumeTo === 'lobby' ? 'waiting' : 'active',
      };
    case 'ended':
      return { phase: 'ended' };
    default:
      return { phase: 'active' };
  }
}

/** The write a teacher event makes, or null when the event isn't allowed from the session's phase. */
export function quizSessionWrite(
  session: QuizSessionPhaseFields,
  event: QuizSessionEvent,
  now: number
): QuizSessionWrite | null {
  const phase = deriveQuizSessionPhase(session);
  switch (event.type) {
    case 'advance':
      return phase ? advanceWrite(session, phase, now) : null;
    case 'end':
      return phase?.kind === 'ended'
        ? null
        : { patch: endSessionPatch('quiz', now), finalize: true };
    case 'everyoneAnswered':
      if (
        phase?.kind !== 'question' ||
        phase.pacing !== 'auto' ||
        phase.step !== 'answering' ||
        phase.autoAdvanceAt !== null
      ) {
        return null;
      }
      return {
        patch: {
          autoProgressAt: now + AUTO_ADVANCE_DELAY_MS,
          ...(session.showPodiumBetweenQuestions
            ? { questionPhase: 'reviewing' }
            : {}),
        },
        finalize: false,
      };
  }
}

function advanceWrite(
  session: QuizSessionPhaseFields,
  phase: QuizSessionPhase,
  now: number
): QuizSessionWrite | null {
  // A paused session moves on only through Resume, which also unpauses the assignment.
  if (phase.kind === 'paused' || phase.kind === 'ended') return null;
  if (
    (phase.kind === 'question' || phase.kind === 'game') &&
    phase.step === 'answering' &&
    session.showPodiumBetweenQuestions
  ) {
    return {
      patch: { questionPhase: 'reviewing', autoProgressAt: null },
      finalize: false,
    };
  }
  const nextIndex = phase.index + 1;
  if (nextIndex >= session.totalQuestions) {
    return {
      patch: {
        ...endSessionPatch('quiz', now),
        currentQuestionIndex: session.totalQuestions,
        questionPhase: deleteField(),
      },
      finalize: true,
    };
  }
  return {
    patch: {
      status: 'active',
      currentQuestionIndex: nextIndex,
      autoProgressAt: null,
      questionPhase: 'answering',
      ...(session.startedAt === null ? { startedAt: now } : {}),
    },
    finalize: false,
  };
}

/** Reopen after a natural end puts the index back in range so a resume doesn't land past the last question. */
export function reopenIndexPatch(
  session: Pick<
    QuizSession,
    'currentQuestionIndex' | 'totalQuestions' | 'sessionMode'
  >
): Record<string, unknown> {
  if (
    typeof session.totalQuestions !== 'number' ||
    session.totalQuestions <= 0 ||
    session.currentQuestionIndex < session.totalQuestions
  ) {
    return {};
  }
  return {
    currentQuestionIndex: session.sessionMode === 'student' ? 0 : -1,
    questionPhase: 'answering',
  };
}
