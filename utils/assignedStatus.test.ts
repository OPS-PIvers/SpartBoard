import { describe, expect, it } from 'vitest';
import type { PeriodAccess, QuizAssignment, QuizResponse } from '@/types';
import {
  compareAssigned,
  deriveAssignedStatus,
  isClassClosed,
  quizAssignedInput,
  type AssignedStatus,
  type QuizAssignedExtras,
} from '@/utils/assignedStatus';

const NOW = 1_000_000;
const MIN = 60_000;

const row = (over: Partial<PeriodAccess> = {}): PeriodAccess => ({
  state: 'closed',
  openAt: null,
  closeAt: null,
  bellPeriodId: null,
  verified: true,
  label: 'P',
  ...over,
});

const quiz = (over: Partial<QuizAssignment> = {}): QuizAssignment => ({
  id: 'a1',
  quizId: 'q1',
  quizTitle: 'Cells quiz',
  quizDriveFileId: 'f1',
  teacherUid: 't1',
  code: 'ABC',
  status: 'active',
  createdAt: 100,
  updatedAt: 100,
  sessionMode: 'student',
  sessionOptions: {},
  ...over,
});

const resp = (
  classId: string | undefined,
  status: QuizResponse['status']
): Pick<QuizResponse, 'status' | 'classId' | 'classPeriod'> => ({
  classId,
  status,
});

type Extras = Partial<QuizAssignedExtras>;
const loaded = (extras?: Extras): QuizAssignedExtras => ({
  responses: [],
  needsGrading: 0,
  ...extras,
});

const derive = (
  a: Partial<QuizAssignment>,
  extras?: Extras,
  now = NOW
): AssignedStatus =>
  deriveAssignedStatus(quizAssignedInput(quiz(a), loaded(extras)), now);

const three = (
  p1: Partial<PeriodAccess>,
  p2: Partial<PeriodAccess>,
  p3: Partial<PeriodAccess>
) => ({
  periodAccess: {
    c1: row({ label: 'P1', rosterId: 'r1', ...p1 }),
    c2: row({ label: 'P2', rosterId: 'r2', ...p2 }),
    c3: row({ label: 'P3', rosterId: 'r3', ...p3 }),
  },
});

describe('class statuses', () => {
  it('reads Ready, Scheduled, Open, Paused and Closed from each row', () => {
    const s = derive({
      periodAccess: {
        ready: row(),
        sched: row({ state: 'open', openAt: NOW + MIN }),
        open: row({ state: 'open', closeAt: NOW + MIN }),
        paused: row({ state: 'paused' }),
        closed: row({ closedAt: NOW - MIN }),
        clock: row({ state: 'open', closeAt: NOW - MIN }),
      },
    });
    expect(s.classes.map((c) => [c.key, c.status, c.closedBy])).toEqual([
      ['ready', 'ready', null],
      ['sched', 'scheduled', null],
      ['open', 'open', null],
      ['paused', 'paused', null],
      ['closed', 'closed', 'teacher'],
      ['clock', 'closed', 'clock'],
    ]);
    expect(s.classes.find((c) => c.key === 'clock')?.closedAt).toBe(NOW - MIN);
  });

  it('D24: a closed row with no closedAt is Ready until that class has begun work', () => {
    const pa = { periodAccess: { c1: row({ label: 'P1' }) } };
    expect(derive(pa).classes[0].status).toBe('ready');
    expect(
      derive(pa, { responses: [resp('c1', 'joined')] }).classes[0].status
    ).toBe('ready');
    expect(
      derive(pa, { responses: [resp('c1', 'in-progress')] }).classes[0].status
    ).toBe('closed');
    expect(
      derive(pa, { responses: [resp('c2', 'completed')] }).classes[0].status
    ).toBe('ready');
  });

  it('matches anonymous responses to a class by its period label', () => {
    const s = derive(
      { periodAccess: { c1: row({ label: 'P1', state: 'open' }) } },
      {
        responses: [
          { status: 'completed', classPeriod: 'P1' },
          { status: 'completed', classPeriod: 'P9' },
        ],
      }
    );
    expect(s.classes[0].submitted).toBe(1);
  });

  it('shows open classes as Paused while the whole assignment is paused', () => {
    const s = derive({
      status: 'paused',
      ...three({ state: 'open' }, {}, { closedAt: 1 }),
    });
    expect(s.classes.map((c) => c.status)).toEqual([
      'paused',
      'ready',
      'closed',
    ]);
  });

  it('D20: an ended assignment shows every class Closed', () => {
    const s = derive({
      status: 'inactive',
      ...three({ state: 'open' }, {}, { state: 'paused' }),
    });
    expect(s.classes.every((c) => c.status === 'closed')).toBe(true);
    expect(s.classes.map((c) => c.closedBy)).toEqual([
      'ended',
      'ended',
      'ended',
    ]);
  });

  it('marks the class whose bell period is under way', () => {
    const s = derive(three({}, {}, {}), {
      bellFor: ({ rosterId }) =>
        rosterId === 'r2' ? { openAt: NOW - MIN, closeAt: NOW + MIN } : null,
    });
    expect(s.classes.map((c) => c.inSession)).toEqual([false, true, false]);
  });

  it('isClassClosed counts a teacher close and a passed close time, never Ready', () => {
    expect(isClassClosed(row(), NOW)).toBe(false);
    expect(isClassClosed(row({ closedAt: 5 }), NOW)).toBe(true);
    expect(isClassClosed(row({ state: 'open', closeAt: NOW - 1 }), NOW)).toBe(
      true
    );
    expect(isClassClosed(row({ state: 'paused', closedAt: 5 }), NOW)).toBe(
      false
    );
  });
});

describe('single line (D15, D20)', () => {
  it('maps a legacy status and window onto one unnamed class', () => {
    expect(derive({}).classes[0].status).toBe('open');
    expect(derive({ status: 'paused' }).classes[0].status).toBe('paused');
    expect(derive({ openAt: NOW + MIN }).classes[0].status).toBe('scheduled');
    expect(derive({ closeAt: NOW - MIN }).classes[0]).toMatchObject({
      status: 'closed',
      closedBy: 'clock',
    });
    const s = derive({ className: 'Bio 2' });
    expect(s.singleLine).toBe(true);
    expect(s.classes[0].label).toBe('Bio 2');
    expect(s.line).toMatchObject({ kind: 'open', classLabel: null });
  });

  it('is one line for a per-class gate with one class', () => {
    const s = derive({ periodAccess: { c1: row({ label: 'P1' }) } });
    expect(s.singleLine).toBe(true);
    expect(s.line).toEqual({
      kind: 'ready',
      readyCount: 1,
      scheduledCount: 0,
      closedCount: 0,
    });
    expect(s.action).toEqual({
      kind: 'open',
      classKey: 'c1',
      classLabel: null,
    });
  });

  it('reads the bell of its one roster', () => {
    const s = derive(
      { rosterIds: ['r1'], status: 'paused' },
      { bellFor: () => ({ openAt: NOW - MIN, closeAt: NOW + MIN }) }
    );
    expect(s.classes[0].inSession).toBe(true);
    expect(s.action.kind).toBe('resume');
  });
});

describe('bucket (D5, D16, D20)', () => {
  const closed = three({ closedAt: 10 }, { closedAt: 20 }, { closedAt: 30 });
  const done = (a: Partial<QuizAssignment>, extras?: Extras) =>
    derive(a, extras).bucket;

  it('is Active while any class is not closed, Ready included', () => {
    expect(done(three({ closedAt: 10 }, { closedAt: 20 }, {}))).toBe('active');
    expect(
      done(three({ closedAt: 10 }, { state: 'open' }, { closedAt: 1 }))
    ).toBe('active');
  });

  it('holds a closed assignment in Active until it is graded and published', () => {
    const subs = { responses: [resp('c1', 'completed')] };
    expect(
      done({ ...closed, status: 'inactive' }, { ...subs, needsGrading: 2 })
    ).toBe('active');
    expect(done({ ...closed, status: 'inactive' }, subs)).toBe('active');
    expect(
      done({ ...closed, status: 'inactive', scoreVisibility: 'none' }, subs)
    ).toBe('active');
    expect(
      done(
        { ...closed, status: 'inactive', scoreVisibility: 'score-only' },
        subs
      )
    ).toBe('done');
  });

  it('is Done once closed with nothing submitted to publish', () => {
    expect(done({ ...closed, status: 'inactive' })).toBe('done');
  });

  it('counts classes closed by the clock while the stored status is still active', () => {
    const s = derive(
      three(
        { state: 'open', closeAt: NOW - MIN },
        { closedAt: 5 },
        { state: 'open', closeAt: NOW - 1 }
      )
    );
    expect(s.bucket).toBe('done');
    expect(s.legacyDone).toBe(false);
  });

  it('D20: an assignment ended with no closedAt anywhere is Done whatever its grading', () => {
    const s = derive(
      { ...three({ state: 'open' }, {}, {}), status: 'inactive' },
      { responses: [resp('c1', 'completed')], needsGrading: 3 }
    );
    expect(s).toMatchObject({
      bucket: 'done',
      legacyDone: true,
      line: { kind: 'done', legacy: true, scoresPublished: false },
      action: { kind: 'results' },
    });
    const single = derive(
      { status: 'inactive' },
      { responses: [resp(undefined, 'completed')] }
    );
    expect(single.legacyDone).toBe(true);
    expect(single.bucket).toBe('done');
  });

  it('holds a single-line assignment closed through the new tab to D5', () => {
    const s = derive(
      { status: 'inactive', closedAt: 50 },
      { responses: [resp(undefined, 'completed')] }
    );
    expect(s.legacyDone).toBe(false);
    expect(s.bucket).toBe('active');
    expect(s.line).toEqual({ kind: 'scores-unpublished', submitted: 1 });
    expect(s.action.kind).toBe('publish');
  });

  it('Move to Finished holds only while the assignment is ended', () => {
    const subs = { responses: [resp('c1', 'completed')], needsGrading: 1 };
    const moved = derive({ ...closed, status: 'inactive', doneAt: 99 }, subs);
    expect(moved).toMatchObject({ bucket: 'done', movedToDone: true });
    expect(moved.action.kind).toBe('results');
    expect(
      derive({ ...closed, status: 'paused', doneAt: 99 }, subs).bucket
    ).toBe('active');
  });

  it('D16: a view-only share is Done as soon as it is closed', () => {
    const s = derive(
      { ...closed, status: 'inactive', mode: 'view-only' },
      { responses: [resp('c1', 'completed')], needsGrading: 4 }
    );
    expect(s).toMatchObject({ bucket: 'done', grading: 'no-scores' });
    expect(s.line).toEqual({ kind: 'view-only', closed: true });
    const live = derive({ mode: 'view-only' });
    expect(live.line).toEqual({ kind: 'view-only', closed: false });
    expect(live.bucket).toBe('active');
  });
});

describe('responses not loaded yet', () => {
  const closed = three({ closedAt: 1 }, { closedAt: 2 }, { closedAt: 3 });

  it('keeps a closed row Active rather than reading it as nothing to grade', () => {
    for (const extras of [
      { responses: null, needsGrading: 0 },
      { responses: [], needsGrading: null },
    ]) {
      const s = derive(closed, extras);
      expect(s).toMatchObject({
        bucket: 'active',
        grading: 'unknown',
        line: { kind: 'grading-unknown' },
      });
      expect(s.action.kind).toBe('results');
    }
  });

  it('still lets the D20 and Move to Finished rules decide an ended row', () => {
    const unknown = { responses: null, needsGrading: null };
    expect(derive({ status: 'inactive' }, unknown).bucket).toBe('done');
    expect(
      derive({ ...closed, status: 'inactive', doneAt: 5 }, unknown).bucket
    ).toBe('done');
  });
});

describe('assignment-level close mark', () => {
  it('keeps a per-class quiz ended by a sub or a paper import out of the D20 rule', () => {
    const s = derive(
      { ...three({ state: 'open' }, {}, {}), status: 'inactive', closedAt: 70 },
      { responses: [resp('c1', 'completed')] }
    );
    expect(s.legacyDone).toBe(false);
    expect(s.bucket).toBe('active');
    expect(s.classes.map((c) => [c.closedBy, c.closedAt])).toEqual([
      ['teacher', 70],
      ['teacher', 70],
      ['teacher', 70],
    ]);
  });
});

describe('status line (D14)', () => {
  it('names the open class with its turn-ins and the classes still to go', () => {
    const s = derive(three({ closedAt: 5 }, { state: 'open' }, {}), {
      responses: [
        resp('c2', 'completed'),
        resp('c2', 'in-progress'),
        resp('c1', 'completed'),
      ],
      classSizes: { c2: 27 },
    });
    expect(s.line).toEqual({
      kind: 'open',
      classLabel: 'P2',
      submitted: 1,
      total: 27,
      classesToGo: 1,
      otherOpen: 0,
    });
  });

  it('prefers the open class that is in session', () => {
    const s = derive(three({ state: 'open' }, {}, { state: 'open' }), {
      bellFor: ({ rosterId }) =>
        rosterId === 'r3' ? { openAt: NOW - MIN, closeAt: NOW + MIN } : null,
    });
    expect(s.line).toMatchObject({
      kind: 'open',
      classLabel: 'P3',
      otherOpen: 1,
    });
  });

  it('shows a paused class when none is open', () => {
    expect(derive(three({ state: 'paused' }, {}, {})).line).toEqual({
      kind: 'paused',
      classLabel: 'P1',
      submitted: 0,
      total: null,
      classesToGo: 2,
    });
  });

  it('counts Ready classes, or names the next scheduled open when none is Ready', () => {
    expect(derive(three({}, {}, { closedAt: 1 })).line).toEqual({
      kind: 'ready',
      readyCount: 2,
      scheduledCount: 0,
      closedCount: 1,
    });
    const at = (m: number) => ({
      state: 'open' as const,
      openAt: NOW + m * MIN,
    });
    expect(derive(three(at(30), at(10), { closedAt: 1 })).line).toEqual({
      kind: 'scheduled',
      classLabel: null,
      opensAt: NOW + 10 * MIN,
      classCount: 2,
    });
    expect(
      derive(three(at(30), { closedAt: 1 }, { closedAt: 1 })).line
    ).toEqual({
      kind: 'scheduled',
      classLabel: 'P1',
      opensAt: NOW + 30 * MIN,
      classCount: 1,
    });
  });

  it('turns to grading once every class is closed', () => {
    const closed = three({ closedAt: 1 }, { closedAt: 2 }, { closedAt: 3 });
    const subs = [resp('c1', 'completed')];
    expect(derive(closed, { responses: subs, needsGrading: 2 }).line).toEqual({
      kind: 'needs-grading',
      count: 2,
    });
    expect(
      derive({ ...closed, scoreVisibility: 'score-only' }, { responses: subs })
        .line
    ).toEqual({ kind: 'done', scoresPublished: true, legacy: false });
  });
});

describe('main action (D8)', () => {
  const bellOn =
    (roster: string): QuizAssignedExtras['bellFor'] =>
    ({ rosterId }) =>
      rosterId === roster ? { openAt: NOW - MIN, closeAt: NOW + MIN } : null;

  it('acts on the class in session: Open, Resume or Monitor', () => {
    expect(derive(three({}, {}, {}), { bellFor: bellOn('r2') }).action).toEqual(
      {
        kind: 'open',
        classKey: 'c2',
        classLabel: 'P2',
      }
    );
    expect(
      derive(three({}, { state: 'paused' }, {}), { bellFor: bellOn('r2') })
        .action
    ).toMatchObject({ kind: 'resume', classKey: 'c2' });
    expect(
      derive(three({ state: 'open' }, { state: 'open' }, {}), {
        bellFor: bellOn('r2'),
      }).action
    ).toMatchObject({ kind: 'monitor', classKey: 'c2' });
  });

  it('skips a closed class in session', () => {
    expect(
      derive(three({ state: 'open' }, { closedAt: 1 }, {}), {
        bellFor: bellOn('r2'),
      }).action
    ).toMatchObject({ kind: 'monitor', classKey: 'c1' });
  });

  it('with no class in session: Monitor, Grade, Publish, Results or Choose class', () => {
    expect(derive(three({ state: 'open' }, {}, {})).action.kind).toBe(
      'monitor'
    );
    expect(derive(three({ state: 'paused' }, {}, {})).action.kind).toBe(
      'monitor'
    );
    expect(
      derive(three({ closedAt: 1 }, {}, {}), { needsGrading: 1 }).action.kind
    ).toBe('grade');
    const closed = three({ closedAt: 1 }, { closedAt: 2 }, { closedAt: 3 });
    const subs = [resp('c1', 'completed')];
    expect(derive(closed, { responses: subs }).action.kind).toBe('publish');
    expect(
      derive({ ...closed, scoreVisibility: 'score-only' }, { responses: subs })
        .action.kind
    ).toBe('results');
    expect(derive(three({}, {}, {})).action).toEqual({
      kind: 'choose-class',
      classKey: null,
      classLabel: null,
    });
    expect(derive(three({ closedAt: 1 }, { closedAt: 2 }, {})).action).toEqual({
      kind: 'open',
      classKey: 'c3',
      classLabel: 'P3',
    });
  });
});

describe('sort (D13)', () => {
  it('puts Open first, then Paused, Ready or Scheduled, Closed, then Done; newest first within a group', () => {
    const mk = (id: string, createdAt: number, a: Partial<QuizAssignment>) =>
      deriveAssignedStatus(
        quizAssignedInput(quiz({ id, createdAt, ...a }), loaded()),
        NOW
      );
    const rows = [
      mk('done', 900, {
        ...three({ closedAt: 1 }, { closedAt: 2 }, { closedAt: 700 }),
      }),
      mk('waiting', 500, {
        ...three({ closedAt: 1 }, { closedAt: 2 }, { closedAt: 3 }),
      }),
      mk('ready-old', 100, three({}, {}, {})),
      mk('ready-new', 300, three({}, {}, {})),
      mk('paused', 50, three({ state: 'paused' }, {}, {})),
      mk('open', 10, three({}, { state: 'open' }, {})),
      mk('legacy', 1, { status: 'inactive' }),
    ];
    const waiting = deriveAssignedStatus(
      quizAssignedInput(
        quiz({
          id: 'waiting',
          createdAt: 500,
          ...three({ closedAt: 1 }, { closedAt: 2 }, { closedAt: 3 }),
        }),
        loaded({ responses: [resp('c1', 'completed')] })
      ),
      NOW
    );
    rows[1] = waiting;
    expect([...rows].sort(compareAssigned).map((r) => r.id)).toEqual([
      'open',
      'paused',
      'ready-new',
      'ready-old',
      'waiting',
      'done',
      'legacy',
    ]);
  });
});

describe('class left open (D11)', () => {
  const T = new Date(2026, 10, 18, 14, 0).getTime();
  const HOUR = 60 * MIN;
  const YESTERDAY = new Date(2026, 10, 17, 9, 0).getTime();
  const bellAt = (openAt: number, closeAt: number) => () => ({
    openAt,
    closeAt,
  });
  const leftOpen = (a: Partial<QuizAssignment>, extras?: Extras, now = T) =>
    derive({ createdAt: T - 6 * HOUR, ...a }, extras, now).classes;

  it('flags an open class whose bell rang after it was opened', () => {
    const [c] = leftOpen(
      { periodAccess: { c1: row({ state: 'open', openedAt: T - 3 * HOUR }) } },
      { bellFor: bellAt(T - 3 * HOUR, T - 2 * HOUR) }
    );
    expect(c.leftOpenSince).toBe(T - 3 * HOUR);
  });

  it('does not flag a class still in its period or opened after the bell', () => {
    const during = leftOpen(
      { periodAccess: { c1: row({ state: 'open', openedAt: T - HOUR }) } },
      { bellFor: bellAt(T - HOUR, T + HOUR) }
    );
    const after = leftOpen(
      { periodAccess: { c1: row({ state: 'open', openedAt: T - HOUR }) } },
      { bellFor: bellAt(T - 3 * HOUR, T - 2 * HOUR) }
    );
    expect(during[0].leftOpenSince).toBeNull();
    expect(after[0].leftOpenSince).toBeNull();
  });

  it('flags a class with no bell only once it was opened on an earlier day', () => {
    const today = leftOpen({
      periodAccess: { c1: row({ state: 'open', openedAt: T - 4 * HOUR }) },
    });
    const earlier = leftOpen({
      periodAccess: { c1: row({ state: 'open', openedAt: YESTERDAY }) },
    });
    expect(today[0].leftOpenSince).toBeNull();
    expect(earlier[0].leftOpenSince).toBe(YESTERDAY);
  });

  it('reads an unstamped class as left open only once its bell has rung today', () => {
    const quiet = leftOpen({
      createdAt: YESTERDAY,
      periodAccess: { c1: row({ state: 'open' }) },
    });
    const rung = leftOpen(
      { createdAt: YESTERDAY, periodAccess: { c1: row({ state: 'open' }) } },
      { bellFor: bellAt(T - 3 * HOUR, T - 2 * HOUR) }
    );
    const windowed = leftOpen({
      periodAccess: { c1: row({ state: 'open', openAt: YESTERDAY }) },
    });
    expect(quiet[0].leftOpenSince).toBeNull();
    expect(rung[0].leftOpenSince).toBe(YESTERDAY);
    expect(windowed[0].leftOpenSince).toBe(YESTERDAY);
  });

  it('measures from a later scheduled start, not an older open stamp', () => {
    const [c] = leftOpen({
      periodAccess: {
        c1: row({ state: 'open', openedAt: YESTERDAY, openAt: T - HOUR }),
      },
    });
    expect(c.leftOpenSince).toBeNull();
  });

  it('never flags a class that closes itself, a paused class, or a view-only share', () => {
    const timed = leftOpen({
      periodAccess: {
        c1: row({ state: 'open', openedAt: YESTERDAY, closeAt: T + HOUR }),
        c2: row({ state: 'paused', openedAt: YESTERDAY }),
      },
    });
    const share = leftOpen({ mode: 'view-only', createdAt: YESTERDAY });
    expect(timed.map((c) => c.leftOpenSince)).toEqual([null, null]);
    expect(share[0].leftOpenSince).toBeNull();
  });

  it('flags a single-line assignment opened on an earlier day', () => {
    const at = (a: Partial<QuizAssignment>, openedAt?: number) =>
      deriveAssignedStatus(
        quizAssignedInput({ ...quiz(a), openedAt }, loaded()),
        T
      ).classes[0].leftOpenSince;
    expect(at({ createdAt: YESTERDAY }, YESTERDAY)).toBe(YESTERDAY);
    expect(at({ createdAt: YESTERDAY })).toBeNull();
    expect(
      at({ createdAt: YESTERDAY, status: 'paused' }, YESTERDAY)
    ).toBeNull();
  });
});

describe('class left open (D11) review cases', () => {
  const T = new Date(2026, 10, 18, 14, 0).getTime();
  const HOUR = 60 * MIN;
  it('reads a single line opened today from its open stamp, not the assigned time', () => {
    const yesterday = new Date(2026, 10, 17, 9, 0).getTime();
    const run = { ...quiz({ createdAt: yesterday }), openedAt: T - HOUR };
    const [c] = deriveAssignedStatus(
      quizAssignedInput(run, loaded()),
      T
    ).classes;
    expect(c.leftOpenSince).toBeNull();
  });

  it('finds the bell for a class row keyed by roster with no rosterId', () => {
    const seen: (string | undefined)[] = [];
    const [c] = deriveAssignedStatus(
      quizAssignedInput(
        quiz({
          createdAt: T - 6 * HOUR,
          periodAccess: {
            r9: { ...row({ state: 'open', openedAt: T - 3 * HOUR }) },
          },
        }),
        loaded({
          bellFor: ({ rosterId }) => {
            seen.push(rosterId);
            return rosterId === 'r9'
              ? { openAt: T - 3 * HOUR, closeAt: T - 2 * HOUR }
              : null;
          },
        })
      ),
      T
    ).classes;
    expect(seen).toEqual(['r9']);
    expect(c.leftOpenSince).toBe(T - 3 * HOUR);
  });
});
