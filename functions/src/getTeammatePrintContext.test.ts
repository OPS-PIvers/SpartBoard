// Unit tests for the delegated paper-print read path
// (docs/plans/PLC_DELEGATED_PAPER_PRINTING.md §5.1).
//
// Two things are worth pinning here and nothing else is: the §4 authorization
// ladder — this is the app's first act-for-another-teacher path, so each of the
// five checks has to fail on its own — and the D5 PII boundary, because a
// student's PIN is a join credential and the roster JSON this reads carries it.

import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(),
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

import {
  handleGetTeammatePrintContext,
  type DelegatedPrintCaller,
  type TeammatePrintDeps,
} from './getTeammatePrintContext';

type Doc = Record<string, unknown>;
type Db = Parameters<typeof handleGetTeammatePrintContext>[0];

const PLC_ID = 'plc-1';
const PLC_QUIZ_ID = 'plc-quiz-1';
const GROUP_ID = 'group-1';
const CALLER_UID = 'teacher-helper';
const TARGET_UID = 'teacher-away';

const INPUT = {
  plcId: PLC_ID,
  targetUid: TARGET_UID,
  plcQuizId: PLC_QUIZ_ID,
};

const caller: DelegatedPrintCaller = {
  uid: CALLER_UID,
  studentRole: false,
  anonymous: false,
};

interface State {
  docs: Record<string, Doc>;
  collections: Record<string, { id: string; data: Doc }[]>;
}

function makeDb(state: State): Db {
  const collectionRef = (path: string): Record<string, unknown> => {
    const self: Record<string, unknown> = {
      doc: (id: string) => docRef(`${path}/${id}`),
      // Query builders are identity here — each test supplies exactly the rows
      // the real query would have matched.
      where: () => self,
      orderBy: () => self,
      limit: () => self,
      get: () =>
        Promise.resolve({
          docs: (state.collections[path] ?? []).map((d) => ({
            id: d.id,
            data: () => d.data,
          })),
        }),
    };
    return self;
  };
  const docRef = (path: string): Record<string, unknown> => ({
    path,
    get: () =>
      Promise.resolve({
        exists: state.docs[path] !== undefined,
        data: () => state.docs[path],
      }),
    collection: (sub: string) => collectionRef(`${path}/${sub}`),
  });
  return {
    doc: (path: string) => docRef(path),
    collection: (path: string) => collectionRef(path),
  } as unknown as Db;
}

const member = (role: string, displayName: string) => ({
  role,
  status: 'active',
  displayName,
});

/** Both switches on, both teachers active members, the quiz shared. */
function baseState(overrides: Partial<State> = {}): State {
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
        questions: [{ id: 'q1', correctAnswer: 'B' }],
      },
      ...(overrides.docs ?? {}),
    },
    collections: overrides.collections ?? {},
  };
}

const DRIVE_FILE_ID = 'drive-quiz-file';
const ROSTER_FILE_ID = 'drive-roster-file';

/** The target holds their own copy, with a roster carrying PINs and emails. */
function stateWithCopy(extra: Partial<State> = {}): State {
  const base = baseState(extra);
  return {
    ...base,
    collections: {
      [`users/${TARGET_UID}/quizzes`]: [
        {
          id: 'their-quiz-id',
          data: {
            title: 'Unit 3 Common Assessment',
            driveFileId: DRIVE_FILE_ID,
            sync: { groupId: GROUP_ID },
          },
        },
      ],
      [`users/${TARGET_UID}/rosters`]: [
        {
          id: 'roster-1',
          data: {
            name: 'Period 3',
            driveFileId: ROSTER_FILE_ID,
            studentCount: 2,
          },
        },
      ],
      ...base.collections,
      ...(extra.collections ?? {}),
    },
  };
}

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
  ],
};

const QUIZ_FILE = {
  id: 'their-quiz-id',
  title: 'Unit 3 Common Assessment (their copy)',
  questions: [{ id: 'q1', correctAnswer: 'B' }],
};

function deps(over: Partial<TeammatePrintDeps> = {}): TeammatePrintDeps {
  return {
    getAccessToken: () => Promise.resolve('token'),
    readDriveJson: (_token, fileId) =>
      Promise.resolve(fileId === ROSTER_FILE_ID ? ROSTER_FILE : QUIZ_FILE),
    ...over,
  };
}

const NO_GRANT: Partial<TeammatePrintDeps> = {
  getAccessToken: () =>
    Promise.reject(new Error('needs-consent: no refresh token stored')),
};

const run = (
  state: State,
  who: DelegatedPrintCaller | null = caller,
  over: Partial<TeammatePrintDeps> = {},
  input: unknown = INPUT
) => handleGetTeammatePrintContext(makeDb(state), who, input, deps(over));

const codeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
  } catch (err) {
    return (err as { code?: string }).code ?? 'no-code';
  }
  return 'resolved';
};

// ---------------------------------------------------------------------------
// §4 authorization ladder — each rung fails on its own.
// ---------------------------------------------------------------------------

describe('authorization ladder', () => {
  it('rejects an unauthenticated caller', async () => {
    expect(await codeOf(run(baseState(), null))).toBe('unauthenticated');
  });

  it('rejects a student-role account', async () => {
    expect(
      await codeOf(run(baseState(), { ...caller, studentRole: true }))
    ).toBe('permission-denied');
  });

  it('rejects an anonymous PIN joiner', async () => {
    expect(await codeOf(run(baseState(), { ...caller, anonymous: true }))).toBe(
      'permission-denied'
    );
  });

  it('rejects printing for yourself through this door', async () => {
    expect(await codeOf(run(baseState(), { ...caller, uid: TARGET_UID }))).toBe(
      'invalid-argument'
    );
  });

  it('rejects a malformed request', async () => {
    expect(await codeOf(run(baseState(), caller, {}, { plcId: PLC_ID }))).toBe(
      'invalid-argument'
    );
  });

  it('refuses when the paper answer-sheets switch is off', async () => {
    const state = baseState();
    state.docs['admin_settings/paper_answer_sheets'] = { enabled: false };
    expect(await codeOf(run(state))).toBe('failed-precondition');
  });

  it('refuses when the delegated-printing switch is off', async () => {
    const state = baseState();
    state.docs['admin_settings/plc_delegated_printing'] = { enabled: false };
    expect(await codeOf(run(state))).toBe('failed-precondition');
  });

  it('refuses when the delegated-printing switch doc is absent', async () => {
    const state = baseState();
    delete state.docs['admin_settings/plc_delegated_printing'];
    expect(await codeOf(run(state))).toBe('failed-precondition');
  });

  it('refuses when the PLC turned the feature off', async () => {
    const state = baseState();
    state.docs[`plcs/${PLC_ID}`] = {
      ...state.docs[`plcs/${PLC_ID}`],
      features: { printForTeammates: false },
    };
    expect(await codeOf(run(state))).toBe('failed-precondition');
  });

  it('refuses a viewer — the role gate is on the actor', async () => {
    const state = baseState();
    state.docs[`plcs/${PLC_ID}`] = {
      members: {
        [CALLER_UID]: member('viewer', 'Helper Teacher'),
        [TARGET_UID]: member('lead', 'Away Teacher'),
      },
      memberUids: [CALLER_UID, TARGET_UID],
    };
    expect(await codeOf(run(state))).toBe('permission-denied');
  });

  it('refuses a caller who is not in the PLC at all', async () => {
    const state = baseState();
    state.docs[`plcs/${PLC_ID}`] = {
      members: { [TARGET_UID]: member('lead', 'Away Teacher') },
      memberUids: [TARGET_UID],
    };
    expect(await codeOf(run(state))).toBe('permission-denied');
  });

  it('refuses a caller whose membership was removed', async () => {
    const state = baseState();
    state.docs[`plcs/${PLC_ID}`] = {
      members: {
        [CALLER_UID]: { ...member('member', 'Helper'), status: 'removed' },
        [TARGET_UID]: member('lead', 'Away Teacher'),
      },
      memberUids: [TARGET_UID],
    };
    expect(await codeOf(run(state))).toBe('permission-denied');
  });

  it('refuses when the target is not a member of this PLC', async () => {
    const state = baseState();
    state.docs[`plcs/${PLC_ID}`] = {
      members: { [CALLER_UID]: member('member', 'Helper Teacher') },
      memberUids: [CALLER_UID],
    };
    expect(await codeOf(run(state))).toBe('not-found');
  });

  it('refuses when the PLC does not exist', async () => {
    const state = baseState();
    delete state.docs[`plcs/${PLC_ID}`];
    expect(await codeOf(run(state))).toBe('not-found');
  });

  it('refuses a quiz that is not shared into this PLC', async () => {
    const state = baseState();
    delete state.docs[`plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`];
    expect(await codeOf(run(state))).toBe('not-found');
  });

  it('refuses a PLC quiz entry with no synced group', async () => {
    const state = baseState();
    state.docs[`plcs/${PLC_ID}/quizzes/${PLC_QUIZ_ID}`] = {};
    expect(await codeOf(run(state))).toBe('failed-precondition');
  });

  it('authorizes a legacy PLC that has only memberUids', async () => {
    const state = stateWithCopy();
    state.docs[`plcs/${PLC_ID}`] = { memberUids: [CALLER_UID, TARGET_UID] };
    const result = await run(state);
    expect(result.targetName).toBe('your teammate');
    expect(result.hasCopy).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// What comes back
// ---------------------------------------------------------------------------

describe('print context', () => {
  it('never returns a student PIN or email', async () => {
    const result = await run(stateWithCopy());
    expect(result.rosters[0].students).toEqual([
      { id: 's1', firstName: 'Ada', lastName: 'Byron' },
      { id: 's2', firstName: 'Alan', lastName: 'Turing' },
    ]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('ada@school.edu');
    expect(serialized).not.toContain('"pin"');
  });

  it('prefers the target’s own Drive copy for content', async () => {
    const result = await run(stateWithCopy());
    expect(result.contentSource).toBe('drive');
    expect(result.quiz.id).toBe('their-quiz-id');
    expect(result.quiz.title).toBe('Unit 3 Common Assessment (their copy)');
    expect(result.driveReachable).toBe(true);
  });

  it('returns the answer key with the questions (D12)', async () => {
    const result = await run(stateWithCopy());
    expect(result.quiz.questions).toEqual([{ id: 'q1', correctAnswer: 'B' }]);
  });

  it('falls back to the synced group when the Drive read fails', async () => {
    const result = await run(stateWithCopy(), caller, {
      readDriveJson: (_t, fileId) =>
        fileId === ROSTER_FILE_ID
          ? Promise.resolve(ROSTER_FILE)
          : Promise.reject(new Error('404')),
    });
    expect(result.contentSource).toBe('synced-group');
    expect(result.quiz.title).toBe('Unit 3 Common Assessment');
    // The quiz id stays THEIR id — a batch binds to the copy, not the group.
    expect(result.quiz.id).toBe('their-quiz-id');
  });

  it('degrades to a spares-only stack when there is no Drive grant', async () => {
    const result = await run(stateWithCopy(), caller, NO_GRANT);
    expect(result.driveReachable).toBe(false);
    expect(result.contentSource).toBe('synced-group');
    expect(result.rosters[0].students).toEqual([]);
    expect(result.rosters[0].loadError).toBe('no-drive-access');
    // The count survives the failed read, so the picker can still size a stack.
    expect(result.rosters[0].studentCount).toBe(2);
  });

  it('reports no copy and no Drive grant without refusing the run (D20)', async () => {
    const result = await run(baseState(), caller, NO_GRANT);
    expect(result.hasCopy).toBe(false);
    expect(result.quizId).toBeNull();
    expect(result.driveReachable).toBe(false);
    // Their copy is deferred to their own sign-in, so the run still has
    // canonical questions to print from.
    expect(result.contentSource).toBe('synced-group');
    expect(result.quiz.questions.length).toBeGreaterThan(0);
  });

  it('reports no copy while Drive is reachable', async () => {
    const result = await run(baseState());
    expect(result.hasCopy).toBe(false);
    expect(result.contentSource).toBe('synced-group');
  });

  // Which quiz a batch belongs to is the query's job now; what is pinned here
  // is the newest-first order and the attribution the warning reads from.
  it('lists the batches already printed for this quiz, newest first', async () => {
    const state = stateWithCopy({
      collections: {
        [`users/${TARGET_UID}/paper_batches`]: [
          {
            id: 'batch-self',
            data: {
              quizId: 'their-quiz-id',
              createdAt: 1000,
              seats: { 1: {} },
            },
          },
          {
            id: 'batch-new',
            data: {
              quizId: 'their-quiz-id',
              createdAt: 2000,
              seats: { 1: {}, 2: {} },
              spareSeats: [3],
              printedByName: 'Helper Teacher',
            },
          },
        ],
      },
    });
    const result = await run(state);
    expect(result.existingBatches).toEqual([
      {
        id: 'batch-new',
        createdAt: 2000,
        sheetCount: 3,
        printedByName: 'Helper Teacher',
      },
      {
        id: 'batch-self',
        createdAt: 1000,
        sheetCount: 1,
        printedByName: null,
      },
    ]);
  });

  it('reads the legacy bare-array roster file shape', async () => {
    const result = await run(stateWithCopy(), caller, {
      readDriveJson: (_t, fileId) =>
        Promise.resolve(
          fileId === ROSTER_FILE_ID ? ROSTER_FILE.students : QUIZ_FILE
        ),
    });
    expect(result.rosters[0].students).toHaveLength(2);
  });

  it('flags a roster whose Drive file will not read, without failing the call', async () => {
    const result = await run(stateWithCopy(), caller, {
      readDriveJson: (_t, fileId) =>
        fileId === ROSTER_FILE_ID
          ? Promise.reject(new Error('403'))
          : Promise.resolve(QUIZ_FILE),
    });
    expect(result.rosters[0].loadError).toBe('drive-read-failed');
    expect(result.quiz.title).toBe('Unit 3 Common Assessment (their copy)');
  });

  it('names the teammate from their PLC member record', async () => {
    const result = await run(stateWithCopy());
    expect(result.targetName).toBe('Away Teacher');
    expect(result.targetUid).toBe(TARGET_UID);
  });
});
