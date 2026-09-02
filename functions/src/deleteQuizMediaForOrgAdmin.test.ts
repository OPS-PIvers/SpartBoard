// Unit tests for the org-admin media review + compliance delete (Brief 4.1).
//
// Firestore is a small in-memory fake; Drive and Storage are injected stubs,
// so only the decisions the brief specifies are under test.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  auth: vi.fn(() => ({ getUser: vi.fn() })),
  storage: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldValue: { delete: () => ({ __delete: true }) },
    FieldPath: { documentId: () => '__name__' },
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

vi.mock('firebase-functions/params', () => ({
  defineSecret: (name: string) => ({ value: () => `secret:${name}` }),
}));

vi.mock('ffmpeg-static', () => ({ default: '/usr/bin/ffmpeg' }));
vi.mock('fluent-ffmpeg', () => ({
  default: Object.assign(vi.fn(), { setFfmpegPath: vi.fn() }),
}));
vi.mock('./functionsInit', () => ({}));
vi.mock('./googleOAuth', () => ({
  refreshGoogleAccessTokenForUid: vi.fn(),
}));
vi.mock('./studentAssignmentTargets', () => ({
  loadTargetDirectory: vi.fn(),
  uidForRef: () => 'uid',
}));
vi.mock('./classlinkShared', () => ({
  ALLOWED_ORIGINS: [],
  normalizeEmailDomain: (email: string) => `@${email.split('@')[1]}`,
  resolveOrgIdForDomain: vi.fn(() => Promise.resolve(null)),
}));
vi.mock('./secrets', () => {
  const secret = (name: string) => ({ value: () => `secret:${name}` });
  return {
    CLASSLINK_CLIENT_ID: secret('cid'),
    CLASSLINK_CLIENT_SECRET: secret('csecret'),
    CLASSLINK_TENANT_URL: secret('tenant'),
    STUDENT_PSEUDONYM_HMAC_SECRET: secret('hmac'),
    GOOGLE_OAUTH_CLIENT_ID: secret('gid'),
  };
});

import {
  assertOrgMediaAdmin,
  buildQuestionTextMap,
  buildRowsForResponse,
  collectQuestionArtifacts,
  deleteOrgQuizMediaSets,
  finishStuckMediaDelete,
  listOrgQuizMedia,
  matchesDateWindow,
  truncateQuestionText,
  MAX_QUESTION_TEXT_CHARS,
  MAX_RESPONSES_SCANNED,
  parseDeleteRequest,
  parseListRequest,
  type OrgMediaDeps,
} from './deleteQuizMediaForOrgAdmin';

const STUCK_AGE_MS = 2 * 60 * 60 * 1000;

// ── In-memory Firestore fake ───────────────────────────────────────────────

type Doc = Record<string, unknown>;

const isPlainObject = (v: unknown): v is Doc =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isDeleteSentinel = (v: unknown): boolean =>
  isPlainObject(v) && v.__delete === true;

function mergeInto(target: Doc, patch: Doc): Doc {
  const out: Doc = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (isDeleteSentinel(value)) {
      delete out[key];
      continue;
    }
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = mergeInto(out[key], value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

type DocApi = {
  path: string;
  id: string;
  get: () => Promise<SnapshotApi>;
  collection: (name: string) => CollectionApi;
  set: (data: Doc, options?: { merge?: boolean }) => Promise<void>;
};

type SnapshotApi = {
  id: string;
  exists: boolean;
  data: () => Doc | undefined;
  get: (field: string) => unknown;
  ref: DocApi;
};

type CollectionApi = {
  where: (field: string, op: string, values: unknown) => CollectionApi;
  limit: (n?: number) => CollectionApi;
  get: () => Promise<{ docs: SnapshotApi[] }>;
  doc: (id: string) => DocApi;
};

function createFakeDb() {
  const docs = new Map<string, Doc>();

  const snapshot = (path: string): SnapshotApi => {
    const data = docs.get(path);
    return {
      id: path.split('/').pop() ?? '',
      exists: data !== undefined,
      data: () => data,
      get: (field: string) => data?.[field],
      ref: doc(path),
    };
  };

  const doc = (path: string): DocApi => ({
    path,
    id: path.split('/').pop() ?? '',
    get: () => Promise.resolve(snapshot(path)),
    collection: (name: string) => collection(`${path}/${name}`),
    set: (data: Doc, options?: { merge?: boolean }) => {
      const prior = docs.get(path) ?? {};
      docs.set(path, options?.merge ? mergeInto(prior, data) : data);
      return Promise.resolve();
    },
  });

  const collection = (path: string): CollectionApi => {
    const childrenOf = (filter?: (d: Doc) => boolean) =>
      [...docs.entries()]
        .filter(([key]) => {
          if (!key.startsWith(`${path}/`)) return false;
          return key.slice(path.length + 1).split('/').length === 1;
        })
        .filter(([, data]) => (filter ? filter(data) : true))
        .map(([key]) => snapshot(key));
    const build = (filter?: (d: Doc) => boolean): CollectionApi => ({
      where: (field: string, _op: string, values: unknown) =>
        build((d) =>
          Array.isArray(values)
            ? values.includes(d[field])
            : d[field] === values
        ),
      limit: () => build(filter),
      get: () => Promise.resolve({ docs: childrenOf(filter) }),
      doc: (id: string) => doc(`${path}/${id}`),
    });
    return build();
  };

  const runTransaction = <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
    fn({
      get: (ref: { path: string }) => Promise.resolve(snapshot(ref.path)),
      set: (
        ref: { path: string },
        data: Doc,
        options?: { merge?: boolean }
      ) => {
        const prior = docs.get(ref.path) ?? {};
        docs.set(ref.path, options?.merge ? mergeInto(prior, data) : data);
      },
    });

  return {
    docs,
    set: (path: string, data: Doc) => docs.set(path, data),
    doc,
    collection,
    runTransaction,
  };
}

type FakeStore = ReturnType<typeof createFakeDb>;

// The fake implements only the Firestore surface these two callables touch.
const asFirestore = (db: FakeStore) =>
  db as unknown as import('firebase-admin').firestore.Firestore;

const ORG = 'orono';

function seedOrg(db: FakeStore): void {
  db.set(`organizations/${ORG}/members/admin@x.org`, {
    email: 'admin@x.org',
    roleId: 'domain_admin',
    uid: 'admin-uid',
  });
  db.set(`organizations/${ORG}/members/teacher@x.org`, {
    email: 'teacher@x.org',
    roleId: 'teacher',
    uid: 'teacher-uid',
  });
}

function seedResponse(db: FakeStore, overrides?: Doc): void {
  db.set('quiz_sessions/s1', {
    teacherUid: 'teacher-uid',
    quizTitle: 'Fractions',
  });
  db.set('quiz_sessions/s1/responses/r1', {
    studentUid: 'stu1',
    pin: '4821',
    answers: [
      {
        questionId: 'q1',
        takeIndex: 0,
        artifacts: [{ id: 'a1', kind: 'audio' }],
      },
      {
        questionId: 'q1',
        takeIndex: 1,
        artifacts: [{ id: 'a2', kind: 'audio' }],
      },
      { questionId: 'q2', artifacts: [{ id: 'b1', kind: 'audio' }] },
    ],
    artifactArchive: {
      a1: {
        archiveStatus: 'archived',
        driveFileId: 'drive-a1',
        archivedAt: 10,
      },
      a2: {
        archiveStatus: 'archived',
        driveFileId: 'drive-a2',
        archivedAt: 20,
      },
      b1: {
        archiveStatus: 'archived',
        driveFileId: 'drive-b1',
        archivedAt: 30,
      },
    },
    ...overrides,
  });
}

function makeDeps(
  db: FakeStore,
  overrides?: Partial<OrgMediaDeps>
): OrgMediaDeps {
  return {
    db: asFirestore(db),
    getAccessToken: vi.fn(() => Promise.resolve('token')),
    deleteDriveFile: vi.fn(() => Promise.resolve()),
    deleteStorageObject: vi.fn(() => Promise.resolve()),
    now: () => 1000,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('request parsing fails closed', () => {
  it('rejects a missing orgId', () => {
    expect(() => parseListRequest({})).toThrow();
    expect(() => parseDeleteRequest({ targets: [] })).toThrow();
  });

  it('rejects a target missing any identifier', () => {
    expect(() =>
      parseDeleteRequest({
        orgId: ORG,
        targets: [{ sessionId: 's1', responseKey: 'r1' }],
      })
    ).toThrow();
  });

  it('rejects path separators in identifiers', () => {
    expect(() =>
      parseDeleteRequest({
        orgId: ORG,
        targets: [
          { sessionId: 's1/../x', responseKey: 'r1', questionId: 'q1' },
        ],
      })
    ).toThrow();
  });
});

describe('assertOrgMediaAdmin', () => {
  let db: FakeStore;
  beforeEach(() => {
    db = createFakeDb();
    seedOrg(db);
  });

  it('rejects a non-admin member of the org', async () => {
    await expect(
      assertOrgMediaAdmin(asFirestore(db), ORG, 'teacher@x.org')
    ).rejects.toThrow(/administrator/i);
  });

  it('rejects a domain_admin of a different org', async () => {
    db.set('organizations/other/members/outsider@y.org', {
      roleId: 'domain_admin',
    });
    await expect(
      assertOrgMediaAdmin(asFirestore(db), ORG, 'outsider@y.org')
    ).rejects.toThrow(/not a member/i);
  });

  it('accepts a domain_admin of the target org', async () => {
    await expect(
      assertOrgMediaAdmin(asFirestore(db), ORG, 'admin@x.org')
    ).resolves.toBeUndefined();
  });

  it('accepts a SpartBoard admin with no member doc', async () => {
    db.set('admins/super@x.org', {});
    await expect(
      assertOrgMediaAdmin(asFirestore(db), ORG, 'super@x.org')
    ).resolves.toBeUndefined();
  });
});

describe('listOrgQuizMedia', () => {
  let db: FakeStore;
  beforeEach(() => {
    db = createFakeDb();
    seedOrg(db);
    seedResponse(db);
  });

  it('groups takes by question and labels the student pseudonymously', async () => {
    const { rows } = await listOrgQuizMedia(
      { orgId: ORG },
      { db: asFirestore(db) }
    );
    const q1 = rows.find((r) => r.questionId === 'q1');
    expect(q1?.takes.map((t) => t.artifactId)).toEqual(['a1', 'a2']);
    expect(q1?.studentLabel).toBe('Pin 4821');
    expect(q1?.teacherEmail).toBe('teacher@x.org');
    expect(q1?.quizTitle).toBe('Fractions');
  });

  it('never returns sessions belonging to another org', async () => {
    db.set('quiz_sessions/s2', { teacherUid: 'stranger-uid' });
    db.set('quiz_sessions/s2/responses/r9', {
      studentUid: 'stu9',
      answers: [{ questionId: 'q1', artifacts: [{ id: 'z1', kind: 'audio' }] }],
      artifactArchive: { z1: { archiveStatus: 'archived', driveFileId: 'd' } },
    });
    const { rows } = await listOrgQuizMedia(
      { orgId: ORG },
      { db: asFirestore(db) }
    );
    expect(rows.every((r) => r.sessionId === 's1')).toBe(true);
  });
});

describe('listOrgQuizMedia scan caps', () => {
  it('stops querying later teacher chunks once the response cap is hit', async () => {
    const db = createFakeDb();
    for (let i = 0; i < 12; i++) {
      db.set(`organizations/${ORG}/members/t${i}@x.org`, {
        email: `t${i}@x.org`,
        roleId: 'teacher',
        uid: `uid-${i}`,
      });
    }
    db.set('quiz_sessions/big', { teacherUid: 'uid-0', quizTitle: 'Big' });
    for (let i = 0; i < MAX_RESPONSES_SCANNED; i++) {
      db.set(`quiz_sessions/big/responses/r${i}`, { studentUid: 's' });
    }
    db.set('quiz_sessions/after', { teacherUid: 'uid-0', quizTitle: 'After' });
    db.set('quiz_sessions/late', { teacherUid: 'uid-11', quizTitle: 'Late' });
    db.set('quiz_sessions/late/responses/r1', {
      studentUid: 'stu-late',
      answers: [{ questionId: 'q1', artifacts: [{ id: 'z1', kind: 'audio' }] }],
      artifactArchive: { z1: { archiveStatus: 'archived', driveFileId: 'd' } },
    });
    let sessionQueries = 0;
    const counting = {
      ...db,
      collection: (path: string) => {
        if (path === 'quiz_sessions') sessionQueries++;
        return db.collection(path);
      },
    } as unknown as FakeStore;

    const { rows, truncated } = await listOrgQuizMedia(
      { orgId: ORG },
      { db: asFirestore(counting) }
    );
    expect(truncated).toBe(true);
    expect(sessionQueries).toBe(1);
    expect(rows).toEqual([]);
  });
});

describe('date window filter', () => {
  it('keeps unstamped rows for a "before X" query', () => {
    expect(matchesDateWindow(0, undefined, 500)).toBe(true);
    expect(matchesDateWindow(900, undefined, 500)).toBe(false);
    expect(matchesDateWindow(900, 500, undefined)).toBe(true);
    expect(matchesDateWindow(100, 500, undefined)).toBe(false);
  });
});

describe('collectQuestionArtifacts', () => {
  it('gathers every take and ignores inline text artifacts', () => {
    const answers = [
      { questionId: 'q1', artifacts: [{ id: 'a1', kind: 'audio' }] },
      {
        questionId: 'q1',
        artifacts: [
          { id: 'a2', kind: 'audio' },
          { id: 't1', kind: 'text' },
        ],
      },
    ];
    expect(collectQuestionArtifacts(answers, 'q1').map((a) => a.id)).toEqual([
      'a1',
      'a2',
    ]);
  });
});

describe('buildRowsForResponse', () => {
  it('omits questions with no media', () => {
    const rows = buildRowsForResponse(
      {
        sessionId: 's1',
        responseKey: 'r1',
        quizTitle: 'Q',
        teacherUid: 't',
        teacherEmail: 't@x.org',
      },
      { answers: [{ questionId: 'q1', answer: 'text only' }] }
    );
    expect(rows).toEqual([]);
  });
});

describe('deleteOrgQuizMediaSets', () => {
  let db: FakeStore;
  beforeEach(() => {
    db = createFakeDb();
    seedOrg(db);
    seedResponse(db);
  });

  it('deletes every take of the question, not just the latest', async () => {
    const deps = makeDeps(db);
    const { results } = await deleteOrgQuizMediaSets(
      {
        orgId: ORG,
        targets: [{ sessionId: 's1', responseKey: 'r1', questionId: 'q1' }],
        deletedBy: 'admin-uid',
      },
      deps
    );
    expect(results.map((r) => r.artifactId)).toEqual(['a1', 'a2']);
    expect(results.every((r) => r.status === 'deleted')).toBe(true);
    expect(deps.deleteDriveFile).toHaveBeenCalledTimes(2);
    // One token refresh for the teacher, not one per artifact.
    expect(deps.getAccessToken).toHaveBeenCalledTimes(1);
  });

  it('marks deleted takes without clearing driveFileId or the answers array', async () => {
    await deleteOrgQuizMediaSets(
      {
        orgId: ORG,
        targets: [{ sessionId: 's1', responseKey: 'r1', questionId: 'q1' }],
        deletedBy: 'admin-uid',
      },
      makeDeps(db)
    );
    const doc = db.docs.get('quiz_sessions/s1/responses/r1') as {
      artifactArchive: Record<string, Record<string, unknown>>;
      answers: unknown[];
    };
    expect(doc.artifactArchive.a1).toMatchObject({
      archiveStatus: 'deleted',
      driveFileId: 'drive-a1',
      deletedAt: 1000,
      deletedBy: 'admin-uid',
    });
    expect(doc.answers).toHaveLength(3);
    expect(doc.artifactArchive.b1?.archiveStatus).toBe('archived');
  });

  it('records delete-failed for a dead teacher token without blocking the batch', async () => {
    db.set('quiz_sessions/s2', {
      teacherUid: 'teacher2-uid',
      quizTitle: 'Other',
    });
    db.set(`organizations/${ORG}/members/teacher2@x.org`, {
      email: 'teacher2@x.org',
      roleId: 'teacher',
      uid: 'teacher2-uid',
    });
    db.set('quiz_sessions/s2/responses/r2', {
      studentUid: 'stu2',
      answers: [{ questionId: 'q1', artifacts: [{ id: 'c1', kind: 'audio' }] }],
      artifactArchive: {
        c1: { archiveStatus: 'archived', driveFileId: 'drive-c1' },
      },
    });
    const deps = makeDeps(db, {
      getAccessToken: vi.fn((uid: string) =>
        uid === 'teacher2-uid'
          ? Promise.reject(new Error('needs-consent: no refresh token stored'))
          : Promise.resolve('token')
      ),
    });
    const { results } = await deleteOrgQuizMediaSets(
      {
        orgId: ORG,
        targets: [
          { sessionId: 's2', responseKey: 'r2', questionId: 'q1' },
          { sessionId: 's1', responseKey: 'r1', questionId: 'q1' },
        ],
        deletedBy: 'admin-uid',
      },
      deps
    );
    const failed = results.find((r) => r.artifactId === 'c1');
    expect(failed?.status).toBe('failed');
    expect(failed?.error).toMatch(/disconnected/i);
    expect(
      results.filter((r) => r.status === 'deleted').map((r) => r.artifactId)
    ).toEqual(['a1', 'a2']);
    const failedDoc = db.docs.get('quiz_sessions/s2/responses/r2') as {
      artifactArchive: Record<string, Record<string, unknown>>;
    };
    expect(failedDoc.artifactArchive.c1).toMatchObject({
      archiveStatus: 'delete-failed',
      driveFileId: 'drive-c1',
      deleteAttemptedAt: 1000,
    });
  });

  it('refuses a target whose session belongs to another org', async () => {
    db.set('quiz_sessions/s9', { teacherUid: 'stranger-uid' });
    const { results } = await deleteOrgQuizMediaSets(
      {
        orgId: ORG,
        targets: [{ sessionId: 's9', responseKey: 'r9', questionId: 'q1' }],
        deletedBy: 'admin-uid',
      },
      makeDeps(db)
    );
    expect(results[0]?.status).toBe('failed');
    expect(results[0]?.error).toMatch(/organization/i);
  });

  it('also deletes a surviving Storage transit object', async () => {
    db.set('quiz_sessions/s1/responses/r1', {
      studentUid: 'stu1',
      answers: [
        {
          questionId: 'q1',
          artifacts: [
            {
              id: 'a1',
              kind: 'audio',
              storagePath: 'quiz_response_media/s1/stu1/a1.webm',
            },
          ],
        },
      ],
      artifactArchive: {
        a1: { archiveStatus: 'failed', storageCleanupPending: true },
      },
    });
    const deps = makeDeps(db);
    const { results } = await deleteOrgQuizMediaSets(
      {
        orgId: ORG,
        targets: [{ sessionId: 's1', responseKey: 'r1', questionId: 'q1' }],
        deletedBy: 'admin-uid',
      },
      deps
    );
    expect(results[0]?.status).toBe('deleted');
    expect(deps.deleteStorageObject).toHaveBeenCalledWith(
      'quiz_response_media/s1/stu1/a1.webm'
    );
    const doc = db.docs.get('quiz_sessions/s1/responses/r1') as {
      artifactArchive: Record<string, Record<string, unknown>>;
      hasStuckArchive: boolean;
    };
    expect(doc.artifactArchive.a1?.storageCleanupPending).toBeUndefined();
    expect(doc.hasStuckArchive).toBe(false);
  });

  it('reports an already-deleted take without re-running the delete', async () => {
    // A realistic storagePath: the old guard let this row be deleted twice.
    db.set('quiz_sessions/s1/responses/r1', {
      studentUid: 'stu1',
      answers: [
        {
          questionId: 'q1',
          artifacts: [
            {
              id: 'a1',
              kind: 'audio',
              storagePath: 'quiz_response_media/s1/stu1/a1.webm',
            },
          ],
        },
      ],
      artifactArchive: {
        a1: {
          archiveStatus: 'deleted',
          driveFileId: 'drive-a1',
          deletedAt: 500,
          deletedBy: 'first-admin',
        },
      },
    });
    const deps = makeDeps(db);
    const { results } = await deleteOrgQuizMediaSets(
      {
        orgId: ORG,
        targets: [{ sessionId: 's1', responseKey: 'r1', questionId: 'q1' }],
        deletedBy: 'admin-uid',
      },
      deps
    );
    expect(results[0]?.status).toBe('already-deleted');
    expect(deps.deleteDriveFile).not.toHaveBeenCalled();
    expect(deps.deleteStorageObject).not.toHaveBeenCalled();
    const doc = db.docs.get('quiz_sessions/s1/responses/r1') as {
      artifactArchive: Record<string, Record<string, unknown>>;
    };
    expect(doc.artifactArchive.a1).toMatchObject({
      deletedAt: 500,
      deletedBy: 'first-admin',
    });
  });

  it('keeps the original deletedAt when a delete-failed take is retried', async () => {
    db.set('quiz_sessions/s1/responses/r1', {
      studentUid: 'stu1',
      answers: [{ questionId: 'q1', artifacts: [{ id: 'a1', kind: 'audio' }] }],
      artifactArchive: {
        a1: {
          archiveStatus: 'delete-failed',
          driveFileId: 'drive-a1',
          deletedAt: 500,
          deletedBy: 'first-admin',
        },
      },
    });
    await deleteOrgQuizMediaSets(
      {
        orgId: ORG,
        targets: [{ sessionId: 's1', responseKey: 'r1', questionId: 'q1' }],
        deletedBy: 'second-admin',
      },
      makeDeps(db)
    );
    const doc = db.docs.get('quiz_sessions/s1/responses/r1') as {
      artifactArchive: Record<string, Record<string, unknown>>;
    };
    expect(doc.artifactArchive.a1).toMatchObject({
      archiveStatus: 'deleted',
      deletedAt: 500,
      deletedBy: 'first-admin',
    });
  });

  it('tombstones a take whose archive is still syncing', async () => {
    db.set('quiz_sessions/s1/responses/r1', {
      studentUid: 'stu1',
      answers: [
        {
          questionId: 'q1',
          artifacts: [
            {
              id: 'a1',
              kind: 'audio',
              storagePath: 'quiz_response_media/s1/stu1/a1.webm',
            },
          ],
        },
      ],
      artifactArchive: {
        a1: { archiveStatus: 'syncing', archiveStartedAt: 5 },
      },
    });
    const deps = makeDeps(db);
    const { results } = await deleteOrgQuizMediaSets(
      {
        orgId: ORG,
        targets: [{ sessionId: 's1', responseKey: 'r1', questionId: 'q1' }],
        deletedBy: 'admin-uid',
      },
      deps
    );
    expect(results[0]?.status).toBe('deleted');
    expect(deps.deleteStorageObject).toHaveBeenCalledWith(
      'quiz_response_media/s1/stu1/a1.webm'
    );
    const doc = db.docs.get('quiz_sessions/s1/responses/r1') as {
      artifactArchive: Record<string, Record<string, unknown>>;
    };
    expect(doc.artifactArchive.a1).toMatchObject({
      archiveStatus: 'deleted',
      deletedAt: 1000,
      deletedBy: 'admin-uid',
    });
    expect(doc.artifactArchive.a1.driveFileId).toBeUndefined();
    expect(doc.artifactArchive.a1.archiveStartedAt).toBeUndefined();
  });

  it('deletes a driveFileId written after the call started', async () => {
    db.set('quiz_sessions/s1/responses/r1', {
      studentUid: 'stu1',
      answers: [{ questionId: 'q1', artifacts: [{ id: 'a1', kind: 'audio' }] }],
      artifactArchive: { a1: { archiveStatus: 'syncing' } },
    });
    let injected = false;
    const deps = makeDeps(db, {
      now: () => {
        if (!injected) {
          injected = true;
          // The in-flight archive finishes between the read and the claim.
          const doc = db.docs.get('quiz_sessions/s1/responses/r1') as {
            artifactArchive: Record<string, Record<string, unknown>>;
          };
          doc.artifactArchive.a1 = {
            archiveStatus: 'archived',
            driveFileId: 'drive-late',
          };
        }
        return 1000;
      },
    });
    const { results } = await deleteOrgQuizMediaSets(
      {
        orgId: ORG,
        targets: [{ sessionId: 's1', responseKey: 'r1', questionId: 'q1' }],
        deletedBy: 'admin-uid',
      },
      deps
    );
    expect(results[0]?.status).toBe('deleted');
    expect(deps.deleteDriveFile).toHaveBeenCalledWith('token', 'drive-late');
    const doc = db.docs.get('quiz_sessions/s1/responses/r1') as {
      artifactArchive: Record<string, Record<string, unknown>>;
    };
    expect(doc.artifactArchive.a1).toMatchObject({
      archiveStatus: 'deleted',
      driveFileId: 'drive-late',
    });
  });
});

describe('two-phase delete claim', () => {
  let db: FakeStore;
  beforeEach(() => {
    db = createFakeDb();
    seedOrg(db);
    db.set('quiz_sessions/s1', {
      teacherUid: 'teacher-uid',
      quizTitle: 'Fractions',
    });
    db.set('quiz_sessions/s1/responses/r1', {
      studentUid: 'stu1',
      answers: [
        {
          questionId: 'q1',
          artifacts: [
            {
              id: 'a1',
              kind: 'audio',
              storagePath: 'quiz_response_media/s1/stu1/a1.webm',
            },
          ],
        },
      ],
      artifactArchive: {
        a1: { archiveStatus: 'archived', driveFileId: 'drive-a1' },
      },
    });
  });

  const runDelete = (deps: OrgMediaDeps, deletedBy = 'admin-uid') =>
    deleteOrgQuizMediaSets(
      {
        orgId: ORG,
        targets: [{ sessionId: 's1', responseKey: 'r1', questionId: 'q1' }],
        deletedBy,
      },
      deps
    );

  const entry = () =>
    (
      db.docs.get('quiz_sessions/s1/responses/r1') as {
        artifactArchive: Record<string, Record<string, unknown>>;
      }
    ).artifactArchive.a1;

  it('leaves the claim at deleting when the Drive delete never returns', async () => {
    await expect(
      runDelete(
        makeDeps(db, {
          deleteDriveFile: vi.fn(() => Promise.reject(new Error('timeout'))),
        })
      )
    ).resolves.toMatchObject({ results: [{ status: 'failed' }] });
    // The audit stamps stand and nothing claims the bytes are gone.
    expect(entry()).toMatchObject({
      archiveStatus: 'delete-failed',
      driveFileId: 'drive-a1',
      deletedAt: 1000,
      deletedBy: 'admin-uid',
    });
  });

  it('never commits deleted while the physical delete is still in flight', async () => {
    let claimSeen: Record<string, unknown> | undefined;
    const deps = makeDeps(db, {
      deleteDriveFile: vi.fn(() => {
        claimSeen = { ...entry() };
        return Promise.reject(new Error('crashed mid-delete'));
      }),
    });
    await runDelete(deps);
    expect(claimSeen).toMatchObject({
      archiveStatus: 'deleting',
      deletedAt: 1000,
      deletedBy: 'admin-uid',
    });
  });

  it('lets a retry complete a stale deleting claim and keeps the first stamps', async () => {
    db.set('quiz_sessions/s1/responses/r1', {
      studentUid: 'stu1',
      answers: [
        {
          questionId: 'q1',
          artifacts: [
            {
              id: 'a1',
              kind: 'audio',
              storagePath: 'quiz_response_media/s1/stu1/a1.webm',
            },
          ],
        },
      ],
      artifactArchive: {
        a1: {
          archiveStatus: 'deleting',
          driveFileId: 'drive-a1',
          deletedAt: 10,
          deletedBy: 'first-admin',
          deleteAttemptedAt: 10,
        },
      },
    });
    const deps = makeDeps(db, { now: () => 10 + STUCK_AGE_MS });
    const { results } = await runDelete(deps, 'second-admin');
    expect(results[0]?.status).toBe('deleted');
    expect(deps.deleteDriveFile).toHaveBeenCalledWith('token', 'drive-a1');
    expect(deps.deleteStorageObject).toHaveBeenCalledWith(
      'quiz_response_media/s1/stu1/a1.webm'
    );
    expect(entry()).toMatchObject({
      archiveStatus: 'deleted',
      deletedAt: 10,
      deletedBy: 'first-admin',
    });
    expect(entry().deleteAttemptedAt).toBeUndefined();
  });

  it('skips a deleting claim that another call still owns', async () => {
    db.set('quiz_sessions/s1/responses/r1', {
      studentUid: 'stu1',
      answers: [{ questionId: 'q1', artifacts: [{ id: 'a1', kind: 'audio' }] }],
      artifactArchive: {
        a1: {
          archiveStatus: 'deleting',
          driveFileId: 'drive-a1',
          deletedAt: 900,
          deleteAttemptedAt: 900,
        },
      },
    });
    const deps = makeDeps(db);
    const { results } = await runDelete(deps);
    expect(results[0]?.status).toBe('skipped');
    expect(deps.deleteDriveFile).not.toHaveBeenCalled();
    expect(entry().archiveStatus).toBe('deleting');
  });
});

describe('finishStuckMediaDelete', () => {
  let db: FakeStore;
  const target = {
    sessionId: 's1',
    responseKey: 'r1',
    questionId: 'q1',
    artifactId: 'a1',
  };

  beforeEach(() => {
    db = createFakeDb();
    seedOrg(db);
    db.set('quiz_sessions/s1', { teacherUid: 'teacher-uid' });
  });

  const seedEntry = (archiveEntry: Record<string, unknown>) =>
    db.set('quiz_sessions/s1/responses/r1', {
      studentUid: 'stu1',
      answers: [
        {
          questionId: 'q1',
          artifacts: [
            {
              id: 'a1',
              kind: 'audio',
              storagePath: 'quiz_response_media/s1/stu1/a1.webm',
            },
          ],
        },
      ],
      artifactArchive: { a1: archiveEntry },
    });

  const entry = () =>
    (
      db.docs.get('quiz_sessions/s1/responses/r1') as {
        artifactArchive: Record<string, Record<string, unknown>>;
      }
    ).artifactArchive.a1;

  it('completes a claim the delete call abandoned', async () => {
    seedEntry({
      archiveStatus: 'deleting',
      driveFileId: 'drive-a1',
      deletedAt: 10,
      deletedBy: 'admin-uid',
      deleteAttemptedAt: 10,
    });
    const deps = makeDeps(db);
    await finishStuckMediaDelete(target, deps);
    expect(deps.deleteDriveFile).toHaveBeenCalledWith('token', 'drive-a1');
    expect(entry()).toMatchObject({
      archiveStatus: 'deleted',
      deletedAt: 10,
      deletedBy: 'admin-uid',
    });
  });

  it('deletes the orphaned Drive copy an archive left on a tombstone', async () => {
    seedEntry({
      archiveStatus: 'deleted',
      deletedAt: 10,
      deletedBy: 'admin-uid',
      orphanedDriveFileId: 'drive-orphan',
    });
    const deps = makeDeps(db);
    await finishStuckMediaDelete(target, deps);
    expect(deps.deleteDriveFile).toHaveBeenCalledWith('token', 'drive-orphan');
    // A settled tombstone keeps its status; only the residue clears.
    expect(entry().archiveStatus).toBe('deleted');
    expect(entry().orphanedDriveFileId).toBeUndefined();
  });

  it('throws and keeps the orphan when the sweep delete still fails', async () => {
    seedEntry({
      archiveStatus: 'deleted',
      deletedAt: 10,
      orphanedDriveFileId: 'drive-orphan',
    });
    const deps = makeDeps(db, {
      deleteDriveFile: vi.fn(() => Promise.reject(new Error('drive down'))),
    });
    await expect(finishStuckMediaDelete(target, deps)).rejects.toThrow(
      /drive down/
    );
    expect(entry().orphanedDriveFileId).toBe('drive-orphan');
  });
});

// ===========================================================================
// Question prompt projection (INT-A) — a raw questionId is unreadable in the
// console, so rows carry the prompt text the session already publishes.
// ===========================================================================

describe('question prompt projection', () => {
  it('collapses whitespace and truncates on a word boundary', () => {
    expect(truncateQuestionText('  Explain\n  your  reasoning ')).toBe(
      'Explain your reasoning'
    );
    const long =
      'Describe in your own words how the numerator and the denominator each change when you simplify a fraction completely';
    const cut = truncateQuestionText(long);
    expect(cut.length).toBeLessThanOrEqual(MAX_QUESTION_TEXT_CHARS + 1);
    expect(cut.endsWith('\u2026')).toBe(true);
    expect(cut.startsWith('Describe in your own words')).toBe(true);
  });

  it('skips questions with no id or no text', () => {
    expect(
      buildQuestionTextMap([
        { id: 'q1', text: 'Read aloud' },
        { id: '', text: 'orphan' },
        { id: 'q2' },
      ])
    ).toEqual({ q1: 'Read aloud' });
    expect(buildQuestionTextMap(undefined)).toEqual({});
  });

  it('projects the prompt onto each row, keeping the id', () => {
    const rows = buildRowsForResponse(
      {
        sessionId: 's1',
        responseKey: 'r1',
        quizTitle: 'Fractions',
        teacherUid: 't',
        teacherEmail: 't@x.org',
        questionTextById: { q1: 'Read the passage aloud' },
      },
      {
        answers: [
          { questionId: 'q1', artifacts: [{ id: 'a1', kind: 'audio' }] },
        ],
        artifactArchive: {
          a1: { archiveStatus: 'archived', driveFileId: 'd' },
        },
      }
    );
    expect(rows[0].questionId).toBe('q1');
    expect(rows[0].questionText).toBe('Read the passage aloud');
  });

  it('omits questionText when the session no longer lists the question', async () => {
    const db = createFakeDb();
    seedOrg(db);
    seedResponse(db);
    db.set('quiz_sessions/s1', {
      teacherUid: 'teacher-uid',
      quizTitle: 'Fractions',
      publicQuestions: [{ id: 'q1', text: 'Read the passage aloud' }],
    });
    const { rows } = await listOrgQuizMedia(
      { orgId: ORG },
      { db: asFirestore(db) }
    );
    expect(rows.find((r) => r.questionId === 'q1')?.questionText).toBe(
      'Read the passage aloud'
    );
    expect(
      rows.find((r) => r.questionId === 'q2')?.questionText
    ).toBeUndefined();
  });
});
