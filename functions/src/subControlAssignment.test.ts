import { describe, it, expect } from 'vitest';
import {
  handleControlSubAssignment,
  controlPatches,
  type ControlSubAssignmentInput,
} from './subControlAssignment';
import type { SubShareCaller } from './subShareAccess';

const NOW = 1_700_000_000_000;
const HOST = 'teacher-uid-1';
const SHARE = 'share-1';
const SESSION = 'session-1';

const SUB: SubShareCaller = {
  uid: 'sub-uid-1',
  email: 'Sub@orono.k12.mn.us',
  emailVerified: true,
  anonymous: false,
  studentRole: false,
};

const stamped = (over: Record<string, unknown> = {}) => ({
  teacherUid: HOST,
  launchedBy: { uid: SUB.uid, email: 'sub@orono.k12.mn.us', shareId: SHARE },
  subMonitorUids: [SUB.uid],
  subMonitorUntil: NOW + 86_400_000,
  status: 'active',
  ...over,
});

interface StubState {
  switchOn?: boolean;
  share?: Record<string, unknown> | null;
  session?: Record<string, unknown> | null;
  /** Response docs under the quiz session, by id. */
  responses?: Record<string, Record<string, unknown>>;
  collection?: string;
}

interface Written {
  path: string;
  data: Record<string, unknown>;
}

function stubDb(state: StubState = {}) {
  const {
    switchOn = true,
    share = {
      hostUid: HOST,
      intendedMode: 'substitute',
      expiresAt: NOW + 86_400_000,
      subEmails: ['sub@orono.k12.mn.us'],
    },
    session = stamped(),
    responses = {},
    collection = 'quiz_sessions',
  } = state;

  const written: Written[] = [];
  const docs: Record<string, Record<string, unknown> | null> = {
    'admin_settings/sub_launch_as_teacher': { enabled: switchOn },
    [`shared_collections/${SHARE}`]: share,
    [`${collection}/${SESSION}`]: session,
  };

  const responseDocs = Object.entries(responses).map(([id, data]) => ({
    ref: { path: `quiz_sessions/${SESSION}/responses/${id}` },
    data: () => data,
  }));

  const db = {
    doc: (path: string) => ({
      path,
      get: () =>
        Promise.resolve({
          exists: docs[path] != null,
          data: () => docs[path] ?? undefined,
        }),
    }),
    collection: (path: string) => ({
      path,
      limit: () => ({
        get: () =>
          Promise.resolve({
            docs: path.endsWith('/responses') ? responseDocs : [],
          }),
      }),
    }),
    batch: () => ({
      update: (ref: { path: string }, data: Record<string, unknown>) => {
        written.push({ path: ref.path, data });
      },
      commit: () => Promise.resolve(),
    }),
  };
  return { db: db as never, written };
}

const deps = { now: () => NOW };

const input = (over: Partial<ControlSubAssignmentInput> = {}) => ({
  shareId: SHARE,
  sessionId: SESSION,
  kind: 'quiz',
  action: 'end',
  ...over,
});

const control = (
  state: StubState = {},
  data: unknown = input(),
  caller: SubShareCaller | null = SUB
) => {
  const { db, written } = stubDb(state);
  return {
    written,
    run: () => handleControlSubAssignment(db, caller, data, deps),
  };
};

describe('handleControlSubAssignment — ending a quiz', () => {
  it('ends the run and the teacher’s row with it', async () => {
    const { run, written } = control();

    const result = await run();

    expect(result).toEqual({ state: 'ended' });
    expect(written.map((w) => w.path)).toEqual([
      `quiz_sessions/${SESSION}`,
      `users/${HOST}/quiz_assignments/${SESSION}`,
    ]);
    expect(written[0].data).toEqual({
      status: 'ended',
      endedAt: NOW,
      autoProgressAt: null,
    });
    expect(written[1].data.status).toBe('ended');
  });

  // A student still answering when the sub ends the run would otherwise never
  // reach the teacher's results.
  it('marks the students still working as completed', async () => {
    const { run, written } = control({
      responses: {
        a: { status: 'in-progress' },
        b: { status: 'joined' },
        c: { status: 'completed' },
      },
    });

    await run();

    const finalized = written.filter((w) => w.path.includes('/responses/'));
    expect(finalized.map((w) => w.path.split('/').pop())).toEqual(['a', 'b']);
    expect(finalized[0].data.status).toBe('completed');
    expect(finalized[0].data.submittedAt).toBe(NOW);
    // The attempt bump: without it a rejoin reads 0 completed and slips past
    // the cap.
    expect(finalized[0].data.completedAttempts).toBeTruthy();
  });
});

describe('handleControlSubAssignment — pausing', () => {
  it('pauses and resumes a quiz on both docs', async () => {
    const paused = control({}, input({ action: 'pause' }));
    expect(await paused.run()).toEqual({ state: 'paused' });
    expect(paused.written[0].data).toEqual({
      status: 'paused',
      autoProgressAt: null,
      endedAt: null,
    });
    expect(paused.written[1].data.status).toBe('paused');

    const resumed = control(
      { session: stamped({ status: 'paused' }) },
      input({ action: 'resume' })
    );
    expect(await resumed.run()).toEqual({ state: 'active' });
    expect(resumed.written[0].data).toEqual({ status: 'active' });
  });

  // The other three kinds have no paused state, so a pause would write a
  // status nothing reads.
  it('refuses to pause anything but a quiz', async () => {
    for (const kind of ['videoActivity', 'guidedLearning', 'flashcards']) {
      await expect(
        control(
          { collection: 'x' },
          input({ kind: kind as 'videoActivity', action: 'pause' })
        ).run()
      ).rejects.toThrow('Only a quiz can be paused');
    }
  });
});

describe('handleControlSubAssignment — the other three kinds', () => {
  it('ends a video activity the way its own teacher control does', async () => {
    const { run, written } = control(
      { collection: 'video_activity_sessions' },
      input({ kind: 'videoActivity' })
    );

    await run();

    expect(written[0].path).toBe(`video_activity_sessions/${SESSION}`);
    expect(written[0].data).toEqual({
      status: 'ended',
      endedAt: NOW,
      expiresAt: NOW,
    });
    expect(written[1].path).toBe(
      `users/${HOST}/video_activity_assignments/${SESSION}`
    );
  });

  it('ends a flashcard run', async () => {
    const { run, written } = control(
      { collection: 'flashcard_sessions' },
      input({ kind: 'flashcards' })
    );

    await run();

    expect(written[0].path).toBe(`flashcard_sessions/${SESSION}`);
    expect(written[0].data.status).toBe('ended');
    expect(written[1].data.endedAt).toBe(NOW);
  });

  // A guided session has no status field at all; students are gated on the
  // close time, and archiving is the teacher's own filing action.
  it('ends a guided activity by closing it, not archiving it', async () => {
    const { run, written } = control(
      {
        collection: 'guided_learning_sessions',
        session: stamped({ status: undefined }),
      },
      input({ kind: 'guidedLearning' })
    );

    await run();

    expect(written[0].data).toEqual({ closeAt: NOW });
    expect(written[1].data).toEqual({ closeAt: NOW, updatedAt: NOW });
    expect(JSON.stringify(written)).not.toContain('archived');
  });
});

describe('handleControlSubAssignment — who may act', () => {
  it('refuses anyone but a verified district staff account', async () => {
    await expect(control({}, input(), null).run()).rejects.toThrow(
      'Sign in first'
    );
    await expect(
      control({}, input(), { ...SUB, anonymous: true }).run()
    ).rejects.toThrow('staff accounts');
    await expect(
      control({}, input(), { ...SUB, emailVerified: false }).run()
    ).rejects.toThrow('verified district account');
    await expect(
      control({}, input(), { ...SUB, email: 'sub@example.com' }).run()
    ).rejects.toThrow('verified district account');
  });

  it('refuses while the org switch is off', async () => {
    await expect(control({ switchOn: false }).run()).rejects.toThrow(
      'is turned off'
    );
  });

  it('refuses an expired share, or one that does not name them', async () => {
    await expect(
      control({
        share: {
          hostUid: HOST,
          intendedMode: 'substitute',
          expiresAt: NOW - 1,
          subEmails: ['sub@orono.k12.mn.us'],
        },
      }).run()
    ).rejects.toThrow('has expired');
    await expect(
      control({
        share: {
          hostUid: HOST,
          intendedMode: 'substitute',
          expiresAt: NOW + 1000,
          subEmails: ['other@orono.k12.mn.us'],
        },
      }).run()
    ).rejects.toThrow('does not name you');
  });

  // The session id is the only thing the caller names, so every other check
  // has to come off the run itself.
  it('refuses a run belonging to another teacher', async () => {
    await expect(
      control({ session: stamped({ teacherUid: 'someone-else' }) }).run()
    ).rejects.toThrow('does not belong to this share');
  });

  it('refuses a run started from a different share', async () => {
    await expect(
      control({
        session: stamped({
          launchedBy: { uid: SUB.uid, email: 'x', shareId: 'other-share' },
        }),
      }).run()
    ).rejects.toThrow('was not started from this share');
  });

  it('refuses a sub who did not start it, and the teacher’s own runs', async () => {
    await expect(
      control({ session: stamped({ subMonitorUids: ['another-sub'] }) }).run()
    ).rejects.toThrow('who started a run');
    await expect(
      control({ session: { teacherUid: HOST, status: 'active' } }).run()
    ).rejects.toThrow('was not started from this share');
  });

  it('refuses once the monitor window has passed', async () => {
    await expect(
      control({ session: stamped({ subMonitorUntil: NOW - 1 }) }).run()
    ).rejects.toThrow('Your time on that run has ended');
  });

  it('refuses a run that no longer exists', async () => {
    await expect(control({ session: null }).run()).rejects.toThrow(
      'no longer exists'
    );
  });
});

describe('handleControlSubAssignment — a run already over', () => {
  it('treats a second end as done, and writes nothing', async () => {
    const { run, written } = control({ session: stamped({ status: 'ended' }) });

    expect(await run()).toEqual({ state: 'ended' });
    expect(written).toEqual([]);
  });

  it('refuses to pause a run that has ended', async () => {
    await expect(
      control(
        { session: stamped({ status: 'ended' }) },
        input({ action: 'pause' })
      ).run()
    ).rejects.toThrow('already ended');
  });

  it('reads a closed guided activity as ended', async () => {
    const { run, written } = control(
      {
        collection: 'guided_learning_sessions',
        session: stamped({ status: undefined, closeAt: NOW - 1 }),
      },
      input({ kind: 'guidedLearning' })
    );

    expect(await run()).toEqual({ state: 'ended' });
    expect(written).toEqual([]);
  });
});

describe('handleControlSubAssignment — the request itself', () => {
  it('refuses a kind or an action it does not know', async () => {
    await expect(
      control({}, input({ kind: 'poll' as 'quiz' })).run()
    ).rejects.toThrow('cannot be controlled from a share');
    await expect(
      control({}, input({ action: 'delete' as 'end' })).run()
    ).rejects.toThrow('action must be pause, resume or end');
  });

  it('refuses an id that is a path', async () => {
    await expect(
      control({}, input({ sessionId: 'a/b' })).run()
    ).rejects.toThrow('must not be a path');
  });
});

describe('controlPatches', () => {
  // Every kind's end has to leave the same two docs the teacher's own control
  // leaves, so the shape is worth pinning on its own.
  it('never writes a status a guided session does not have', () => {
    expect(controlPatches('guidedLearning', 'end', NOW).session.status).toBe(
      undefined
    );
  });

  it('ends every other kind with a status and a time', () => {
    for (const kind of ['quiz', 'videoActivity', 'flashcards'] as const) {
      const { session, state } = controlPatches(kind, 'end', NOW);
      expect(session.status).toBe('ended');
      expect(session.endedAt).toBe(NOW);
      expect(state).toBe('ended');
    }
  });
});
