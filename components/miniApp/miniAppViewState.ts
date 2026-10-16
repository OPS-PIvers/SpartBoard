// Mini App student view state: one union in place of the old hasSubmitted/turnedIn/excluded booleans.

import type { MiniAppSession } from '@/types';
import type { MiniAppSubmitKind } from '@/utils/miniAppResults';

/** A v2 submission: the frame's request id is absent for legacy messages. */
export interface SubmitRequest {
  kind: Exclude<MiniAppSubmitKind, 'done'>;
  requestId?: string;
}

export type SubmissionStatus =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; payload: unknown; request?: SubmitRequest };

/** The app is showing: its save status, whether anything was submitted, and v2 attempts used. */
export interface OpenView {
  kind: 'open';
  save: SubmissionStatus;
  submitted: boolean;
  attemptsUsed: number;
}

/** Every attempt is used; the app is replaced by the Turned in screen for good. */
export interface TurnedInView {
  kind: 'turnedIn';
  attemptsUsed: number;
}

/** The teacher skipped this student; `behind` keeps tracking so a later un-skip restores it. */
export interface ExcludedView {
  kind: 'excluded';
  behind: OpenView | TurnedInView;
}

export type MiniAppView = OpenView | TurnedInView | ExcludedView;

export type MiniAppViewEvent =
  | { type: 'pointerLoaded'; excluded: boolean }
  | {
      type: 'existingFound';
      attemptCount?: number;
      attemptLimit: number | null;
    }
  | { type: 'saveStarted' }
  | { type: 'saveSucceeded'; at: number; attemptsUsed?: number }
  | { type: 'saveFailed'; payload: unknown; request?: SubmitRequest }
  | { type: 'saveCleared' }
  | { type: 'savedToastExpired' }
  | { type: 'attemptsExhausted' };

export const initialMiniAppView: OpenView = {
  kind: 'open',
  save: { kind: 'idle' },
  submitted: false,
  attemptsUsed: 0,
};

function stepActive(
  state: OpenView | TurnedInView,
  event: Exclude<MiniAppViewEvent, { type: 'pointerLoaded' }>
): OpenView | TurnedInView {
  if (state.kind === 'turnedIn') return state;
  switch (event.type) {
    case 'existingFound': {
      if (event.attemptCount === undefined) {
        return state.submitted ? state : { ...state, submitted: true };
      }
      const used = event.attemptCount;
      if (event.attemptLimit !== null && used >= event.attemptLimit) {
        return { kind: 'turnedIn', attemptsUsed: used };
      }
      return { ...state, submitted: true, attemptsUsed: used };
    }
    case 'saveStarted':
      return { ...state, save: { kind: 'submitting' } };
    case 'saveSucceeded':
      return {
        ...state,
        save: { kind: 'saved', at: event.at },
        submitted: true,
        attemptsUsed: event.attemptsUsed ?? state.attemptsUsed,
      };
    case 'saveFailed':
      return {
        ...state,
        save: { kind: 'error', payload: event.payload, request: event.request },
      };
    case 'saveCleared':
      return state.save.kind === 'idle'
        ? state
        : { ...state, save: { kind: 'idle' } };
    case 'savedToastExpired':
      return state.save.kind === 'saved'
        ? { ...state, save: { kind: 'idle' } }
        : state;
    case 'attemptsExhausted':
      return { kind: 'turnedIn', attemptsUsed: state.attemptsUsed };
  }
}

export function miniAppViewReducer(
  state: MiniAppView,
  event: MiniAppViewEvent
): MiniAppView {
  if (event.type === 'pointerLoaded') {
    if (state.kind === 'excluded') {
      return event.excluded ? state : state.behind;
    }
    return event.excluded ? { kind: 'excluded', behind: state } : state;
  }
  if (state.kind === 'excluded') {
    const behind = stepActive(state.behind, event);
    return behind === state.behind ? state : { kind: 'excluded', behind };
  }
  return stepActive(state, event);
}

export type SessionLoad =
  | { kind: 'loading' }
  | { kind: 'loaded'; session: MiniAppSession }
  | { kind: 'notFound' };

export type SessionLoadEvent =
  | { type: 'snapshot'; session: MiniAppSession | null }
  | { type: 'listenerError' };

/** Not found is final: a listener error ends the subscription, and a later doc never replaces it. */
export function sessionLoadReducer(
  state: SessionLoad,
  event: SessionLoadEvent
): SessionLoad {
  if (state.kind === 'notFound') return state;
  if (event.type === 'listenerError' || event.session === null) {
    return { kind: 'notFound' };
  }
  return { kind: 'loaded', session: event.session };
}
