// Guided Learning student view state: one union in place of the old started/completed/submitting/submitFailed/reachedEnd/endCardOpen booleans.

import type { GuidedLearningResponse } from '@/types';

export type SubmitStatus = 'idle' | 'submitting' | 'failed';

/** In the player: the submit's status and the v2 end card. */
export interface PlayingFlow {
  kind: 'playing';
  submit: SubmitStatus;
  reachedEnd: boolean;
  endCardOpen: boolean;
  /** Bumped by Replay so the player remounts fresh. */
  replayKey: number;
}

export type GLFlow =
  | { kind: 'notStarted' }
  | PlayingFlow
  | { kind: 'completed'; replayKey: number };

export type GLFlowEvent =
  | { type: 'started' }
  | { type: 'reachedEnd' }
  | { type: 'endCardDismissed' }
  | { type: 'submitStarted' }
  | { type: 'submitSucceeded' }
  | { type: 'submitFailed' }
  /** The server refused the write because the period is shut; the pause overlay takes over. */
  | { type: 'submitRefused' }
  /** A view-only share finishes without saving anything. */
  | { type: 'finishedWithoutSaving' }
  | { type: 'replay' };

export const initialGLFlow: GLFlow = { kind: 'notStarted' };

const playing = (replayKey: number): PlayingFlow => ({
  kind: 'playing',
  submit: 'idle',
  reachedEnd: false,
  endCardOpen: false,
  replayKey,
});

/** The next flow, or `state` itself when the event isn't allowed from it. */
export function glFlowReducer(state: GLFlow, event: GLFlowEvent): GLFlow {
  switch (state.kind) {
    case 'notStarted':
      return event.type === 'started' ? playing(0) : state;
    case 'completed':
      return event.type === 'replay' ? playing(state.replayKey + 1) : state;
    case 'playing':
      switch (event.type) {
        case 'reachedEnd':
          return state.reachedEnd && state.endCardOpen
            ? state
            : { ...state, reachedEnd: true, endCardOpen: true };
        case 'endCardDismissed':
          return state.endCardOpen ? { ...state, endCardOpen: false } : state;
        case 'submitStarted':
          return state.submit === 'submitting'
            ? state
            : { ...state, submit: 'submitting' };
        case 'submitSucceeded':
          return state.submit === 'submitting'
            ? { kind: 'completed', replayKey: state.replayKey }
            : state;
        case 'submitFailed':
          return state.submit === 'submitting'
            ? { ...state, submit: 'failed' }
            : state;
        case 'submitRefused':
          return state.submit === 'submitting'
            ? { ...state, submit: 'idle' }
            : state;
        case 'finishedWithoutSaving':
          return state.submit === 'submitting'
            ? state
            : { kind: 'completed', replayKey: state.replayKey };
        case 'started':
        case 'replay':
          return state;
      }
  }
}

/** This student's response doc as the listener has reported it; `failed` keeps the last snapshot. */
export type ResponseLoad =
  | { kind: 'off' }
  | { kind: 'loading'; failed: boolean }
  | {
      kind: 'loaded';
      response: GuidedLearningResponse | null;
      failed: boolean;
    };

export type ResponseLoadEvent =
  | { type: 'subscribed'; on: boolean }
  | { type: 'snapshot'; response: GuidedLearningResponse | null }
  | { type: 'listenerError' };

export const initialResponseLoad = (on: boolean): ResponseLoad =>
  on ? { kind: 'loading', failed: false } : { kind: 'off' };

export function responseLoadReducer(
  state: ResponseLoad,
  event: ResponseLoadEvent
): ResponseLoad {
  switch (event.type) {
    case 'subscribed':
      if ((state.kind !== 'off') === event.on) return state;
      return initialResponseLoad(event.on);
    case 'snapshot':
      return state.kind === 'off'
        ? state
        : { kind: 'loaded', response: event.response, failed: false };
    case 'listenerError':
      if (state.kind === 'off' || state.failed) return state;
      return { ...state, failed: true };
  }
}

export const loadedResponse = (
  load: ResponseLoad
): GuidedLearningResponse | null =>
  load.kind === 'loaded' ? load.response : null;

export type GLStudentScreen =
  | { kind: 'loading' }
  | { kind: 'loadError'; message: string }
  | { kind: 'notFound' }
  | { kind: 'excluded' }
  | { kind: 'statusFailed' }
  | { kind: 'awaitingResponse' }
  | { kind: 'returningSubmitted'; response: GuidedLearningResponse }
  | { kind: 'completed' }
  | { kind: 'closed' }
  | { kind: 'needsSignIn' }
  | { kind: 'start' }
  | { kind: 'periodLocked' }
  | { kind: 'enteringPeriod' }
  | { kind: 'playing'; flow: PlayingFlow };

export interface GLStudentScreenInput {
  sessionLoading: boolean;
  sessionError: string | null;
  hasSession: boolean;
  excluded: boolean;
  flow: GLFlow;
  response: ResponseLoad;
  isClosed: boolean;
  perPeriod: boolean;
  assessmentMode: boolean;
  isStudentRole: boolean;
  entered: boolean;
  canEnter: boolean;
}

/** The one screen the student sees, picked in priority order from the session, their response and the local flow. */
export function deriveGLStudentScreen(
  input: GLStudentScreenInput
): GLStudentScreen {
  const { flow, response } = input;
  if (input.sessionLoading) return { kind: 'loading' };
  if (input.sessionError)
    return { kind: 'loadError', message: input.sessionError };
  if (!input.hasSession) return { kind: 'notFound' };
  // Teacher skipped this student for this assignment.
  if (input.excluded) return { kind: 'excluded' };

  if (flow.kind !== 'completed' && response.kind !== 'off') {
    const saved = loadedResponse(response);
    // A failed read must not look like "nothing submitted", or a returning student would resubmit.
    if (response.failed && !saved) return { kind: 'statusFailed' };
    // Until the first snapshot lands, a save could not tell a create from an update.
    if (response.kind === 'loading') return { kind: 'awaitingResponse' };
    if (saved && typeof saved.completedAt === 'number') {
      return { kind: 'returningSubmitted', response: saved };
    }
  }

  if (flow.kind === 'completed') return { kind: 'completed' };

  // A submit already in flight lands inside the rules' grace window.
  const submitting = flow.kind === 'playing' && flow.submit === 'submitting';
  if (input.isClosed && !submitting) return { kind: 'closed' };

  // Assessment mode refuses a join without a school sign-in, whose self-picked period no rule can check.
  if (input.perPeriod && input.assessmentMode && !input.isStudentRole) {
    return { kind: 'needsSignIn' };
  }

  if (flow.kind === 'notStarted') return { kind: 'start' };

  if (input.perPeriod && !input.entered) {
    return input.canEnter
      ? { kind: 'enteringPeriod' }
      : { kind: 'periodLocked' };
  }

  return { kind: 'playing', flow };
}
