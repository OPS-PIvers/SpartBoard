import { describe, expect, it } from 'vitest';
import {
  deriveFlashcardStudentView,
  initialProgressListen,
  initialSeat,
  initialSubmit,
  nextWindowBoundary,
  progressListenReducer,
  seatReducer,
  shouldEnter,
  submitReducer,
  type FlashcardStudentViewInput,
  type ProgressListenEvent,
  type ProgressListenState,
  type SeatEvent,
  type SeatState,
  type SubmitEvent,
  type SubmitState,
} from '@/components/flashcards/flashcardStudentView';
import type {
  FlashcardProgress,
  FlashcardSession,
  StudentAssignmentPointer,
} from '@/types';

const NOW = 1_800_000_000_000;

const ALL_SEAT_EVENTS: SeatEvent[] = [
  { type: 'seated' },
  { type: 'noSeat' },
  { type: 'seatFailed' },
  { type: 'entered' },
];

const ALL_SEATS: SeatState[] = [
  { kind: 'idle' },
  { kind: 'none' },
  { kind: 'error' },
  { kind: 'seated', entered: false },
  { kind: 'seated', entered: true },
];

describe('seatReducer', () => {
  it('starts idle', () => {
    expect(initialSeat).toEqual({ kind: 'idle' });
  });

  it.each([
    [{ type: 'seated' } as const, { kind: 'seated', entered: false }],
    [{ type: 'noSeat' } as const, { kind: 'none' }],
    [{ type: 'seatFailed' } as const, { kind: 'error' }],
  ])('idle + %o', (event, expected) => {
    expect(seatReducer(initialSeat, event)).toEqual(expected);
  });

  it('latches entered once seated', () => {
    expect(
      seatReducer({ kind: 'seated', entered: false }, { type: 'entered' })
    ).toEqual({ kind: 'seated', entered: true });
  });

  const allowed = new Set([
    'idle:seated',
    'idle:noSeat',
    'idle:seatFailed',
    'seated-false:entered',
  ]);
  for (const state of ALL_SEATS) {
    const name =
      state.kind === 'seated' ? `seated-${String(state.entered)}` : state.kind;
    for (const event of ALL_SEAT_EVENTS) {
      if (allowed.has(`${name}:${event.type}`)) continue;
      it(`ignores ${event.type} from ${name}`, () => {
        expect(seatReducer(state, event)).toBe(state);
      });
    }
  }
});

describe('shouldEnter', () => {
  const seated: SeatState = { kind: 'seated', entered: false };
  it('enters only when seated, open and the content has loaded', () => {
    expect(shouldEnter(seated, true, false)).toBe(true);
    expect(shouldEnter(seated, false, false)).toBe(false);
    expect(shouldEnter(seated, true, true)).toBe(false);
    expect(shouldEnter({ kind: 'idle' }, true, false)).toBe(false);
  });

  it('never fires again once entered, so a render-time dispatch settles', () => {
    expect(shouldEnter({ kind: 'seated', entered: true }, true, false)).toBe(
      false
    );
  });
});

const someProgress = {
  classId: 'A',
  cards: {},
} as unknown as FlashcardProgress;

const run = (state: ProgressListenState, ...events: ProgressListenEvent[]) =>
  events.reduce(progressListenReducer, state);

describe('progressListenReducer', () => {
  it('starts loading with no resets', () => {
    expect(initialProgressListen).toEqual({
      progress: { kind: 'loading' },
      existed: false,
      resetCount: 0,
    });
  });

  it('becomes ready on the first snapshot, with or without a doc', () => {
    expect(
      run(initialProgressListen, {
        type: 'snapshot',
        value: null,
        first: true,
      })
    ).toEqual({
      progress: { kind: 'ready', value: null },
      existed: false,
      resetCount: 0,
    });
    expect(
      run(initialProgressListen, {
        type: 'snapshot',
        value: someProgress,
        first: true,
      }).progress
    ).toEqual({ kind: 'ready', value: someProgress });
  });

  it('counts a teacher reset when a doc that existed disappears', () => {
    const state = run(
      initialProgressListen,
      { type: 'snapshot', value: someProgress, first: true },
      { type: 'snapshot', value: null, first: false }
    );
    expect(state.resetCount).toBe(1);
    expect(state.existed).toBe(false);
    expect(state.progress).toEqual({ kind: 'ready', value: null });
  });

  it('does not count a missing doc that never existed', () => {
    const state = run(
      initialProgressListen,
      { type: 'snapshot', value: null, first: true },
      { type: 'snapshot', value: null, first: false }
    );
    expect(state.resetCount).toBe(0);
  });

  it('counts each reset after the student writes again', () => {
    const state = run(
      initialProgressListen,
      { type: 'snapshot', value: someProgress, first: true },
      { type: 'snapshot', value: null, first: false },
      { type: 'snapshot', value: someProgress, first: false },
      { type: 'snapshot', value: null, first: false }
    );
    expect(state.resetCount).toBe(2);
  });

  it('never counts a new subscription first snapshot as a reset', () => {
    const state = run(
      initialProgressListen,
      { type: 'snapshot', value: someProgress, first: true },
      { type: 'snapshot', value: null, first: true }
    );
    expect(state.resetCount).toBe(0);
  });

  it('treats a read error as no progress without counting a reset', () => {
    const before = run(initialProgressListen, {
      type: 'snapshot',
      value: someProgress,
      first: true,
    });
    const state = run(before, { type: 'error' });
    expect(state).toEqual({
      progress: { kind: 'ready', value: null },
      existed: true,
      resetCount: 0,
    });
  });
});

describe('submitReducer', () => {
  const idle: SubmitState = { kind: 'idle' };
  const submitting: SubmitState = { kind: 'submitting' };
  const failed: SubmitState = { kind: 'failed' };
  const started: SubmitEvent = { type: 'submitStarted' };
  const fail: SubmitEvent = { type: 'submitFailed' };

  it('starts idle', () => {
    expect(initialSubmit).toEqual(idle);
  });

  it('submits from idle or after a failure, and fails only while submitting', () => {
    expect(submitReducer(idle, started)).toEqual(submitting);
    expect(submitReducer(failed, started)).toEqual(submitting);
    expect(submitReducer(submitting, fail)).toEqual(failed);
  });

  it.each([
    [submitting, started],
    [idle, fail],
    [failed, fail],
  ])('leaves %o unchanged on %o', (state, event) => {
    expect(submitReducer(state, event)).toBe(state);
  });
});

const session = (over: Partial<FlashcardSession> = {}): FlashcardSession => ({
  id: 'fc-1',
  teacherUid: 't1',
  setId: 'set-1',
  title: 'Numbers',
  kind: 'study',
  termLanguage: 'es-ES',
  definitionLanguage: 'en-US',
  cards: [],
  classIds: ['A'],
  status: 'active',
  createdAt: 1,
  ...over,
});

const pointer = (
  over: Partial<StudentAssignmentPointer> = {}
): StudentAssignmentPointer => ({
  kind: 'flashcards',
  sessionId: 'fc-1',
  teacherUid: 't1',
  classId: 'A',
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

const input = (
  over: Partial<FlashcardStudentViewInput> & {
    sessionOver?: Partial<FlashcardSession>;
  } = {}
): FlashcardStudentViewInput => {
  const { sessionOver, ...rest } = over;
  return {
    session: { kind: 'ready', value: session(sessionOver) },
    progress: { kind: 'ready', value: null },
    pointer: null,
    studentUid: 'ps-1',
    content: null,
    now: NOW,
    perPeriod: false,
    seat: initialSeat,
    canEnter: true,
    ...rest,
  };
};

const kindOf = (over: Parameters<typeof input>[0] = {}) =>
  deriveFlashcardStudentView(input(over)).kind;

describe('deriveFlashcardStudentView', () => {
  it('is unavailable without a session or a signed-in student', () => {
    expect(kindOf({ session: { kind: 'unavailable' } })).toBe('unavailable');
    expect(kindOf({ studentUid: null })).toBe('unavailable');
  });

  it('loads until the session, progress and pointer have all arrived', () => {
    expect(kindOf({ session: { kind: 'loading' } })).toBe('loading');
    expect(kindOf({ progress: { kind: 'loading' } })).toBe('loading');
    expect(kindOf({ pointer: undefined })).toBe('loading');
  });

  it('shows the excluded notice before any window check', () => {
    expect(
      kindOf({
        pointer: pointer({ excluded: true }),
        sessionOver: { status: 'ended' },
      })
    ).toBe('excluded');
  });

  it('is upcoming before openAt and open from openAt on', () => {
    const view = deriveFlashcardStudentView(
      input({ sessionOver: { openAt: NOW + 1 } })
    );
    expect(view).toMatchObject({ kind: 'upcoming', openAt: NOW + 1 });
    expect(kindOf({ sessionOver: { openAt: NOW } })).toBe('tracked');
  });

  it('uses the pointer window shift over the session window', () => {
    expect(
      kindOf({
        sessionOver: { closeAt: NOW - 1 },
        pointer: pointer({ closeAt: NOW + 60_000 }),
      })
    ).toBe('tracked');
  });

  it('shows Check results once submitted, even after the Check ends', () => {
    const progress = { ...someProgress, submittedAt: NOW - 5 };
    const view = deriveFlashcardStudentView(
      input({
        sessionOver: { kind: 'check', status: 'ended' },
        progress: { kind: 'ready', value: progress },
      })
    );
    expect(view).toMatchObject({ kind: 'submitted', progress });
  });

  it('closes a Check the teacher ends mid-Check', () => {
    expect(kindOf({ sessionOver: { kind: 'check', status: 'ended' } })).toBe(
      'checkClosed'
    );
  });

  it('closes a Check whose closeAt has passed', () => {
    expect(kindOf({ sessionOver: { kind: 'check', closeAt: NOW } })).toBe(
      'checkClosed'
    );
  });

  it('keeps study going untracked with the ended banner when the teacher ends it', () => {
    expect(
      deriveFlashcardStudentView(
        input({ sessionOver: { status: 'ended', closeAt: NOW + 1 } })
      )
    ).toMatchObject({ kind: 'closed', closeAt: null });
  });

  it('names the close time in the banner when the window closed', () => {
    expect(
      deriveFlashcardStudentView(input({ sessionOver: { closeAt: NOW - 1 } }))
    ).toMatchObject({ kind: 'closed', closeAt: NOW - 1 });
  });

  it('tracks progress in an open study assignment', () => {
    expect(deriveFlashcardStudentView(input())).toMatchObject({
      kind: 'tracked',
      paused: false,
    });
  });

  describe('per-period sessions', () => {
    const period = (seat: SeatState, canEnter: boolean) =>
      deriveFlashcardStudentView(input({ perPeriod: true, seat, canEnter }));

    it('waits while the seat is being taken or the content loads', () => {
      expect(period({ kind: 'idle' }, true)).toMatchObject({
        kind: 'seating',
        step: 'waiting',
      });
      expect(period({ kind: 'seated', entered: false }, true)).toMatchObject({
        kind: 'seating',
        step: 'waiting',
      });
    });

    it('explains a missing seat or a seat error', () => {
      expect(period({ kind: 'none' }, true)).toMatchObject({
        step: 'noSeat',
      });
      expect(period({ kind: 'error' }, true)).toMatchObject({
        step: 'seatError',
      });
    });

    it('locks a seated student whose period is shut', () => {
      expect(period({ kind: 'seated', entered: false }, false).kind).toBe(
        'periodLocked'
      );
    });

    it('pauses the player in place when the period shuts after entering', () => {
      expect(period({ kind: 'seated', entered: true }, false)).toMatchObject({
        kind: 'tracked',
        paused: true,
      });
      expect(period({ kind: 'seated', entered: true }, true)).toMatchObject({
        kind: 'tracked',
        paused: false,
      });
    });

    it('still closes an entered student when the teacher ends it', () => {
      expect(
        deriveFlashcardStudentView(
          input({
            perPeriod: true,
            seat: { kind: 'seated', entered: true },
            sessionOver: { status: 'ended' },
          })
        ).kind
      ).toBe('closed');
    });
  });

  it('folds hidden content cards into the session', () => {
    const cards = [{ id: 'c1', term: 'uno', definition: 'one' }];
    const view = deriveFlashcardStudentView(
      input({ sessionOver: { cardsInContent: true }, content: { cards } })
    );
    expect('session' in view && view.session.cards).toEqual(cards);
  });
});

describe('nextWindowBoundary', () => {
  const active = { status: 'active' as const };

  it('is the sooner of a future openAt or closeAt', () => {
    expect(
      nextWindowBoundary(active, { openAt: NOW + 10, closeAt: NOW + 20 }, NOW)
    ).toBe(NOW + 10);
    expect(
      nextWindowBoundary(active, { openAt: NOW - 10, closeAt: NOW + 20 }, NOW)
    ).toBe(NOW + 20);
  });

  it('is null once both have passed, with no window, or after the teacher ends it', () => {
    expect(nextWindowBoundary(active, { closeAt: NOW }, NOW)).toBeNull();
    expect(nextWindowBoundary(active, {}, NOW)).toBeNull();
    expect(
      nextWindowBoundary({ status: 'ended' }, { closeAt: NOW + 20 }, NOW)
    ).toBeNull();
  });
});
