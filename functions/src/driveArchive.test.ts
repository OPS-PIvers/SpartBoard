// Unit tests for the legacy `archiveActivityWallPhoto` callable's resume path.

import { describe, it, expect, vi, beforeEach } from 'vitest';

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

vi.mock('./classlinkShared', () => ({ ALLOWED_ORIGINS: [] }));
vi.mock('./functionsInit', () => ({}));

type Bag = Record<string, unknown>;

const isDelete = (v: unknown) =>
  typeof v === 'object' && v !== null && '__delete' in (v as Bag);

function mergeInto(target: Bag, patch: Bag): Bag {
  for (const [key, value] of Object.entries(patch)) {
    if (isDelete(value)) delete target[key];
    else target[key] = value;
  }
  return target;
}

const SESSION_ID = 'teacher-1_wall-abc123456';
const SUBMISSION_ID = 'sub-1';
const STORAGE_PATH = `activity_wall_photos/${SESSION_ID}_${SUBMISSION_ID}`;

let submissionState: Bag | null;
let deletedFiles: string[];

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(
    vi.fn(() => ({
      collection: () => ({
        doc: () => ({
          collection: () => ({
            doc: () => submissionRef,
          }),
        }),
      }),
      runTransaction: async (
        fn: (tx: {
          get: (ref: unknown) => Promise<unknown>;
          set: (ref: unknown, data: Bag) => void;
        }) => Promise<unknown>
      ) =>
        fn({
          get: () => submissionRef.get(),
          set: (_ref, data) => {
            void submissionRef.set(data);
          },
        }),
    })),
    { FieldValue: { delete: () => ({ __delete: true }) } }
  ),
  storage: vi.fn(() => ({
    bucket: () => ({
      file: (name: string) => ({
        delete: () => {
          deletedFiles.push(name);
          return Promise.resolve();
        },
      }),
    }),
  })),
}));

const submissionRef = {
  get: () =>
    Promise.resolve({
      exists: submissionState !== null,
      data: () => submissionState ?? undefined,
    }),
  set: (data: Bag) => {
    if (submissionState) mergeInto(submissionState, data);
    return Promise.resolve();
  },
};

import { archiveActivityWallPhoto } from './driveArchive';

const callableHandler = archiveActivityWallPhoto as unknown as (request: {
  auth: { uid: string };
  data: Bag;
}) => Promise<Bag>;

beforeEach(() => {
  vi.clearAllMocks();
  deletedFiles = [];
  submissionState = {
    storagePath: STORAGE_PATH,
    archiveStatus: 'failed',
    driveFileId: 'drive-existing',
  };
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)
  ) as unknown as typeof fetch;
});

describe('archiveActivityWallPhoto resume path', () => {
  it('finishes a resumed submission instead of stranding it at syncing', async () => {
    const result = await callableHandler({
      auth: { uid: 'teacher-1' },
      data: {
        accessToken: 'tok',
        sessionId: SESSION_ID,
        submissionId: SUBMISSION_ID,
        activityId: 'wall-abc123456',
      },
    });
    expect(result).toMatchObject({
      archiveStatus: 'archived',
      driveFileId: 'drive-existing',
    });
    expect(submissionState?.archiveStatus).toBe('archived');
    expect(deletedFiles).toContain(STORAGE_PATH);
    // Reapplies the legacy 'anyone' permission, not a fresh upload.
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/drive-existing/permissions'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('stays failed (never lost) when finishing a resumed submission errors', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({}),
      } as Response)
    ) as unknown as typeof fetch;

    await expect(
      callableHandler({
        auth: { uid: 'teacher-1' },
        data: {
          accessToken: 'tok',
          sessionId: SESSION_ID,
          submissionId: SUBMISSION_ID,
          activityId: 'wall-abc123456',
        },
      })
    ).rejects.toThrow();

    expect(submissionState?.archiveStatus).toBe('failed');
    expect(submissionState?.driveFileId).toBe('drive-existing');
  });
});
