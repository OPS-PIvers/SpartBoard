// Video Activity session and response states, derived from the fields already stored (no new fields).

import type {
  VideoActivityPublicQuestion,
  VideoActivityResponse,
  VideoActivitySession,
} from '@/types';
import {
  deriveRunState,
  endSessionPatch,
  type RunState,
} from '@/utils/sessionLifecycle';

/** Firestore sentinels, passed in so this module stays free of the SDK. */
export interface FieldOps {
  arrayUnion: (...values: string[]) => unknown;
  arrayRemove: (...values: string[]) => unknown;
  increment: (n: number) => unknown;
}

// ─── Board pacing (teacher-paced runs) ────────────────────────────────────────

export type VaLiveState =
  | { phase: 'lobby' }
  | { phase: 'watching' }
  | {
      phase: 'question';
      questionId: string;
      /** False only when a question id is stored with a closed phase. */
      open: boolean;
      resultsShown: boolean;
      answerRevealed: boolean;
      revealedAnswer: string | null;
    }
  | { phase: 'ended' };

/** A status other than waiting or ended reads as running, as the board and student screens always have. */
export function deriveVaLiveState(
  session: Pick<VideoActivitySession, 'status' | 'live'>
): VaLiveState {
  if (session.status === 'ended') return { phase: 'ended' };
  if (session.status === 'waiting') return { phase: 'lobby' };
  const live = session.live;
  if (!live?.currentQuestionId) return { phase: 'watching' };
  return {
    phase: 'question',
    questionId: live.currentQuestionId,
    open: live.questionPhase === 'open',
    resultsShown: !!live.resultsShown,
    answerRevealed: !!live.answerRevealed,
    revealedAnswer: live.revealedAnswer ?? null,
  };
}

/** The question open for answers on the board, or null. */
export function openLiveQuestionId(state: VaLiveState): string | null {
  return state.phase === 'question' && state.open ? state.questionId : null;
}

export type VaLiveEvent =
  | { type: 'start' }
  | { type: 'open'; questionId: string; playheadSeconds: number }
  | { type: 'resume'; playheadSeconds: number }
  | { type: 'showResults'; shown: boolean }
  | { type: 'reveal'; revealed: boolean; correctAnswer?: string | null }
  | { type: 'skip'; questionIds: string[]; playheadSeconds: number }
  | { type: 'end'; playheadSeconds: number };

/** The next pacing state, or `state` itself when the event isn't allowed from it. */
export function liveTransition(
  state: VaLiveState,
  event: VaLiveEvent
): VaLiveState {
  switch (event.type) {
    case 'start':
      return state.phase === 'lobby' ? { phase: 'watching' } : state;
    case 'open':
      if (state.phase !== 'watching' && state.phase !== 'question')
        return state;
      return {
        phase: 'question',
        questionId: event.questionId,
        open: true,
        resultsShown: false,
        answerRevealed: false,
        revealedAnswer: null,
      };
    case 'resume':
      return state.phase === 'question' ? { phase: 'watching' } : state;
    case 'showResults':
      return state.phase === 'question'
        ? { ...state, resultsShown: event.shown }
        : state;
    case 'reveal':
      return state.phase === 'question'
        ? {
            ...state,
            answerRevealed: event.revealed,
            revealedAnswer: event.revealed
              ? (event.correctAnswer ?? null)
              : null,
          }
        : state;
    case 'skip':
      return state;
    case 'end':
      return state.phase === 'ended' ? state : { phase: 'ended' };
  }
}

/** The session write for a pacing event, or null when there is nothing to write. */
export function livePacingPatch(
  event: VaLiveEvent,
  now: number,
  ops: Pick<FieldOps, 'arrayUnion' | 'arrayRemove'>
): Record<string, unknown> | null {
  const stamp = (
    patch: Record<string, unknown>,
    playheadSeconds?: number
  ): Record<string, unknown> => ({
    ...patch,
    'live.updatedAt': now,
    ...(playheadSeconds !== undefined
      ? { 'live.playheadSeconds': Math.max(0, playheadSeconds) }
      : {}),
  });
  switch (event.type) {
    case 'start':
      return stamp({ status: 'active' });
    case 'open':
      return stamp(
        {
          'live.currentQuestionId': event.questionId,
          'live.questionPhase': 'open',
          'live.resultsShown': false,
          'live.answerRevealed': false,
          'live.revealedAnswer': null,
          'live.askedQuestionIds': ops.arrayUnion(event.questionId),
          'live.skippedQuestionIds': ops.arrayRemove(event.questionId),
        },
        event.playheadSeconds
      );
    case 'resume':
      return stamp(
        {
          'live.currentQuestionId': null,
          'live.questionPhase': 'closed',
          'live.revealedAnswer': null,
        },
        event.playheadSeconds
      );
    case 'showResults':
      return stamp({ 'live.resultsShown': event.shown });
    case 'reveal':
      return stamp({
        'live.answerRevealed': event.revealed,
        'live.revealedAnswer': event.revealed
          ? (event.correctAnswer ?? null)
          : null,
      });
    case 'skip':
      if (event.questionIds.length === 0) return null;
      return stamp(
        { 'live.skippedQuestionIds': ops.arrayUnion(...event.questionIds) },
        event.playheadSeconds
      );
    case 'end':
      return stamp(
        {
          ...endSessionPatch('videoActivity', now),
          'live.currentQuestionId': null,
          'live.questionPhase': 'closed',
        },
        event.playheadSeconds
      );
  }
}

// ─── Whole session ────────────────────────────────────────────────────────────

export type VaSessionState =
  { mode: 'self-paced'; run: RunState } | { mode: 'live'; pacing: VaLiveState };

/** Self-paced runs need the assignment status to tell Pause from End; null for a status VA never writes. */
export function deriveVaSessionState(
  session: Pick<VideoActivitySession, 'status' | 'live' | 'sessionMode'>,
  assignmentStatus?: unknown
): VaSessionState | null {
  if (session.sessionMode === 'teacher') {
    return { mode: 'live', pacing: deriveVaLiveState(session) };
  }
  const run = deriveRunState('videoActivity', {
    status: session.status,
    assignmentStatus,
  });
  return run ? { mode: 'self-paced', run } : null;
}

// ─── Student response ─────────────────────────────────────────────────────────

type ResponseLifecycleFields = Pick<
  VideoActivityResponse,
  'completedAt' | 'unlocked' | 'completedAttempts'
>;

export type VaResponseState =
  | { kind: 'in-progress'; resumed: boolean }
  | { kind: 'completed'; completedAt: number };

/** Rules require `completedAt` on create, so it is a number or null on every stored response. */
export function isVaResponseCompleted(
  response: Pick<VideoActivityResponse, 'completedAt'>
): boolean {
  return response.completedAt != null;
}

export function deriveVaResponseState(
  response: Pick<VideoActivityResponse, 'completedAt' | 'unlocked'>
): VaResponseState {
  return response.completedAt != null
    ? { kind: 'completed', completedAt: response.completedAt }
    : { kind: 'in-progress', resumed: response.unlocked === true };
}

export type VaResponseEvent =
  | { type: 'answer' }
  | { type: 'complete'; now: number }
  | {
      type: 'rejoin';
      /** Completions recorded on the cross-launch ledger. */
      ledgerCompleted: number;
      attemptLimit: number | null;
    }
  | { type: 'unlock' };

/** What a rejoin does to an existing response: resume an unlocked attempt, start a fresh one, refuse, or nothing. */
export type VaRejoinOutcome = 'resume-unlocked' | 'reset' | 'at-cap' | 'none';

export function rejoinOutcome(
  existing: ResponseLifecycleFields,
  ledgerCompleted: number,
  attemptLimit: number | null
): VaRejoinOutcome {
  if (existing.completedAt == null) return 'none';
  if (existing.unlocked) return 'resume-unlocked';
  // A legacy completion counts as one attempt even when the counter reads 0.
  const completed = Math.max(
    existing.completedAttempts ?? 0,
    ledgerCompleted,
    1
  );
  return attemptLimit !== null && completed >= attemptLimit
    ? 'at-cap'
    : 'reset';
}

/** The next response state, or `state` itself when the event isn't allowed from it. */
export function responseTransition(
  state: VaResponseState,
  event: VaResponseEvent,
  existing: ResponseLifecycleFields
): VaResponseState {
  switch (event.type) {
    case 'answer':
      return state;
    case 'complete':
      return state.kind === 'in-progress'
        ? { kind: 'completed', completedAt: event.now }
        : state;
    case 'rejoin': {
      const outcome = rejoinOutcome(
        existing,
        event.ledgerCompleted,
        event.attemptLimit
      );
      if (outcome === 'resume-unlocked')
        return { kind: 'in-progress', resumed: true };
      if (outcome === 'reset') return { kind: 'in-progress', resumed: false };
      return state;
    }
    case 'unlock':
      return { kind: 'in-progress', resumed: true };
  }
}

/** The response fields a completion writes, or null when it is already complete. */
export function completionPatch(
  existing: ResponseLifecycleFields,
  now: number,
  ops: Pick<FieldOps, 'increment'>
): Record<string, unknown> | null {
  if (existing.completedAt != null) return null;
  return {
    completedAt: now,
    completedAttempts: ops.increment(1),
    // Only when the doc carries the flag, so writes land during a rules deploy gap.
    ...(existing.unlocked ? { unlocked: false } : {}),
  };
}

/** The response fields a teacher unlock writes: reopen the attempt and refund it. */
export function unlockPatch(
  existing: ResponseLifecycleFields,
  now: number
): Record<string, unknown> {
  return {
    completedAt: null,
    score: null,
    completedAttempts: Math.max(0, (existing.completedAttempts ?? 0) - 1),
    unlocked: true,
    unlockedAt: now,
  };
}

// ─── Self-paced student player (local UI state) ───────────────────────────────

export interface SelfPacedPlayerState {
  activeQuestion: VideoActivityPublicQuestion | null;
  /** Bumped to remount the question overlay after a shut period refuses it. */
  overlayNonce: number;
  /** finishing and finished show the completion screen; retry offers Finish activity. */
  finish: 'watching' | 'finishing' | 'finished' | 'retry';
  seekRequest: { time: number; nonce: number } | null;
}

export type SelfPacedPlayerEvent =
  | { type: 'questionReached'; question: VideoActivityPublicQuestion }
  | { type: 'questionDone' }
  | { type: 'rewind'; time: number; nonce: number }
  | { type: 'periodFrozen' }
  | { type: 'videoEnded' }
  | { type: 'completeSucceeded' }
  | { type: 'completeFailed' };

export const initialSelfPacedPlayerState: SelfPacedPlayerState = {
  activeQuestion: null,
  overlayNonce: 0,
  finish: 'watching',
  seekRequest: null,
};

export function selfPacedPlayerReducer(
  state: SelfPacedPlayerState,
  event: SelfPacedPlayerEvent
): SelfPacedPlayerState {
  switch (event.type) {
    case 'questionReached':
      return { ...state, activeQuestion: event.question };
    case 'questionDone':
      return state.activeQuestion ? { ...state, activeQuestion: null } : state;
    case 'rewind':
      return {
        ...state,
        activeQuestion: null,
        seekRequest: { time: event.time, nonce: event.nonce },
      };
    case 'periodFrozen':
      return { ...state, overlayNonce: state.overlayNonce + 1 };
    case 'videoEnded':
      return state.finish === 'watching' || state.finish === 'retry'
        ? { ...state, finish: 'finishing' }
        : state;
    case 'completeSucceeded':
      return state.finish === 'finishing'
        ? { ...state, finish: 'finished' }
        : state;
    case 'completeFailed':
      // A failed write wins even over an overlapping success, as the two flags it replaces did.
      return state.finish === 'finishing' || state.finish === 'finished'
        ? { ...state, finish: 'retry' }
        : state;
  }
}

/** The video reached its end and the completion screen shows (the old `videoEnded` flag). */
export const selfPacedVideoEnded = (state: SelfPacedPlayerState): boolean =>
  state.finish === 'finishing' || state.finish === 'finished';
