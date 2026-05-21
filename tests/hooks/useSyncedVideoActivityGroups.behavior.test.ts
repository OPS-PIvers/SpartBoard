/**
 * Tests for the pure async helpers in useSyncedVideoActivityGroups:
 *   - publishSyncedVideoActivity — behavior field threading (include when present, omit when absent)
 *   - pullSyncedVideoActivityContent — returns behavior from the doc snapshot
 *   - createSyncedVideoActivityGroup — behavior field threading (include when present, omit when absent)
 *
 * Mocking strategy mirrors useSyncedQuizGroups.test.ts:
 *   - firebase/firestore is fully mocked so runTransaction, getDoc, setDoc are observable.
 *   - A fake transaction object is constructed and injected via runTransaction mock.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import * as firestore from 'firebase/firestore';
import {
  publishSyncedVideoActivity,
  pullSyncedVideoActivityContent,
  createSyncedVideoActivityGroup,
} from '@/hooks/useSyncedVideoActivityGroups';
import type { VideoActivityBehaviorSettings } from '@/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('firebase/firestore');

vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
  functions: { __mock: 'functions' },
}));

vi.mock('@/utils/logError', () => ({
  logError: vi.fn(),
}));

// httpsCallable is in firebase/functions — not exercised by these tests but
// the hook imports it at module level.
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const GROUP_ID = 'va-group-abc';
const UID = 'teacher-uid-va-1';

const BEHAVIOR: VideoActivityBehaviorSettings = {
  sessionMode: 'auto',
  sessionOptions: {
    tabWarningsEnabled: true,
    showResultToStudent: false,
    showCorrectAnswerToStudent: true,
    showCorrectOnBoard: false,
    shuffleQuestions: false,
    shuffleAnswerOptions: true,
    rewindOnIncorrectSeconds: 0,
    pointPenaltyOnIncorrect: 0,
    scoreVisibility: 'score-only',
  },
  attemptLimit: 3,
};

const BASE_GROUP_DOC = {
  id: GROUP_ID,
  version: 2,
  title: 'Test Video Activity',
  youtubeUrl: 'https://www.youtube.com/watch?v=test',
  questions: [{ id: 'q1', type: 'timed', text: 'Q1?' }],
  participants: { [UID]: { joinedAt: 1000 } },
  createdAt: 1000,
  updatedAt: 1000,
  updatedBy: UID,
};

// ---------------------------------------------------------------------------
// Helper — build a fake Firestore transaction
// ---------------------------------------------------------------------------

interface FakeTx {
  get: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
}

function makeFakeTx() {
  const updates: Array<{ ref: unknown; patch: Record<string, unknown> }> = [];
  const tx: FakeTx = {
    get: vi.fn(),
    update: vi.fn((ref: unknown, patch: Record<string, unknown>) => {
      updates.push({ ref, patch });
    }),
    set: vi.fn(),
  };
  return { tx, updates };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // doc() returns an addressable string for easy assertions
  (firestore.doc as unknown as Mock).mockImplementation(
    (_db: unknown, ...segs: string[]) => segs.join('/')
  );

  // setDoc resolves by default
  (firestore.setDoc as unknown as Mock).mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// publishSyncedVideoActivity — behavior field threading
// ---------------------------------------------------------------------------

describe('publishSyncedVideoActivity — behavior field threading', () => {
  async function runPublish(overrides: {
    behavior?: VideoActivityBehaviorSettings;
    version?: number;
  }) {
    const { tx, updates } = makeFakeTx();

    // tx.get returns the base group doc (version matches expectedVersion)
    tx.get.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ ...BASE_GROUP_DOC, version: overrides.version ?? 2 }),
    });

    (firestore.runTransaction as unknown as Mock).mockImplementation(
      async (_db: unknown, fn: (tx: FakeTx) => Promise<unknown>) => fn(tx)
    );

    await publishSyncedVideoActivity(GROUP_ID, {
      title: 'Updated Title',
      youtubeUrl: BASE_GROUP_DOC.youtubeUrl,
      questions: BASE_GROUP_DOC.questions as never,
      expectedVersion: overrides.version ?? 2,
      uid: UID,
      ...(overrides.behavior !== undefined
        ? { behavior: overrides.behavior }
        : {}),
    });

    return updates;
  }

  it('includes behavior in tx.update payload when input.behavior is provided', async () => {
    const updates = await runPublish({ behavior: BEHAVIOR });

    expect(updates).toHaveLength(1);
    expect(updates[0].patch).toMatchObject({ behavior: BEHAVIOR });
  });

  it('omits behavior key from tx.update payload when input.behavior is absent', async () => {
    const updates = await runPublish({});

    expect(updates).toHaveLength(1);
    expect(updates[0].patch).not.toHaveProperty('behavior');
  });

  it('stamps version increment and updatedBy in all cases', async () => {
    const updates = await runPublish({ behavior: BEHAVIOR });

    expect(updates[0].patch).toMatchObject({
      version: 3, // 2 + 1
      updatedBy: UID,
      title: 'Updated Title',
    });
  });
});

// ---------------------------------------------------------------------------
// pullSyncedVideoActivityContent — behavior field
// ---------------------------------------------------------------------------

describe('pullSyncedVideoActivityContent — behavior field', () => {
  it('returns behavior when the doc contains it', async () => {
    (firestore.getDoc as unknown as Mock).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ ...BASE_GROUP_DOC, behavior: BEHAVIOR }),
    });

    const result = await pullSyncedVideoActivityContent(GROUP_ID);

    expect(result.behavior).toEqual(BEHAVIOR);
    expect(result.title).toBe(BASE_GROUP_DOC.title);
    expect(result.version).toBe(BASE_GROUP_DOC.version);
  });

  it('returns undefined behavior when the doc has no behavior field', async () => {
    (firestore.getDoc as unknown as Mock).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ ...BASE_GROUP_DOC }), // no behavior
    });

    const result = await pullSyncedVideoActivityContent(GROUP_ID);

    expect(result.behavior).toBeUndefined();
  });

  it('throws when the group doc does not exist', async () => {
    (firestore.getDoc as unknown as Mock).mockResolvedValueOnce({
      exists: () => false,
    });

    await expect(pullSyncedVideoActivityContent(GROUP_ID)).rejects.toThrow(
      'Synced video activity group not found.'
    );
  });
});

// ---------------------------------------------------------------------------
// createSyncedVideoActivityGroup — behavior field threading
// ---------------------------------------------------------------------------

describe('createSyncedVideoActivityGroup — behavior field threading', () => {
  it('includes behavior in setDoc payload when input.behavior is provided', async () => {
    await createSyncedVideoActivityGroup({
      groupId: GROUP_ID,
      uid: UID,
      title: 'New Video Activity',
      youtubeUrl: BASE_GROUP_DOC.youtubeUrl,
      questions: [],
      behavior: BEHAVIOR,
    });

    expect(firestore.setDoc).toHaveBeenCalledTimes(1);
    const [_ref, payload] = (firestore.setDoc as unknown as Mock).mock
      .calls[0] as [unknown, Record<string, unknown>];
    expect(payload).toMatchObject({ behavior: BEHAVIOR });
  });

  it('omits behavior key from setDoc payload when input.behavior is absent', async () => {
    await createSyncedVideoActivityGroup({
      groupId: GROUP_ID,
      uid: UID,
      title: 'New Video Activity',
      youtubeUrl: BASE_GROUP_DOC.youtubeUrl,
      questions: [],
    });

    expect(firestore.setDoc).toHaveBeenCalledTimes(1);
    const [_ref, payload] = (firestore.setDoc as unknown as Mock).mock
      .calls[0] as [unknown, Record<string, unknown>];
    expect(payload).not.toHaveProperty('behavior');
  });
});
