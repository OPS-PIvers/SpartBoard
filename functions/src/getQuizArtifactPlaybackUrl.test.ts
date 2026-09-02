// Unit tests for the student playback proxy (Brief 3.6). Firestore is a tiny
// in-memory fake; Drive and the feature gate are injected stubs, so only the
// authorization decisions the brief specifies are under test.

import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  auth: vi.fn(() => ({ getUser: vi.fn() })),
  storage: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldValue: { delete: () => ({ __delete: true }) },
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
  gradingKeyFor,
  MAX_PLAYBACK_BYTES,
  parsePlaybackRequest,
  playbackBlockReason,
  resolveArtifactPlayback,
  selectPlaybackTake,
  type PlaybackDeps,
} from './getQuizArtifactPlaybackUrl';
import {
  QUIZ_MEDIA_ARCHIVE_SECRETS,
  QUIZ_MEDIA_GOOGLE_SECRETS,
} from './quizMediaArchive';

const STUDENT = 'student-1';
const TEACHER = 'teacher-1';

type Doc = Record<string, unknown>;

function makeDb(docs: Record<string, Doc>) {
  const get = (path: string) => ({
    get: () =>
      Promise.resolve({
        exists: docs[path] !== undefined,
        data: () => docs[path],
      }),
  });
  return {
    collection: (c: string) => ({
      doc: (id: string) => ({
        ...get(`${c}/${id}`),
        collection: (sub: string) => ({
          doc: (subId: string) => get(`${c}/${id}/${sub}/${subId}`),
        }),
      }),
    }),
  } as unknown as PlaybackDeps['db'];
}

function makeAnswers(takes: number[] = [1, 2]) {
  return takes.map((takeIndex) => ({
    questionId: 'q1',
    takeIndex,
    artifacts: [
      {
        id: `a${takeIndex}`,
        slot: 'primary',
        kind: 'audio',
        mimeType: 'audio/webm',
        durationMs: 4000,
      },
    ],
  }));
}

function makeDocs(
  overrides: {
    session?: Doc;
    response?: Doc;
  } = {}
): Record<string, Doc> {
  return {
    'quiz_sessions/s1': {
      teacherUid: TEACHER,
      scoreVisibility: 'score-and-responses',
      mediaResponseEnabled: true,
      ...overrides.session,
    },
    'quiz_sessions/s1/responses/r1': {
      studentUid: STUDENT,
      answers: makeAnswers(),
      artifactArchive: {
        a1: { archiveStatus: 'archived', driveFileId: 'drive-a1' },
        a2: { archiveStatus: 'archived', driveFileId: 'drive-a2' },
      },
      ...overrides.response,
    },
  };
}

function makeDeps(
  docs: Record<string, Doc>,
  over: Partial<PlaybackDeps> = {}
): PlaybackDeps {
  return {
    db: makeDb(docs),
    getAccessToken: () => Promise.resolve('token'),
    downloadDriveFile: () => Promise.resolve(Buffer.from('audio-bytes')),
    isFeatureGranted: () => Promise.resolve(true),
    ...over,
  };
}

const REQ = {
  sessionId: 's1',
  responseKey: 'r1',
  questionId: 'q1',
  slot: 'primary' as const,
  callerUid: STUDENT,
};

describe('playback secrets', () => {
  it('takes only the Google OAuth trio, not the archive bundle', () => {
    expect(QUIZ_MEDIA_GOOGLE_SECRETS).toHaveLength(3);
    expect(QUIZ_MEDIA_ARCHIVE_SECRETS.length).toBeGreaterThan(
      QUIZ_MEDIA_GOOGLE_SECRETS.length
    );
    for (const s of QUIZ_MEDIA_GOOGLE_SECRETS) {
      expect(QUIZ_MEDIA_ARCHIVE_SECRETS).toContain(s);
    }
  });
});

describe('parsePlaybackRequest', () => {
  it('fails closed on missing identifiers', () => {
    expect(() => parsePlaybackRequest({ sessionId: 's1' })).toThrow();
    expect(() => parsePlaybackRequest({})).toThrow();
  });

  it('rejects an unknown slot and a path-traversing key', () => {
    expect(() => parsePlaybackRequest({ ...REQ, slot: 'sneaky' })).toThrow();
    expect(() =>
      parsePlaybackRequest({ ...REQ, responseKey: '../other' })
    ).toThrow();
  });

  it('defaults the slot to primary', () => {
    expect(
      parsePlaybackRequest({
        sessionId: 's1',
        responseKey: 'r1',
        questionId: 'q1',
      }).slot
    ).toBe('primary');
  });
});

describe('gradingKeyFor', () => {
  it('leaves the primary slot unsuffixed for back-compat', () => {
    expect(gradingKeyFor('q1', 'primary')).toBe('q1');
    expect(gradingKeyFor('q1', 'addendum')).toBe('q1::addendum');
  });
});

describe('playbackBlockReason', () => {
  it('treats every non-archived status as not playable', () => {
    expect(playbackBlockReason(undefined)).toBe('archiving');
    expect(playbackBlockReason({ archiveStatus: 'syncing' })).toBe('archiving');
    expect(playbackBlockReason({ archiveStatus: 'failed' })).toBe('failed');
    expect(playbackBlockReason({ archiveStatus: 'lost' })).toBe('failed');
    expect(playbackBlockReason({ archiveStatus: 'deleting' })).toBe('deleted');
    expect(playbackBlockReason({ archiveStatus: 'deleted' })).toBe('deleted');
    expect(playbackBlockReason({ archiveStatus: 'delete-failed' })).toBe(
      'deleted'
    );
    expect(playbackBlockReason({ archiveStatus: 'archived' })).toBe(
      'archiving'
    );
    expect(
      playbackBlockReason({ archiveStatus: 'archived', driveFileId: 'x' })
    ).toBeNull();
  });
});

describe('selectPlaybackTake', () => {
  it('resolves the highest takeIndex when no grade pins one', () => {
    expect(
      selectPlaybackTake(makeAnswers([1, 2, 3]), 'q1', 'primary')
    ).toMatchObject({ takeIndex: 3 });
  });

  it('resolves the graded take when the teacher pinned one', () => {
    expect(
      selectPlaybackTake(makeAnswers([1, 2, 3]), 'q1', 'primary', 1)
    ).toMatchObject({ takeIndex: 1 });
  });

  it('falls back to the highest take when the pin does not exist', () => {
    expect(
      selectPlaybackTake(makeAnswers([1, 2]), 'q1', 'primary', 9)
    ).toMatchObject({ takeIndex: 2 });
  });

  it('ignores other questions, other slots and non-audio artifacts', () => {
    const answers = [
      {
        questionId: 'other',
        takeIndex: 9,
        artifacts: [{ id: 'x', kind: 'audio', slot: 'primary' }],
      },
      {
        questionId: 'q1',
        takeIndex: 5,
        artifacts: [{ id: 'y', kind: 'audio', slot: 'addendum' }],
      },
      {
        questionId: 'q1',
        takeIndex: 4,
        artifacts: [{ id: 'z', kind: 'text', slot: 'primary' }],
      },
      ...makeAnswers([1]),
    ];
    expect(selectPlaybackTake(answers, 'q1', 'primary')).toMatchObject({
      takeIndex: 1,
    });
  });

  it('returns null when the question has no audio take', () => {
    expect(selectPlaybackTake([], 'q1', 'primary')).toBeNull();
  });
});

describe('resolveArtifactPlayback', () => {
  it('denies before the teacher publishes', async () => {
    const docs = makeDocs({ session: { scoreVisibility: undefined } });
    await expect(
      resolveArtifactPlayback(REQ, makeDeps(docs))
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('denies when results were unpublished back to none', async () => {
    const docs = makeDocs({ session: { scoreVisibility: 'none' } });
    await expect(
      resolveArtifactPlayback(REQ, makeDeps(docs))
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('denies when the session predates the media marker', async () => {
    const docs = makeDocs({ session: { mediaResponseEnabled: undefined } });
    await expect(
      resolveArtifactPlayback(REQ, makeDeps(docs))
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('denies when the fail-closed feature record does not grant access', async () => {
    const deps = makeDeps(makeDocs(), {
      isFeatureGranted: () => Promise.resolve(false),
    });
    await expect(resolveArtifactPlayback(REQ, deps)).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('denies a forged responseKey belonging to a classmate', async () => {
    const deps = makeDeps(makeDocs());
    await expect(
      resolveArtifactPlayback({ ...REQ, callerUid: 'other-student' }, deps)
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('reports a mid-archive take as not available rather than erroring', async () => {
    const docs = makeDocs({
      response: {
        studentUid: STUDENT,
        answers: makeAnswers([1]),
        artifactArchive: { a1: { archiveStatus: 'syncing' } },
      },
    });
    const download = vi.fn();
    const result = await resolveArtifactPlayback(
      REQ,
      makeDeps(docs, { downloadDriveFile: download })
    );
    expect(result).toEqual({ status: 'not-available', reason: 'archiving' });
    expect(download).not.toHaveBeenCalled();
  });

  it('reports a compliance-deleted take as not available', async () => {
    const docs = makeDocs({
      response: {
        studentUid: STUDENT,
        answers: makeAnswers([1]),
        artifactArchive: { a1: { archiveStatus: 'deleted' } },
      },
    });
    await expect(resolveArtifactPlayback(REQ, makeDeps(docs))).resolves.toEqual(
      { status: 'not-available', reason: 'deleted' }
    );
  });

  it('returns the bytes for the owning student once published and archived', async () => {
    const result = await resolveArtifactPlayback(REQ, makeDeps(makeDocs()));
    expect(result).toMatchObject({
      status: 'ready',
      artifactId: 'a2',
      takeIndex: 2,
      mimeType: 'audio/mp4',
      data: Buffer.from('audio-bytes').toString('base64'),
      durationMs: 4000,
    });
  });

  it('serves the graded take, not the newest one', async () => {
    const docs = makeDocs({
      response: {
        studentUid: STUDENT,
        answers: makeAnswers([1, 2]),
        grading: { q1: { gradedTakeIndex: 1 } },
        artifactArchive: {
          a1: { archiveStatus: 'archived', driveFileId: 'drive-a1' },
          a2: { archiveStatus: 'archived', driveFileId: 'drive-a2' },
        },
      },
    });
    const download = vi.fn(() => Promise.resolve(Buffer.from('one')));
    const result = await resolveArtifactPlayback(
      REQ,
      makeDeps(docs, { downloadDriveFile: download })
    );
    expect(result).toMatchObject({ status: 'ready', artifactId: 'a1' });
    expect(download).toHaveBeenCalledWith('token', 'drive-a1');
  });

  it('never hands the client a Drive id or a token', async () => {
    const result = await resolveArtifactPlayback(REQ, makeDeps(makeDocs()));
    expect(JSON.stringify(result)).not.toContain('drive-a2');
    expect(JSON.stringify(result)).not.toContain('token');
  });

  it('refuses an oversized file rather than truncating it', async () => {
    const deps = makeDeps(makeDocs(), {
      downloadDriveFile: () =>
        Promise.resolve(Buffer.alloc(MAX_PLAYBACK_BYTES + 1, 0x41)),
    });
    await expect(resolveArtifactPlayback(REQ, deps)).resolves.toEqual({
      status: 'not-available',
      reason: 'too-large',
    });
  });

  it('surfaces a Drive failure as unavailable, never as a leak', async () => {
    const deps = makeDeps(makeDocs(), {
      downloadDriveFile: () => Promise.reject(new Error('drive 500')),
    });
    await expect(resolveArtifactPlayback(REQ, deps)).rejects.toMatchObject({
      code: 'unavailable',
    });
  });

  it('reports no-recording for a question with no audio take', async () => {
    const docs = makeDocs({
      response: { studentUid: STUDENT, answers: [], artifactArchive: {} },
    });
    await expect(resolveArtifactPlayback(REQ, makeDeps(docs))).resolves.toEqual(
      { status: 'not-available', reason: 'no-recording' }
    );
  });

  it('fails closed on a missing session or response', async () => {
    await expect(
      resolveArtifactPlayback(REQ, makeDeps({}))
    ).rejects.toMatchObject({ code: 'not-found' });
    await expect(
      resolveArtifactPlayback(
        REQ,
        makeDeps({ 'quiz_sessions/s1': makeDocs()['quiz_sessions/s1'] })
      )
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});
