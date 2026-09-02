// Unit tests for the quiz media Drive archival core (Brief 3.3).
//
// `archiveQuizArtifactCore` takes an injectable `ArchiveDeps`, so Storage,
// ffmpeg, Drive and the name resolver are all stubs here; only the decision
// logic the brief specifies is under test.

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
}));
vi.mock('./classlinkShared', () => ({
  ALLOWED_ORIGINS: [],
  computeStudentUid: (id: string) => `uid:${id}`,
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
  buildArchiveFileName,
  computeHasStuckArchive,
  countCommittedTakes,
  exceedsTakeLimit,
  hasQuizMediaStoragePrefix,
  parseRefKey,
  questionLabelFor,
  type ArchiveDeps,
} from './quizMediaArchive';

const SESSION_ID = 'sess-1';
const RESPONSE_KEY = 'resp-1';
const STUDENT_UID = 'student-1';
const TEACHER_UID = 'teacher-1';
const QUESTION_ID = 'q1';
const ARTIFACT_ID = 'art-1';
const GOOD_PATH = `quiz_response_media/${SESSION_ID}/${STUDENT_UID}/${ARTIFACT_ID}.webm`;

interface SeedOptions {
  session?: Record<string, unknown>;
  response?: Record<string, unknown>;
}

function makeStubDb(seed: SeedOptions) {
  const writes: Record<string, unknown>[] = [];
  const session = seed.session ?? null;
  const response = seed.response ?? null;
  const responseRef = {
    get: () =>
      Promise.resolve({
        exists: response !== null,
        data: () => response ?? undefined,
      }),
    set: (data: Record<string, unknown>) => {
      writes.push(data);
      return Promise.resolve();
    },
  };
  const sessionRef = {
    get: () =>
      Promise.resolve({
        exists: session !== null,
        data: () => session ?? undefined,
      }),
    collection: () => ({ doc: () => responseRef }),
  };
  const db = {
    collection: (name: string) => {
      if (name !== 'quiz_sessions') {
        throw new Error(`Unexpected collection ${name}`);
      }
      return { doc: () => sessionRef };
    },
  };
  return { db, writes };
}

function makeDeps(
  db: unknown,
  overrides: Partial<ArchiveDeps> = {}
): ArchiveDeps {
  return {
    db: db as ArchiveDeps['db'],
    statObject: vi.fn(() =>
      Promise.resolve({ size: 1024, contentType: 'audio/webm' })
    ),
    downloadObject: vi.fn(() => Promise.resolve(Buffer.from('source'))),
    deleteObject: vi.fn(() => Promise.resolve()),
    transcodeToM4a: vi.fn(() => Promise.resolve(Buffer.from('m4a'))),
    getAccessToken: vi.fn(() => Promise.resolve('token')),
    uploadToDrive: vi.fn(() => Promise.resolve({ id: 'drive-1' })),
    resolveStudentName: vi.fn(() =>
      Promise.resolve({ givenName: 'Ava', familyName: 'Nguyen' })
    ),
    isFeatureGranted: vi.fn(() => Promise.resolve(true)),
    now: () => 1_700_000_000_000,
    ...overrides,
  };
}

function baseSeed(overrides: SeedOptions = {}): SeedOptions {
  return {
    session: {
      teacherUid: TEACHER_UID,
      quizTitle: 'Unit 3 Speaking',
      publicQuestions: [{ id: QUESTION_ID }],
      ...(overrides.session ?? {}),
    },
    response: {
      studentUid: STUDENT_UID,
      answers: [
        {
          questionId: QUESTION_ID,
          artifacts: [
            {
              id: ARTIFACT_ID,
              kind: 'audio',
              storagePath: GOOD_PATH,
              uploadState: 'pending',
            },
          ],
        },
      ],
      ...(overrides.response ?? {}),
    },
  };
}

function call(deps: ArchiveDeps) {
  return archiveQuizArtifactCore(
    {
      sessionId: SESSION_ID,
      responseKey: RESPONSE_KEY,
      questionId: QUESTION_ID,
      artifactId: ARTIFACT_ID,
      callerUid: STUDENT_UID,
    },
    deps
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('pure helpers', () => {
  it('accepts only paths under this response prefix', () => {
    expect(hasQuizMediaStoragePrefix(GOOD_PATH, SESSION_ID, STUDENT_UID)).toBe(
      true
    );
    expect(
      hasQuizMediaStoragePrefix(
        `quiz_response_media/${SESSION_ID}/other-student/x.webm`,
        SESSION_ID,
        STUDENT_UID
      )
    ).toBe(false);
    expect(
      hasQuizMediaStoragePrefix(
        `quiz_response_media/${SESSION_ID}/${STUDENT_UID}/nested/x.webm`,
        SESSION_ID,
        STUDENT_UID
      )
    ).toBe(false);
  });

  it('treats an absent takeLimit as unlimited', () => {
    expect(exceedsTakeLimit(99, null)).toBe(false);
    expect(exceedsTakeLimit(99, undefined)).toBe(false);
    expect(exceedsTakeLimit(1, 2)).toBe(false);
    expect(exceedsTakeLimit(2, 2)).toBe(true);
  });

  it('counts committed sibling takes, excluding the one being archived', () => {
    const answers = [
      {
        questionId: QUESTION_ID,
        artifacts: [{ id: 'old-1', uploadState: 'uploaded' }],
      },
      {
        questionId: QUESTION_ID,
        artifacts: [{ id: 'old-2', uploadState: 'failed' }],
      },
      {
        questionId: QUESTION_ID,
        artifacts: [{ id: ARTIFACT_ID, uploadState: 'pending' }],
      },
      {
        questionId: 'other',
        artifacts: [{ id: 'x', uploadState: 'uploaded' }],
      },
    ];
    expect(countCommittedTakes(answers, QUESTION_ID, ARTIFACT_ID)).toBe(1);
  });

  it('names the Drive file with the real name and question position', () => {
    expect(
      buildArchiveFileName(
        { givenName: 'Ava', familyName: 'Nguyen' },
        'Pin1234',
        'Q3'
      )
    ).toBe('Nguyen_Ava__Q3.m4a');
    expect(buildArchiveFileName(null, 'Pin1234', 'Q1')).toBe('Pin1234__Q1.m4a');
  });

  it('labels a question by its 1-based position', () => {
    expect(questionLabelFor([{ id: 'a' }, { id: 'b' }], 'b')).toBe('Q2');
    expect(questionLabelFor([], 'zz')).toBe('Qzz');
  });

  it('flags the response as stuck only while an entry needs the sweep', () => {
    expect(computeHasStuckArchive({ a: { archiveStatus: 'archived' } })).toBe(
      false
    );
    expect(
      computeHasStuckArchive({
        a: { archiveStatus: 'archived' },
        b: { archiveStatus: 'failed' },
      })
    ).toBe(true);
  });

  it('round-trips ref keys', () => {
    expect(parseRefKey('classlink:abc')).toEqual({
      kind: 'classlink',
      sourcedId: 'abc',
    });
    expect(parseRefKey('test:kid@school.edu')).toEqual({
      kind: 'test',
      email: 'kid@school.edu',
    });
    expect(parseRefKey('nonsense')).toBeNull();
  });
});

describe('archiveQuizArtifactCore', () => {
  it('archives to Drive, marks archived and deletes the Storage object', async () => {
    const { db, writes } = makeStubDb(baseSeed());
    const deps = makeDeps(db);
    const result = await call(deps);

    expect(result).toEqual({
      archiveStatus: 'archived',
      driveFileId: 'drive-1',
    });
    expect(deps.uploadToDrive).toHaveBeenCalledWith(
      'token',
      expect.anything(),
      'audio/mp4',
      'Nguyen_Ava__Q1.m4a',
      'Quiz Responses/Unit 3 Speaking'
    );
    expect(deps.deleteObject).toHaveBeenCalledWith(GOOD_PATH);

    const syncing = writes[0].artifactArchive as Record<
      string,
      { archiveStatus: string }
    >;
    expect(syncing[ARTIFACT_ID].archiveStatus).toBe('syncing');
    expect(writes[0].hasStuckArchive).toBe(true);
    const archived = writes[1].artifactArchive as Record<
      string,
      { archiveStatus: string; driveFileId: string }
    >;
    expect(archived[ARTIFACT_ID]).toMatchObject({
      archiveStatus: 'archived',
      driveFileId: 'drive-1',
    });
    expect(writes[1].hasStuckArchive).toBe(false);
  });

  it('never calls a public-sharing step on the Drive file', async () => {
    const { db } = makeStubDb(baseSeed());
    const deps = makeDeps(db);
    await call(deps);
    expect(Object.keys(deps)).not.toContain('makeDriveFilePublic');
  });

  it('rejects a forged storagePath before any Drive write', async () => {
    const seed = baseSeed();
    (
      (seed.response as { answers: { artifacts: { storagePath: string }[] }[] })
        .answers[0].artifacts[0] as { storagePath: string }
    ).storagePath = 'quiz_response_media/sess-1/someone-else/art-1.webm';
    const { db } = makeStubDb(seed);
    const deps = makeDeps(db);
    await expect(call(deps)).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(deps.uploadToDrive).not.toHaveBeenCalled();
    expect(deps.downloadObject).not.toHaveBeenCalled();
  });

  it('rejects when the take limit is already met', async () => {
    const seed = baseSeed();
    (seed.response as { answers: unknown[] }).answers = [
      {
        questionId: QUESTION_ID,
        artifacts: [{ id: 'old-1', uploadState: 'uploaded' }],
      },
      ...(seed.response as { answers: unknown[] }).answers,
    ];
    (seed.session as { publicQuestions: unknown[] }).publicQuestions = [
      { id: QUESTION_ID, recording: { takeLimit: 1 } },
    ];
    const { db } = makeStubDb(seed);
    const deps = makeDeps(db);
    await expect(call(deps)).rejects.toMatchObject({
      code: 'resource-exhausted',
    });
    expect(deps.uploadToDrive).not.toHaveBeenCalled();
  });

  it('rejects an oversized Storage object before downloading it', async () => {
    const { db } = makeStubDb(baseSeed());
    const deps = makeDeps(db, {
      statObject: vi.fn(() =>
        Promise.resolve({ size: 20 * 1024 * 1024, contentType: 'audio/webm' })
      ),
    });
    await expect(call(deps)).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    expect(deps.downloadObject).not.toHaveBeenCalled();
  });

  it('rejects a missing Storage object', async () => {
    const { db } = makeStubDb(baseSeed());
    const deps = makeDeps(db, {
      statObject: vi.fn(() => Promise.resolve(null)),
    });
    await expect(call(deps)).rejects.toMatchObject({ code: 'not-found' });
  });

  it('records archiveStatus failed with a message when the transcode fails', async () => {
    const { db, writes } = makeStubDb(baseSeed());
    const deps = makeDeps(db, {
      transcodeToM4a: vi.fn(() => Promise.reject(new Error('ffmpeg exited 1'))),
    });
    await expect(call(deps)).rejects.toMatchObject({ code: 'internal' });
    const failed = writes[writes.length - 1].artifactArchive as Record<
      string,
      { archiveStatus: string; archiveError: string }
    >;
    expect(failed[ARTIFACT_ID]).toMatchObject({
      archiveStatus: 'failed',
      archiveError: 'ffmpeg exited 1',
    });
    expect(writes[writes.length - 1].hasStuckArchive).toBe(true);
    expect(deps.deleteObject).not.toHaveBeenCalled();
  });

  it('fails closed when the feature permission record is missing', async () => {
    const { db } = makeStubDb(baseSeed());
    const deps = makeDeps(db, {
      isFeatureGranted: vi.fn(() => Promise.resolve(false)),
    });
    await expect(call(deps)).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(deps.uploadToDrive).not.toHaveBeenCalled();
  });

  it('rejects a caller who does not own the response', async () => {
    const { db } = makeStubDb(baseSeed());
    const deps = makeDeps(db);
    await expect(
      archiveQuizArtifactCore(
        {
          sessionId: SESSION_ID,
          responseKey: RESPONSE_KEY,
          questionId: QUESTION_ID,
          artifactId: ARTIFACT_ID,
          callerUid: 'someone-else',
        },
        deps
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('is idempotent once the artifact is already archived', async () => {
    const seed = baseSeed();
    (seed.response as Record<string, unknown>).artifactArchive = {
      [ARTIFACT_ID]: { archiveStatus: 'archived', driveFileId: 'drive-old' },
    };
    const { db } = makeStubDb(seed);
    const deps = makeDeps(db);
    const result = await call(deps);
    expect(result.driveFileId).toBe('drive-old');
    expect(deps.uploadToDrive).not.toHaveBeenCalled();
  });

  it('falls back to the PIN label when no real name resolves', async () => {
    const seed = baseSeed();
    (seed.response as Record<string, unknown>).pin = '4821';
    const { db } = makeStubDb(seed);
    const deps = makeDeps(db, {
      resolveStudentName: vi.fn(() => Promise.resolve(null)),
    });
    await call(deps);
    expect(deps.uploadToDrive).toHaveBeenCalledWith(
      'token',
      expect.anything(),
      'audio/mp4',
      'Pin4821__Q1.m4a',
      'Quiz Responses/Unit 3 Speaking'
    );
  });
});
