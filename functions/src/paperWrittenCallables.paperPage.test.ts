// getPaperPageV1: the session's own teacher reads a kept page; nobody else does (K1, K19).
import { describe, it, expect, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { makeStubFirestore, type StubData } from './testing/stubFirestore';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  auth: vi.fn(),
  storage: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldValue: { serverTimestamp: () => 'ts', delete: () => undefined },
  }),
}));
vi.mock('./functionsInit', () => ({}));
vi.mock('./classlinkShared', () => ({
  ALLOWED_ORIGINS: [],
  normalizeEmailDomain: vi.fn(),
  resolveOrgIdForDomain: vi.fn(),
}));
vi.mock('./googleOAuth', () => ({ refreshGoogleAccessTokenForUid: vi.fn() }));
vi.mock('ffmpeg-static', () => ({ default: '/usr/bin/ffmpeg' }));
vi.mock('fluent-ffmpeg', () => ({
  default: Object.assign(vi.fn(), { setFfmpegPath: vi.fn() }),
}));
vi.mock('./studentAssignmentTargets', () => ({
  loadTargetDirectory: vi.fn(),
  uidForRef: vi.fn(),
}));
vi.mock('firebase-functions/params', () => ({
  defineSecret: (name: string) => ({ value: () => name }),
}));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentCreated: (_opts: unknown, handler: unknown) => handler,
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

import {
  handleGetPaperPage,
  type Caller,
  type PaperWrittenDeps,
} from './paperWrittenCallables';

const SESSION = 'quiz_sessions/s1';
const RESPONSE = `${SESSION}/responses/r1`;
const PATH = 'paper_pages/t1/scan-2/3/1.webp';
const PAGE_ID = 'pg_scan-2_1';

const TEACHER: Caller = { uid: 't1', anonymous: false, studentRole: false };
const TEAMMATE: Caller = { uid: 't2', anonymous: false, studentRole: false };
const STUDENT: Caller = { uid: 'p1', anonymous: false, studentRole: true };
const ANONYMOUS: Caller = { uid: 'r1', anonymous: true, studentRole: false };

const request = { sessionId: 's1', responseKey: 'r1', page: 1 };

function seed(over: Record<string, StubData> = {}): Record<string, StubData> {
  return {
    [SESSION]: { teacherUid: 't1' },
    [RESPONSE]: {
      studentUid: 'p1',
      paperPages: [
        {
          id: PAGE_ID,
          slot: 'primary',
          kind: 'paper-page',
          storagePath: PATH,
          mimeType: 'image/webp',
          uploadState: 'uploaded',
        },
      ],
    },
    'users/t1/paper_page_scans/scan-2': {
      seats: { 3: { sessionId: 's1', responseKey: 'r1' } },
    },
    ...over,
  };
}

function makeDeps(
  store: Record<string, StubData>,
  {
    objects = {},
    drive = {},
    granted = true,
  }: {
    objects?: Record<string, string>;
    drive?: Record<string, string>;
    granted?: boolean;
  } = {}
) {
  const stub = makeStubFirestore(store);
  const deps: PaperWrittenDeps = {
    db: stub.db as unknown as Firestore,
    now: () => 1,
    readObject: vi.fn((path: string) =>
      Promise.resolve(
        objects[path]
          ? { data: Buffer.from(objects[path]), contentType: 'image/webp' }
          : null
      )
    ),
    statObject: vi.fn(),
    getAccessToken: vi.fn(() => Promise.resolve('tok')),
    downloadDriveFile: vi.fn((_t: string, id: string) =>
      drive[id]
        ? Promise.resolve(Buffer.from(drive[id]))
        : Promise.reject(new Error('404'))
    ),
    isKeptPagesGranted: vi.fn(() => Promise.resolve(granted)),
  };
  return deps;
}

const b64 = (s: string) => Buffer.from(s).toString('base64');

describe('getPaperPageV1', () => {
  it('serves the session teacher the Storage copy', async () => {
    const deps = makeDeps(seed(), { objects: { [PATH]: 'page' } });
    await expect(handleGetPaperPage(deps, TEACHER, request)).resolves.toEqual({
      status: 'ready',
      mimeType: 'image/webp',
      data: b64('page'),
      source: 'storage',
    });
  });

  it('serves the archived Drive copy once Storage is cleared', async () => {
    const store = seed();
    store[RESPONSE] = {
      ...store[RESPONSE],
      artifactArchive: {
        [PAGE_ID]: {
          archiveStatus: 'archived',
          driveFileId: 'd1',
          sourcePath: PATH,
        },
      },
    };
    const deps = makeDeps(store, { drive: { d1: 'drive-page' } });
    await expect(handleGetPaperPage(deps, TEACHER, request)).resolves.toEqual({
      status: 'ready',
      mimeType: 'image/webp',
      data: b64('drive-page'),
      source: 'drive',
    });
  });

  it.each([
    ['a student', STUDENT],
    ['an anonymous caller', ANONYMOUS],
  ])('refuses %s before reading anything', async (_label, caller) => {
    const deps = makeDeps(seed(), { objects: { [PATH]: 'page' } });
    await expect(
      handleGetPaperPage(deps, caller, request)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(deps.readObject).not.toHaveBeenCalled();
    expect(deps.isKeptPagesGranted).not.toHaveBeenCalled();
  });

  it('refuses a teacher who does not own the session, such as a PLC teammate', async () => {
    const deps = makeDeps(seed(), { objects: { [PATH]: 'page' } });
    await expect(
      handleGetPaperPage(deps, TEAMMATE, request)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(deps.readObject).not.toHaveBeenCalled();
  });

  it('refuses the owner without the kept-pages flag', async () => {
    const deps = makeDeps(seed(), {
      objects: { [PATH]: 'page' },
      granted: false,
    });
    await expect(
      handleGetPaperPage(deps, TEACHER, request)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(deps.readObject).not.toHaveBeenCalled();
  });

  it('requires sign-in and a whole page number', async () => {
    const deps = makeDeps(seed());
    await expect(handleGetPaperPage(deps, null, request)).rejects.toMatchObject(
      { code: 'unauthenticated' }
    );
    for (const page of [0, 1.5, '1', 64])
      await expect(
        handleGetPaperPage(deps, TEACHER, { ...request, page })
      ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('reports no-page for a missing page or one the scan lookup does not trace here', async () => {
    const missing = makeDeps(seed(), { objects: { [PATH]: 'page' } });
    await expect(
      handleGetPaperPage(missing, TEACHER, { ...request, page: 2 })
    ).resolves.toEqual({ status: 'not-available', reason: 'no-page' });

    const foreign = makeDeps(
      seed({
        'users/t1/paper_page_scans/scan-2': {
          seats: { 3: { sessionId: 's1', responseKey: 'someone-else' } },
        },
      }),
      { objects: { [PATH]: 'page' } }
    );
    await expect(
      handleGetPaperPage(foreign, TEACHER, request)
    ).resolves.toEqual({ status: 'not-available', reason: 'no-page' });
    expect(foreign.readObject).not.toHaveBeenCalled();
  });

  it.each([
    [{ archiveStatus: 'syncing' }, 'archiving'],
    [{ archiveStatus: 'failed' }, 'failed'],
    [{ archiveStatus: 'lost' }, 'failed'],
    [{ archiveStatus: 'deleted' }, 'deleted'],
    [{ archiveStatus: 'awaiting-drive' }, 'missing'],
  ])('reports %o as %s when Storage has no copy', async (entry, reason) => {
    const store = seed();
    store[RESPONSE] = {
      ...store[RESPONSE],
      artifactArchive: { [PAGE_ID]: entry },
    };
    await expect(
      handleGetPaperPage(makeDeps(store), TEACHER, request)
    ).resolves.toEqual({ status: 'not-available', reason });
  });

  it('caps the size as crops do', async () => {
    const deps = makeDeps(seed(), {
      objects: { [PATH]: 'x'.repeat(3 * 1024 * 1024 + 1) },
    });
    await expect(handleGetPaperPage(deps, TEACHER, request)).resolves.toEqual({
      status: 'not-available',
      reason: 'too-large',
    });
  });
});
