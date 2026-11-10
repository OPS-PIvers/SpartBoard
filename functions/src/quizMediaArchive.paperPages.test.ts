// Kept scan pages through the shared Drive archive core (docs/plans/shipped/QUIZ_PAPER_KEPT_PAGES.md §3.1, K13).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeStubFirestore, type StubData } from './testing/stubFirestore';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  auth: vi.fn(() => ({ getUser: vi.fn() })),
  storage: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldValue: { delete: () => undefined },
  }),
}));
vi.mock('firebase-functions/v2/https', () => {
  class FakeHttpsError extends Error {
    code: string;
    details: unknown;
    constructor(code: string, message: string, details?: unknown) {
      super(message);
      this.code = code;
      this.details = details;
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
vi.mock('./googleOAuth', () => ({ refreshGoogleAccessTokenForUid: vi.fn() }));
vi.mock('./studentAssignmentTargets', () => ({
  loadTargetDirectory: vi.fn(),
  uidForRef: vi.fn(),
}));
vi.mock('./classlinkShared', () => ({
  ALLOWED_ORIGINS: [],
  normalizeEmailDomain: vi.fn(),
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
  archiveQuizArtifactCore,
  buildPaperPageFileName,
  hasPaperPageStoragePrefix,
  isArtifactStoragePathOwned,
  parsePaperPageArtifactId,
  retryStorageCleanup,
  type ArchiveDeps,
} from './quizMediaArchive';

const TEACHER = 'teacher-1';
const SESSION = 'sess-1';
const KEY = 'pin-period_1-0003';
const SCAN = 'scan-2';
const PAGE_ID = `pg_${SCAN}_2`;
const PATH = `paper_pages/${TEACHER}/${SCAN}/3/2.webp`;
const RESPONSE = `quiz_sessions/${SESSION}/responses/${KEY}`;

const page = (over: StubData = {}) => ({
  id: PAGE_ID,
  slot: 'primary',
  kind: 'paper-page',
  storagePath: PATH,
  mimeType: 'image/webp',
  uploadState: 'uploaded',
  ...over,
});

function seed(over: Record<string, StubData> = {}) {
  return makeStubFirestore({
    [`quiz_sessions/${SESSION}`]: {
      teacherUid: TEACHER,
      quizTitle: 'Unit 3: Cells',
      publicQuestions: [{ id: 'q1' }],
    },
    [RESPONSE]: {
      studentUid: 'pin-period_1-0003',
      pin: '0003',
      answers: [],
      paperPages: [page()],
    },
    [`users/${TEACHER}/paper_page_scans/${SCAN}`]: {
      seats: { 3: { sessionId: SESSION, responseKey: KEY } },
    },
    ...over,
  });
}

function deps(db: unknown, over: Partial<ArchiveDeps> = {}): ArchiveDeps {
  return {
    db: db as ArchiveDeps['db'],
    statObject: vi.fn(() =>
      Promise.resolve({ size: 300_000, contentType: 'image/webp' })
    ),
    downloadObject: vi.fn(() => Promise.resolve(Buffer.from('page'))),
    deleteObject: vi.fn(() => Promise.resolve()),
    transcodeToM4a: vi.fn(),
    getAccessToken: vi.fn(() => Promise.resolve('token')),
    uploadToDrive: vi.fn(() => Promise.resolve({ id: 'drive-9' })),
    deleteDriveFile: vi.fn(() => Promise.resolve()),
    resolveStudentName: vi.fn(() =>
      Promise.resolve({ givenName: 'Ava', familyName: 'Nguyen' })
    ),
    isFeatureGranted: vi.fn(() => Promise.resolve(false)),
    isWhiteboardGranted: vi.fn(() => Promise.resolve(false)),
    now: () => 1_700_000_000_000,
    ...over,
  };
}

const archive = (d: ArchiveDeps, callerUid: string | null = null) =>
  archiveQuizArtifactCore(
    {
      sessionId: SESSION,
      responseKey: KEY,
      questionId: '',
      artifactId: PAGE_ID,
      callerUid,
    },
    d
  );

const entryOf = (stub: ReturnType<typeof seed>) =>
  (stub.get(RESPONSE)?.artifactArchive as Record<string, StubData>)?.[PAGE_ID];

beforeEach(() => vi.clearAllMocks());

describe('kept page helpers', () => {
  it('accepts only the canonical page path under the teacher', () => {
    expect(hasPaperPageStoragePrefix(PATH, TEACHER)).toBe(true);
    for (const bad of [
      `paper_pages/other/${SCAN}/3/2.webp`,
      `paper_pages/${TEACHER}/${SCAN}/0/2.webp`,
      `paper_pages/${TEACHER}/${SCAN}/3/02.webp`,
      `paper_pages/${TEACHER}/${SCAN}/3/2.png`,
      `paper_pages/${TEACHER}/../3/2.webp`,
      `paper_written_crops/${TEACHER}/${SCAN}/3/2.webp`,
    ])
      expect(hasPaperPageStoragePrefix(bad, TEACHER)).toBe(false);
  });

  it('parses only ids the import mints', () => {
    expect(parsePaperPageArtifactId(PAGE_ID)).toEqual({
      scanId: SCAN,
      page: 2,
    });
    for (const bad of ['pg_scan-2_02', 'pg_scan_x_2', 'hw_scan-2_q1', 'pg__2'])
      expect(parsePaperPageArtifactId(bad)).toBeNull();
  });

  it('names a page Family_Given_p{page}, falling back to the pin', () => {
    const name = { givenName: 'Ava Rose', familyName: "O'Neil" };
    expect(buildPaperPageFileName(name, 'Pin0003', 2, '.webp')).toBe(
      "O'Neil_AvaRose_p2.webp"
    );
    expect(buildPaperPageFileName(null, 'Pin0003', 1, '.png')).toBe(
      'Pin0003_p1.png'
    );
  });
});

describe('archiving a kept page', () => {
  it('files it under Quiz Responses/{quiz}/Pages and deletes the Storage copy', async () => {
    const stub = seed();
    const d = deps(stub.db);
    expect(await archive(d)).toEqual({
      archiveStatus: 'archived',
      driveFileId: 'drive-9',
    });
    expect(d.uploadToDrive).toHaveBeenCalledWith(
      'token',
      Buffer.from('page'),
      'image/webp',
      'Nguyen_Ava_p2.webp',
      'Quiz Responses/Unit 3 Cells/Pages'
    );
    expect(d.deleteObject).toHaveBeenCalledWith(PATH);
    expect(entryOf(stub)).toMatchObject({
      archiveStatus: 'archived',
      driveFileId: 'drive-9',
      sourcePath: PATH,
    });
    // Archiving is retention hygiene, never gated on the feature.
    expect(d.isFeatureGranted).not.toHaveBeenCalled();
  });

  it('holds the page as awaiting-drive when the teacher has no Drive grant', async () => {
    const stub = seed();
    const d = deps(stub.db, {
      getAccessToken: vi.fn(() =>
        Promise.reject(new Error('needs-consent: no refresh token'))
      ),
    });
    expect(await archive(d)).toEqual({ archiveStatus: 'awaiting-drive' });
    expect(d.downloadObject).not.toHaveBeenCalled();
    expect(d.deleteObject).not.toHaveBeenCalled();
    expect(entryOf(stub)).toMatchObject({
      archiveStatus: 'awaiting-drive',
      awaitingDriveSince: 1_700_000_000_000,
    });
  });

  it('refuses a page the scan lookup does not trace to this response', async () => {
    const stub = seed({
      [`users/${TEACHER}/paper_page_scans/${SCAN}`]: {
        seats: { 3: { sessionId: SESSION, responseKey: 'someone-else' } },
      },
    });
    const d = deps(stub.db);
    await expect(archive(d)).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(d.uploadToDrive).not.toHaveBeenCalled();
  });

  it('refuses a page whose stored path names another seat', async () => {
    const stub = seed({
      [RESPONSE]: {
        studentUid: 'p',
        answers: [],
        paperPages: [
          page({ storagePath: `paper_pages/${TEACHER}/${SCAN}/4/2.webp` }),
        ],
      },
    });
    await expect(archive(deps(stub.db))).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('settles a pending entry whose page a rescan dropped, so the hourly retry stops', async () => {
    const stub = seed({
      [RESPONSE]: {
        studentUid: 'p',
        answers: [],
        artifactArchive: { [PAGE_ID]: { archiveStatus: 'failed' } },
        hasStuckArchive: true,
      },
    });
    await expect(archive(deps(stub.db))).rejects.toMatchObject({
      code: 'not-found',
      details: { artifactLost: true },
    });
    expect(entryOf(stub)).toMatchObject({ archiveStatus: 'lost' });
    expect(stub.get(RESPONSE)?.hasStuckArchive).toBe(false);
  });

  it('never reads a kept page from student-writable answers', async () => {
    const stub = seed({
      [RESPONSE]: {
        studentUid: 'p',
        answers: [{ questionId: '', artifacts: [page()] }],
      },
    });
    await expect(archive(deps(stub.db))).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('lets only the teacher or the server archive it', async () => {
    const stub = seed();
    await expect(
      archive(deps(stub.db), 'pin-period_1-0003')
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(archive(deps(stub.db), TEACHER)).resolves.toMatchObject({
      archiveStatus: 'archived',
    });
  });

  it('retries the Storage delete an archived page still owes', async () => {
    const stub = seed();
    await stub.db.doc(RESPONSE).set(
      {
        artifactArchive: {
          [PAGE_ID]: {
            archiveStatus: 'archived',
            driveFileId: 'drive-9',
            storageCleanupPending: true,
          },
        },
      },
      { merge: true }
    );
    const d = deps(stub.db);
    await retryStorageCleanup(
      {
        sessionId: SESSION,
        responseKey: KEY,
        questionId: '',
        artifactId: PAGE_ID,
      },
      d
    );
    expect(d.deleteObject).toHaveBeenCalledWith(PATH);
  });

  it('proves page ownership only with the artifact id and a database', async () => {
    const stub = seed();
    const base = {
      kind: 'paper-page',
      storagePath: PATH,
      sessionId: SESSION,
      responseKey: KEY,
      teacherUid: TEACHER,
      questionId: '',
      responseRef: stub.db.doc(RESPONSE) as never,
      response: {},
    };
    expect(await isArtifactStoragePathOwned(base)).toBe(false);
    expect(
      await isArtifactStoragePathOwned({
        ...base,
        artifactId: PAGE_ID,
        db: stub.db as never,
      })
    ).toBe(true);
  });
});
