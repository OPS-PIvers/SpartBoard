import { describe, it, expect } from 'vitest';
import type { LiveSession, LiveStudent } from '@/types';
import {
  deriveLiveSessionState,
  deriveStudentView,
  initialLiveSessionState,
  isWidgetLive,
  liveSessionReducer,
  startKind,
  type LiveSessionEvent,
  type LiveSessionHookState,
  type StudentConnection,
} from '@/utils/liveSessionState';

const session = (over: Partial<LiveSession> = {}): LiveSession => ({
  id: 'teacher-1',
  isActive: true,
  activeWidgetId: 'w1',
  activeWidgetType: 'clock',
  code: 'ABC123',
  frozen: false,
  createdAt: 1,
  ...over,
});

const record = (over: Partial<LiveStudent> = {}): LiveStudent => ({
  id: 'stu-1',
  pin: '1234',
  status: 'active',
  joinedAt: 1,
  lastActive: 1,
  ...over,
});

const joined = (frozen = false): StudentConnection => ({
  kind: 'joined',
  studentId: 'stu-1',
  pin: '1234',
  frozen,
});

const base = (
  over: Partial<LiveSessionHookState> = {}
): LiveSessionHookState => ({
  session: null,
  loading: false,
  students: [],
  connection: { kind: 'notJoined' },
  ...over,
});

const run = (state: LiveSessionHookState, events: LiveSessionEvent[]) =>
  events.reduce(liveSessionReducer, state);

const view = (
  state: LiveSessionHookState,
  joinedCode: string | null = 'teacher-1'
) =>
  deriveStudentView({
    authInitialized: true,
    joinedCode,
    connection: state.connection,
    session: state.session,
  });

describe('deriveLiveSessionState (teacher broadcast)', () => {
  it('is idle with no session doc', () => {
    expect(deriveLiveSessionState(null)).toEqual({ kind: 'idle' });
  });

  it('is ended when the doc exists but is not active', () => {
    expect(
      deriveLiveSessionState(session({ isActive: false, activeWidgetId: null }))
    ).toEqual({ kind: 'ended' });
  });

  it('is live with the broadcast widget, freeze and code', () => {
    expect(deriveLiveSessionState(session({ frozen: true }))).toEqual({
      kind: 'live',
      widgetId: 'w1',
      widgetType: 'clock',
      frozen: true,
      code: 'ABC123',
    });
  });

  it('marks only the broadcast widget live', () => {
    const live = deriveLiveSessionState(session());
    expect(isWidgetLive(live, 'w1')).toBe(true);
    expect(isWidgetLive(live, 'w2')).toBe(false);
    expect(
      isWidgetLive(deriveLiveSessionState(session({ isActive: false })), 'w1')
    ).toBe(false);
    expect(isWidgetLive({ kind: 'idle' }, 'w1')).toBe(false);
  });

  it('switches in place only while live, otherwise starts fresh', () => {
    expect(startKind(deriveLiveSessionState(session()))).toBe('switch');
    expect(
      startKind(deriveLiveSessionState(session({ isActive: false })))
    ).toBe('fresh');
    expect(startKind({ kind: 'idle' })).toBe('fresh');
  });
});

describe('initialLiveSessionState', () => {
  it('loads for a teacher and for a student with a code, not for a student without one', () => {
    expect(initialLiveSessionState('teacher', undefined).loading).toBe(true);
    expect(initialLiveSessionState('student', 'teacher-1').loading).toBe(true);
    expect(initialLiveSessionState('student', undefined).loading).toBe(false);
    expect(initialLiveSessionState('teacher', undefined).connection).toEqual({
      kind: 'notJoined',
    });
  });
});

describe('liveSessionReducer: allowed transitions', () => {
  it('sessionSnapshot stores the doc (or null) and stops loading', () => {
    const s = session();
    expect(
      run(base({ loading: true }), [{ type: 'sessionSnapshot', session: s }])
    ).toEqual(base({ session: s }));
    expect(
      run(base({ session: s, loading: true }), [
        { type: 'sessionSnapshot', session: null },
      ])
    ).toEqual(base());
  });

  it('sessionError stops loading and keeps the last session', () => {
    const s = session();
    expect(
      run(base({ session: s, loading: true }), [{ type: 'sessionError' }])
    ).toEqual(base({ session: s }));
  });

  it('targetCleared drops the session and stops loading', () => {
    expect(
      run(base({ session: session(), loading: true }), [
        { type: 'targetCleared' },
      ])
    ).toEqual(base());
  });

  it('rosterSnapshot replaces a changed roster and rosterCleared empties it', () => {
    const a = record({ id: 'a' });
    const s1 = run(base(), [{ type: 'rosterSnapshot', students: [a] }]);
    expect(s1.students).toEqual([a]);
    const s2 = run(s1, [
      { type: 'rosterSnapshot', students: [{ ...a, status: 'frozen' }] },
    ]);
    expect(s2.students[0].status).toBe('frozen');
    expect(run(s2, [{ type: 'rosterCleared' }]).students).toEqual([]);
  });

  it('rosterSnapshot keeps the same array when only the order changed', () => {
    const a = record({ id: 'a' });
    const b = record({ id: 'b', pin: '9' });
    const s1 = run(base(), [{ type: 'rosterSnapshot', students: [a, b] }]);
    const s2 = run(s1, [
      { type: 'rosterSnapshot', students: [{ ...b }, { ...a }] },
    ]);
    expect(s2).toBe(s1);
  });

  it('joined connects the student, unfrozen', () => {
    expect(
      run(base(), [{ type: 'joined', studentId: 'stu-1', pin: '1234' }])
        .connection
    ).toEqual(joined());
  });

  it('myRecordSnapshot follows the teacher freeze, unfreeze and disconnect', () => {
    const s = base({ connection: joined() });
    const frozen = run(s, [
      {
        type: 'myRecordSnapshot',
        studentId: 'stu-1',
        record: record({ status: 'frozen' }),
      },
    ]);
    expect(frozen.connection).toEqual(joined(true));
    const thawed = run(frozen, [
      {
        type: 'myRecordSnapshot',
        studentId: 'stu-1',
        record: record({ status: 'active' }),
      },
    ]);
    expect(thawed.connection).toEqual(joined(false));
    const disconnected = run(frozen, [
      {
        type: 'myRecordSnapshot',
        studentId: 'stu-1',
        record: record({ status: 'disconnected' }),
      },
    ]);
    expect(disconnected.connection).toEqual(joined(false));
  });

  it('myRecordSnapshot picks up the pin from the record', () => {
    const s = run(base({ connection: joined() }), [
      {
        type: 'myRecordSnapshot',
        studentId: 'stu-1',
        record: record({ pin: '77' }),
      },
    ]);
    expect(s.connection).toEqual({ ...joined(), pin: '77' });
  });

  it('a missing record (removed) returns the student to the lobby and keeps the session', () => {
    const s = run(base({ connection: joined(true), session: session() }), [
      { type: 'myRecordSnapshot', studentId: 'stu-1', record: null },
    ]);
    expect(s.connection).toEqual({ kind: 'notJoined' });
    expect(s.session).toEqual(session());
  });

  it('left disconnects the student and keeps the session', () => {
    const s = run(base({ connection: joined(true), session: session() }), [
      { type: 'left' },
    ]);
    expect(s.connection).toEqual({ kind: 'notJoined' });
    expect(s.session).toEqual(session());
  });
});

describe('liveSessionReducer: disallowed events leave state unchanged', () => {
  const cases: [string, LiveSessionHookState, LiveSessionEvent][] = [
    ['left before joining', base({ session: session() }), { type: 'left' }],
    [
      'a record snapshot before joining',
      base({ session: session() }),
      {
        type: 'myRecordSnapshot',
        studentId: 'stu-1',
        record: record({ status: 'frozen' }),
      },
    ],
    [
      'a removal before joining',
      base({ session: session() }),
      { type: 'myRecordSnapshot', studentId: 'stu-1', record: null },
    ],
    [
      "another student's record",
      base({ connection: joined(), session: session() }),
      {
        type: 'myRecordSnapshot',
        studentId: 'stu-2',
        record: record({ id: 'stu-2', status: 'frozen' }),
      },
    ],
    [
      "another student's removal",
      base({ connection: joined(), session: session() }),
      { type: 'myRecordSnapshot', studentId: 'stu-2', record: null },
    ],
    ['clearing an empty roster', base(), { type: 'rosterCleared' }],
    [
      'a session error when not loading',
      base({ session: session() }),
      { type: 'sessionError' },
    ],
    [
      'an identical roster',
      base({ students: [record()] }),
      { type: 'rosterSnapshot', students: [record()] },
    ],
  ];

  it.each(cases)('%s', (_label, state, event) => {
    expect(liveSessionReducer(state, event)).toBe(state);
  });
});

describe('deriveStudentView', () => {
  it('waits for auth, then shows the lobby until joined', () => {
    expect(
      deriveStudentView({
        authInitialized: false,
        joinedCode: 'teacher-1',
        connection: joined(),
        session: session(),
      })
    ).toEqual({ kind: 'initializing' });
    expect(view(base({ session: session() }))).toEqual({ kind: 'lobby' });
    expect(
      view(base({ connection: joined(), session: session() }), null)
    ).toEqual({
      kind: 'lobby',
    });
  });

  it('waits when no session, an ended session, or no broadcast widget', () => {
    expect(view(base({ connection: joined() }))).toEqual({ kind: 'waiting' });
    expect(
      view(
        base({ connection: joined(), session: session({ isActive: false }) })
      )
    ).toEqual({ kind: 'waiting' });
    expect(
      view(
        base({
          connection: joined(),
          session: session({ activeWidgetId: null }),
        })
      )
    ).toEqual({ kind: 'waiting' });
  });

  it('a class freeze wins over a personal freeze', () => {
    expect(
      view(
        base({ connection: joined(true), session: session({ frozen: true }) })
      )
    ).toEqual({ kind: 'frozen', scope: 'class' });
    expect(
      view(base({ connection: joined(true), session: session() }))
    ).toEqual({
      kind: 'frozen',
      scope: 'self',
    });
  });

  it('a frozen student whose session ended waits rather than staying frozen', () => {
    expect(
      view(
        base({
          connection: joined(true),
          session: session({ isActive: false, frozen: true }),
        })
      )
    ).toEqual({ kind: 'waiting' });
  });

  it('watches the broadcast widget', () => {
    expect(view(base({ connection: joined(), session: session() }))).toEqual({
      kind: 'watching',
      widgetId: 'w1',
    });
  });
});

describe('teacher/student disagreement', () => {
  const watching = () =>
    run(base({ loading: true }), [
      { type: 'sessionSnapshot', session: session() },
      { type: 'joined', studentId: 'stu-1', pin: '1234' },
      { type: 'myRecordSnapshot', studentId: 'stu-1', record: record() },
    ]);

  it('teacher ends while the student watches: the student waits, still joined', () => {
    const s = run(watching(), [
      {
        type: 'sessionSnapshot',
        session: session({ isActive: false, activeWidgetId: null }),
      },
      {
        type: 'myRecordSnapshot',
        studentId: 'stu-1',
        record: record({ status: 'disconnected' }),
      },
    ]);
    expect(view(s)).toEqual({ kind: 'waiting' });
    expect(s.connection.kind).toBe('joined');
  });

  it('teacher ends and goes live fresh: the wiped record sends the student back to the lobby', () => {
    const s = run(watching(), [
      {
        type: 'sessionSnapshot',
        session: session({ isActive: false, activeWidgetId: null }),
      },
      {
        type: 'sessionSnapshot',
        session: session({ activeWidgetId: 'w2', code: 'NEW999' }),
      },
      { type: 'myRecordSnapshot', studentId: 'stu-1', record: null },
    ]);
    expect(view(s)).toEqual({ kind: 'lobby' });
  });

  it('teacher switches the broadcast widget: the student follows without rejoining', () => {
    const s = run(watching(), [
      {
        type: 'sessionSnapshot',
        session: session({ activeWidgetId: 'w2', activeWidgetType: 'poll' }),
      },
    ]);
    expect(view(s)).toEqual({ kind: 'watching', widgetId: 'w2' });
    expect(s.connection).toEqual(joined());
  });

  it('teacher removes a frozen student: back to the lobby, not stuck frozen', () => {
    const s = run(watching(), [
      {
        type: 'myRecordSnapshot',
        studentId: 'stu-1',
        record: record({ status: 'frozen' }),
      },
      { type: 'myRecordSnapshot', studentId: 'stu-1', record: null },
    ]);
    expect(s.connection).toEqual({ kind: 'notJoined' });
    expect(view(s)).toEqual({ kind: 'lobby' });
  });

  it('a removed student gets the session back from the next session snapshot but stays in the lobby', () => {
    const s = run(watching(), [
      { type: 'myRecordSnapshot', studentId: 'stu-1', record: null },
      { type: 'sessionSnapshot', session: session() },
    ]);
    expect(view(s)).toEqual({ kind: 'lobby' });
  });

  it('class freeze lifted while personally frozen: the student stays frozen', () => {
    const s = run(watching(), [
      {
        type: 'myRecordSnapshot',
        studentId: 'stu-1',
        record: record({ status: 'frozen' }),
      },
      { type: 'sessionSnapshot', session: session({ frozen: true }) },
    ]);
    expect(view(s)).toEqual({ kind: 'frozen', scope: 'class' });
    const lifted = run(s, [
      { type: 'sessionSnapshot', session: session({ frozen: false }) },
    ]);
    expect(view(lifted)).toEqual({ kind: 'frozen', scope: 'self' });
  });

  it('student leaves while frozen: back to the lobby', () => {
    const s = run(watching(), [
      {
        type: 'myRecordSnapshot',
        studentId: 'stu-1',
        record: record({ status: 'frozen' }),
      },
      { type: 'left' },
    ]);
    expect(view(s)).toEqual({ kind: 'lobby' });
  });

  it('the session doc is deleted while the student watches: the student waits', () => {
    const s = run(watching(), [{ type: 'sessionSnapshot', session: null }]);
    expect(view(s)).toEqual({ kind: 'waiting' });
  });
});
