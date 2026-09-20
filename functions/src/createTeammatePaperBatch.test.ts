// Unit tests for the delegated paper-print WRITE path
// (docs/plans/PLC_DELEGATED_PAPER_PRINTING.md §5.2, §5.3).
//
// This is the half that writes into a colleague's account, so what is pinned
// here is what that write may and may not be: seats derived from their real
// roster rather than from the caller's ids (D16), a copy created and rolled
// back as one unit (D9), a spares-only fallback instead of a failure (D19),
// and a withdraw that stops at the first scanned sheet (D22).

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldValue: { serverTimestamp: () => 'server-timestamp' },
  }),
}));

vi.mock('firebase-functions/v2/https', () => {
  class FakeHttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    onCall: (_opts: unknown, handler: unknown) => handler,
    HttpsError: FakeHttpsError,
  };
});
vi.mock('./functionsInit', () => ({}));
vi.mock('./classlinkShared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./classlinkShared')>()),
  ALLOWED_ORIGINS: [],
}));

const joinSyncGroup = vi.fn();
vi.mock('./plcQuizSyncJoin', () => ({
  handleJoinPlcQuizSyncGroup: (...args: unknown[]) =>
    joinSyncGroup(...args) as unknown,
}));

import {
  handleCreateTeammatePaperBatch,
  handleWithdrawTeammatePaperBatch,
  type TeammatePrintWriteDeps,
} from './createTeammatePaperBatch';
import type { DelegatedPrintCaller } from './getTeammatePrintContext';

type Doc = Record<string, unknown>;
type Db = Parameters<typeof handleCreateTeammatePaperBatch>[0];

const PLC_ID = 'plc-1';
const PLC_QUIZ_ID = 'plc-quiz-1';
const GROUP_ID = 'group-1';
const CALLER_UID = 'teacher-helper';
const TARGET_UID = 'teacher-away';
const THEIR_QUIZ_ID = 'their-quiz-id';
const ROSTER_ID = 'roster-1';
const DRIVE_FILE_ID = 'drive-quiz-file';
const ROSTER_FILE_ID = 'drive-roster-file';
const NOW = 1_700_000_000_000;

const caller: DelegatedPrintCaller = {
  uid: CALLER_UID,
  studentRole: false,
  anonymous: false,
};

const INPUT = {
  plcId: PLC_ID,
  targetUid: TARGET_UID,
  plcQuizId: PLC_QUIZ_ID,
  selections: [{ rosterId: ROSTER_ID, studentIds: ['s1', 's2'] }],
  spareCount: 2,
};

interface Row {
  id: string;
  data: Doc;
}
interface State {
  docs: Record<string, Doc>;
  collections: Record<string, Row[]>;
  /** Paths whose `update` should reject, for the partial-failure paths. */
  failUpdateAt?: (path: string) => boolean;
}

interface Writes {
  sets: Array<{ path: string; data: Doc }>;
  updates: Array<{ path: string; data: Doc }>;
  deletes: string[];
}

function makeDb(state: State): { db: Db; writes: Writes } {
  const writes: Writes = { sets: [], updates: [], deletes: [] };
  const collectionRef = (path: string): Record<string, unknown> => {
    const self: Record<string, unknown> = {
      // Query builders are identity: each test supplies exactly the rows the
      // real query would have matched.
      doc: (id?: string) => docRef(`${path}/${id ?? 'generated-id'}`),
      where: () => self,
      orderBy: () => self,
      limit: () => self,
      get: () => {
        const docs = (state.collections[path] ?? []).map((d) => ({
          id: d.id,
          data: () => d.data,
        }));
        return Promise.resolve({ docs, empty: docs.length === 0 });
      },
    };
    return self;
  };
  const docRef = (path: string): Record<string, unknown> => ({
    path,
    id: path.split('/').pop(),
    get: () =>
      Promise.resolve({
        exists: state.docs[path] !== undefined,
        data: () => state.docs[path],
      }),
    set: (data: Doc) => {
      writes.sets.push({ path, data });
      state.docs[path] = data;
      return Promise.resolve();
    },
    update: (data: Doc) => {
      if (state.failUpdateAt?.(path))
        return Promise.reject(new Error(`update failed: ${path}`));
      writes.updates.push({ path, data });
      state.docs[path] = { ...(state.docs[path] ?? {}), ...data };
      return Promise.resolve();
    },
    delete: () => {
      writes.deletes.push(path);
      delete state.docs[path];
      return Promise.resolve();
    },
    collection: (sub: string) => collectionRef(`${path}/${sub}`),
  });
  const tx = {
    get: (target: { get: () => Promise<unknown> }) => target.get(),
    set: (ref: { set: (d: Doc) => void }, data: Doc) => ref.set(data),
    update: (ref: { update: (d: Doc) => void }, data: Doc) => ref.update(data),
    delete: (ref: { delete: () => void }) => ref.delete(),
  };
  return {
    db: {
      doc: (path: string) => docRef(path),
      collection: (path: string) => collectionRef(path),
      // Single-threaded stub: the handler's transaction body runs once, which
      // is enough to pin what it reads and writes.
      runTransaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    } as unknown as Db,
    writes,
  };
}

const member = (role: string, displayName: string) => ({
  role,
  status: 'active',
  displayName,
});

const QUESTIONS = [
  {
    id: 'q1',
    type: 'MC',
    text: 'Capital of France?',
    correctAnswer: 'Paris',
    incorrectAnswers: ['Lyon', 'Nice'],
  },
  {
    id: 'q2',
    type: 'MC',
    text: 'Water boils at 100C',
    correctAnswer: 'True',
    incorrectAnswers: ['False'],
  },
  { id: 'q3', type: 'FIB', text: 'Explain', correctAnswer: 'anything' },
];

const ROSTER_FILE = {
  version: 2,
  students: [
    {
      id: 's1',
      firstName: 'Ada',
      lastName: 'Byron',
      pin: '07',
      email: 'ada@school.edu',
    },
    { id: 's2', firstName: 'Alan', lastName: 'Turing', pin: '12' },
    { id: 's3', firstName: 'Grace', lastName: 'Hopper', pin: '19' },
  ],
};

function baseState(over: Partial<State> = {}): State {
  return {
    docs: {
      'admin_settings/paper_answer_sheets': { enabled: true },
      'admin_settings/plc_delegated_printing': { enabled: true },
      [`plcs/${PLC_ID}`]: {
        members: {
          [CALLER_UID]: member('member', 'Helper Teacher'),
          [TARGET_UID]: member('lead', 'Away Teacher'),
        },
        memberUids: [CALLER_UID, TARGET_UID],
      },
      [`plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`]: { syncGroupId: GROUP_ID },
      [`synced_quizzes/${GROUP_ID}`]: {
        title: 'Unit 3 Common Assessment',
        questions: QUESTIONS,
        version: 2,
      },
      ...(over.docs ?? {}),
    },
    collections: {
      [`users/${TARGET_UID}/quizzes`]: [
        {
          id: THEIR_QUIZ_ID,
          data: {
            title: 'Unit 3 Common Assessment',
            driveFileId: DRIVE_FILE_ID,
            sync: { groupId: GROUP_ID },
          },
        },
      ],
      [`users/${TARGET_UID}/rosters`]: [
        {
          id: ROSTER_ID,
          data: {
            name: 'Period 3',
            driveFileId: ROSTER_FILE_ID,
            studentCount: 3,
          },
        },
      ],
      ...(over.collections ?? {}),
    },
  };
}

function deps(over: Partial<TeammatePrintWriteDeps> = {}) {
  const writeDriveJson = vi.fn(() => Promise.resolve('new-drive-file'));
  const trashDriveFile = vi.fn(() => Promise.resolve());
  return {
    getAccessToken: () => Promise.resolve('token'),
    readDriveJson: (_t: string, fileId: string) =>
      Promise.resolve(
        fileId === ROSTER_FILE_ID
          ? ROSTER_FILE
          : { id: THEIR_QUIZ_ID, title: 'Their copy', questions: QUESTIONS }
      ),
    writeDriveJson,
    trashDriveFile,
    ...over,
  } as TeammatePrintWriteDeps & {
    writeDriveJson: typeof writeDriveJson;
    trashDriveFile: typeof trashDriveFile;
  };
}

const NO_GRANT = {
  getAccessToken: () =>
    Promise.reject(new Error('needs-consent: no refresh token stored')),
};

const create = (
  state: State,
  d: TeammatePrintWriteDeps,
  input: unknown = INPUT,
  who: DelegatedPrintCaller | null = caller
) => {
  const { db, writes } = makeDb(state);
  return {
    writes,
    run: () => handleCreateTeammatePaperBatch(db, who, input, d, NOW),
  };
};

const batchWrite = (writes: Writes) =>
  writes.sets.find((w) => w.path.includes('/paper_batches/'));

beforeEach(() => {
  joinSyncGroup.mockReset();
  joinSyncGroup.mockResolvedValue({
    groupId: GROUP_ID,
    version: 4,
    alreadyJoined: false,
  });
});

describe('createTeammatePaperBatchV1 — authorization', () => {
  it('refuses an unauthenticated caller', async () => {
    const { run } = create(baseState(), deps(), INPUT, null);
    await expect(run()).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('refuses a student account', async () => {
    const { run } = create(baseState(), deps(), INPUT, {
      ...caller,
      studentRole: true,
    });
    await expect(run()).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('refuses a viewer, who may not act on PLC content', async () => {
    const state = baseState();
    (state.docs[`plcs/${PLC_ID}`].members as Record<string, unknown>)[
      CALLER_UID
    ] = member('viewer', 'Helper Teacher');
    const { run } = create(state, deps());
    await expect(run()).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('refuses when the org kill switch is off', async () => {
    const state = baseState({
      docs: { 'admin_settings/plc_delegated_printing': { enabled: false } },
    });
    const { run } = create(state, deps());
    await expect(run()).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('refuses when the PLC has turned the feature off', async () => {
    const state = baseState();
    state.docs[`plcs/${PLC_ID}`].features = { printForTeammates: false };
    const { run } = create(state, deps());
    await expect(run()).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('refuses a target who is not in the PLC', async () => {
    const state = baseState();
    state.docs[`plcs/${PLC_ID}`].members = {
      [CALLER_UID]: member('member', 'Helper Teacher'),
    };
    state.docs[`plcs/${PLC_ID}`].memberUids = [CALLER_UID];
    const { run } = create(state, deps());
    await expect(run()).rejects.toMatchObject({ code: 'not-found' });
  });

  it('rejects a spare count outside the printable range', async () => {
    const { run } = create(baseState(), deps(), {
      ...INPUT,
      spareCount: 500,
    });
    await expect(run()).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('createTeammatePaperBatchV1 — the batch it writes', () => {
  it('seats the picked students and stamps who printed it', async () => {
    const { run, writes } = create(baseState(), deps());
    const result = await run();

    const written = batchWrite(writes);
    expect(written?.path).toBe(
      `users/${TARGET_UID}/paper_batches/${result.batch.id}`
    );
    expect(result.batch.quizId).toBe(THEIR_QUIZ_ID);
    expect(result.batch.printedByUid).toBe(CALLER_UID);
    expect(result.batch.printedByName).toBe('Helper Teacher');
    expect(result.batch.printedAt).toBe(NOW);
    expect(Object.values(result.batch.seats)).toEqual([
      { rosterId: ROSTER_ID, studentId: 's1' },
      { rosterId: ROSTER_ID, studentId: 's2' },
    ]);
    expect(result.batch.spareSeats).toHaveLength(2);
    expect(result.printedForTeacherName).toBe('Away Teacher');
  });

  it('derives the question and choice counts from the quiz, not the caller', async () => {
    const { run } = create(baseState(), deps());
    const result = await run();
    // q3 is free response and never reaches a bubble row.
    expect(result.batch.questionCount).toBe(2);
    expect(result.batch.choiceCount).toBe(3);
    expect(result.testPaper.map((r) => r.row)).toEqual([1, 2]);
  });

  it('never seats a student id the target does not actually have', async () => {
    const { run } = create(baseState(), deps(), {
      ...INPUT,
      selections: [
        { rosterId: ROSTER_ID, studentIds: ['s1', 'someone-elses-student'] },
      ],
    });
    const result = await run();
    expect(Object.values(result.batch.seats)).toEqual([
      { rosterId: ROSTER_ID, studentId: 's1' },
    ]);
  });

  it('keeps PINs and emails out of everything it writes or returns', async () => {
    const { run, writes } = create(baseState(), deps());
    const result = await run();
    const serialized = JSON.stringify({ result, writes });
    expect(serialized).not.toContain('"pin"');
    expect(serialized).not.toContain('school.edu');
    expect(serialized).not.toContain('"19"');
  });

  it('prints from their own copy without needing the shared group doc', async () => {
    const state = baseState();
    delete state.docs[`synced_quizzes/${GROUP_ID}`];
    const { run } = create(state, deps());
    const result = await run();
    expect(result.quizTitle).toBe('Their copy');
  });

  it('refuses a class the target no longer has', async () => {
    const { run } = create(baseState(), deps(), {
      ...INPUT,
      selections: [{ rosterId: 'deleted-roster', studentIds: ['s1'] }],
    });
    await expect(run()).rejects.toMatchObject({ code: 'not-found' });
  });

  it('refuses a quiz with nothing bubbleable on it', async () => {
    const state = baseState();
    state.collections[`users/${TARGET_UID}/quizzes`] = [];
    state.docs[`synced_quizzes/${GROUP_ID}`] = {
      title: 'Essay only',
      questions: [{ id: 'q1', type: 'FIB', correctAnswer: 'x' }],
    };
    const { run } = create(state, deps());
    await expect(run()).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('refuses a run that would print nothing at all', async () => {
    const { run } = create(baseState(), deps(), {
      ...INPUT,
      selections: [{ rosterId: ROSTER_ID, studentIds: [] }],
      spareCount: 0,
    });
    await expect(run()).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('logs who printed for whom in the PLC feed', async () => {
    const { run, writes } = create(baseState(), deps());
    await run();
    const activity = writes.sets.find((w) =>
      w.path.startsWith(`plcs/${PLC_ID}/activity/`)
    );
    expect(activity?.data).toMatchObject({
      type: 'paper_printed',
      actorUid: CALLER_UID,
      actorName: 'Helper Teacher',
    });
    expect(String(activity?.data.targetTitle)).toContain('Away Teacher');
  });
});

describe('createTeammatePaperBatchV1 — no personal copy yet (D9)', () => {
  it('creates their copy, joins the sync group and binds the batch to it', async () => {
    const state = baseState();
    state.collections[`users/${TARGET_UID}/quizzes`] = [];
    const d = deps();
    const { run, writes } = create(state, d);
    const result = await run();

    expect(d.writeDriveJson).toHaveBeenCalledTimes(1);
    expect(joinSyncGroup).toHaveBeenCalledWith(
      expect.anything(),
      TARGET_UID,
      PLC_ID,
      PLC_QUIZ_ID
    );
    const quizWrite = writes.sets.find((w) =>
      w.path.startsWith(`users/${TARGET_UID}/quizzes/`)
    );
    expect(quizWrite?.data).toMatchObject({
      driveFileId: 'new-drive-file',
      title: 'Unit 3 Common Assessment',
    });
    expect(writes.updates[0]?.data).toEqual({
      sync: { groupId: GROUP_ID, lastSyncedVersion: 4 },
    });
    expect(result.createdCopy).toBe(true);
    expect(result.batch.quizId).toBe(quizWrite?.path.split('/').pop());
  });

  // A rejected print must leave nothing behind: the copy and the sync-group
  // join are durable changes to an absent colleague's account, and there is no
  // stack to show for them if the run never gets that far.
  it.each([
    [
      'the quiz has nothing bubbleable on it',
      (state: State) => {
        state.docs[`synced_quizzes/${GROUP_ID}`] = {
          title: 'Essay only',
          questions: [{ id: 'q1', type: 'FIB', correctAnswer: 'x' }],
        };
        return INPUT;
      },
    ],
    [
      'a selected class no longer exists',
      () => ({
        ...INPUT,
        selections: [{ rosterId: 'deleted-roster', studentIds: ['s1'] }],
      }),
    ],
    [
      'nothing at all was selected',
      () => ({ ...INPUT, selections: [], spareCount: 0 }),
    ],
  ])('writes nothing when %s', async (_label, prepare) => {
    const state = baseState();
    state.collections[`users/${TARGET_UID}/quizzes`] = [];
    const d = deps();
    const { run, writes } = create(state, d, prepare(state));

    await expect(run()).rejects.toThrow();
    expect(writes.sets).toHaveLength(0);
    expect(writes.updates).toHaveLength(0);
    expect(d.writeDriveJson).not.toHaveBeenCalled();
    expect(joinSyncGroup).not.toHaveBeenCalled();
  });

  it('binds to a copy another teammate created while this run was in flight', async () => {
    const state = baseState();
    state.collections[`users/${TARGET_UID}/quizzes`] = [];
    // A concurrent print lands between our empty read and our claim.
    const d = deps({
      writeDriveJson: vi.fn(() => {
        state.collections[`users/${TARGET_UID}/quizzes`] = [
          {
            id: 'their-quiz-from-the-other-run',
            data: { driveFileId: 'x', sync: { groupId: GROUP_ID } },
          },
        ];
        return Promise.resolve('new-drive-file');
      }),
    } as Partial<TeammatePrintWriteDeps>);
    const { run, writes } = create(state, d);
    const result = await run();

    // No second copy in their library, and ours is cleaned up after itself.
    expect(
      writes.sets.filter((w) => w.path.includes('/quizzes/'))
    ).toHaveLength(0);
    expect(d.trashDriveFile).toHaveBeenCalledWith('token', 'new-drive-file');
    expect(joinSyncGroup).not.toHaveBeenCalled();
    expect(result.createdCopy).toBe(false);
    expect(result.batch.quizId).toBe('their-quiz-from-the-other-run');
  });

  it('claims the copy with its sync linkage already set', async () => {
    const state = baseState();
    state.collections[`users/${TARGET_UID}/quizzes`] = [];
    const { run, writes } = create(state, deps());
    await run();
    const quizWrite = writes.sets.find((w) =>
      w.path.startsWith(`users/${TARGET_UID}/quizzes/`)
    );
    expect(quizWrite?.data.sync).toEqual({
      groupId: GROUP_ID,
      lastSyncedVersion: 2,
    });
  });

  // The join has landed by the time the version refinement runs, so undoing the
  // copy there would strand the target in the participants map with no quiz.
  it('keeps the joined copy when only the version refinement fails', async () => {
    const state = baseState();
    state.collections[`users/${TARGET_UID}/quizzes`] = [];
    state.failUpdateAt = (path) => path.includes('/quizzes/');
    const d = deps();
    const { run, writes } = create(state, d);
    const result = await run();

    expect(result.createdCopy).toBe(true);
    expect(writes.deletes).toHaveLength(0);
    expect(d.trashDriveFile).not.toHaveBeenCalled();
    // The stack still printed, bound to the copy that was created.
    expect(batchWrite(writes)).toBeDefined();
  });

  it('rolls the copy back when the sync join fails', async () => {
    const state = baseState();
    state.collections[`users/${TARGET_UID}/quizzes`] = [];
    joinSyncGroup.mockRejectedValue(new Error('removed mid-flow'));
    const d = deps();
    const { run, writes } = create(state, d);

    await expect(run()).rejects.toThrow('removed mid-flow');
    expect(writes.deletes.some((p) => p.includes('/quizzes/'))).toBe(true);
    expect(d.trashDriveFile).toHaveBeenCalledWith('token', 'new-drive-file');
    expect(batchWrite(writes)).toBeUndefined();
  });

  it('blocks when there is no copy and no way to make one (D20)', async () => {
    const state = baseState();
    state.collections[`users/${TARGET_UID}/quizzes`] = [];
    const { run, writes } = create(state, deps(NO_GRANT));
    await expect(run()).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(writes.sets).toHaveLength(0);
  });
});

describe('createTeammatePaperBatchV1 — no Drive grant (D19)', () => {
  it('prints an unnamed stack sized to the class instead of failing', async () => {
    const { run } = create(baseState(), deps(NO_GRANT));
    const result = await run();
    // Three students, no names: three unnamed sheets plus the two spares asked for.
    expect(result.batch.seats).toEqual({});
    expect(result.batch.spareSeats).toHaveLength(5);
    expect(result.batch.rosterIds).toEqual([ROSTER_ID]);
    expect(result.sheets.every((s) => s.student === null)).toBe(true);
  });
});

describe('withdrawTeammatePaperBatchV1 (D22)', () => {
  const BATCH_ID = 'batch-1';
  const WITHDRAW = {
    plcId: PLC_ID,
    targetUid: TARGET_UID,
    plcQuizId: PLC_QUIZ_ID,
    batchId: BATCH_ID,
  };

  const withdrawState = (batch: Doc | undefined): State => {
    const state = baseState();
    if (batch)
      state.docs[`users/${TARGET_UID}/paper_batches/${BATCH_ID}`] = batch;
    return state;
  };

  const run = (state: State, who: DelegatedPrintCaller | null = caller) => {
    const { db, writes } = makeDb(state);
    return {
      writes,
      go: () => handleWithdrawTeammatePaperBatch(db, who, WITHDRAW),
    };
  };

  it('deletes a stack the caller printed and nobody has scanned', async () => {
    const state = withdrawState({
      quizId: THEIR_QUIZ_ID,
      printedByUid: CALLER_UID,
    });
    const { go, writes } = run(state);
    await expect(go()).resolves.toEqual({ deleted: true });
    expect(writes.deletes).toEqual([
      `users/${TARGET_UID}/paper_batches/${BATCH_ID}`,
    ]);
  });

  it('refuses a stack someone else printed', async () => {
    const state = withdrawState({
      quizId: THEIR_QUIZ_ID,
      printedByUid: 'a-different-helper',
    });
    const { go, writes } = run(state);
    await expect(go()).rejects.toMatchObject({ code: 'permission-denied' });
    expect(writes.deletes).toHaveLength(0);
  });

  it('refuses a self-printed stack, which carries no printedByUid', async () => {
    const { go } = run(withdrawState({ quizId: THEIR_QUIZ_ID }));
    await expect(go()).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('refuses once a sheet from the run has been scanned', async () => {
    const state = withdrawState({
      quizId: THEIR_QUIZ_ID,
      printedByUid: CALLER_UID,
    });
    state.collections[`users/${TARGET_UID}/quiz_assignments`] = [
      { id: 'assignment-1', data: { quizId: THEIR_QUIZ_ID } },
    ];
    state.collections['quiz_sessions/assignment-1/responses'] = [
      { id: 'r1', data: { paperBatchId: BATCH_ID } },
    ];
    const { go, writes } = run(state);
    await expect(go()).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(writes.deletes).toHaveLength(0);
  });

  it('refuses a batch with no quiz on it, which cannot be checked for scans', async () => {
    const { go, writes } = run(withdrawState({ printedByUid: CALLER_UID }));
    await expect(go()).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(writes.deletes).toHaveLength(0);
  });

  it('reports a batch that is already gone', async () => {
    const { go } = run(withdrawState(undefined));
    await expect(go()).rejects.toMatchObject({ code: 'not-found' });
  });
});
