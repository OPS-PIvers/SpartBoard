import { describe, expect, it } from 'vitest';
import type { QuizResponse, QuizSession } from '@/types';
import {
  deriveQuizStudentScreen,
  initialQuestionStep,
  initialQuizJoinFlow,
  isAtAttemptCap,
  isAttemptStarted,
  isAttemptSubmitted,
  questionStepReducer,
  questionTimedOut,
  quizJoinFlowReducer,
  type QuestionStepEvent,
  type QuestionStepState,
  type QuizJoinFlow,
  type QuizJoinFlowEvent,
  type QuizStudentScreenInput,
} from '@/utils/quizStudentPhase';

const Q1 = { id: 'q1', type: 'MC', text: 'One', timeLimit: 0 };
const Q2 = { id: 'q2', type: 'MC', text: 'Two', timeLimit: 0 };

function session(overrides: Partial<QuizSession> = {}): QuizSession {
  return {
    id: 's1',
    status: 'active',
    sessionMode: 'teacher',
    currentQuestionIndex: 0,
    totalQuestions: 2,
    startedAt: 1000,
    questionPhase: 'answering',
    publicQuestions: [Q1, Q2],
    ...overrides,
  } as unknown as QuizSession;
}

function response(overrides: Partial<QuizResponse> = {}): QuizResponse {
  return {
    studentUid: 'u1',
    status: 'in-progress',
    answers: [],
    _responseKey: 'u1',
    ...overrides,
  } as unknown as QuizResponse;
}

function input(
  overrides: Partial<QuizStudentScreenInput> = {}
): QuizStudentScreenInput {
  return {
    session: session(),
    response: response(),
    hasError: false,
    periodLocked: false,
    questionsPending: false,
    needsMicCheck: false,
    ...overrides,
  };
}

const kindOf = (overrides: Partial<QuizStudentScreenInput>) =>
  deriveQuizStudentScreen(input(overrides)).kind;

describe('attempt helpers', () => {
  it('reads submitted only from a completed status', () => {
    expect(isAttemptSubmitted(response({ status: 'completed' }))).toBe(true);
    expect(isAttemptSubmitted(response({ status: 'in-progress' }))).toBe(false);
    expect(isAttemptSubmitted(response({ status: 'joined' }))).toBe(false);
    expect(isAttemptSubmitted(null)).toBe(false);
    expect(isAttemptSubmitted(undefined)).toBe(false);
  });

  it('counts an attempt as started once in progress or anything is answered', () => {
    expect(isAttemptStarted(response({ status: 'joined' }))).toBe(false);
    expect(isAttemptStarted(response({ status: 'in-progress' }))).toBe(true);
    expect(
      isAttemptStarted(
        response({
          status: 'joined',
          answers: [{ questionId: 'q1', answer: 'a' }],
        } as Partial<QuizResponse>)
      )
    ).toBe(true);
    expect(isAttemptStarted(null)).toBe(false);
  });

  it('caps only when a limit is set and reached', () => {
    expect(isAtAttemptCap(session(), response())).toBe(false);
    expect(
      isAtAttemptCap(
        session({ attemptLimit: 2 }),
        response({ completedAttempts: 1 })
      )
    ).toBe(false);
    expect(
      isAtAttemptCap(
        session({ attemptLimit: 2 }),
        response({ completedAttempts: 2 })
      )
    ).toBe(true);
    expect(isAtAttemptCap(session({ attemptLimit: 1 }), null)).toBe(false);
  });
});

describe('quizJoinFlowReducer', () => {
  const pending = initialQuizJoinFlow({
    previewing: false,
    lookupFirst: true,
  });
  const pin = initialQuizJoinFlow({ previewing: false, lookupFirst: false });
  const run = (flow: QuizJoinFlow, ...events: QuizJoinFlowEvent[]) =>
    events.reduce(quizJoinFlowReducer, flow);

  it('starts joined for a preview and pending when a URL code needs a lookup', () => {
    expect(
      initialQuizJoinFlow({ previewing: true, lookupFirst: true }).step.kind
    ).toBe('joined');
    expect(pending.gate).toBe('pending');
    expect(pin.gate).toBe('pin');
    expect(pin).toEqual({
      gate: 'pin',
      step: { kind: 'entry', periods: null, selectedPeriod: null },
      autoJoinError: null,
      terminalError: null,
    });
  });

  it('resolves the gate once, from pending only', () => {
    const gate = run(pending, { type: 'gateResolved', gate: 'gate' });
    expect(gate.gate).toBe('gate');
    expect(
      quizJoinFlowReducer(gate, { type: 'gateResolved', gate: 'blocked' })
    ).toBe(gate);
    expect(
      quizJoinFlowReducer(pin, { type: 'gateResolved', gate: 'gate' })
    ).toBe(pin);
  });

  it('settles a pending gate even after a preview has joined', () => {
    const preview = initialQuizJoinFlow({
      previewing: true,
      lookupFirst: true,
    });
    expect(
      quizJoinFlowReducer(preview, { type: 'gateResolved', gate: 'pin' }).gate
    ).toBe('pin');
  });

  it('takes the PIN escape only from the sign-in gate', () => {
    const gate = run(pending, { type: 'gateResolved', gate: 'gate' });
    expect(quizJoinFlowReducer(gate, { type: 'usePin' }).gate).toBe('pin');
    expect(quizJoinFlowReducer(pin, { type: 'usePin' })).toBe(pin);
    expect(quizJoinFlowReducer(pending, { type: 'usePin' })).toBe(pending);
  });

  it('walks the PIN path: periods, pick, back, pick again, join', () => {
    const asked = run(pin, { type: 'periodsNeeded', periods: ['P1', 'P2'] });
    expect(asked.step).toMatchObject({ kind: 'entry', periods: ['P1', 'P2'] });
    const picked = run(asked, { type: 'periodPicked', period: 'P2' });
    expect(picked.step).toMatchObject({ selectedPeriod: 'P2' });
    const back = run(picked, { type: 'periodBack' });
    expect(back.step).toMatchObject({ periods: null, selectedPeriod: null });
    const joined = run(
      back,
      { type: 'periodsNeeded', periods: ['P1'] },
      { type: 'periodPicked', period: 'P1' },
      { type: 'joined' }
    );
    expect(joined.step.kind).toBe('joined');
  });

  it('ignores a period pick with no picker showing', () => {
    expect(
      quizJoinFlowReducer(pin, { type: 'periodPicked', period: 'P1' })
    ).toBe(pin);
  });

  it('drops the picker but keeps the pick when a later lookup fails', () => {
    const flow = run(
      pin,
      { type: 'periodsNeeded', periods: ['P1'] },
      { type: 'periodPicked', period: 'P1' },
      { type: 'lookupFailed' }
    );
    expect(flow.step).toMatchObject({ periods: null, selectedPeriod: 'P1' });
  });

  it('blocks PIN joins when the session refuses them', () => {
    expect(run(pin, { type: 'joinBlocked' }).gate).toBe('blocked');
  });

  it('records auto-join and review errors without joining', () => {
    const failed = run(pin, { type: 'autoJoinFailed', message: 'offline' });
    expect(failed).toMatchObject({
      step: { kind: 'entry' },
      autoJoinError: 'offline',
    });
    const closed = run(failed, {
      type: 'reviewUnavailable',
      message: 'This quiz session has already ended.',
    });
    expect(closed).toMatchObject({
      autoJoinError: 'offline',
      terminalError: 'This quiz session has already ended.',
    });
  });

  it('keeps an auto-join error after a later join', () => {
    const flow = run(
      pin,
      { type: 'autoJoinFailed', message: 'offline' },
      { type: 'joined' }
    );
    expect(flow).toMatchObject({
      step: { kind: 'joined' },
      autoJoinError: 'offline',
    });
  });

  it('reconnecting after end joins in review when there is a submission', () => {
    // SessionEndedError, then subscribeForReview succeeds.
    expect(run(pin, { type: 'joined' }).step.kind).toBe('joined');
  });

  it('marks an excluded student and ignores everything after', () => {
    const excluded = run(pin, { type: 'excluded' });
    expect(excluded.step.kind).toBe('excluded');
    expect(quizJoinFlowReducer(excluded, { type: 'joined' })).toBe(excluded);
  });

  it('leaves a joined flow unchanged for every entry event', () => {
    const joined = run(pin, { type: 'joined' });
    const events: QuizJoinFlowEvent[] = [
      { type: 'usePin' },
      { type: 'joinBlocked' },
      { type: 'periodsNeeded', periods: ['P1'] },
      { type: 'periodPicked', period: 'P1' },
      { type: 'periodBack' },
      { type: 'lookupFailed' },
      { type: 'joined' },
      { type: 'excluded' },
    ];
    for (const event of events) {
      expect(quizJoinFlowReducer(joined, event)).toBe(joined);
    }
  });
});

describe('deriveQuizStudentScreen', () => {
  it('shows a listener error only when no response arrived', () => {
    expect(kindOf({ hasError: true, response: null })).toBe('listenerError');
    expect(kindOf({ hasError: true })).toBe('answering');
  });

  it('locks a closed period before the attempt starts and pauses it after', () => {
    expect(
      deriveQuizStudentScreen(
        input({ periodLocked: true, response: response({ status: 'joined' }) })
      )
    ).toEqual({ kind: 'periodLocked', started: false });
    expect(
      deriveQuizStudentScreen(input({ periodLocked: true, response: null }))
    ).toEqual({ kind: 'periodLocked', started: false });
    expect(deriveQuizStudentScreen(input({ periodLocked: true }))).toEqual({
      kind: 'periodLocked',
      started: true,
    });
  });

  it('lets a submitted student past a closed period', () => {
    expect(
      kindOf({
        periodLocked: true,
        response: response({ status: 'completed' }),
      })
    ).toBe('submitted');
  });

  it('waits for questions unless the session ended or the attempt is in', () => {
    expect(kindOf({ questionsPending: true })).toBe('loadingQuestions');
    expect(
      kindOf({ questionsPending: true, session: session({ status: 'ended' }) })
    ).toBe('results');
    expect(
      kindOf({
        questionsPending: true,
        response: response({ status: 'completed' }),
      })
    ).toBe('submitted');
  });

  it('sends a game session with a response to the game, whatever its status', () => {
    for (const status of ['active', 'paused', 'ended'] as const) {
      expect(
        kindOf({ session: session({ sessionMode: 'game', status }) })
      ).toBe('game');
    }
    expect(
      kindOf({ session: session({ sessionMode: 'game' }), response: null })
    ).toBe('loadingResponse');
  });

  it('maps paused, waiting and ended sessions to their screens', () => {
    expect(kindOf({ session: session({ status: 'paused' }) })).toBe('paused');
    expect(
      kindOf({
        session: session({
          status: 'paused',
          startedAt: null,
          currentQuestionIndex: -1,
        }),
      })
    ).toBe('paused');
    expect(
      kindOf({
        session: session({ status: 'waiting', currentQuestionIndex: -1 }),
      })
    ).toBe('waiting');
    expect(kindOf({ session: session({ status: 'ended' }) })).toBe('results');
  });

  it('treats a status Quiz never writes as ended', () => {
    expect(
      kindOf({
        session: session({ status: 'archived' as QuizSession['status'] }),
      })
    ).toBe('results');
  });

  it('shows the submitted screen for a completed or capped attempt', () => {
    expect(
      deriveQuizStudentScreen(
        input({ response: response({ status: 'completed' }) })
      )
    ).toMatchObject({ kind: 'submitted', completed: true });
    // A capped response whose status was reset never sees questions again.
    expect(
      deriveQuizStudentScreen(
        input({
          session: session({ attemptLimit: 1 }),
          response: response({ status: 'joined', completedAttempts: 1 }),
        })
      )
    ).toMatchObject({ kind: 'submitted', completed: false });
  });

  it('waits for the response doc on an active session', () => {
    expect(kindOf({ response: null })).toBe('loadingResponse');
  });

  it('holds a student at a Stop until the next part opens', () => {
    const sections = [
      { id: 'a', questionIds: ['q1'], stopAfter: true },
      { id: 'b', questionIds: ['q2'] },
    ];
    const held = response({ partHeld: true, partsDone: 1 });
    const selfPaced = session({
      sessionMode: 'student',
      sections,
    } as Partial<QuizSession>);
    expect(
      deriveQuizStudentScreen(input({ session: selfPaced, response: held }))
    ).toMatchObject({ kind: 'heldAtStop', nextPart: 2, ready: false });
    expect(
      deriveQuizStudentScreen(
        input({
          session: { ...selfPaced, partsOpen: { all: 2 } },
          response: held,
        })
      )
    ).toMatchObject({ kind: 'heldAtStop', ready: true });
    // Teacher-paced sessions have no Stops.
    expect(
      kindOf({
        session: session({ sections } as Partial<QuizSession>),
        response: held,
      })
    ).toBe('answering');
  });

  it('shows the review phase only with a current question', () => {
    expect(kindOf({ session: session({ questionPhase: 'reviewing' }) })).toBe(
      'reviewing'
    );
    expect(
      kindOf({
        session: session({
          questionPhase: 'reviewing',
          currentQuestionIndex: 5,
        }),
      })
    ).toBe('answering');
  });

  it('asks for the microphone before questions', () => {
    expect(kindOf({ needsMicCheck: true })).toBe('micCheck');
  });

  it('marks a question answered only by a submitted answer, not a draft', () => {
    const draft = response({
      answers: [{ questionId: 'q1', answer: 'a', status: 'draft' }],
    } as Partial<QuizResponse>);
    const sent = response({
      answers: [{ questionId: 'q1', answer: 'a', status: 'submitted' }],
    } as Partial<QuizResponse>);
    expect(deriveQuizStudentScreen(input({ response: draft }))).toMatchObject({
      kind: 'answering',
      alreadyAnswered: false,
    });
    expect(deriveQuizStudentScreen(input({ response: sent }))).toMatchObject({
      kind: 'answering',
      alreadyAnswered: true,
      question: Q1,
    });
    expect(
      deriveQuizStudentScreen(
        input({ session: session({ currentQuestionIndex: -1 }) })
      )
    ).toMatchObject({ kind: 'answering', question: undefined });
  });

  describe('teacher and student disagree', () => {
    it('teacher ends while the student is mid-submit: results, answers kept', () => {
      const ended = session({ status: 'ended', currentQuestionIndex: 2 });
      expect(
        kindOf({
          session: ended,
          response: response({ status: 'in-progress' }),
        })
      ).toBe('results');
      expect(
        kindOf({ session: ended, response: response({ status: 'completed' }) })
      ).toBe('results');
    });

    it('student reconnects after the session ended: results, even with no response', () => {
      expect(
        kindOf({ session: session({ status: 'ended' }), response: null })
      ).toBe('results');
    });

    it('teacher pauses while the student is answering: paused screen', () => {
      expect(
        kindOf({
          session: session({ status: 'paused', pausedAt: 5 }),
          needsMicCheck: true,
        })
      ).toBe('paused');
    });

    it('teacher pauses after the student submitted: still paused, not results', () => {
      expect(
        kindOf({
          session: session({ status: 'paused' }),
          response: response({ status: 'completed' }),
        })
      ).toBe('paused');
    });

    it('period closes mid-attempt: paused with answers kept', () => {
      expect(
        deriveQuizStudentScreen(input({ periodLocked: true }))
      ).toMatchObject({ kind: 'periodLocked', started: true });
    });
  });
});

describe('questionStepReducer', () => {
  const run = (state: QuestionStepState, ...events: QuestionStepEvent[]) =>
    events.reduce(questionStepReducer, state);
  const timed = initialQuestionStep('q1', false, 3);

  it('starts the countdown only for an unanswered timed question', () => {
    expect(timed).toEqual({
      questionId: 'q1',
      alreadyAnswered: false,
      submitted: false,
      timeLeft: 3,
      timedOutFor: null,
    });
    expect(initialQuestionStep('q1', true, 3)).toMatchObject({
      submitted: true,
      timeLeft: null,
    });
    expect(initialQuestionStep('q1', false, 0).timeLeft).toBeNull();
  });

  it('counts down and times out once', () => {
    const zero = run(
      timed,
      { type: 'tick' },
      { type: 'tick' },
      { type: 'tick' }
    );
    expect(zero.timeLeft).toBe(0);
    expect(questionTimedOut(zero, 'q1', false)).toBe(true);
    const out = run(zero, { type: 'timeout', questionId: 'q1' });
    expect(out).toMatchObject({ submitted: true, timedOutFor: 'q1' });
    expect(questionTimedOut(out, 'q1', false)).toBe(false);
    expect(
      questionStepReducer(out, { type: 'timeout', questionId: 'q1' })
    ).toBe(out);
  });

  it('does not time out before zero, without a timer, after submit, mid-submit or with no question', () => {
    expect(questionTimedOut(timed, 'q1', false)).toBe(false);
    expect(
      questionTimedOut(initialQuestionStep('q1', false, 0), 'q1', false)
    ).toBe(false);
    const zero = { ...timed, timeLeft: 0 };
    expect(questionTimedOut(run(zero, { type: 'submit' }), 'q1', false)).toBe(
      false
    );
    expect(questionTimedOut(zero, 'q1', true)).toBe(false);
    expect(questionTimedOut(zero, undefined, false)).toBe(false);
    // Two ticks can land before a render; below zero still counts as out.
    expect(questionTimedOut({ ...timed, timeLeft: -1 }, 'q1', false)).toBe(
      true
    );
  });

  it('still sends the timed-out answer when a listener flip marks it answered in the same render', () => {
    const zero = { ...timed, timeLeft: 0 };
    // The render sees the clock out, then queues the flip before the timeout.
    expect(questionTimedOut(zero, 'q1', false)).toBe(true);
    const out = run(
      zero,
      { type: 'answeredChanged', alreadyAnswered: true, inFlight: false },
      { type: 'timeout', questionId: 'q1' }
    );
    expect(out).toMatchObject({ submitted: true, timedOutFor: 'q1' });
  });

  it('lets a failed timeout write be retried by hand without timing out again', () => {
    const out = run(
      { ...timed, timeLeft: 0 },
      { type: 'timeout', questionId: 'q1' },
      { type: 'submitFailed' }
    );
    expect(out).toMatchObject({ submitted: false, timedOutFor: 'q1' });
    expect(questionTimedOut(out, 'q1', false)).toBe(false);
  });

  it('resets everything when the teacher moves on mid-countdown or after a timeout', () => {
    const out = run(
      { ...timed, timeLeft: 0 },
      { type: 'timeout', questionId: 'q1' }
    );
    const next = run(out, {
      type: 'question',
      questionId: 'q2',
      alreadyAnswered: false,
      timeLimit: 10,
    });
    expect(next).toEqual(initialQuestionStep('q2', false, 10));
  });

  it('keeps state when the same question is announced again', () => {
    const ticked = run(timed, { type: 'tick' });
    expect(
      questionStepReducer(ticked, {
        type: 'question',
        questionId: 'q1',
        alreadyAnswered: false,
        timeLimit: 3,
      })
    ).toBe(ticked);
  });

  it('follows the listener on answered flips, except mid-submit', () => {
    const flipped = run(timed, {
      type: 'answeredChanged',
      alreadyAnswered: true,
      inFlight: false,
    });
    expect(flipped).toMatchObject({ alreadyAnswered: true, submitted: true });
    expect(
      questionStepReducer(timed, {
        type: 'answeredChanged',
        alreadyAnswered: true,
        inFlight: true,
      })
    ).toBe(timed);
    expect(
      questionStepReducer(timed, {
        type: 'answeredChanged',
        alreadyAnswered: false,
        inFlight: false,
      })
    ).toBe(timed);
  });

  it('does not tick a question without a timer', () => {
    const untimed = initialQuestionStep('q1', false, 0);
    expect(questionStepReducer(untimed, { type: 'tick' })).toBe(untimed);
  });

  it('treats submit and submitFailed as idempotent', () => {
    const sent = run(timed, { type: 'submit' });
    expect(questionStepReducer(sent, { type: 'submit' })).toBe(sent);
    expect(questionStepReducer(timed, { type: 'submitFailed' })).toBe(timed);
  });
});
