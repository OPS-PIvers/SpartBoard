import { describe, expect, it } from 'vitest';
import {
  deriveGLStudentScreen,
  glFlowReducer,
  initialGLFlow,
  initialResponseLoad,
  responseLoadReducer,
  type GLFlow,
  type GLFlowEvent,
  type GLStudentScreenInput,
  type PlayingFlow,
  type ResponseLoad,
  type ResponseLoadEvent,
} from '@/components/guidedLearning/glStudentViewState';
import type { GuidedLearningResponse } from '@/types';

const playing = (
  over: Partial<Omit<PlayingFlow, 'kind'>> = {}
): PlayingFlow => ({
  kind: 'playing',
  submit: 'idle',
  reachedEnd: false,
  endCardOpen: false,
  replayKey: 0,
  ...over,
});

const run = (state: GLFlow, ...events: GLFlowEvent[]) =>
  events.reduce(glFlowReducer, state);

const ALL_FLOW_EVENTS: GLFlowEvent[] = [
  { type: 'started' },
  { type: 'reachedEnd' },
  { type: 'endCardDismissed' },
  { type: 'submitStarted' },
  { type: 'submitSucceeded' },
  { type: 'submitFailed' },
  { type: 'submitRefused' },
  { type: 'finishedWithoutSaving' },
  { type: 'replay' },
];

const ALLOWED: Record<string, GLFlowEvent['type'][]> = {
  notStarted: ['started'],
  playingIdle: [
    'reachedEnd',
    'endCardDismissed',
    'submitStarted',
    'finishedWithoutSaving',
  ],
  playingSubmitting: [
    'reachedEnd',
    'endCardDismissed',
    'submitSucceeded',
    'submitFailed',
    'submitRefused',
  ],
  playingFailed: [
    'reachedEnd',
    'endCardDismissed',
    'submitStarted',
    'finishedWithoutSaving',
  ],
  completed: ['replay'],
};

const STATES: Record<keyof typeof ALLOWED, GLFlow> = {
  notStarted: initialGLFlow,
  playingIdle: playing(),
  playingSubmitting: playing({ submit: 'submitting' }),
  playingFailed: playing({ submit: 'failed' }),
  completed: { kind: 'completed', replayKey: 0 },
};

describe('glFlowReducer: allowed transitions', () => {
  it('starts not started', () => {
    expect(initialGLFlow).toEqual({ kind: 'notStarted' });
  });

  it('Start → playing, fresh', () => {
    expect(run(initialGLFlow, { type: 'started' })).toEqual(playing());
  });

  it('reaching the end opens the end card; Go back closes it but remembers the end', () => {
    const atEnd = run(playing(), { type: 'reachedEnd' });
    expect(atEnd).toEqual(playing({ reachedEnd: true, endCardOpen: true }));
    expect(run(atEnd, { type: 'endCardDismissed' })).toEqual(
      playing({ reachedEnd: true, endCardOpen: false })
    );
  });

  it('reaching the end again reopens the end card', () => {
    expect(run(playing({ reachedEnd: true }), { type: 'reachedEnd' })).toEqual(
      playing({ reachedEnd: true, endCardOpen: true })
    );
  });

  it('Done → submitting → completed', () => {
    expect(
      run(playing(), { type: 'submitStarted' }, { type: 'submitSucceeded' })
    ).toEqual({ kind: 'completed', replayKey: 0 });
  });

  it('a failed submit stays in the player with Retry, and Retry can still finish', () => {
    const failed = run(
      playing(),
      { type: 'submitStarted' },
      { type: 'submitFailed' }
    );
    expect(failed).toEqual(playing({ submit: 'failed' }));
    expect(run(failed, { type: 'submitStarted' })).toEqual(
      playing({ submit: 'submitting' })
    );
    expect(
      run(failed, { type: 'submitStarted' }, { type: 'submitSucceeded' })
    ).toEqual({ kind: 'completed', replayKey: 0 });
  });

  it('a refused submit (period shut) returns to idle, not failed', () => {
    expect(
      run(playing(), { type: 'submitStarted' }, { type: 'submitRefused' })
    ).toEqual(playing());
  });

  it('a view-only share finishes without saving', () => {
    expect(run(playing(), { type: 'finishedWithoutSaving' })).toEqual({
      kind: 'completed',
      replayKey: 0,
    });
  });

  it('Replay → a fresh player with a new key', () => {
    const after = run(
      playing({ reachedEnd: true, endCardOpen: true }),
      { type: 'finishedWithoutSaving' },
      { type: 'replay' }
    );
    expect(after).toEqual(playing({ replayKey: 1 }));
    expect(
      run(after, { type: 'finishedWithoutSaving' }, { type: 'replay' })
    ).toEqual(playing({ replayKey: 2 }));
  });

  it('keeps the end card state while a submit runs', () => {
    const s = playing({ reachedEnd: true, endCardOpen: true });
    expect(run(s, { type: 'submitStarted' })).toEqual({
      ...s,
      submit: 'submitting',
    });
  });
});

describe('glFlowReducer: disallowed events leave state unchanged', () => {
  for (const [name, state] of Object.entries(STATES)) {
    const allowed = ALLOWED[name];
    for (const event of ALL_FLOW_EVENTS) {
      if (allowed.includes(event.type)) continue;
      it(`${name} ignores ${event.type}`, () => {
        expect(glFlowReducer(state, event)).toBe(state);
      });
    }
  }

  it('ignores a second Done while one is in flight', () => {
    const s = playing({ submit: 'submitting' });
    expect(glFlowReducer(s, { type: 'submitStarted' })).toBe(s);
  });

  it('cannot finish a view-only run mid-submit', () => {
    const s = playing({ submit: 'submitting' });
    expect(glFlowReducer(s, { type: 'finishedWithoutSaving' })).toBe(s);
  });

  it('returns the same object for a no-op end-card event', () => {
    const open = playing({ reachedEnd: true, endCardOpen: true });
    expect(glFlowReducer(open, { type: 'reachedEnd' })).toBe(open);
    const closed = playing();
    expect(glFlowReducer(closed, { type: 'endCardDismissed' })).toBe(closed);
  });
});

const resp = (
  over: Partial<GuidedLearningResponse> = {}
): GuidedLearningResponse => ({
  sessionId: 's1',
  studentAnonymousId: 'u1',
  answers: [],
  startedAt: 1,
  completedAt: null,
  score: null,
  ...over,
});

const runLoad = (state: ResponseLoad, ...events: ResponseLoadEvent[]) =>
  events.reduce(responseLoadReducer, state);

describe('responseLoadReducer', () => {
  it('starts loading when subscribed, off when not', () => {
    expect(initialResponseLoad(true)).toEqual({
      kind: 'loading',
      failed: false,
    });
    expect(initialResponseLoad(false)).toEqual({ kind: 'off' });
  });

  it('a snapshot loads, with or without a doc', () => {
    const r = resp();
    expect(
      runLoad(initialResponseLoad(true), { type: 'snapshot', response: r })
    ).toEqual({ kind: 'loaded', response: r, failed: false });
    expect(
      runLoad(initialResponseLoad(true), { type: 'snapshot', response: null })
    ).toEqual({ kind: 'loaded', response: null, failed: false });
  });

  it('a listener error before any snapshot keeps loading, marked failed', () => {
    expect(
      runLoad(initialResponseLoad(true), { type: 'listenerError' })
    ).toEqual({ kind: 'loading', failed: true });
  });

  it('a later listener error keeps the last snapshot', () => {
    const r = resp({ completedAt: 2 });
    expect(
      runLoad(
        initialResponseLoad(true),
        { type: 'snapshot', response: r },
        { type: 'listenerError' }
      )
    ).toEqual({ kind: 'loaded', response: r, failed: true });
  });

  it('the next snapshot clears a failure', () => {
    expect(
      runLoad(
        initialResponseLoad(true),
        { type: 'listenerError' },
        { type: 'snapshot', response: null }
      )
    ).toEqual({ kind: 'loaded', response: null, failed: false });
  });

  it('unsubscribing (a view-only session) drops everything; resubscribing loads again', () => {
    const off = runLoad(
      initialResponseLoad(true),
      { type: 'snapshot', response: resp() },
      { type: 'subscribed', on: false }
    );
    expect(off).toEqual({ kind: 'off' });
    expect(runLoad(off, { type: 'subscribed', on: true })).toEqual({
      kind: 'loading',
      failed: false,
    });
  });

  it('ignores snapshots and errors while off, and a repeat subscription', () => {
    const off = initialResponseLoad(false);
    expect(
      responseLoadReducer(off, { type: 'snapshot', response: resp() })
    ).toBe(off);
    expect(responseLoadReducer(off, { type: 'listenerError' })).toBe(off);
    expect(responseLoadReducer(off, { type: 'subscribed', on: false })).toBe(
      off
    );
    const loaded = runLoad(initialResponseLoad(true), {
      type: 'snapshot',
      response: null,
    });
    expect(responseLoadReducer(loaded, { type: 'subscribed', on: true })).toBe(
      loaded
    );
  });
});

const base: GLStudentScreenInput = {
  sessionLoading: false,
  sessionError: null,
  hasSession: true,
  excluded: false,
  flow: initialGLFlow,
  response: { kind: 'loaded', response: null, failed: false },
  isClosed: false,
  perPeriod: false,
  assessmentMode: false,
  isStudentRole: false,
  entered: false,
  canEnter: true,
};
const screen = (over: Partial<GLStudentScreenInput>) =>
  deriveGLStudentScreen({ ...base, ...over }).kind;

describe('deriveGLStudentScreen', () => {
  it('loading, load error and not found come first', () => {
    expect(screen({ sessionLoading: true, excluded: true })).toBe('loading');
    expect(screen({ sessionError: 'x', excluded: true })).toBe('loadError');
    expect(screen({ hasSession: false, excluded: true })).toBe('notFound');
  });

  it('an excluded student sees the excluded notice even after submitting', () => {
    expect(
      screen({ excluded: true, flow: { kind: 'completed', replayKey: 0 } })
    ).toBe('excluded');
  });

  it('a fresh student sees Start; a started one the player', () => {
    expect(screen({})).toBe('start');
    expect(screen({ flow: playing() })).toBe('playing');
  });

  it('waits for the first response snapshot before offering Start', () => {
    expect(screen({ response: { kind: 'loading', failed: false } })).toBe(
      'awaitingResponse'
    );
  });

  it('a failed status read blocks Start rather than inviting a resubmit', () => {
    expect(screen({ response: { kind: 'loading', failed: true } })).toBe(
      'statusFailed'
    );
    expect(
      screen({ response: { kind: 'loaded', response: null, failed: true } })
    ).toBe('statusFailed');
  });

  it('a failure after a snapshot keeps using that snapshot', () => {
    expect(
      screen({ response: { kind: 'loaded', response: resp(), failed: true } })
    ).toBe('start');
    expect(
      screen({
        response: {
          kind: 'loaded',
          response: resp({ completedAt: 2 }),
          failed: true,
        },
      })
    ).toBe('returningSubmitted');
  });

  it('a returning student who submitted sees their submission, never Start', () => {
    expect(
      screen({
        response: {
          kind: 'loaded',
          response: resp({ completedAt: 2 }),
          failed: false,
        },
      })
    ).toBe('returningSubmitted');
  });

  it('a just-submitted student sees completion even before the snapshot catches up', () => {
    const completed: GLFlow = { kind: 'completed', replayKey: 0 };
    expect(
      screen({ flow: completed, response: { kind: 'loading', failed: true } })
    ).toBe('completed');
    expect(
      screen({
        flow: completed,
        response: {
          kind: 'loaded',
          response: resp({ completedAt: 2 }),
          failed: false,
        },
      })
    ).toBe('completed');
  });

  it('view-only shares skip the response entirely', () => {
    expect(screen({ response: { kind: 'off' } })).toBe('start');
  });

  describe('teacher closes (Close now, Archive, sub End)', () => {
    it('before Start: closed', () => {
      expect(screen({ isClosed: true })).toBe('closed');
    });

    it('mid-activity: closed replaces the player', () => {
      expect(screen({ isClosed: true, flow: playing() })).toBe('closed');
      expect(
        screen({ isClosed: true, flow: playing({ submit: 'failed' }) })
      ).toBe('closed');
    });

    it('mid-submit: the player stays until the submit settles', () => {
      expect(
        screen({ isClosed: true, flow: playing({ submit: 'submitting' }) })
      ).toBe('playing');
    });

    it('mid-submit, then success: completion', () => {
      const flow = run(playing({ submit: 'submitting' }), {
        type: 'submitSucceeded',
      });
      expect(screen({ isClosed: true, flow })).toBe('completed');
    });

    it('mid-submit, then failure: closed', () => {
      const flow = run(playing({ submit: 'submitting' }), {
        type: 'submitFailed',
      });
      expect(screen({ isClosed: true, flow })).toBe('closed');
    });

    it('after submitting: completion stays', () => {
      expect(
        screen({ isClosed: true, flow: { kind: 'completed', replayKey: 0 } })
      ).toBe('completed');
    });

    it('reconnect after close, never submitted: closed, with or without saved answers', () => {
      expect(screen({ isClosed: true })).toBe('closed');
      expect(
        screen({
          isClosed: true,
          response: { kind: 'loaded', response: resp(), failed: false },
        })
      ).toBe('closed');
    });

    it('reconnect after close, submitted: their submission', () => {
      expect(
        screen({
          isClosed: true,
          response: {
            kind: 'loaded',
            response: resp({ completedAt: 2 }),
            failed: false,
          },
        })
      ).toBe('returningSubmitted');
    });

    it('a closed view-only share is closed too', () => {
      expect(screen({ isClosed: true, response: { kind: 'off' } })).toBe(
        'closed'
      );
    });
  });

  describe('per-period access', () => {
    const period = { perPeriod: true };

    it('assessment mode refuses an anonymous joiner before Start', () => {
      expect(screen({ ...period, assessmentMode: true })).toBe('needsSignIn');
      expect(
        screen({ ...period, assessmentMode: true, isStudentRole: true })
      ).toBe('start');
    });

    it('a closed session wins over the sign-in refusal', () => {
      expect(screen({ ...period, assessmentMode: true, isClosed: true })).toBe(
        'closed'
      );
    });

    it('started but not yet let in: locked or entering', () => {
      expect(screen({ ...period, flow: playing(), canEnter: false })).toBe(
        'periodLocked'
      );
      expect(screen({ ...period, flow: playing(), canEnter: true })).toBe(
        'enteringPeriod'
      );
    });

    it('once entered, the player stays even if the period closes (it pauses in place)', () => {
      expect(
        screen({ ...period, flow: playing(), entered: true, canEnter: false })
      ).toBe('playing');
    });
  });
});
