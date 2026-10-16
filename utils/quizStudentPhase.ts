// Quiz student app state: the join flow and per-question step as reducers, and the screen as one union derived from stored fields.

import {
  isAnswerSubmitted,
  type QuizPublicQuestion,
  type QuizResponse,
  type QuizSession,
} from '@/types';
import { deriveQuizSessionPhase } from '@/utils/quizSessionPhase';
import {
  openedPartFor,
  partsDoneOf,
  periodOfResponse,
  sessionHasStops,
  totalParts,
} from '@/utils/quizParts';

// ─── Attempt ─────────────────────────────────────────────────────────────────

/** Whether this response is turned in; the one place the student app reads `status === 'completed'`. */
export function isAttemptSubmitted(
  response: Pick<QuizResponse, 'status'> | null | undefined
): boolean {
  return response?.status === 'completed';
}

/** Whether the student has begun this attempt (answered anything or moved past joined). */
export function isAttemptStarted(
  response: Pick<QuizResponse, 'status' | 'answers'> | null | undefined
): boolean {
  return (
    response?.status === 'in-progress' || (response?.answers?.length ?? 0) > 0
  );
}

/** Whether the student has used every attempt the session allows. */
export function isAtAttemptCap(
  session: Pick<QuizSession, 'attemptLimit'>,
  response: Pick<QuizResponse, 'completedAttempts'> | null | undefined
): boolean {
  const limit = session.attemptLimit ?? null;
  return limit !== null && (response?.completedAttempts ?? 0) >= limit;
}

// ─── Join flow ───────────────────────────────────────────────────────────────

/** Before join: 'pending' still looking up the session, 'gate' offers sign-in, 'blocked' refuses PINs. */
export type QuizJoinGate = 'pending' | 'gate' | 'pin' | 'blocked';

export type QuizJoinStep =
  | {
      kind: 'entry';
      /** Class periods to pick from, once the code is known to need one. */
      periods: string[] | null;
      selectedPeriod: string | null;
    }
  | { kind: 'joined' }
  | { kind: 'excluded' };

export interface QuizJoinFlow {
  gate: QuizJoinGate;
  step: QuizJoinStep;
  /** A signed-in auto-join that failed outside the session hook. */
  autoJoinError: string | null;
  /** Wins over every other error: a closed assignment with nothing to review. */
  terminalError: string | null;
}

export type QuizJoinFlowEvent =
  | { type: 'gateResolved'; gate: Exclude<QuizJoinGate, 'pending'> }
  | { type: 'usePin' }
  | { type: 'joinBlocked' }
  | { type: 'periodsNeeded'; periods: string[] }
  | { type: 'periodPicked'; period: string }
  | { type: 'periodBack' }
  | { type: 'lookupFailed' }
  | { type: 'joined' }
  | { type: 'excluded' }
  | { type: 'autoJoinFailed'; message: string }
  | { type: 'reviewUnavailable'; message: string };

export function initialQuizJoinFlow(opts: {
  previewing: boolean;
  lookupFirst: boolean;
}): QuizJoinFlow {
  return {
    gate: opts.lookupFirst ? 'pending' : 'pin',
    step: opts.previewing
      ? { kind: 'joined' }
      : {
          kind: 'entry',
          periods: null,
          selectedPeriod: null,
        },
    autoJoinError: null,
    terminalError: null,
  };
}

export function quizJoinFlowReducer(
  flow: QuizJoinFlow,
  event: QuizJoinFlowEvent
): QuizJoinFlow {
  // The gate lookup settles once, and errors stay put, whatever step the student is on.
  switch (event.type) {
    case 'gateResolved':
      return flow.gate === 'pending' ? { ...flow, gate: event.gate } : flow;
    case 'autoJoinFailed':
      return { ...flow, autoJoinError: event.message };
    case 'reviewUnavailable':
      return { ...flow, terminalError: event.message };
  }
  const { step } = flow;
  // Joined and excluded are final for this page.
  if (step.kind !== 'entry') return flow;
  const withStep = (next: QuizJoinStep): QuizJoinFlow => ({
    ...flow,
    step: next,
  });
  switch (event.type) {
    case 'usePin':
      return flow.gate === 'gate' ? { ...flow, gate: 'pin' } : flow;
    case 'joinBlocked':
      return { ...flow, gate: 'blocked' };
    case 'periodsNeeded':
      return withStep({ ...step, periods: event.periods });
    case 'periodPicked':
      return step.periods
        ? withStep({ ...step, selectedPeriod: event.period })
        : flow;
    case 'periodBack':
      return withStep({ ...step, periods: null, selectedPeriod: null });
    case 'lookupFailed':
      return withStep({ ...step, periods: null });
    case 'joined':
      return withStep({ kind: 'joined' });
    case 'excluded':
      return withStep({ kind: 'excluded' });
  }
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export type QuizStudentScreen =
  | { kind: 'listenerError' }
  | { kind: 'periodLocked'; started: boolean }
  | { kind: 'loadingQuestions' }
  | { kind: 'game'; response: QuizResponse }
  | { kind: 'paused' }
  | { kind: 'waiting' }
  | { kind: 'submitted'; response: QuizResponse; completed: boolean }
  | { kind: 'loadingResponse' }
  | {
      kind: 'heldAtStop';
      response: QuizResponse;
      nextPart: number;
      ready: boolean;
    }
  | { kind: 'reviewing'; response: QuizResponse; question: QuizPublicQuestion }
  | { kind: 'micCheck'; response: QuizResponse }
  | {
      kind: 'answering';
      response: QuizResponse;
      question: QuizPublicQuestion | undefined;
      alreadyAnswered: boolean;
    }
  | { kind: 'results' };

export interface QuizStudentScreenInput {
  session: QuizSession;
  response: QuizResponse | null;
  /** The session hook reported an error. */
  hasError: boolean;
  /** This student's class period isn't open right now. */
  periodLocked: boolean;
  /** Questions or this attempt's bank draw are still on their way. */
  questionsPending: boolean;
  /** The session records answers and this page hasn't passed the microphone check. */
  needsMicCheck: boolean;
}

/** The screen a joined student sees, from the session and their response. */
export function deriveQuizStudentScreen(
  input: QuizStudentScreenInput
): QuizStudentScreen {
  const { session, response } = input;
  const submitted = isAttemptSubmitted(response);

  // A response listener that failed after join would otherwise spin forever.
  if (input.hasError && !response) return { kind: 'listenerError' };
  if (input.periodLocked && !submitted) {
    return { kind: 'periodLocked', started: isAttemptStarted(response) };
  }
  if (input.questionsPending && session.status !== 'ended' && !submitted) {
    return { kind: 'loadingQuestions' };
  }
  if (session.sessionMode === 'game' && response) {
    return { kind: 'game', response };
  }

  const phase = deriveQuizSessionPhase(session);
  if (phase?.kind === 'paused') return { kind: 'paused' };
  if (phase?.kind === 'lobby') return { kind: 'waiting' };
  if (!phase || phase.kind === 'ended') return { kind: 'results' };

  // Active from here. A capped attempt never sees questions, even if its status was reset.
  if (response && (submitted || isAtAttemptCap(session, response))) {
    return { kind: 'submitted', response, completed: submitted };
  }
  // The attempt's shuffle seed comes from the response, so wait for it.
  if (!response) return { kind: 'loadingResponse' };

  const partsDone = partsDoneOf(response);
  if (
    sessionHasStops(session) &&
    response.partHeld === true &&
    partsDone > 0 &&
    partsDone < totalParts(session.sections)
  ) {
    const opened = openedPartFor(
      session.partsOpen,
      periodOfResponse(session, response),
      response._responseKey
    );
    return {
      kind: 'heldAtStop',
      response,
      nextPart: partsDone + 1,
      ready: opened > partsDone,
    };
  }

  const question =
    session.currentQuestionIndex >= 0
      ? (session.publicQuestions ?? [])[session.currentQuestionIndex]
      : undefined;
  if (session.questionPhase === 'reviewing' && question) {
    return { kind: 'reviewing', response, question };
  }
  if (input.needsMicCheck) return { kind: 'micCheck', response };
  return {
    kind: 'answering',
    response,
    question,
    // Drafts don't count: only an explicit submit marks a question answered.
    alreadyAnswered: question
      ? response.answers.some(
          (a) => a.questionId === question.id && isAnswerSubmitted(a)
        )
      : false,
  };
}

// ─── Question step ───────────────────────────────────────────────────────────

/** One question's answer state: its countdown and whether it has been sent. */
export interface QuestionStepState {
  questionId: string | undefined;
  /** The `alreadyAnswered` value last applied, so a later flip can be noticed. */
  alreadyAnswered: boolean;
  submitted: boolean;
  /** Seconds left, or null when the question has no timer. */
  timeLeft: number | null;
  /** The question whose timeout already sent its answer. */
  timedOutFor: string | null;
}

export type QuestionStepEvent =
  /** A different question is showing; resets every per-question field. */
  | {
      type: 'question';
      questionId: string | undefined;
      alreadyAnswered: boolean;
      timeLimit: number;
    }
  /** The listener changed whether this question counts as answered; ignored mid-submit. */
  | { type: 'answeredChanged'; alreadyAnswered: boolean; inFlight: boolean }
  | { type: 'tick' }
  /** The countdown ran out on this question (see `questionTimedOut`); sends its answer once. */
  | { type: 'timeout'; questionId: string }
  | { type: 'submit' }
  | { type: 'submitFailed' };

export function initialQuestionStep(
  questionId: string | undefined,
  alreadyAnswered: boolean,
  timeLimit: number
): QuestionStepState {
  return {
    questionId,
    alreadyAnswered,
    submitted: alreadyAnswered,
    timeLeft: timeLimit > 0 && !alreadyAnswered ? timeLimit : null,
    timedOutFor: null,
  };
}

/**
 * Whether the countdown has run out on an unsent question, judged on the values this render sees.
 * The answer still goes out when a listener flip in the same render marks it answered.
 */
export function questionTimedOut(
  state: QuestionStepState,
  questionId: string | undefined,
  submitting: boolean
): questionId is string {
  return (
    state.timeLeft !== null &&
    state.timeLeft <= 0 &&
    !state.submitted &&
    !submitting &&
    questionId !== undefined &&
    state.timedOutFor !== questionId
  );
}

export function questionStepReducer(
  state: QuestionStepState,
  event: QuestionStepEvent
): QuestionStepState {
  switch (event.type) {
    case 'question':
      return event.questionId === state.questionId
        ? state
        : initialQuestionStep(
            event.questionId,
            event.alreadyAnswered,
            event.timeLimit
          );
    case 'answeredChanged':
      if (event.alreadyAnswered === state.alreadyAnswered || event.inFlight) {
        return state;
      }
      return {
        ...state,
        alreadyAnswered: event.alreadyAnswered,
        submitted: event.alreadyAnswered,
      };
    case 'tick':
      return state.timeLeft === null
        ? state
        : { ...state, timeLeft: state.timeLeft - 1 };
    case 'timeout':
      return state.timedOutFor === event.questionId
        ? state
        : { ...state, timedOutFor: event.questionId, submitted: true };
    case 'submit':
      return state.submitted ? state : { ...state, submitted: true };
    case 'submitFailed':
      return state.submitted ? { ...state, submitted: false } : state;
  }
}
