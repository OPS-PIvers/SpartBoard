import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyAttemptWrite: vi.fn(),
  applyDocWrite: vi.fn(),
}));

vi.mock('../firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(
    vi.fn(() => ({})),
    { FieldValue: { serverTimestamp: vi.fn(), delete: vi.fn() } }
  ),
}));
vi.mock('../functionsInit', () => ({}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
vi.mock('../quizAttemptHistory', () => ({
  applyAttemptWrite: mocks.applyAttemptWrite,
  applyAttemptGradeWrite: vi.fn(),
}));
vi.mock('./gradeIndex', async (orig) => ({
  ...(await orig<typeof import('./gradeIndex')>()),
  isGradeIndexEnabled: vi.fn().mockResolvedValue(true),
  applyDocWrite: mocks.applyDocWrite,
  markSessionDirty: vi.fn().mockResolvedValue(undefined),
}));

import { handleQuizResponseWrite } from './gradeIndexTriggers';

const doc = (data: Record<string, unknown> | undefined) => ({
  exists: !!data,
  data: () => data,
});
const event = {
  params: { sessionId: 'qs1', docId: 'u1' },
  time: new Date().toISOString(),
  data: {
    before: doc(undefined),
    after: doc({ status: 'completed', studentUid: 'u1' }),
  },
};

describe('handleQuizResponseWrite', () => {
  beforeEach(() => {
    mocks.applyAttemptWrite.mockReset();
    mocks.applyDocWrite.mockReset();
  });

  it('still runs the index step, then fails the event when the attempt copy fails', async () => {
    mocks.applyAttemptWrite.mockRejectedValue(new Error('copy failed'));
    await expect(handleQuizResponseWrite(event as never)).rejects.toThrow(
      'copy failed'
    );
    expect(mocks.applyDocWrite).toHaveBeenCalledTimes(1);
  });

  it('drops a failure on an event older than the retry window', async () => {
    mocks.applyAttemptWrite.mockRejectedValue(new Error('copy failed'));
    await expect(
      handleQuizResponseWrite({
        ...event,
        time: '2020-01-01T00:00:00Z',
      })
    ).resolves.toBeUndefined();
  });

  it('resolves when both steps succeed', async () => {
    mocks.applyAttemptWrite.mockResolvedValue(undefined);
    await expect(
      handleQuizResponseWrite(event as never)
    ).resolves.toBeUndefined();
  });
});
