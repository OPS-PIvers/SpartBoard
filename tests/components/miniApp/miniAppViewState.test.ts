import { describe, expect, it } from 'vitest';
import {
  initialMiniAppView,
  miniAppViewReducer,
  sessionLoadReducer,
  type MiniAppView,
  type MiniAppViewEvent,
  type OpenView,
  type SessionLoad,
} from '@/components/miniApp/miniAppViewState';
import type { MiniAppSession } from '@/types';

const open = (over: Partial<Omit<OpenView, 'kind'>> = {}): OpenView => ({
  ...initialMiniAppView,
  ...over,
});

const run = (state: MiniAppView, ...events: MiniAppViewEvent[]) =>
  events.reduce(miniAppViewReducer, state);

const ALL_EVENTS: MiniAppViewEvent[] = [
  { type: 'pointerLoaded', excluded: true },
  { type: 'pointerLoaded', excluded: false },
  { type: 'existingFound', attemptLimit: null },
  { type: 'existingFound', attemptCount: 1, attemptLimit: 3 },
  { type: 'existingFound', attemptCount: 3, attemptLimit: 3 },
  { type: 'saveStarted' },
  { type: 'saveSucceeded', at: 5 },
  { type: 'saveSucceeded', at: 5, attemptsUsed: 2 },
  { type: 'saveFailed', payload: { a: 1 } },
  { type: 'saveCleared' },
  { type: 'savedToastExpired' },
  { type: 'attemptsExhausted' },
];

describe('miniAppViewReducer: open', () => {
  it('starts open, idle, nothing submitted, no attempts', () => {
    expect(initialMiniAppView).toEqual({
      kind: 'open',
      save: { kind: 'idle' },
      submitted: false,
      attemptsUsed: 0,
    });
  });

  it('save started → submitting', () => {
    expect(run(open(), { type: 'saveStarted' })).toEqual(
      open({ save: { kind: 'submitting' } })
    );
  });

  it('save succeeded → saved and submitted, attempts kept for v1', () => {
    expect(
      run(
        open({ attemptsUsed: 1 }),
        { type: 'saveStarted' },
        {
          type: 'saveSucceeded',
          at: 9,
        }
      )
    ).toEqual(
      open({ save: { kind: 'saved', at: 9 }, submitted: true, attemptsUsed: 1 })
    );
  });

  it('v2 save succeeded records the server attempt count', () => {
    expect(
      run(open(), { type: 'saveSucceeded', at: 9, attemptsUsed: 2 })
    ).toMatchObject({ attemptsUsed: 2, submitted: true });
  });

  it('save failed keeps the payload and request for Retry, and does not mark submitted', () => {
    const request = { kind: 'result' as const, requestId: 'r1' };
    expect(
      run(
        open(),
        { type: 'saveStarted' },
        {
          type: 'saveFailed',
          payload: { x: 1 },
          request,
        }
      )
    ).toEqual(open({ save: { kind: 'error', payload: { x: 1 }, request } }));
  });

  it('save failed with no auth user lands from idle too', () => {
    expect(run(open(), { type: 'saveFailed', payload: 1 })).toMatchObject({
      save: { kind: 'error', payload: 1 },
    });
  });

  it('save cleared → idle from submitting or error', () => {
    expect(
      run(open({ save: { kind: 'submitting' } }), { type: 'saveCleared' })
    ).toEqual(open());
    expect(
      run(open({ save: { kind: 'error', payload: 1 } }), {
        type: 'saveCleared',
      })
    ).toEqual(open());
  });

  it('saved toast expiry → idle, keeping submitted', () => {
    expect(
      run(open({ save: { kind: 'saved', at: 1 }, submitted: true }), {
        type: 'savedToastExpired',
      })
    ).toEqual(open({ submitted: true }));
  });

  it('existing submission without an attempt count marks submitted only', () => {
    expect(
      run(open({ attemptsUsed: 0 }), {
        type: 'existingFound',
        attemptLimit: 2,
      })
    ).toEqual(open({ submitted: true }));
  });

  it('existing v2 submission under the limit records attempts', () => {
    expect(
      run(open(), { type: 'existingFound', attemptCount: 1, attemptLimit: 3 })
    ).toEqual(open({ submitted: true, attemptsUsed: 1 }));
  });

  it('existing v2 submission with no limit never turns in', () => {
    expect(
      run(open(), {
        type: 'existingFound',
        attemptCount: 40,
        attemptLimit: null,
      })
    ).toEqual(open({ submitted: true, attemptsUsed: 40 }));
  });

  it('existing v2 submission at the limit → turned in', () => {
    expect(
      run(open(), { type: 'existingFound', attemptCount: 3, attemptLimit: 3 })
    ).toEqual({ kind: 'turnedIn', attemptsUsed: 3 });
  });

  it('attempts exhausted → turned in, keeping the count', () => {
    expect(
      run(open({ attemptsUsed: 2, save: { kind: 'submitting' } }), {
        type: 'attemptsExhausted',
      })
    ).toEqual({ kind: 'turnedIn', attemptsUsed: 2 });
  });
});

describe('miniAppViewReducer: events that change nothing', () => {
  it('saved toast expiry outside saved is a no-op', () => {
    for (const save of [
      { kind: 'idle' as const },
      { kind: 'submitting' as const },
      { kind: 'error' as const, payload: 1 },
    ]) {
      const state = open({ save });
      expect(run(state, { type: 'savedToastExpired' })).toBe(state);
    }
  });

  it('save cleared while idle is a no-op', () => {
    const state = open();
    expect(run(state, { type: 'saveCleared' })).toBe(state);
  });

  it('existing submission seen twice is a no-op', () => {
    const state = open({ submitted: true });
    expect(run(state, { type: 'existingFound', attemptLimit: null })).toBe(
      state
    );
  });

  it('an un-skip for a student who was never skipped is a no-op', () => {
    const state = open({ submitted: true });
    expect(run(state, { type: 'pointerLoaded', excluded: false })).toBe(state);
  });

  it('turned in absorbs every event except a skip', () => {
    const state: MiniAppView = { kind: 'turnedIn', attemptsUsed: 3 };
    for (const event of ALL_EVENTS) {
      if (event.type === 'pointerLoaded' && event.excluded) continue;
      expect(run(state, event)).toBe(state);
    }
  });

  it('a second skip while skipped is a no-op', () => {
    const state: MiniAppView = { kind: 'excluded', behind: open() };
    expect(run(state, { type: 'pointerLoaded', excluded: true })).toBe(state);
  });
});

describe('miniAppViewReducer: excluded', () => {
  it('skip hides an open view and keeps it behind', () => {
    const behind = open({ submitted: true });
    expect(run(behind, { type: 'pointerLoaded', excluded: true })).toEqual({
      kind: 'excluded',
      behind,
    });
  });

  it('skip wins over turned in', () => {
    const behind: MiniAppView = { kind: 'turnedIn', attemptsUsed: 1 };
    expect(run(behind, { type: 'pointerLoaded', excluded: true })).toEqual({
      kind: 'excluded',
      behind,
    });
  });

  it('events while skipped update the view behind, so an un-skip restores it', () => {
    const state = run(
      open(),
      { type: 'pointerLoaded', excluded: true },
      { type: 'existingFound', attemptCount: 1, attemptLimit: 1 }
    );
    expect(state).toEqual({
      kind: 'excluded',
      behind: { kind: 'turnedIn', attemptsUsed: 1 },
    });
    expect(run(state, { type: 'pointerLoaded', excluded: false })).toEqual({
      kind: 'turnedIn',
      attemptsUsed: 1,
    });
  });

  it('a no-op event while skipped keeps the same state', () => {
    const state: MiniAppView = { kind: 'excluded', behind: open() };
    expect(run(state, { type: 'savedToastExpired' })).toBe(state);
  });
});

describe('miniAppViewReducer: teacher and student disagree', () => {
  it('server says attempts are used up mid-save: turned in, and the late result is ignored', () => {
    const state = run(
      open({ attemptsUsed: 2 }),
      { type: 'saveStarted' },
      { type: 'attemptsExhausted' },
      { type: 'saveSucceeded', at: 1, attemptsUsed: 3 },
      { type: 'saveFailed', payload: {} }
    );
    expect(state).toEqual({ kind: 'turnedIn', attemptsUsed: 2 });
  });

  it('teacher skips the student mid-save: the save still settles behind the notice', () => {
    const state = run(
      open(),
      { type: 'saveStarted' },
      { type: 'pointerLoaded', excluded: true },
      { type: 'saveSucceeded', at: 4 }
    );
    expect(state).toEqual({
      kind: 'excluded',
      behind: open({ save: { kind: 'saved', at: 4 }, submitted: true }),
    });
  });
});

const SESSION = { id: 's1', status: 'active' } as MiniAppSession;

describe('sessionLoadReducer', () => {
  const loading: SessionLoad = { kind: 'loading' };

  it('loading → loaded on a doc', () => {
    expect(
      sessionLoadReducer(loading, { type: 'snapshot', session: SESSION })
    ).toEqual({ kind: 'loaded', session: SESSION });
  });

  it('loading → not found on a missing doc or a listener error', () => {
    expect(
      sessionLoadReducer(loading, { type: 'snapshot', session: null })
    ).toEqual({ kind: 'notFound' });
    expect(sessionLoadReducer(loading, { type: 'listenerError' })).toEqual({
      kind: 'notFound',
    });
  });

  it('loaded → loaded with the newer doc (teacher ends, then reopens)', () => {
    const ended = { ...SESSION, status: 'ended' } as MiniAppSession;
    const a = sessionLoadReducer(loading, {
      type: 'snapshot',
      session: SESSION,
    });
    const b = sessionLoadReducer(a, { type: 'snapshot', session: ended });
    expect(b).toEqual({ kind: 'loaded', session: ended });
    expect(
      sessionLoadReducer(b, { type: 'snapshot', session: SESSION })
    ).toEqual({ kind: 'loaded', session: SESSION });
  });

  it('loaded → not found when the doc is deleted or the listener fails', () => {
    const loaded: SessionLoad = { kind: 'loaded', session: SESSION };
    expect(
      sessionLoadReducer(loaded, { type: 'snapshot', session: null })
    ).toEqual({ kind: 'notFound' });
    expect(sessionLoadReducer(loaded, { type: 'listenerError' })).toEqual({
      kind: 'notFound',
    });
  });

  it('not found is final', () => {
    const notFound: SessionLoad = { kind: 'notFound' };
    expect(
      sessionLoadReducer(notFound, { type: 'snapshot', session: SESSION })
    ).toBe(notFound);
    expect(sessionLoadReducer(notFound, { type: 'listenerError' })).toBe(
      notFound
    );
  });
});
