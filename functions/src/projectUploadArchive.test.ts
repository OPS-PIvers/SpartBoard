// Unit tests for the Projects upload → Drive archive.
//
// `archiveProjectUploadCore` takes the same injectable `WallArchiveDeps` the
// Activity Wall core does, so Storage, Drive and the OAuth refresh are stubs
// here; only this module's own decisions are under test.

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
  MAX_ARCHIVE_ATTEMPTS,
  type WallArchiveDeps,
} from './activityWallArchive';
import {
  archivableTypeForMime,
  archiveProjectUploadCore,
  buildProjectFolderPath,
  hasProjectUploadStoragePrefix,
  projectIdFromRunId,
  shouldArchiveProjectUpload,
  teacherUidFromRunId,
} from './projectUploadArchive';

const TEACHER_UID = 'teacher-1';
const PROJECT_ID = 'project-abcdef123';
const RUN_ID = `${TEACHER_UID}_${PROJECT_ID}`;
const GROUP_ID = 'group-1';
const UPLOAD_ID = 'upload-1';
const GOOD_PATH = `project_uploads/${RUN_ID}/${GROUP_ID}/${UPLOAD_ID}/poster.pdf`;
const NOW = 1_700_000_000_000;

type Bag = Record<string, unknown>;

const isDelete = (v: unknown) =>
  typeof v === 'object' && v !== null && '__delete' in (v as Bag);

/** Firestore `set(..., {merge: true})` semantics. */
function mergeInto(target: Bag, patch: Bag): Bag {
  for (const [key, value] of Object.entries(patch)) {
    if (isDelete(value)) delete target[key];
    else target[key] = value;
  }
  return target;
}

interface SeedOptions {
  run?: Bag | null;
  group?: Bag | null;
  upload?: Bag | null;
}

function makeStubDb(seed: SeedOptions) {
  const run = seed.run === undefined ? { title: 'Ecosystem poster' } : seed.run;
  const group = seed.group === undefined ? { name: 'Otters' } : seed.group;
  const uploadSeed = seed.upload === undefined ? null : seed.upload;
  const state: Bag | null = uploadSeed ? { ...uploadSeed } : null;
  const writes: Bag[] = [];

  const uploadRef = {
    id: UPLOAD_ID,
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
  const groupRef = {
    id: GROUP_ID,
    get: () =>
      Promise.resolve({
        exists: group !== null,
        data: () => group ?? undefined,
      }),
    collection: (name: string) => {
      if (name !== 'uploads') throw new Error(`Unexpected collection ${name}`);
      return { doc: () => uploadRef };
    },
  };
  const runRef = {
    id: RUN_ID,
    get: () =>
      Promise.resolve({ exists: run !== null, data: () => run ?? undefined }),
    collection: (name: string) => {
      if (name !== 'groups') throw new Error(`Unexpected collection ${name}`);
      return { doc: () => groupRef };
    },
  };

  let chain: Promise<unknown> = Promise.resolve();
  const db = {
    collection: (name: string) => {
      if (name !== 'project_runs') {
        throw new Error(`Unexpected collection ${name}`);
      }
      return { doc: () => runRef };
    },
    runTransaction: <T>(
      fn: (tx: {
        get: (ref: typeof uploadRef) => Promise<unknown>;
        set: (ref: typeof uploadRef, data: Bag) => void;
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
  return { db, writes, state: () => state };
}

function makeDeps(
  db: unknown,
  overrides: Partial<WallArchiveDeps> = {}
): WallArchiveDeps {
  return {
    db: db as WallArchiveDeps['db'],
    statObject: vi.fn(() =>
      Promise.resolve({ size: 2048, contentType: 'application/pdf' })
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
  } as WallArchiveDeps;
}

const firebaseUpload = (overrides: Bag = {}): Bag => ({
  id: UPLOAD_ID,
  fileName: 'poster.pdf',
  contentType: 'application/pdf',
  sizeBytes: 2048,
  uploadedByUid: 'student-1',
  uploadedAt: 1,
  storagePath: GOOD_PATH,
  archiveStatus: 'firebase',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('run id parsing', () => {
  it('splits the teacher uid off the front', () => {
    expect(teacherUidFromRunId(RUN_ID)).toBe(TEACHER_UID);
    expect(projectIdFromRunId(RUN_ID)).toBe(PROJECT_ID);
  });

  it('refuses a run id with no teacher prefix', () => {
    expect(teacherUidFromRunId('nounderscore')).toBe('');
    expect(teacherUidFromRunId('_leading')).toBe('');
  });

  it('keeps underscores in the project id', () => {
    expect(projectIdFromRunId('uid_a_b')).toBe('a_b');
  });
});

describe('hasProjectUploadStoragePrefix', () => {
  it('accepts the one shape the rules allow', () => {
    expect(
      hasProjectUploadStoragePrefix(GOOD_PATH, RUN_ID, GROUP_ID, UPLOAD_ID)
    ).toBe(true);
  });

  it('rejects another group, another upload and a nested path', () => {
    expect(
      hasProjectUploadStoragePrefix(
        `project_uploads/${RUN_ID}/other-group/${UPLOAD_ID}/a.pdf`,
        RUN_ID,
        GROUP_ID,
        UPLOAD_ID
      )
    ).toBe(false);
    expect(
      hasProjectUploadStoragePrefix(
        `project_uploads/${RUN_ID}/${GROUP_ID}/other-upload/a.pdf`,
        RUN_ID,
        GROUP_ID,
        UPLOAD_ID
      )
    ).toBe(false);
    expect(
      hasProjectUploadStoragePrefix(
        `project_uploads/${RUN_ID}/${GROUP_ID}/${UPLOAD_ID}/../x.pdf`,
        RUN_ID,
        GROUP_ID,
        UPLOAD_ID
      )
    ).toBe(false);
  });

  it('rejects an empty file name', () => {
    expect(
      hasProjectUploadStoragePrefix(
        `project_uploads/${RUN_ID}/${GROUP_ID}/${UPLOAD_ID}/`,
        RUN_ID,
        GROUP_ID,
        UPLOAD_ID
      )
    ).toBe(false);
  });
});

describe('buildProjectFolderPath', () => {
  it('nests the group under the project under Projects', () => {
    expect(buildProjectFolderPath('Ecosystem poster', RUN_ID, 'Otters')).toBe(
      'Projects/Ecosystem poster (project-)/Otters'
    );
  });

  it('falls back when a title or group name is blank', () => {
    expect(buildProjectFolderPath('   ', RUN_ID, '')).toBe(
      'Projects/Untitled Project (project-)/Group'
    );
  });
});

describe('archivableTypeForMime', () => {
  it('maps by family, defaulting to file', () => {
    expect(archivableTypeForMime('image/png')).toBe('photo');
    expect(archivableTypeForMime('video/mp4')).toBe('video');
    expect(archivableTypeForMime('application/pdf')).toBe('file');
  });
});

describe('shouldArchiveProjectUpload', () => {
  it('claims a fresh upload under the project prefix', () => {
    expect(shouldArchiveProjectUpload(firebaseUpload())).toBe(true);
  });

  it('ignores an already-archived upload and a foreign prefix', () => {
    expect(
      shouldArchiveProjectUpload(
        firebaseUpload({ archiveStatus: 'archived', storagePath: GOOD_PATH })
      )
    ).toBe(false);
    expect(
      shouldArchiveProjectUpload(
        firebaseUpload({ storagePath: `activity_wall_media/x/y/z.jpg` })
      )
    ).toBe(false);
  });

  it('ignores a doc with no storagePath at all', () => {
    expect(shouldArchiveProjectUpload({ archiveStatus: 'firebase' })).toBe(
      false
    );
    expect(shouldArchiveProjectUpload(undefined)).toBe(false);
  });
});

describe('archiveProjectUploadCore', () => {
  it('uploads, shares and clears the transit copy', async () => {
    const { db, state } = makeStubDb({ upload: firebaseUpload() });
    const deps = makeDeps(db);

    const result = await archiveProjectUploadCore(deps, {
      runId: RUN_ID,
      groupId: GROUP_ID,
      uploadId: UPLOAD_ID,
    });

    expect(result).toEqual({
      archiveStatus: 'archived',
      driveFileId: 'drive-1',
    });
    expect(deps.uploadToDrive).toHaveBeenCalledWith(
      'token',
      expect.any(Buffer),
      'application/pdf',
      'poster.pdf',
      'Projects/Ecosystem poster (project-)/Otters'
    );
    expect(deps.setDrivePermission).toHaveBeenCalledWith(
      'token',
      'drive-1',
      expect.objectContaining({ type: 'domain', domain: 'school.org' })
    );
    expect(deps.deleteObject).toHaveBeenCalledWith(GOOD_PATH);

    const final = state();
    expect(final?.archiveStatus).toBe('archived');
    expect(final?.driveFileId).toBe('drive-1');
    expect(final?.driveUrl).toBe(
      'https://drive.google.com/file/d/drive-1/view'
    );
    expect(final?.storagePath).toBeUndefined();
  });

  it('mints the Drive token for the uid in the run id, not the doc field', async () => {
    const { db } = makeStubDb({
      run: { title: 'Poster', teacherUid: 'someone-else' },
      upload: firebaseUpload(),
    });
    const deps = makeDeps(db);

    await archiveProjectUploadCore(deps, {
      runId: RUN_ID,
      groupId: GROUP_ID,
      uploadId: UPLOAD_ID,
    });

    expect(deps.getAccessToken).toHaveBeenCalledWith(TEACHER_UID);
  });

  it('streams a large file instead of buffering it', async () => {
    const { db } = makeStubDb({ upload: firebaseUpload() });
    const deps = makeDeps(db, {
      statObject: vi.fn(() =>
        Promise.resolve({ size: 80 * 1024 * 1024, contentType: 'video/mp4' })
      ),
    });

    await archiveProjectUploadCore(deps, {
      runId: RUN_ID,
      groupId: GROUP_ID,
      uploadId: UPLOAD_ID,
    });

    expect(deps.uploadFileToDrive).toHaveBeenCalled();
    expect(deps.downloadObject).not.toHaveBeenCalled();
    expect(deps.discardTempFile).toHaveBeenCalledWith('/tmp/media.bin');
  });

  it('refuses an upload whose storagePath points at another group', async () => {
    const { db } = makeStubDb({
      upload: firebaseUpload({
        storagePath: `project_uploads/${RUN_ID}/other-group/${UPLOAD_ID}/a.pdf`,
      }),
    });
    const deps = makeDeps(db);

    await expect(
      archiveProjectUploadCore(deps, {
        runId: RUN_ID,
        groupId: GROUP_ID,
        uploadId: UPLOAD_ID,
      })
    ).rejects.toThrow(/not its own/);
    expect(deps.uploadToDrive).not.toHaveBeenCalled();
  });

  it('records a failure and leaves the file where it is', async () => {
    const { db, state } = makeStubDb({ upload: firebaseUpload() });
    const deps = makeDeps(db, {
      uploadToDrive: vi.fn(() => Promise.reject(new Error('Drive said no'))),
    });

    await expect(
      archiveProjectUploadCore(deps, {
        runId: RUN_ID,
        groupId: GROUP_ID,
        uploadId: UPLOAD_ID,
      })
    ).rejects.toThrow('Drive said no');

    const final = state();
    expect(final?.archiveStatus).toBe('failed');
    expect(final?.attemptCount).toBe(1);
    expect(final?.storagePath).toBe(GOOD_PATH);
    expect(deps.deleteObject).not.toHaveBeenCalled();
  });

  it('does not burn an attempt when the teacher never connected Drive', async () => {
    const { db, state } = makeStubDb({ upload: firebaseUpload() });
    const deps = makeDeps(db, {
      getAccessToken: vi.fn(() => Promise.reject(new Error('needs-consent'))),
    });

    await expect(
      archiveProjectUploadCore(deps, {
        runId: RUN_ID,
        groupId: GROUP_ID,
        uploadId: UPLOAD_ID,
      })
    ).rejects.toThrow(/needs-consent/);
    expect(state()?.attemptCount).toBe(0);
  });

  it('settles at lost once the attempts run out', async () => {
    const { db, state } = makeStubDb({
      upload: firebaseUpload({
        archiveStatus: 'failed',
        attemptCount: MAX_ARCHIVE_ATTEMPTS - 1,
      }),
    });
    const deps = makeDeps(db, {
      uploadToDrive: vi.fn(() => Promise.reject(new Error('Drive said no'))),
    });

    await expect(
      archiveProjectUploadCore(deps, {
        runId: RUN_ID,
        groupId: GROUP_ID,
        uploadId: UPLOAD_ID,
      })
    ).rejects.toThrow('Drive said no');
    expect(state()?.archiveStatus).toBe('lost');
  });

  it('keeps the Drive copy and flags cleanup when the transit delete fails', async () => {
    const { db, state } = makeStubDb({ upload: firebaseUpload() });
    const deps = makeDeps(db, {
      deleteObject: vi.fn(() => Promise.reject(new Error('bucket busy'))),
    });

    const result = await archiveProjectUploadCore(deps, {
      runId: RUN_ID,
      groupId: GROUP_ID,
      uploadId: UPLOAD_ID,
    });

    expect(result.archiveStatus).toBe('archived');
    expect(state()?.storageCleanupPending).toBe(true);
  });

  it('skips an upload another worker is already moving', async () => {
    const { db } = makeStubDb({
      upload: firebaseUpload({
        archiveStatus: 'syncing',
        archiveStartedAt: NOW - 1000,
      }),
    });
    const deps = makeDeps(db);

    const result = await archiveProjectUploadCore(deps, {
      runId: RUN_ID,
      groupId: GROUP_ID,
      uploadId: UPLOAD_ID,
    });

    expect(result).toEqual({ archiveStatus: 'syncing' });
    expect(deps.uploadToDrive).not.toHaveBeenCalled();
  });

  it('resumes from an existing Drive file instead of uploading twice', async () => {
    const { db } = makeStubDb({
      upload: firebaseUpload({
        archiveStatus: 'failed',
        driveFileId: 'drive-existing',
        attemptCount: 1,
      }),
    });
    const deps = makeDeps(db);

    const result = await archiveProjectUploadCore(deps, {
      runId: RUN_ID,
      groupId: GROUP_ID,
      uploadId: UPLOAD_ID,
    });

    expect(result.driveFileId).toBe('drive-existing');
    expect(deps.uploadToDrive).not.toHaveBeenCalled();
    // The permission is re-applied: the prior attempt may have failed there.
    expect(deps.setDrivePermission).toHaveBeenCalled();
  });

  it('rejects a run or group that is gone', async () => {
    const missingRun = makeStubDb({ run: null, upload: firebaseUpload() });
    await expect(
      archiveProjectUploadCore(makeDeps(missingRun.db), {
        runId: RUN_ID,
        groupId: GROUP_ID,
        uploadId: UPLOAD_ID,
      })
    ).rejects.toThrow(/run not found/i);

    const missingGroup = makeStubDb({ group: null, upload: firebaseUpload() });
    await expect(
      archiveProjectUploadCore(makeDeps(missingGroup.db), {
        runId: RUN_ID,
        groupId: GROUP_ID,
        uploadId: UPLOAD_ID,
      })
    ).rejects.toThrow(/group not found/i);
  });

  it('rejects a run id carrying no teacher uid', async () => {
    const { db } = makeStubDb({ upload: firebaseUpload() });
    await expect(
      archiveProjectUploadCore(makeDeps(db), {
        runId: 'nounderscore',
        groupId: GROUP_ID,
        uploadId: UPLOAD_ID,
      })
    ).rejects.toThrow(/no teacher/i);
  });
});
