import { describe, expect, it } from 'vitest';
import {
  acceptsStudents,
  assignmentLifecyclePatches,
  type AssignmentLifecycleEvent,
  deriveRunState,
  endSessionPatch,
  transition,
  type LifecycleEvent,
  type LifecycleKind,
  type RunState,
} from '@/utils/sessionLifecycle';
import { controlPatches } from '@/functions/src/subControlPatches';

const NOW = 1_700_000_000_000;

const WAITING: RunState = { phase: 'waiting' };
const ACTIVE: RunState = { phase: 'active' };
const PAUSED_ACTIVE: RunState = { phase: 'paused', resumeTo: 'active' };
const PAUSED_LOBBY: RunState = { phase: 'paused', resumeTo: 'waiting' };
const ENDED: RunState = { phase: 'ended' };

const STATES: RunState[] = [
  WAITING,
  ACTIVE,
  PAUSED_ACTIVE,
  PAUSED_LOBBY,
  ENDED,
];
const EVENTS: LifecycleEvent[] = [
  { type: 'start' },
  { type: 'pause' },
  { type: 'resume' },
  { type: 'end' },
  { type: 'reopen' },
];

type Machine = { kind: LifecycleKind; teacherPaced: boolean; name: string };
const MACHINES: Machine[] = [
  { kind: 'quiz', teacherPaced: false, name: 'quiz' },
  { kind: 'videoActivity', teacherPaced: false, name: 'self-paced video' },
  { kind: 'videoActivity', teacherPaced: true, name: 'live video' },
];

// Every allowed move, keyed `${state}|${event}`; anything missing must be a no-op.
const label = (s: RunState): string =>
  s.phase === 'paused' ? `paused:${s.resumeTo}` : s.phase;

const ALLOWED: Record<string, Record<string, RunState>> = {
  quiz: {
    'waiting|start': ACTIVE,
    'waiting|pause': PAUSED_LOBBY,
    'waiting|end': ENDED,
    'active|pause': PAUSED_ACTIVE,
    'active|end': ENDED,
    'paused:active|resume': ACTIVE,
    'paused:active|end': ENDED,
    'paused:waiting|resume': WAITING,
    'paused:waiting|end': ENDED,
    'ended|reopen': PAUSED_ACTIVE,
  },
  'self-paced video': {
    'waiting|start': ACTIVE,
    'waiting|end': ENDED,
    'active|pause': PAUSED_ACTIVE,
    'active|end': ENDED,
    'paused:active|resume': ACTIVE,
    'paused:active|end': ENDED,
    'paused:waiting|resume': ACTIVE,
    'paused:waiting|end': ENDED,
    'ended|reopen': ACTIVE,
  },
  'live video': {
    'waiting|start': ACTIVE,
    'waiting|end': ENDED,
    'active|end': ENDED,
    'paused:active|resume': ACTIVE,
    'paused:active|end': ENDED,
    'paused:waiting|resume': ACTIVE,
    'paused:waiting|end': ENDED,
    'ended|reopen': ACTIVE,
  },
};

describe('transition', () => {
  for (const machine of MACHINES) {
    describe(machine.name, () => {
      for (const state of STATES) {
        for (const event of EVENTS) {
          const key = `${label(state)}|${event.type}`;
          const expected = ALLOWED[machine.name][key];
          it(`${key} → ${expected ? label(expected) : 'unchanged'}`, () => {
            const next = transition(machine.kind, state, event, {
              teacherPaced: machine.teacherPaced,
            });
            if (expected) {
              expect(next).toEqual(expected);
            } else {
              expect(next).toBe(state);
            }
          });
        }
      }
    });
  }

  it('quiz reopen keeps the lobby when the run is reset to the lobby', () => {
    expect(
      transition('quiz', ENDED, { type: 'reopen', resumeTo: 'waiting' })
    ).toEqual(PAUSED_LOBBY);
  });
});

describe('deriveRunState', () => {
  it('reads each quiz status', () => {
    expect(deriveRunState('quiz', { status: 'waiting' })).toEqual(WAITING);
    expect(deriveRunState('quiz', { status: 'active' })).toEqual(ACTIVE);
    expect(deriveRunState('quiz', { status: 'ended' })).toEqual(ENDED);
  });

  it('a paused quiz resumes to the lobby until a question has been shown', () => {
    expect(
      deriveRunState('quiz', {
        status: 'paused',
        startedAt: null,
        currentQuestionIndex: -1,
      })
    ).toEqual(PAUSED_LOBBY);
    expect(
      deriveRunState('quiz', {
        status: 'paused',
        startedAt: NOW,
        currentQuestionIndex: -1,
      })
    ).toEqual(PAUSED_LOBBY);
    expect(
      deriveRunState('quiz', {
        status: 'paused',
        startedAt: NOW,
        currentQuestionIndex: 2,
      })
    ).toEqual(PAUSED_ACTIVE);
  });

  it('a quiz with an unknown status has no run state', () => {
    expect(deriveRunState('quiz', { status: 'archived' })).toBeNull();
    expect(deriveRunState('quiz', { status: undefined })).toBeNull();
  });

  it('a video session stored as ended reads as paused while its assignment is paused', () => {
    expect(
      deriveRunState('videoActivity', {
        status: 'ended',
        assignmentStatus: 'paused',
      })
    ).toEqual(PAUSED_ACTIVE);
    expect(
      deriveRunState('videoActivity', {
        status: 'ended',
        assignmentStatus: 'inactive',
      })
    ).toEqual(ENDED);
    expect(deriveRunState('videoActivity', { status: 'ended' })).toEqual(ENDED);
    expect(deriveRunState('videoActivity', { status: 'waiting' })).toEqual(
      WAITING
    );
    expect(deriveRunState('videoActivity', { status: 'active' })).toEqual(
      ACTIVE
    );
    expect(deriveRunState('videoActivity', { status: 'paused' })).toBeNull();
  });
});

describe('acceptsStudents', () => {
  it('quiz joins are open while waiting, active or paused', () => {
    expect(acceptsStudents('quiz', { status: 'waiting' })).toBe(true);
    expect(acceptsStudents('quiz', { status: 'active' })).toBe(true);
    expect(acceptsStudents('quiz', { status: 'paused' })).toBe(true);
    expect(acceptsStudents('quiz', { status: 'ended' })).toBe(false);
    expect(acceptsStudents('quiz', { status: undefined })).toBe(false);
  });

  it('video joins are refused only once the session is ended', () => {
    expect(acceptsStudents('videoActivity', { status: 'waiting' })).toBe(true);
    expect(acceptsStudents('videoActivity', { status: 'active' })).toBe(true);
    expect(acceptsStudents('videoActivity', { status: 'ended' })).toBe(false);
    expect(acceptsStudents('videoActivity', { status: undefined })).toBe(true);
  });
});

describe('teacher and student disagreements', () => {
  it('a paused video run looks ended to a student, who has no assignment to read', () => {
    const teacher = deriveRunState('videoActivity', {
      status: 'ended',
      assignmentStatus: 'paused',
    });
    expect(teacher?.phase).toBe('paused');
    expect(acceptsStudents('videoActivity', { status: 'ended' })).toBe(false);
  });

  it('a stale tab cannot resume or pause a quiz that another tab ended', () => {
    expect(transition('quiz', ENDED, { type: 'resume' })).toBe(ENDED);
    expect(transition('quiz', ENDED, { type: 'pause' })).toBe(ENDED);
  });

  it('Next cannot move a paused quiz on; only Resume does', () => {
    expect(transition('quiz', PAUSED_ACTIVE, { type: 'start' })).toBe(
      PAUSED_ACTIVE
    );
  });

  it('ending twice is the same end', () => {
    for (const kind of ['quiz', 'videoActivity'] as const) {
      expect(transition(kind, ENDED, { type: 'end' })).toBe(ENDED);
    }
  });

  it('a live video run has no pause', () => {
    expect(
      transition(
        'videoActivity',
        ACTIVE,
        { type: 'pause' },
        {
          teacherPaced: true,
        }
      )
    ).toBe(ACTIVE);
  });
});

describe('endSessionPatch', () => {
  it('a quiz end also stops any pending auto-advance', () => {
    expect(endSessionPatch('quiz', NOW)).toEqual({
      status: 'ended',
      endedAt: NOW,
      autoProgressAt: null,
    });
  });

  it('a video end stamps the end time', () => {
    expect(endSessionPatch('videoActivity', NOW)).toEqual({
      status: 'ended',
      endedAt: NOW,
    });
  });
});

describe('assignmentLifecyclePatches', () => {
  it('quiz pause, resume, end and reopen write what the hooks wrote before', () => {
    expect(assignmentLifecyclePatches('quiz', { type: 'pause' }, NOW)).toEqual({
      assignmentStatus: 'paused',
      assignment: { status: 'paused', updatedAt: NOW },
      session: {
        status: 'paused',
        autoProgressAt: null,
        pausedAt: NOW,
        endedAt: null,
      },
    });
    expect(assignmentLifecyclePatches('quiz', { type: 'resume' }, NOW)).toEqual(
      {
        assignmentStatus: 'active',
        assignment: { status: 'active', updatedAt: NOW },
        session: { status: 'active', endedAt: null },
      }
    );
    expect(
      assignmentLifecyclePatches('quiz', { type: 'resume', to: 'waiting' }, NOW)
        .session
    ).toEqual({ status: 'waiting', endedAt: null });
    expect(assignmentLifecyclePatches('quiz', { type: 'end' }, NOW)).toEqual({
      assignmentStatus: 'inactive',
      assignment: { status: 'inactive', updatedAt: NOW },
      session: { status: 'ended', endedAt: NOW, autoProgressAt: null },
    });
    expect(assignmentLifecyclePatches('quiz', { type: 'reopen' }, NOW)).toEqual(
      {
        assignmentStatus: 'paused',
        assignment: { status: 'paused', updatedAt: NOW },
        session: { status: 'paused', autoProgressAt: null, endedAt: null },
      }
    );
  });

  it('video pause ends the session and keeps the assignment paused', () => {
    expect(
      assignmentLifecyclePatches('videoActivity', { type: 'pause' }, NOW)
    ).toEqual({
      assignmentStatus: 'paused',
      assignment: { status: 'paused', updatedAt: NOW },
      session: { status: 'ended', endedAt: NOW },
    });
  });

  it('video resume and reopen set the session active without clearing endedAt', () => {
    for (const type of ['resume', 'reopen'] as const) {
      expect(
        assignmentLifecyclePatches('videoActivity', { type }, NOW)
      ).toEqual({
        assignmentStatus: 'active',
        assignment: { status: 'active', updatedAt: NOW },
        session: { status: 'active' },
      });
    }
  });

  it('video end files the assignment as inactive', () => {
    expect(
      assignmentLifecyclePatches('videoActivity', { type: 'end' }, NOW)
    ).toEqual({
      assignmentStatus: 'inactive',
      assignment: { status: 'inactive', updatedAt: NOW },
      session: { status: 'ended', endedAt: NOW },
    });
  });

  it('a patch moves the derived state the way the transition does', () => {
    const cases: [LifecycleKind, RunState, AssignmentLifecycleEvent][] = [
      ['quiz', ACTIVE, { type: 'pause' }],
      ['quiz', PAUSED_ACTIVE, { type: 'resume' }],
      ['quiz', ACTIVE, { type: 'end' }],
      ['quiz', ENDED, { type: 'reopen' }],
      ['videoActivity', ACTIVE, { type: 'pause' }],
      ['videoActivity', PAUSED_ACTIVE, { type: 'resume' }],
      ['videoActivity', ACTIVE, { type: 'end' }],
      ['videoActivity', ENDED, { type: 'reopen' }],
    ];
    for (const [kind, from, event] of cases) {
      const patch = assignmentLifecyclePatches(kind, event, NOW);
      const written = deriveRunState(kind, {
        status: patch.session.status,
        assignmentStatus: patch.assignmentStatus,
        startedAt: NOW,
        currentQuestionIndex: 0,
      });
      expect(written).toEqual(transition(kind, from, event));
    }
  });
});

describe('the sub control function writes the same patches', () => {
  it('end', () => {
    for (const kind of ['quiz', 'videoActivity'] as const) {
      const server = controlPatches(kind, 'end', NOW);
      const client = assignmentLifecyclePatches(kind, { type: 'end' }, NOW);
      expect(server.session).toEqual(client.session);
      expect(server.assignment).toEqual(client.assignment);
    }
  });

  it('quiz pause', () => {
    const server = controlPatches('quiz', 'pause', NOW);
    const client = assignmentLifecyclePatches('quiz', { type: 'pause' }, NOW);
    expect(server.session).toEqual(client.session);
    expect(server.assignment).toEqual(client.assignment);
  });
});
