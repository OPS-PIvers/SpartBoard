// Unit tests for the retired `archiveActivityWallPhoto` callable.

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

const firestoreMock = vi.fn();
const storageMock = vi.fn();
vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: firestoreMock,
  storage: storageMock,
}));

import { archiveActivityWallPhoto } from './driveArchive';

const callableHandler = archiveActivityWallPhoto as unknown as (request: {
  auth?: { uid: string; token?: Record<string, unknown> };
  data: Record<string, unknown>;
}) => Promise<Record<string, unknown>>;

const AUTH = {
  uid: 'teacher-1',
  token: { email: 'teacher@school.org', email_verified: true },
};

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(() =>
    Promise.reject(new Error('no network in this test'))
  );
});

describe('archiveActivityWallPhoto (retired)', () => {
  it.each([
    ['another feature', 'quiz_response_media/other-teacher/quiz/answer.webm'],
    ['another wall', 'activity_wall_media/other_wall/sub-1/photo.jpg'],
    ['its own wall', 'activity_wall_media/teacher-1_wall/sub-1/photo.jpg'],
  ])(
    'never reads, uploads or deletes a file on %s',
    async (_label, storagePath) => {
      const result = await callableHandler({
        auth: AUTH,
        data: {
          accessToken: 'caller-supplied-token',
          sessionId: 'teacher-1_wall',
          submissionId: 'sub-1',
          activityId: 'wall',
          storagePath,
        },
      });

      expect(result).toEqual({ skipped: true, archiveStatus: 'retired' });
      expect(firestoreMock).not.toHaveBeenCalled();
      expect(storageMock).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    }
  );

  it('still refuses an unauthenticated caller', async () => {
    await expect(async () =>
      callableHandler({ data: { sessionId: 'teacher-1_wall' } })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });
});
