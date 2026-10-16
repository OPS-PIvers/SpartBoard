// Flashcards assignment page state: one view union in place of the old if/else ladder, plus the seat, progress-listener and submit reducers.

import type {
  FlashcardProgress,
  FlashcardSession,
  StudentAssignmentPointer,
} from '@/types';
import {
  getWindowState,
  resolveEffectiveWindow,
  type WindowFields,
} from '@/utils/assignmentWindow';
import {
  mergeFlashcardSessionContent,
  type FlashcardSessionContent,
} from '@/utils/flashcardSessionContent';

export type Loadable<T> =
  { kind: 'loading' } | { kind: 'unavailable' } | { kind: 'ready'; value: T };

/** Seating in a per-period session; `entered` latches once the player has shown. */
export type SeatState =
  | { kind: 'idle' }
  | { kind: 'none' }
  | { kind: 'error' }
  | { kind: 'seated'; entered: boolean };

export type SeatEvent =
  | { type: 'seated' }
  | { type: 'noSeat' }
  | { type: 'seatFailed' }
  | { type: 'entered' };

export const initialSeat: SeatState = { kind: 'idle' };

/** The next seat state, or `state` itself when the event isn't allowed from it. */
export function seatReducer(state: SeatState, event: SeatEvent): SeatState {
  switch (state.kind) {
    case 'idle':
      switch (event.type) {
        case 'seated':
          return { kind: 'seated', entered: false };
        case 'noSeat':
          return { kind: 'none' };
        case 'seatFailed':
          return { kind: 'error' };
        default:
          return state;
      }
    case 'seated':
      return event.type === 'entered' && !state.entered
        ? { kind: 'seated', entered: true }
        : state;
    case 'none':
    case 'error':
      return state;
  }
}

/** Whether a render-time `entered` dispatch would change anything. */
export const shouldEnter = (
  seat: SeatState,
  canEnter: boolean,
  contentPending: boolean
): boolean =>
  seat.kind === 'seated' && !seat.entered && canEnter && !contentPending;

/** The progress listener; `resetCount` bumps when a doc that existed is deleted (a teacher reset). */
export interface ProgressListenState {
  progress: Loadable<FlashcardProgress | null>;
  existed: boolean;
  resetCount: number;
}

export type ProgressListenEvent =
  /** `first` marks a new subscription's first snapshot, which never counts as a reset. */
  | { type: 'snapshot'; value: FlashcardProgress | null; first: boolean }
  | { type: 'error' };

export const initialProgressListen: ProgressListenState = {
  progress: { kind: 'loading' },
  existed: false,
  resetCount: 0,
};

export function progressListenReducer(
  state: ProgressListenState,
  event: ProgressListenEvent
): ProgressListenState {
  if (event.type === 'error') {
    return { ...state, progress: { kind: 'ready', value: null } };
  }
  const existedBefore = !event.first && state.existed;
  const reset = event.value === null && existedBefore;
  return {
    progress: { kind: 'ready', value: event.value },
    existed: event.value !== null,
    resetCount: reset ? state.resetCount + 1 : state.resetCount,
  };
}

/** A Check submit from the tracked player. Success stays `submitting` until the results view replaces the player. */
export type SubmitState =
  { kind: 'idle' } | { kind: 'submitting' } | { kind: 'failed' };

export type SubmitEvent = { type: 'submitStarted' } | { type: 'submitFailed' };

export const initialSubmit: SubmitState = { kind: 'idle' };

export function submitReducer(
  state: SubmitState,
  event: SubmitEvent
): SubmitState {
  switch (event.type) {
    case 'submitStarted':
      return state.kind === 'submitting' ? state : { kind: 'submitting' };
    case 'submitFailed':
      return state.kind === 'submitting' ? { kind: 'failed' } : state;
  }
}

interface ReadyView {
  session: FlashcardSession;
  progress: FlashcardProgress | null;
  effectiveWindow: WindowFields;
}

export type FlashcardStudentView =
  | { kind: 'unavailable' }
  | { kind: 'loading' }
  | { kind: 'excluded' }
  | (ReadyView &
      (
        | { kind: 'upcoming'; openAt: number }
        | { kind: 'submitted'; progress: FlashcardProgress }
        | { kind: 'checkClosed' }
        /** Study goes on untracked; `closeAt` is null when the banner says the assignment ended. */
        | { kind: 'closed'; closeAt: number | null }
        | { kind: 'seating'; step: 'waiting' | 'noSeat' | 'seatError' }
        | { kind: 'periodLocked' }
        | { kind: 'tracked'; paused: boolean }
      ));

export interface FlashcardStudentViewInput {
  session: Loadable<FlashcardSession>;
  progress: Loadable<FlashcardProgress | null>;
  /** `undefined` while the pointer is still loading. */
  pointer: StudentAssignmentPointer | null | undefined;
  studentUid: string | null;
  content: FlashcardSessionContent | null;
  now: number;
  perPeriod: boolean;
  seat: SeatState;
  canEnter: boolean;
}

export function deriveFlashcardStudentView(
  input: FlashcardStudentViewInput
): FlashcardStudentView {
  const { pointer } = input;
  if (input.session.kind === 'unavailable' || !input.studentUid) {
    return { kind: 'unavailable' };
  }
  if (
    input.session.kind === 'loading' ||
    input.progress.kind !== 'ready' ||
    pointer === undefined
  ) {
    return { kind: 'loading' };
  }
  if (pointer?.excluded) return { kind: 'excluded' };

  const session = mergeFlashcardSessionContent(
    input.session.value,
    input.content
  );
  const progress = input.progress.value;
  const effectiveWindow = resolveEffectiveWindow(session, pointer);
  const ready: ReadyView = { session, progress, effectiveWindow };
  const windowState =
    session.status === 'ended'
      ? 'closed'
      : getWindowState(effectiveWindow, input.now);
  const isCheck = session.kind === 'check';

  if (windowState === 'upcoming' && effectiveWindow.openAt !== undefined) {
    return { ...ready, kind: 'upcoming', openAt: effectiveWindow.openAt };
  }
  if (isCheck && typeof progress?.submittedAt === 'number') {
    return { ...ready, kind: 'submitted', progress };
  }
  if (isCheck && windowState === 'closed') {
    return { ...ready, kind: 'checkClosed' };
  }
  if (windowState === 'closed') {
    return {
      ...ready,
      kind: 'closed',
      closeAt:
        session.status === 'ended' || effectiveWindow.closeAt === undefined
          ? null
          : effectiveWindow.closeAt,
    };
  }
  const { seat } = input;
  if (input.perPeriod && !(seat.kind === 'seated' && seat.entered)) {
    if (seat.kind === 'none')
      return { ...ready, kind: 'seating', step: 'noSeat' };
    if (seat.kind === 'error') {
      return { ...ready, kind: 'seating', step: 'seatError' };
    }
    if (seat.kind === 'seated' && !input.canEnter) {
      return { ...ready, kind: 'periodLocked' };
    }
    return { ...ready, kind: 'seating', step: 'waiting' };
  }
  return {
    ...ready,
    kind: 'tracked',
    paused: input.perPeriod && !input.canEnter,
  };
}

/** The next open or close time after `now`, when the page must re-render to change screens. */
export function nextWindowBoundary(
  session: Pick<FlashcardSession, 'status'>,
  effectiveWindow: WindowFields,
  now: number
): number | null {
  if (session.status === 'ended') return null;
  const ahead = [effectiveWindow.openAt, effectiveWindow.closeAt].filter(
    (at): at is number => at !== undefined && at > now
  );
  return ahead.length > 0 ? Math.min(...ahead) : null;
}
