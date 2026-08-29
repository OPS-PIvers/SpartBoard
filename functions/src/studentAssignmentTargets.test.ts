// Unit tests for `setAssignmentTargetsV1`'s handler (M17 §5 A2).
//
// The onCall wrapper's auth checks are trivial; the invariants worth pinning
// live in the handler: ownership, the cross-class / cross-org targeting guard,
// per-ref uid derivation, flag-before-pointer ordering, and idempotency.
// Exercised against a stub Firestore rather than the emulator.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(),
}));

vi.mock('firebase-functions/v2/https', () => ({
  onCall: vi.fn((_opts: unknown, handler: unknown) => handler),
  HttpsError: class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

vi.mock('./secrets', () => ({
  CLASSLINK_CLIENT_ID: { value: () => 'id' },
  CLASSLINK_CLIENT_SECRET: { value: () => 'secret' },
  CLASSLINK_TENANT_URL: { value: () => 'https://tenant.example' },
  STUDENT_PSEUDONYM_HMAC_SECRET: { value: () => 'unit-test-hmac-secret' },
}));

import { computeStudentUid } from './classlinkShared';
import {
  handleSetAssignmentTargets,
  isTestClassAuthority,
  parseSetAssignmentTargetsInput,
  refKey,
  resolveTargets,
  sanitizeOverride,
  uidForRef,
  type SetAssignmentTargetsInput,
  type TargetAuthorizationContext,
} from './studentAssignmentTargets';

const HMAC = 'unit-test-hmac-secret';
const TEACHER_UID = 'teacher-1';
const OTHER_TEACHER_UID = 'teacher-2';
const ASSIGNMENT_ID = 'assignment-1';
const CLASS_A = 'class-a';
const SOURCED_A = 'sid-a';
const SOURCED_B = 'sid-b';
const SOURCED_FOREIGN = 'sid-foreign';
const TEST_EMAIL = 'Kid@school.edu';

// ---------------------------------------------------------------------------
// Stub Firestore
// ---------------------------------------------------------------------------

interface StubState {
  docs: Map<string, Record<string, unknown>>;
  /** Ordered log of every mutation, so ordering invariants are assertable. */
  writes: {
    path: string;
    op: 'set' | 'delete';
    data?: Record<string, unknown>;
  }[];
}

function makeDb(state: StubState) {
  const docRef = (path: string) => ({
    __path: path,
    id: path.split('/').pop() ?? '',
    parent: {
      parent: {
        id: path.split('/').slice(-3, -2)[0] ?? '',
      },
    },
    collection: (sub: string) => collectionRef(`${path}/${sub}`),
    get: () => Promise.resolve(snapFor(path)),
    set: (data: Record<string, unknown>) => {
      state.writes.push({ path, op: 'set', data });
      state.docs.set(path, { ...(state.docs.get(path) ?? {}), ...data });
      return Promise.resolve();
    },
  });
  const collectionRef = (path: string) => ({
    __path: path,
    doc: (id: string) => docRef(`${path}/${id}`),
    limit: () => ({
      get: () =>
        Promise.resolve({
          docs: [...state.docs.entries()]
            .filter(([p]) => p.startsWith(`${path}/`))
            .map(([p, data]) => ({
              id: p.split('/').pop() ?? '',
              get: (field: string) => data[field],
            })),
        }),
    }),
  });

  const snapFor = (path: string) => {
    const data = state.docs.get(path);
    return {
      exists: data !== undefined,
      ref: docRef(path),
      get: (field: string) => data?.[field],
      data: () => data,
    };
  };

  return {
    collection: (name: string) => collectionRef(name),
    doc: (path: string) => docRef(path),
    getAll: (...refs: { __path: string }[]) =>
      Promise.resolve(refs.map((r) => snapFor(r.__path))),
    batch: () => {
      const ops: (() => void)[] = [];
      return {
        set: (ref: { __path: string }, data: Record<string, unknown>) => {
          ops.push(() => {
            state.writes.push({ path: ref.__path, op: 'set', data });
            state.docs.set(ref.__path, data);
          });
        },
        delete: (ref: { __path: string }) => {
          ops.push(() => {
            state.writes.push({ path: ref.__path, op: 'delete' });
            state.docs.delete(ref.__path);
          });
        },
        commit: () => {
          ops.forEach((op) => op());
          return Promise.resolve();
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let state: StubState;

const ctx = (): TargetAuthorizationContext => ({
  classIdBySourcedId: new Map([
    [SOURCED_A, CLASS_A],
    [SOURCED_B, CLASS_A],
  ]),
  classIdByTestEmail: new Map([[TEST_EMAIL.toLowerCase(), 'testclass']]),
  testClassAuthorized: true,
});

const baseInput = (
  overrides: Partial<SetAssignmentTargetsInput> = {}
): SetAssignmentTargetsInput => ({
  assignmentId: ASSIGNMENT_ID,
  kind: 'quiz',
  sessionId: ASSIGNMENT_ID,
  add: [{ kind: 'classlink', sourcedId: SOURCED_A }],
  remove: [],
  overridesBySourcedId: {},
  window: { openAt: null, closeAt: null, dueAt: null },
  ...overrides,
});

const run = (input: SetAssignmentTargetsInput, uid = TEACHER_UID) =>
  handleSetAssignmentTargets(makeDb(state) as never, uid, HMAC, input, () =>
    Promise.resolve(ctx())
  );

const pointerPath = (uid: string) =>
  `student_assignments/${uid}/items/${ASSIGNMENT_ID}`;

const assignmentPath = () =>
  `users/${TEACHER_UID}/quiz_assignments/${ASSIGNMENT_ID}`;

const pointerFor = (sourcedId = SOURCED_A) =>
  state.docs.get(pointerPath(computeStudentUid(sourcedId, HMAC))) as Record<
    string,
    unknown
  >;

beforeEach(() => {
  state = { docs: new Map(), writes: [] };
  state.docs.set(`users/${TEACHER_UID}/quiz_assignments/${ASSIGNMENT_ID}`, {
    id: ASSIGNMENT_ID,
  });
  state.docs.set(`quiz_sessions/${ASSIGNMENT_ID}`, {
    teacherUid: TEACHER_UID,
    status: 'active',
  });
});

// ---------------------------------------------------------------------------
// uid derivation
// ---------------------------------------------------------------------------

describe('uidForRef', () => {
  it('derives a ClassLink uid from the bare sourcedId', () => {
    expect(uidForRef({ kind: 'classlink', sourcedId: SOURCED_A }, HMAC)).toBe(
      computeStudentUid(SOURCED_A, HMAC)
    );
  });

  it('derives a test-class uid from the `test:{emailLower}` namespace', () => {
    expect(uidForRef({ kind: 'test', email: 'kid@school.edu' }, HMAC)).toBe(
      computeStudentUid('test:kid@school.edu', HMAC)
    );
  });

  it('never collides a test uid with a same-string ClassLink uid', () => {
    expect(uidForRef({ kind: 'test', email: 'x@y.z' }, HMAC)).not.toBe(
      uidForRef({ kind: 'classlink', sourcedId: 'x@y.z' }, HMAC)
    );
  });
});

// ---------------------------------------------------------------------------
// Authorization (pure resolution)
// ---------------------------------------------------------------------------

describe('resolveTargets', () => {
  it('resolves refs enrolled in a class the teacher owns', () => {
    const { resolved, skipped } = resolveTargets(
      [{ kind: 'classlink', sourcedId: SOURCED_A }],
      ctx(),
      HMAC
    );
    expect(skipped).toHaveLength(0);
    expect(resolved[0].classId).toBe(CLASS_A);
  });

  it('skips (never resolves) a valid-shape sourcedId from another teacher class', () => {
    const { resolved, skipped } = resolveTargets(
      [{ kind: 'classlink', sourcedId: SOURCED_FOREIGN }],
      ctx(),
      HMAC
    );
    expect(resolved).toHaveLength(0);
    expect(skipped[0].reason).toBe('not-in-teacher-classes');
  });

  it('skips a test-class email outside the caller org test class', () => {
    const { resolved, skipped } = resolveTargets(
      [{ kind: 'test', email: 'stranger@other.edu' }],
      ctx(),
      HMAC
    );
    expect(resolved).toHaveLength(0);
    expect(skipped[0].reason).toBe('not-in-teacher-classes');
  });

  // F6: a plain teacher can forge `testClassId` onto their own (client-
  // writable) roster doc; the org-admin gate is what stops that reaching a
  // test-class student, so an unauthorized caller resolves nothing.
  it('skips every test ref when the caller is not a test-class authority', () => {
    const { resolved, skipped } = resolveTargets(
      [{ kind: 'test', email: TEST_EMAIL.toLowerCase() }],
      { ...ctx(), testClassAuthorized: false },
      HMAC
    );
    expect(resolved).toHaveLength(0);
    expect(skipped[0].reason).toBe('test-class-not-authorized');
  });

  it('still resolves ClassLink refs for a non-test-class-authority caller', () => {
    const { resolved } = resolveTargets(
      [{ kind: 'classlink', sourcedId: SOURCED_A }],
      { ...ctx(), testClassAuthorized: false },
      HMAC
    );
    expect(resolved).toHaveLength(1);
  });

  it('reports duplicates instead of writing twice', () => {
    const { resolved, skipped } = resolveTargets(
      [
        { kind: 'classlink', sourcedId: SOURCED_A },
        { kind: 'classlink', sourcedId: SOURCED_A },
      ],
      ctx(),
      HMAC
    );
    expect(resolved).toHaveLength(1);
    expect(skipped[0].reason).toBe('duplicate');
  });
});

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

describe('handleSetAssignmentTargets', () => {
  it('rejects when the caller does not own the assignment', async () => {
    await expect(run(baseInput(), OTHER_TEACHER_UID)).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('rejects when the session belongs to another teacher', async () => {
    state.docs.set(
      `users/${OTHER_TEACHER_UID}/quiz_assignments/${ASSIGNMENT_ID}`,
      {
        id: ASSIGNMENT_ID,
      }
    );
    await expect(run(baseInput(), OTHER_TEACHER_UID)).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('writes one pointer doc per authorized student', async () => {
    const result = await run(baseInput());
    expect(result).toMatchObject({ written: 1, removed: 0 });
    const uid = computeStudentUid(SOURCED_A, HMAC);
    expect(state.docs.get(pointerPath(uid))).toMatchObject({
      kind: 'quiz',
      sessionId: ASSIGNMENT_ID,
      teacherUid: TEACHER_UID,
      classId: CLASS_A,
    });
  });

  it('writes NO pointer for a cross-class sourcedId and reports it as skipped', async () => {
    const result = await run(
      baseInput({ add: [{ kind: 'classlink', sourcedId: SOURCED_FOREIGN }] })
    );
    expect(result.written).toBe(0);
    expect(result.skipped).toEqual([
      {
        ref: { kind: 'classlink', sourcedId: SOURCED_FOREIGN },
        reason: 'not-in-teacher-classes',
      },
    ]);
    expect(
      state.docs.get(pointerPath(computeStudentUid(SOURCED_FOREIGN, HMAC)))
    ).toBeUndefined();
  });

  it('writes the session individualTargeting flag BEFORE any pointer doc', async () => {
    await run(baseInput());
    const flagIndex = state.writes.findIndex(
      (w) => w.path === `quiz_sessions/${ASSIGNMENT_ID}`
    );
    const pointerIndex = state.writes.findIndex((w) =>
      w.path.startsWith('student_assignments/')
    );
    expect(flagIndex).toBeGreaterThanOrEqual(0);
    expect(state.writes[flagIndex].data).toMatchObject({
      individualTargeting: true,
    });
    expect(flagIndex).toBeLessThan(pointerIndex);
  });

  it('clears individualTargeting AFTER the deletes on an explicit class-mode call', async () => {
    const uid = computeStudentUid(SOURCED_A, HMAC);
    await run(baseInput());
    state.writes = [];
    await run(
      baseInput({
        add: [],
        remove: [{ kind: 'classlink', sourcedId: SOURCED_A }],
        targetMode: 'class',
      })
    );
    const deleteIndex = state.writes.findIndex(
      (w) => w.op === 'delete' && w.path === pointerPath(uid)
    );
    const flagIndex = state.writes.findIndex(
      (w) => w.path === `quiz_sessions/${ASSIGNMENT_ID}`
    );
    expect(deleteIndex).toBeGreaterThanOrEqual(0);
    expect(flagIndex).toBeGreaterThan(deleteIndex);
    expect(state.writes[flagIndex].data).toMatchObject({
      individualTargeting: false,
    });
  });

  it('never re-exposes the assignment when students remain after a remove', async () => {
    await run(
      baseInput({
        add: [
          { kind: 'classlink', sourcedId: SOURCED_A },
          { kind: 'classlink', sourcedId: SOURCED_B },
        ],
      })
    );
    state.writes = [];
    await run(
      baseInput({
        add: [],
        remove: [{ kind: 'classlink', sourcedId: SOURCED_A }],
      })
    );
    expect(
      state.writes.some(
        (w) =>
          w.path === `quiz_sessions/${ASSIGNMENT_ID}` &&
          (w.data ?? {}).individualTargeting === false
      )
    ).toBe(false);
  });

  // F3: removing the last student via deltas must not strand the flag.
  it('clears individualTargeting when the last student is removed via deltas', async () => {
    await run(baseInput());
    state.writes = [];
    await run(
      baseInput({
        add: [],
        remove: [{ kind: 'classlink', sourcedId: SOURCED_A }],
      })
    );
    const flagWrite = state.writes.find(
      (w) => w.path === `quiz_sessions/${ASSIGNMENT_ID}`
    );
    expect(flagWrite?.data).toMatchObject({ individualTargeting: false });
  });

  it('keeps individualTargeting on an intentionally empty students-mode assignment', async () => {
    await run(baseInput({ add: [], targetMode: 'students' }));
    const flagWrites = state.writes.filter(
      (w) => w.path === `quiz_sessions/${ASSIGNMENT_ID}`
    );
    expect(flagWrites).toHaveLength(1);
    expect(flagWrites[0].data).toMatchObject({ individualTargeting: true });
  });

  // F2: the assignment doc must mirror the true pointer set for A2b cleanup.
  it('persists the resolved target set and mode onto the assignment doc', async () => {
    await run(
      baseInput({
        add: [
          { kind: 'classlink', sourcedId: SOURCED_A },
          { kind: 'classlink', sourcedId: SOURCED_FOREIGN },
        ],
      })
    );
    expect(state.docs.get(assignmentPath())).toMatchObject({
      targetStudents: [{ kind: 'classlink', sourcedId: SOURCED_A }],
      targetMode: 'students',
    });
  });

  it('carries prior targets forward and drops removed ones on the assignment doc', async () => {
    await run(
      baseInput({
        add: [
          { kind: 'classlink', sourcedId: SOURCED_A },
          { kind: 'classlink', sourcedId: SOURCED_B },
        ],
      })
    );
    await run(
      baseInput({
        add: [],
        remove: [{ kind: 'classlink', sourcedId: SOURCED_A }],
      })
    );
    expect(state.docs.get(assignmentPath())).toMatchObject({
      targetStudents: [{ kind: 'classlink', sourcedId: SOURCED_B }],
    });
  });

  it('records targetMode class when the set empties without explicit students mode', async () => {
    await run(baseInput());
    await run(
      baseInput({
        add: [],
        remove: [{ kind: 'classlink', sourcedId: SOURCED_A }],
      })
    );
    expect(state.docs.get(assignmentPath())).toMatchObject({
      targetStudents: [],
      targetMode: 'class',
    });
  });

  it('is idempotent — a re-run keeps createdAt and the same doc set', async () => {
    await run(baseInput());
    const uid = computeStudentUid(SOURCED_A, HMAC);
    const first = state.docs.get(pointerPath(uid)) as { createdAt: number };
    await run(baseInput());
    const second = state.docs.get(pointerPath(uid)) as { createdAt: number };
    expect(second.createdAt).toBe(first.createdAt);
    expect(
      [...state.docs.keys()].filter((k) => k.startsWith('student_assignments/'))
    ).toHaveLength(1);
  });

  it('lets add win over remove for the same student (no double-write in one batch)', async () => {
    const uid = computeStudentUid(SOURCED_A, HMAC);
    const result = await run(
      baseInput({ remove: [{ kind: 'classlink', sourcedId: SOURCED_A }] })
    );
    expect(result).toMatchObject({ written: 1, removed: 0 });
    expect(state.docs.get(pointerPath(uid))).toBeDefined();
    expect(
      state.writes.filter((w) => w.path === pointerPath(uid))
    ).toHaveLength(1);
  });

  it('stores only the targeted student own override on their pointer doc', async () => {
    await run(
      baseInput({
        overridesBySourcedId: {
          [`classlink:${SOURCED_A}`]: { timeMultiplier: 2 },
          [`classlink:${SOURCED_FOREIGN}`]: { timeMultiplier: 1.5 },
        },
      })
    );
    const doc = pointerFor();
    expect(doc).toMatchObject({ override: { timeMultiplier: 2 } });
    expect(JSON.stringify(doc)).not.toContain('1.5');
  });

  // F1: a partial re-send must never erase a stored 504/IEP accommodation.
  it('preserves a stored override when the payload omits that key', async () => {
    await run(
      baseInput({
        overridesBySourcedId: {
          [`classlink:${SOURCED_A}`]: { timeMultiplier: 2 },
        },
      })
    );
    await run(baseInput({ overridesBySourcedId: {} }));
    expect(pointerFor()).toMatchObject({ override: { timeMultiplier: 2 } });
  });

  it('clears a stored override on an explicit null for that key', async () => {
    await run(
      baseInput({
        overridesBySourcedId: {
          [`classlink:${SOURCED_A}`]: { timeMultiplier: 2 },
        },
      })
    );
    await run(
      baseInput({ overridesBySourcedId: { [`classlink:${SOURCED_A}`]: null } })
    );
    expect('override' in pointerFor()).toBe(false);
  });

  it('replaces a stored override when the key carries a new value', async () => {
    await run(
      baseInput({
        overridesBySourcedId: {
          [`classlink:${SOURCED_A}`]: { timeMultiplier: 2 },
        },
      })
    );
    await run(
      baseInput({
        overridesBySourcedId: {
          [`classlink:${SOURCED_A}`]: { timeMultiplier: 1.5 },
        },
      })
    );
    expect(pointerFor()).toMatchObject({ override: { timeMultiplier: 1.5 } });
  });

  it('preserves stored window fields whose keys the payload omits', async () => {
    await run(baseInput({ window: { openAt: 100, closeAt: 200, dueAt: 300 } }));
    await run(baseInput({ window: { closeAt: 250 } }));
    const doc = pointerFor();
    expect(doc.openAt).toBe(100);
    expect(doc.closeAt).toBe(250);
    expect(doc.dueAt).toBe(300);
  });

  it('clears a stored window field on an explicit null', async () => {
    await run(baseInput({ window: { openAt: 100, closeAt: 200, dueAt: 300 } }));
    await run(baseInput({ window: { closeAt: null } }));
    const doc = pointerFor();
    expect('closeAt' in doc).toBe(false);
    expect(doc.openAt).toBe(100);
  });

  it('carries the assignment window onto the pointer doc', async () => {
    await run(
      baseInput({ window: { openAt: 100, closeAt: 200, dueAt: null } })
    );
    const doc = state.docs.get(
      pointerPath(computeStudentUid(SOURCED_A, HMAC))
    ) as Record<string, unknown>;
    expect(doc.openAt).toBe(100);
    expect(doc.closeAt).toBe(200);
    expect('dueAt' in doc).toBe(false);
  });

  it('removes a pointer doc for a removed ref', async () => {
    await run(baseInput());
    const result = await run(
      baseInput({
        add: [],
        remove: [{ kind: 'classlink', sourcedId: SOURCED_A }],
      })
    );
    expect(result.removed).toBe(1);
    expect(
      state.docs.get(pointerPath(computeStudentUid(SOURCED_A, HMAC)))
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Input parsing + override sanitization
// ---------------------------------------------------------------------------

describe('parseSetAssignmentTargetsInput', () => {
  it('rejects an unknown kind', () => {
    expect(() =>
      parseSetAssignmentTargetsInput({
        assignmentId: 'a',
        sessionId: 'a',
        kind: 'not-a-kind',
      })
    ).toThrow();
  });

  it('accepts every supported kind', () => {
    for (const kind of [
      'quiz',
      'video-activity',
      'guided-learning',
      'mini-app',
    ]) {
      expect(
        parseSetAssignmentTargetsInput({
          assignmentId: 'a',
          sessionId: 'a',
          kind,
        }).input.kind
      ).toBe(kind);
    }
  });

  it('reports malformed refs instead of dropping them silently', () => {
    const { input, skipped } = parseSetAssignmentTargetsInput({
      assignmentId: 'a',
      sessionId: 'a',
      kind: 'quiz',
      add: [{ kind: 'classlink' }, { kind: 'classlink', sourcedId: 'ok' }],
    });
    expect(input.add).toHaveLength(1);
    expect(skipped[0].reason).toBe('malformed-ref');
  });

  it('keeps an explicit null override key so it can clear, and drops bare keys', () => {
    const { input } = parseSetAssignmentTargetsInput({
      assignmentId: 'a',
      sessionId: 'a',
      kind: 'quiz',
      overridesBySourcedId: {
        'classlink:sid-a': null,
        'test:MiXeD@School.Edu': { timeMultiplier: 2 },
        'sid-bare': { timeMultiplier: 2 },
      },
    });
    expect(input.overridesBySourcedId).toEqual({
      'classlink:sid-a': null,
      'test:mixed@school.edu': { timeMultiplier: 2 },
    });
  });

  it('distinguishes an absent window key from an explicit null', () => {
    const { input } = parseSetAssignmentTargetsInput({
      assignmentId: 'a',
      sessionId: 'a',
      kind: 'quiz',
      window: { closeAt: null, dueAt: 5 },
    });
    expect(input.window.openAt).toBeUndefined();
    expect(input.window.closeAt).toBeNull();
    expect(input.window.dueAt).toBe(5);
  });

  it('lowercases test-ref emails so uid derivation is case-stable', () => {
    const { input } = parseSetAssignmentTargetsInput({
      assignmentId: 'a',
      sessionId: 'a',
      kind: 'quiz',
      add: [{ kind: 'test', email: 'MiXeD@School.Edu' }],
    });
    expect(input.add[0]).toEqual({ kind: 'test', email: 'mixed@school.edu' });
  });
});

// ---------------------------------------------------------------------------
// F6 — test-class authority (the forged-roster-doc scenario)
// ---------------------------------------------------------------------------

describe('isTestClassAuthority', () => {
  const EMAIL = 'teacher@orono.k12.mn.us';
  const ORG = 'orono';
  const check = () => isTestClassAuthority(makeDb(state) as never, EMAIL, ORG);

  it('denies a plain teacher who forged a testClassId onto their own roster', async () => {
    state.docs.set(`users/${TEACHER_UID}/rosters/forged`, {
      testClassId: 'mock-period-1',
    });
    state.docs.set(`organizations/${ORG}/members/${EMAIL}`, {
      roleId: 'teacher',
    });
    await expect(check()).resolves.toBe(false);
  });

  it('denies a caller with no member doc at all', async () => {
    await expect(check()).resolves.toBe(false);
  });

  it('allows a domain admin', async () => {
    state.docs.set(`organizations/${ORG}/members/${EMAIL}`, {
      roleId: 'domain_admin',
    });
    await expect(check()).resolves.toBe(true);
  });

  it('allows a legacy super admin via /admins/{email}', async () => {
    state.docs.set(`admins/${EMAIL}`, {});
    await expect(check()).resolves.toBe(true);
  });
});

// ---------------------------------------------------------------------------
// F7 — kind-namespaced ref keys
// ---------------------------------------------------------------------------

describe('refKey', () => {
  it('namespaces by kind so a test email cannot collide with a sourcedId', () => {
    expect(refKey({ kind: 'classlink', sourcedId: 'x@y.z' })).not.toBe(
      refKey({ kind: 'test', email: 'x@y.z' })
    );
  });

  it('preserves sourcedId case and lowercases test emails', () => {
    expect(refKey({ kind: 'classlink', sourcedId: 'SID-A' })).toBe(
      'classlink:SID-A'
    );
    expect(refKey({ kind: 'test', email: 'kid@school.edu' })).toBe(
      'test:kid@school.edu'
    );
  });
});

describe('sanitizeOverride', () => {
  it('drops unknown keys', () => {
    expect(sanitizeOverride({ timeMultiplier: 2, evil: 'x' })).toEqual({
      timeMultiplier: 2,
    });
  });

  it('rejects an unsupported time multiplier', () => {
    expect(sanitizeOverride({ timeMultiplier: 99 })).toBeNull();
  });

  it('keeps the supported override surface', () => {
    expect(
      sanitizeOverride({
        timeMultiplier: 'unlimited',
        questionIds: ['q1', 'q2'],
        hiddenOptionIdsByQuestion: { q1: ['o1'] },
        tabWarningThreshold: 'off',
        openAt: 1,
        closeAt: 2,
      })
    ).toEqual({
      timeMultiplier: 'unlimited',
      questionIds: ['q1', 'q2'],
      hiddenOptionIdsByQuestion: { q1: ['o1'] },
      tabWarningThreshold: 'off',
      openAt: 1,
      closeAt: 2,
    });
  });

  it('returns null for a payload with nothing recognizable', () => {
    expect(sanitizeOverride({ nope: true })).toBeNull();
  });
});
