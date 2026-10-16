// Run lifecycle shared by Quiz and Video Activity sessions, derived from the fields already stored.

export type LifecycleKind = 'quiz' | 'videoActivity';

export type AssignmentRunStatus = 'active' | 'paused' | 'inactive';

export type RunState =
  | { phase: 'waiting' }
  | { phase: 'active' }
  | { phase: 'paused'; resumeTo: 'waiting' | 'active' }
  | { phase: 'ended' };

export type LifecycleEvent =
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'resume'; to?: 'waiting' | 'active' }
  | { type: 'end' }
  | { type: 'reopen'; resumeTo?: 'waiting' | 'active' };

export type AssignmentLifecycleEvent = Exclude<
  LifecycleEvent,
  { type: 'start' }
>;

export interface StoredRunFields {
  status: unknown;
  /** Video Activity only: a paused assignment stores its session as `ended`. */
  assignmentStatus?: unknown;
  startedAt?: number | null;
  currentQuestionIndex?: number;
}

/** The run state a session's stored fields describe, or null for a status this kind never writes. */
export function deriveRunState(
  kind: LifecycleKind,
  fields: StoredRunFields
): RunState | null {
  const { status } = fields;
  if (status === 'waiting') return { phase: 'waiting' };
  if (status === 'active') return { phase: 'active' };
  if (kind === 'quiz') {
    if (status === 'ended') return { phase: 'ended' };
    if (status !== 'paused') return null;
    const neverStarted =
      fields.startedAt == null || (fields.currentQuestionIndex ?? 0) < 0;
    return { phase: 'paused', resumeTo: neverStarted ? 'waiting' : 'active' };
  }
  if (status !== 'ended') return null;
  return fields.assignmentStatus === 'paused'
    ? { phase: 'paused', resumeTo: 'active' }
    : { phase: 'ended' };
}

/** Whether students may join or keep working, judged on session status alone. */
export function acceptsStudents(
  kind: LifecycleKind,
  session: { status: unknown }
): boolean {
  if (kind === 'quiz') {
    const state = deriveRunState('quiz', {
      status: session.status,
      startedAt: null,
    });
    return state !== null && state.phase !== 'ended';
  }
  return session.status !== 'ended';
}

/** The next run state, or `state` itself when the event isn't allowed from it. */
export function transition(
  kind: LifecycleKind,
  state: RunState,
  event: LifecycleEvent,
  options: { teacherPaced?: boolean } = {}
): RunState {
  switch (event.type) {
    case 'start':
      return state.phase === 'waiting' ? { phase: 'active' } : state;
    case 'pause':
      if (state.phase === 'active') {
        if (kind === 'videoActivity' && options.teacherPaced) return state;
        return { phase: 'paused', resumeTo: 'active' };
      }
      if (state.phase === 'waiting' && kind === 'quiz') {
        return { phase: 'paused', resumeTo: 'waiting' };
      }
      return state;
    case 'resume':
      if (state.phase !== 'paused') return state;
      return kind === 'quiz' ? { phase: state.resumeTo } : { phase: 'active' };
    case 'end':
      return state.phase === 'ended' ? state : { phase: 'ended' };
    case 'reopen':
      if (state.phase !== 'ended') return state;
      return kind === 'quiz'
        ? { phase: 'paused', resumeTo: event.resumeTo ?? 'active' }
        : { phase: 'active' };
  }
}

/** The session fields every end writes; callers add their own extras. */
export function endSessionPatch(
  kind: LifecycleKind,
  now: number
): Record<string, unknown> {
  return kind === 'quiz'
    ? { status: 'ended', endedAt: now, autoProgressAt: null }
    : { status: 'ended', endedAt: now };
}

export interface AssignmentLifecyclePatches {
  assignmentStatus: AssignmentRunStatus;
  assignment: { status: AssignmentRunStatus; updatedAt: number };
  session: Record<string, unknown>;
}

/** The assignment and session writes for a teacher's Pause, Resume, End or Reopen, batched together by the caller. */
export function assignmentLifecyclePatches(
  kind: LifecycleKind,
  event: AssignmentLifecycleEvent,
  now: number
): AssignmentLifecyclePatches {
  const assignmentStatus: AssignmentRunStatus =
    event.type === 'end'
      ? 'inactive'
      : event.type === 'pause' || (event.type === 'reopen' && kind === 'quiz')
        ? 'paused'
        : 'active';
  return {
    assignmentStatus,
    assignment: { status: assignmentStatus, updatedAt: now },
    session: sessionPatchFor(kind, event, now),
  };
}

function sessionPatchFor(
  kind: LifecycleKind,
  event: AssignmentLifecycleEvent,
  now: number
): Record<string, unknown> {
  if (event.type === 'end') return endSessionPatch(kind, now);
  if (kind === 'videoActivity') {
    // A video session has no paused status, so Pause ends it and the paused assignment tells them apart.
    return event.type === 'pause'
      ? endSessionPatch(kind, now)
      : { status: 'active' };
  }
  if (event.type === 'pause') {
    return {
      status: 'paused',
      autoProgressAt: null,
      pausedAt: now,
      endedAt: null,
    };
  }
  if (event.type === 'reopen') {
    return { status: 'paused', autoProgressAt: null, endedAt: null };
  }
  return { status: event.to ?? 'active', endedAt: null };
}
