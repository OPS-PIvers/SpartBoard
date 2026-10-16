// Pure session and assignment patches for controlSubAssignmentV1; utils/sessionLifecycle.ts parity is tested in tests/utils/sessionLifecycle.test.ts.

export const CONTROLLABLE_KINDS = [
  'quiz',
  'videoActivity',
  'guidedLearning',
  'flashcards',
] as const;
export type ControlKind = (typeof CONTROLLABLE_KINDS)[number];

export const ACTIONS = ['pause', 'resume', 'end'] as const;
export type ControlAction = (typeof ACTIONS)[number];

export type ControlState = 'paused' | 'active' | 'ended';

export interface Patches {
  session: Record<string, unknown>;
  assignment: Record<string, unknown>;
  state: ControlState;
}

/**
 * What each kind's own teacher-side control writes, mirrored field for field
 * so a sub-ended run looks exactly like a teacher-ended one.
 */
export function controlPatches(
  kind: ControlKind,
  action: ControlAction,
  now: number
): Patches {
  if (action === 'pause') {
    // Only a quiz has a paused state; the others are active or ended.
    return {
      session: {
        status: 'paused',
        autoProgressAt: null,
        endedAt: null,
        pausedAt: now,
      },
      assignment: { status: 'paused', updatedAt: now },
      state: 'paused',
    };
  }
  if (action === 'resume') {
    // A sub-launched quiz is always self-paced, so active is where it resumes
    // to; there is no teacher-paced question index to restore.
    return {
      session: { status: 'active' },
      assignment: { status: 'active', updatedAt: now },
      state: 'active',
    };
  }
  if (kind === 'guidedLearning') {
    // A guided session has no status of its own: students are gated on the
    // close time. Archiving is the teacher's own filing action, not this.
    return {
      session: { closeAt: now },
      assignment: { closeAt: now, updatedAt: now },
      state: 'ended',
    };
  }
  if (kind === 'videoActivity') {
    return {
      session: { status: 'ended', endedAt: now },
      assignment: { status: 'inactive', updatedAt: now },
      state: 'ended',
    };
  }
  if (kind === 'flashcards') {
    return {
      session: { status: 'ended', endedAt: now, updatedAt: now },
      assignment: { status: 'ended', endedAt: now, updatedAt: now },
      state: 'ended',
    };
  }
  // A quiz and a video activity file their assignment as `inactive`, which is
  // the archived bucket the teacher's manager filters on; only the session ends.
  return {
    session: { status: 'ended', endedAt: now, autoProgressAt: null },
    assignment: { status: 'inactive', updatedAt: now },
    state: 'ended',
  };
}
