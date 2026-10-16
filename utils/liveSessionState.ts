import type { LiveSession, LiveStudent, WidgetType } from '@/types';

/** The teacher's broadcast, derived from the stored `sessions/{teacherUid}` doc. */
export type LiveSessionState =
  | { kind: 'idle' }
  | { kind: 'ended' }
  | {
      kind: 'live';
      widgetId: string | null;
      widgetType: WidgetType | null;
      frozen: boolean;
      code: string;
    };

export function deriveLiveSessionState(
  session: LiveSession | null
): LiveSessionState {
  if (!session) return { kind: 'idle' };
  if (session.isActive !== true) return { kind: 'ended' };
  return {
    kind: 'live',
    widgetId: session.activeWidgetId,
    widgetType: session.activeWidgetType,
    frozen: session.frozen,
    code: session.code,
  };
}

export function isWidgetLive(
  state: LiveSessionState,
  widgetId: string
): boolean {
  return state.kind === 'live' && state.widgetId === widgetId;
}

/** Going live while already live switches the broadcast in place; otherwise it starts fresh. */
export function startKind(state: LiveSessionState): 'switch' | 'fresh' {
  return state.kind === 'live' ? 'switch' : 'fresh';
}

/** This student's own roster record, as the student tab knows it. */
export type StudentConnection =
  | { kind: 'notJoined' }
  | { kind: 'joined'; studentId: string; pin: string; frozen: boolean };

export interface LiveSessionHookState {
  session: LiveSession | null;
  loading: boolean;
  students: LiveStudent[];
  connection: StudentConnection;
}

export type LiveSessionEvent =
  | { type: 'sessionSnapshot'; session: LiveSession | null }
  | { type: 'sessionError' }
  | { type: 'targetCleared' }
  | { type: 'rosterSnapshot'; students: LiveStudent[] }
  | { type: 'rosterCleared' }
  | { type: 'joined'; studentId: string; pin: string }
  | { type: 'myRecordSnapshot'; studentId: string; record: LiveStudent | null }
  | { type: 'left' };

const NOT_JOINED: StudentConnection = { kind: 'notJoined' };

export function initialLiveSessionState(
  role: 'teacher' | 'student',
  joinCode: string | undefined
): LiveSessionHookState {
  return {
    session: null,
    loading: role === 'teacher' || !!joinCode,
    students: [],
    connection: NOT_JOINED,
  };
}

const sameStudent = (a: LiveStudent, b: LiveStudent) =>
  a.id === b.id &&
  a.pin === b.pin &&
  a.status === b.status &&
  a.joinedAt === b.joinedAt &&
  a.lastActive === b.lastActive;

/** Keeps the previous array when a snapshot carries the same roster, so the canvas doesn't re-render. */
function nextRoster(prev: LiveStudent[], next: LiveStudent[]): LiveStudent[] {
  if (prev.length !== next.length) return next;
  if (next.every((s, i) => sameStudent(prev[i], s))) return prev;
  const prevById = new Map(prev.map((s) => [s.id, s]));
  for (const s of next) {
    const before = prevById.get(s.id);
    if (!before || !sameStudent(before, s)) return next;
  }
  return prev;
}

export function liveSessionReducer(
  state: LiveSessionHookState,
  event: LiveSessionEvent
): LiveSessionHookState {
  switch (event.type) {
    case 'sessionSnapshot':
      return { ...state, session: event.session, loading: false };
    case 'sessionError':
      return state.loading ? { ...state, loading: false } : state;
    case 'targetCleared':
      return { ...state, session: null, loading: false };
    case 'rosterSnapshot': {
      const students = nextRoster(state.students, event.students);
      return students === state.students ? state : { ...state, students };
    }
    case 'rosterCleared':
      return state.students.length === 0 ? state : { ...state, students: [] };
    case 'joined':
      return {
        ...state,
        connection: {
          kind: 'joined',
          studentId: event.studentId,
          pin: event.pin,
          frozen: false,
        },
      };
    case 'myRecordSnapshot': {
      const { connection } = state;
      if (
        connection.kind !== 'joined' ||
        connection.studentId !== event.studentId
      ) {
        return state;
      }
      // A missing record means the teacher removed this student or started fresh.
      if (!event.record) {
        return { ...state, connection: NOT_JOINED };
      }
      return {
        ...state,
        connection: {
          ...connection,
          pin: event.record.pin,
          frozen: event.record.status === 'frozen',
        },
      };
    }
    case 'left':
      if (state.connection.kind !== 'joined') return state;
      // Keep the session: its listener stays on the same code, so a rejoin needs it.
      return { ...state, connection: NOT_JOINED };
  }
}

/** What the student's screen shows; an ended session looks the same as one not started yet. */
export type StudentView =
  | { kind: 'initializing' }
  | { kind: 'lobby' }
  | { kind: 'waiting' }
  | { kind: 'frozen'; scope: 'class' | 'self' }
  | { kind: 'watching'; widgetId: string };

export function deriveStudentView(input: {
  authInitialized: boolean;
  joinedCode: string | null;
  connection: StudentConnection;
  session: LiveSession | null;
}): StudentView {
  const { authInitialized, joinedCode, connection, session } = input;
  if (!authInitialized) return { kind: 'initializing' };
  if (!joinedCode || connection.kind !== 'joined') return { kind: 'lobby' };
  const live = deriveLiveSessionState(session);
  if (live.kind !== 'live' || !live.widgetId) return { kind: 'waiting' };
  if (live.frozen) return { kind: 'frozen', scope: 'class' };
  if (connection.frozen) return { kind: 'frozen', scope: 'self' };
  return { kind: 'watching', widgetId: live.widgetId };
}
