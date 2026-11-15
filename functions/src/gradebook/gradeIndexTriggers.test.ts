import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  stampTurnIn: vi.fn(),
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
vi.mock('../quizTurnIn', () => ({ stampTurnIn: mocks.stampTurnIn }));
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

import {
  handleQuizResponseWrite,
  handleVideoResponseWrite,
} from './gradeIndexTriggers';

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
    mocks.stampTurnIn.mockReset();
    mocks.stampTurnIn.mockImplementation((...a: unknown[]) => a[5]);
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

  it('retries a fresh stamp failure but drops a stale one', async () => {
    mocks.applyAttemptWrite.mockResolvedValue(undefined);
    mocks.stampTurnIn.mockRejectedValue(new Error('contention'));
    await expect(handleQuizResponseWrite(event as never)).rejects.toThrow(
      'contention'
    );
    expect(mocks.applyAttemptWrite).not.toHaveBeenCalled();
    await expect(
      handleQuizResponseWrite({
        ...event,
        time: '2020-01-01T00:00:00Z',
      })
    ).resolves.toBeUndefined();
    expect(mocks.applyAttemptWrite).toHaveBeenCalledTimes(1);
  });

  it('resolves when both steps succeed', async () => {
    mocks.applyAttemptWrite.mockResolvedValue(undefined);
    await expect(
      handleQuizResponseWrite(event as never)
    ).resolves.toBeUndefined();
  });
});

describe('handleVideoResponseWrite', () => {
  beforeEach(() => {
    mocks.stampTurnIn.mockReset();
    mocks.applyDocWrite.mockReset();
  });

  it('fails the event, and skips the index step, when the stamp fails so the trigger retries', async () => {
    mocks.stampTurnIn.mockRejectedValue(new Error('contention'));
    await expect(handleVideoResponseWrite(event as never)).rejects.toThrow(
      'contention'
    );
    expect(mocks.applyDocWrite).not.toHaveBeenCalled();
  });
});
