// Unit tests for the Activity Wall Drive archival core and its hourly sweep.
//
// `archiveActivityWallMediaCore` takes an injectable `WallArchiveDeps`, so
// Storage, Drive and the OAuth refresh are stubs here; only the decision logic
// the brief specifies is under test.

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

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentCreated: (_opts: unknown, handler: unknown) => handler,
  onDocumentUpdated: (_opts: unknown, handler: unknown) => handler,
}));

vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_opts: unknown, handler: unknown) => handler,
}));

vi.mock('firebase-functions/params', () => ({
  defineSecret: (name: string) => ({ value: () => `secret:${name}` }),
}));

vi.mock('./functionsInit', () => ({}));
vi.mock('./googleOAuth', () => ({
  refreshGoogleAccessTokenForUid: vi.fn(),
}));
vi.mock('./secrets', () => ({
  GOOGLE_OAUTH_CLIENT_ID: { value: () => 'secret:gid' },
}));

import {
  archiveActivityWallMediaCore,
  buildArchiveFileName,
  buildDriveUrl,
  resolveDrivePermission,
  buildWallFolderPath,
  effectiveArchiveStatus,
  hasActivityWallStoragePrefix,
  isAllowedMimeForType,
  isNeedsConsentError,
  maxBytesForType,
  resolveArchivableType,
  resolveFailedArchiveStatus,
  shouldArchiveSubmission,
  teacherUidFromSessionId,
  MAX_ARCHIVE_ATTEMPTS,
  SESSIONS_COLLECTION,
  STREAM_DOWNLOAD_THRESHOLD_BYTES,
  type WallArchiveDeps,
} from './activityWallArchive';
import {
  isOrphanedObject,
  isStuckSubmission,
  parseMediaObjectName,
  runSweepActivityWallArchives,
  STUCK_SUBMISSION_AGE_MS,
} from './sweepActivityWallArchives';

const TEACHER_UID = 'teacher-1';
const ACTIVITY_ID = 'wall-abc123456';
const SESSION_ID = `${TEACHER_UID}_${ACTIVITY_ID}`;
const SUBMISSION_ID = 'sub-1';
const GOOD_PATH = `activity_wall_media/${SESSION_ID}/${SUBMISSION_ID}/photo.jpg`;
const NOW = 1_700_000_000_000;

type Bag = Record<string, unknown>;

const isDelete = (v: unknown) =>
  typeof v === 'object' && v !== null && '__delete' in (v as Bag);

/** Firestore `set(..., {merge: true})` semantics, including map merging. */
function mergeInto(target: Bag, patch: Bag): Bag {
  for (const [key, value] of Object.entries(patch)) {
    if (isDelete(value)) {
      delete target[key];
    } else if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    ) {
      const existing = target[key];
      target[key] = mergeInto(
        typeof existing === 'object' && existing !== null
          ? { ...(existing as Bag) }
          : {},
        value as Bag
      );
    } else {
      target[key] = value;
    }
  }
  return target;
}

interface SeedOptions {
  session?: Bag | null;
  submission?: Bag | null;
}

function makeStubDb(seed: SeedOptions) {
  const session = seed.session === undefined ? {} : seed.session;
  const submission: Bag | null =
    seed.submission === undefined ? null : seed.submission;
  const state = submission ? { ...submission } : null;
  const writes: Bag[] = [];
  const submissionRef = {
    id: SUBMISSION_ID,
    get: () =>
      Promise.resolve({
        exists: state !== null,
        data: () => state ?? undefined,
      }),
    set: (data: Bag) => {
      writes.push(data);
      if (state) mergeInto(state, data);
      return Promise.resolve();
    },
  };
  const sessionRef = {
    id: SESSION_ID,
    get: () =>
      Promise.resolve({
        exists: session !== null,
        data: () => session ?? undefined,
      }),
    collection: () => ({ doc: () => submissionRef }),
  };
  let chain: Promise<unknown> = Promise.resolve();
  const db = {
    collection: (name: string) => {
      if (name !== 'activity_wall_sessions') {
        throw new Error(`Unexpected collection ${name}`);
      }
      return { doc: () => sessionRef };
    },
    runTransaction: <T>(
      fn: (tx: {
        get: (ref: typeof submissionRef) => Promise<unknown>;
        set: (ref: typeof submissionRef, data: Bag) => void;
      }) => Promise<T>
    ): Promise<T> => {
      const next = chain.then(() =>
        fn({
          get: (ref) => ref.get(),
          set: (ref, data) => {
            void ref.set(data);
          },
        })
      );
      chain = next.catch(() => undefined);
      return next;
    },
  };
  return { db, writes, state };
}

function makeDeps(
  db: unknown,
  overrides: Partial<WallArchiveDeps> = {}
): WallArchiveDeps {
  return {
    db: db as WallArchiveDeps['db'],
    statObject: vi.fn(() =>
      Promise.resolve({ size: 2048, contentType: 'image/jpeg' })
    ),
    downloadObject: vi.fn(() => Promise.resolve(Buffer.from('bytes'))),
    downloadObjectToTempFile: vi.fn(() => Promise.resolve('/tmp/media.bin')),
    deleteObject: vi.fn(() => Promise.resolve()),
    getAccessToken: vi.fn(() => Promise.resolve('token')),
    getUserEmail: vi.fn(() => Promise.resolve('teacher@school.org')),
    uploadToDrive: vi.fn(() => Promise.resolve({ id: 'drive-1' })),
    uploadFileToDrive: vi.fn(() => Promise.resolve({ id: 'drive-big' })),
    discardTempFile: vi.fn(() => Promise.resolve()),
    setDrivePermission: vi.fn(() => Promise.resolve()),
    now: () => NOW,
    ...overrides,
  };
}

function baseSeed(overrides: SeedOptions = {}): SeedOptions {
  return {
    session: {
      teacherUid: TEACHER_UID,
      title: 'Field Trip Photos',
      driveVisibility: 'domain',
      ...(overrides.session ?? {}),
    },
    submission: {
      type: 'photo',
      storagePath: GOOD_PATH,
      archiveStatus: 'firebase',
      submittedAt: NOW - 60_000,
      ...(overrides.submission ?? {}),
    },
  };
}

const call = (deps: WallArchiveDeps) =>
  archiveActivityWallMediaCore(deps, {
    sessionId: SESSION_ID,
    submissionId: SUBMISSION_ID,
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('pure helpers', () => {
  it('accepts only in-wall storage paths', () => {
    expect(
      hasActivityWallStoragePrefix(GOOD_PATH, SESSION_ID, SUBMISSION_ID)
    ).toBe(true);
    expect(
      hasActivityWallStoragePrefix(
        `activity_wall_photos/${SESSION_ID}/${SUBMISSION_ID}.jpg`,
        SESSION_ID,
        SUBMISSION_ID
      )
    ).toBe(true);
    expect(
      hasActivityWallStoragePrefix(
        `activity_wall_media/other-session/${SUBMISSION_ID}/a.jpg`,
        SESSION_ID,
        SUBMISSION_ID
      )
    ).toBe(false);
    expect(
      hasActivityWallStoragePrefix(
        `activity_wall_media/${SESSION_ID}/${SUBMISSION_ID}/../x.jpg`,
        SESSION_ID,
        SUBMISSION_ID
      )
    ).toBe(false);
  });

  it('derives the teacher uid from the session id', () => {
    expect(teacherUidFromSessionId(SESSION_ID)).toBe(TEACHER_UID);
    expect(teacherUidFromSessionId('nounderscore')).toBe('');
  });

  it('maps types to caps, MIME allowlists and Drive URLs', () => {
    expect(resolveArchivableType('video', '')).toBe('video');
    expect(resolveArchivableType(undefined, '')).toBe('photo');
    expect(resolveArchivableType('text', 'text/plain')).toBeNull();
    expect(maxBytesForType('video')).toBe(200 * 1024 * 1024);
    expect(isAllowedMimeForType('file', 'application/pdf')).toBe(true);
    expect(isAllowedMimeForType('file', 'image/jpeg')).toBe(false);
    expect(buildDriveUrl('photo', 'abc')).toBe(
      'https://drive.google.com/thumbnail?id=abc&sz=w2000'
    );
    expect(buildDriveUrl('video', 'abc')).toBe(
      'https://drive.google.com/file/d/abc/preview'
    );
    expect(buildDriveUrl('file', 'abc')).toBe(
      'https://drive.google.com/file/d/abc/view'
    );
  });

  it('defaults an absent driveVisibility to a domain permission', () => {
    expect(resolveDrivePermission(undefined, 'teacher@school.org')).toEqual({
      permission: {
        type: 'domain',
        domain: 'school.org',
        role: 'reader',
        allowFileDiscovery: false,
      },
      value: 'domain',
    });
    expect(resolveDrivePermission('anyone', null)).toEqual({
      permission: { type: 'anyone', role: 'reader' },
      value: 'anyone',
    });
    expect(() => resolveDrivePermission('domain', null)).toThrow();
  });

  it('adds no permission for a domain share on a public webmail domain', () => {
    expect(resolveDrivePermission(undefined, 'teacher@gmail.com')).toEqual({
      permission: null,
      value: 'private',
    });
    expect(resolveDrivePermission(undefined, 'teacher@Outlook.com')).toEqual({
      permission: null,
      value: 'private',
    });
  });

  it('builds folder path and file name', () => {
    expect(buildWallFolderPath('Field Trip', SESSION_ID)).toBe(
      'Activity Walls/Field Trip (wall-abc)'
    );
    expect(
      buildArchiveFileName(SUBMISSION_ID, 'my photo.jpg', 'image/jpeg')
    ).toBe('my photo.jpg');
    expect(buildArchiveFileName(SUBMISSION_ID, undefined, 'image/png')).toBe(
      'sub-1.png'
    );
  });

  it('treats a storagePath with no status as firebase', () => {
    expect(effectiveArchiveStatus({ storagePath: GOOD_PATH })).toBe('firebase');
    expect(effectiveArchiveStatus({ archiveStatus: 'archived' })).toBe(
      'archived'
    );
    expect(effectiveArchiveStatus({})).toBeNull();
    expect(shouldArchiveSubmission({ storagePath: GOOD_PATH })).toBe(true);
    expect(
      shouldArchiveSubmission({
        storagePath: GOOD_PATH,
        archiveStatus: 'archived',
      })
    ).toBe(false);
  });

  it('settles at lost only on the attempt ceiling or an unrecoverable error', () => {
    expect(resolveFailedArchiveStatus(1, false)).toBe('failed');
    expect(resolveFailedArchiveStatus(1, true)).toBe('lost');
    expect(resolveFailedArchiveStatus(MAX_ARCHIVE_ATTEMPTS, false)).toBe(
      'lost'
    );
  });

  it('recognizes the needs-consent refresh failure', () => {
    expect(isNeedsConsentError({ details: { reason: 'needs-consent' } })).toBe(
      true
    );
    expect(isNeedsConsentError(new Error('boom'))).toBe(false);
  });
});

describe('archiveActivityWallMediaCore', () => {
  it('archives with a domain permission and deletes the transit object', async () => {
    const { db, state } = makeStubDb(baseSeed());
    const deps = makeDeps(db);
    const result = await call(deps);

    expect(result).toEqual({
      archiveStatus: 'archived',
      driveFileId: 'drive-1',
    });
    expect(deps.setDrivePermission).toHaveBeenCalledWith('token', 'drive-1', {
      type: 'domain',
      domain: 'school.org',
      role: 'reader',
      allowFileDiscovery: false,
    });
    expect(deps.uploadToDrive).toHaveBeenCalledWith(
      'token',
      expect.any(Buffer),
      'image/jpeg',
      'sub-1.jpg',
      'Activity Walls/Field Trip Photos (wall-abc)'
    );
    expect(deps.deleteObject).toHaveBeenCalledWith(GOOD_PATH);
    expect(state?.archiveStatus).toBe('archived');
    expect(state?.content).toBe(
      'https://drive.google.com/thumbnail?id=drive-1&sz=w2000'
    );
    expect(state?.storagePath).toBeUndefined();
  });

  it('uses an anyone permission when the wall allows guests', async () => {
    const { db } = makeStubDb(
      baseSeed({ session: { driveVisibility: 'anyone' } })
    );
    const deps = makeDeps(db);
    await call(deps);
    expect(deps.setDrivePermission).toHaveBeenCalledWith('token', 'drive-1', {
      type: 'anyone',
      role: 'reader',
    });
  });

  it('streams anything over the buffering threshold', async () => {
    const { db } = makeStubDb(
      baseSeed({ submission: { type: 'video', mimeType: 'video/mp4' } })
    );
    const deps = makeDeps(db, {
      statObject: vi.fn(() =>
        Promise.resolve({
          size: STREAM_DOWNLOAD_THRESHOLD_BYTES + 1,
          contentType: 'video/mp4',
        })
      ),
    });
    const result = await call(deps);
    expect(result.driveFileId).toBe('drive-big');
    expect(deps.downloadObject).not.toHaveBeenCalled();
    expect(deps.uploadFileToDrive).toHaveBeenCalled();
    expect(deps.discardTempFile).toHaveBeenCalledWith('/tmp/media.bin');
  });

  it('records needs-consent without burning an attempt', async () => {
    const { db, state } = makeStubDb(baseSeed());
    const consentError = Object.assign(new Error('needs-consent: no token'), {
      details: { reason: 'needs-consent' },
    });
    const deps = makeDeps(db, {
      getAccessToken: vi.fn(() => Promise.reject(consentError)),
    });
    await expect(call(deps)).rejects.toThrow();
    expect(state?.archiveStatus).toBe('failed');
    expect(state?.archiveError).toBe('needs-consent');
    expect(state?.attemptCount).toBe(0);
  });

  it('settles at lost on the fifth failed attempt', async () => {
    const { db, state } = makeStubDb(
      baseSeed({
        submission: {
          archiveStatus: 'failed',
          attemptCount: MAX_ARCHIVE_ATTEMPTS - 1,
        },
      })
    );
    const deps = makeDeps(db, {
      uploadToDrive: vi.fn(() => Promise.reject(new Error('drive down'))),
    });
    await expect(call(deps)).rejects.toThrow('drive down');
    expect(state?.attemptCount).toBe(MAX_ARCHIVE_ATTEMPTS);
    expect(state?.archiveStatus).toBe('lost');
  });

  it('gives up immediately when the transit object is gone', async () => {
    const { db, state } = makeStubDb(baseSeed());
    const deps = makeDeps(db, {
      statObject: vi.fn(() => Promise.resolve(null)),
    });
    await expect(call(deps)).rejects.toThrow();
    expect(state?.archiveStatus).toBe('lost');
    expect(state?.attemptCount).toBe(1);
  });

  it('no-ops while another run owns the claim', async () => {
    const { db } = makeStubDb(
      baseSeed({
        submission: {
          archiveStatus: 'syncing',
          archiveStartedAt: NOW - 1000,
        },
      })
    );
    const deps = makeDeps(db);
    const result = await call(deps);
    expect(result).toEqual({ archiveStatus: 'syncing' });
    expect(deps.uploadToDrive).not.toHaveBeenCalled();
  });

  it('finalizes instead of re-uploading when a prior attempt already reached Drive', async () => {
    const { db, state } = makeStubDb(
      baseSeed({
        submission: {
          archiveStatus: 'failed',
          driveFileId: 'drive-orphaned',
          attemptCount: 2,
        },
      })
    );
    const deps = makeDeps(db);
    const result = await call(deps);

    expect(result).toEqual({
      archiveStatus: 'archived',
      driveFileId: 'drive-orphaned',
    });
    expect(deps.uploadToDrive).not.toHaveBeenCalled();
    expect(deps.setDrivePermission).toHaveBeenCalledWith(
      'token',
      'drive-orphaned',
      {
        type: 'domain',
        domain: 'school.org',
        role: 'reader',
        allowFileDiscovery: false,
      }
    );
    expect(deps.deleteObject).toHaveBeenCalledWith(GOOD_PATH);
    expect(state?.archiveStatus).toBe('archived');
    expect(state?.driveFileId).toBe('drive-orphaned');
    expect(state?.content).toBe(
      'https://drive.google.com/thumbnail?id=drive-orphaned&sz=w2000'
    );
    expect(state?.storagePath).toBeUndefined();
  });

  it('ignores a client-writable session.teacherUid and derives it from the sessionId', async () => {
    const { db } = makeStubDb(
      baseSeed({ session: { teacherUid: 'attacker-uid' } })
    );
    const deps = makeDeps(db);
    await call(deps);
    expect(deps.getAccessToken).toHaveBeenCalledWith(TEACHER_UID);
  });

  it('writes a private permission for a domain share to a public webmail domain', async () => {
    const { db, state } = makeStubDb(baseSeed());
    const deps = makeDeps(db, {
      getUserEmail: vi.fn(() => Promise.resolve('teacher@gmail.com')),
    });
    await call(deps);
    expect(deps.setDrivePermission).not.toHaveBeenCalled();
    expect(state?.drivePermission).toBe('private');
  });

  it('returns the existing Drive id when already archived', async () => {
    const { db } = makeStubDb(
      baseSeed({
        submission: { archiveStatus: 'archived', driveFileId: 'drive-old' },
      })
    );
    const deps = makeDeps(db);
    const result = await call(deps);
    expect(result).toEqual({
      archiveStatus: 'archived',
      driveFileId: 'drive-old',
    });
    expect(deps.uploadToDrive).not.toHaveBeenCalled();
  });
});

describe('sweepActivityWallArchives', () => {
  it('classifies stuck submissions and orphaned objects', () => {
    expect(
      isStuckSubmission({ submittedAt: NOW - STUCK_SUBMISSION_AGE_MS }, NOW)
    ).toBe(true);
    expect(isStuckSubmission({ submittedAt: NOW - 1000 }, NOW)).toBe(false);
    expect(isStuckSubmission({}, NOW)).toBe(false);
    expect(parseMediaObjectName(GOOD_PATH)).toEqual({
      sessionId: SESSION_ID,
      submissionId: SUBMISSION_ID,
    });
    expect(
      parseMediaObjectName(
        `activity_wall_photos/${SESSION_ID}/${SUBMISSION_ID}.jpg`
      )
    ).toEqual({ sessionId: SESSION_ID, submissionId: SUBMISSION_ID });
    expect(parseMediaObjectName('other/thing.jpg')).toBeNull();
    const old = NOW - 8 * 24 * 60 * 60 * 1000;
    expect(isOrphanedObject(null, GOOD_PATH, old, NOW)).toBe(true);
    expect(
      isOrphanedObject({ archiveStatus: 'lost' }, GOOD_PATH, old, NOW)
    ).toBe(true);
    expect(
      isOrphanedObject(
        { archiveStatus: 'firebase', storagePath: GOOD_PATH },
        GOOD_PATH,
        old,
        NOW
      )
    ).toBe(false);
    expect(isOrphanedObject(null, GOOD_PATH, NOW - 1000, NOW)).toBe(false);
  });

  it('deletes a 7-day-old orphan and marks its submission lost', async () => {
    const submissionState: Bag = {
      archiveStatus: 'lost',
      storagePath: GOOD_PATH,
    };
    const submissionRef = {
      get: () => Promise.resolve({ exists: true, data: () => submissionState }),
      set: (data: Bag) => {
        mergeInto(submissionState, data);
        return Promise.resolve();
      },
    };
    const db = {
      collectionGroup: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => ({
              get: () => Promise.resolve({ empty: true, size: 0, docs: [] }),
            }),
          }),
          limit: () => ({
            get: () => Promise.resolve({ empty: true, size: 0, docs: [] }),
          }),
        }),
      }),
      collection: () => ({
        doc: () => ({ collection: () => ({ doc: () => submissionRef }) }),
      }),
    };
    const deleteObject = vi.fn(() => Promise.resolve());
    const summary = await runSweepActivityWallArchives(db as never, {
      archiveOne: vi.fn(() => Promise.resolve()),
      listObjects: vi.fn((prefix: string) =>
        Promise.resolve(
          prefix.startsWith('activity_wall_media')
            ? [
                {
                  name: GOOD_PATH,
                  createdAt: NOW - 8 * 24 * 60 * 60 * 1000,
                },
              ]
            : []
        )
      ),
      deleteObject,
      now: () => NOW,
    });

    expect(deleteObject).toHaveBeenCalledWith(GOOD_PATH);
    expect(summary.objectsDeleted).toBe(1);
    expect(summary.markedLost).toBe(1);
    expect(submissionState.archiveStatus).toBe('lost');
    expect(submissionState.storagePath).toBeUndefined();
  });

  it('retries a pending storage cleanup and clears the flag on success', async () => {
    const submissionState: Bag = {
      archiveStatus: 'archived',
      storageCleanupPending: true,
    };
    const submissionRef = {
      id: SUBMISSION_ID,
      parent: {
        parent: { id: SESSION_ID, parent: { id: SESSIONS_COLLECTION } },
      },
      set: (data: Bag) => {
        mergeInto(submissionState, data);
        return Promise.resolve();
      },
    };
    const docSnap = { id: SUBMISSION_ID, ref: submissionRef };
    const db = {
      collectionGroup: () => ({
        where: (field: string) => ({
          limit: () => ({
            get: () =>
              Promise.resolve(
                field === 'storageCleanupPending'
                  ? { empty: false, size: 1, docs: [docSnap] }
                  : { empty: true, size: 0, docs: [] }
              ),
          }),
          orderBy: () => ({
            limit: () => ({
              get: () => Promise.resolve({ empty: true, size: 0, docs: [] }),
            }),
          }),
        }),
      }),
    };
    const deleteObject = vi.fn(() => Promise.resolve());
    const summary = await runSweepActivityWallArchives(db as never, {
      archiveOne: vi.fn(() => Promise.resolve()),
      listObjects: vi.fn((prefix: string) =>
        Promise.resolve(
          prefix === `activity_wall_media/${SESSION_ID}/${SUBMISSION_ID}/`
            ? [{ name: GOOD_PATH, createdAt: NOW }]
            : []
        )
      ),
      deleteObject,
      now: () => NOW,
    });

    expect(deleteObject).toHaveBeenCalledWith(GOOD_PATH);
    expect(summary.cleanupRetried).toBe(1);
    expect(summary.cleanupCleared).toBe(1);
    expect(submissionState.storageCleanupPending).toBeUndefined();
  });
});
