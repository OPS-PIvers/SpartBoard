/**
 * Tests for the pure async helpers in useSyncedQuizGroups:
 *   - publishSyncedQuiz  — behavior field threading (include when present, omit when absent)
 *   - pullSyncedQuizContent — returns behavior from the doc snapshot
 *   - createSyncedQuizGroup — behavior field threading (include when present, omit when absent)
 *
 * Mocking strategy mirrors usePlcInvitations.test.ts / usePlcQuizzes.test.ts:
 *   - firebase/firestore is fully mocked so runTransaction, getDoc, setDoc are observable.
 *   - A fake transaction object is constructed and injected via runTransaction mock.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import * as firestore from 'firebase/firestore';
import {
  publishSyncedQuiz,
  pullSyncedQuizContent,
  createSyncedQuizGroup,
  useSyncedQuizGroupsByIds,
} from '@/hooks/useSyncedQuizGroups';
import type { QuizBehaviorSettings } from '@/types';

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

const GROUP_ID = 'group-abc';
const UID = 'teacher-uid-1';

const BEHAVIOR: QuizBehaviorSettings = {
  sessionMode: 'auto',
  sessionOptions: {
    showCorrectAnswerToStudent: true,
    speedBonusEnabled: false,
  },
  attemptLimit: 3,
};

const BASE_GROUP_DOC = {
  id: GROUP_ID,
  version: 2,
  title: 'Test Quiz',
  questions: [{ id: 'q1', type: 'multiple-choice', text: 'Q1?' }],
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
// publishSyncedQuiz — behavior field threading
// ---------------------------------------------------------------------------

describe('publishSyncedQuiz — behavior field threading', () => {
  async function runPublish(overrides: {
    behavior?: QuizBehaviorSettings;
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

    await publishSyncedQuiz(GROUP_ID, {
      title: 'Updated Title',
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
// pullSyncedQuizContent — returns behavior from doc
// ---------------------------------------------------------------------------

describe('pullSyncedQuizContent — behavior field', () => {
  it('returns behavior when the doc contains it', async () => {
    (firestore.getDoc as unknown as Mock).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ ...BASE_GROUP_DOC, behavior: BEHAVIOR }),
    });

    const result = await pullSyncedQuizContent(GROUP_ID);

    expect(result.behavior).toEqual(BEHAVIOR);
    expect(result.title).toBe(BASE_GROUP_DOC.title);
    expect(result.version).toBe(BASE_GROUP_DOC.version);
  });

  it('returns undefined behavior when the doc has no behavior field', async () => {
    (firestore.getDoc as unknown as Mock).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ ...BASE_GROUP_DOC }), // no behavior
    });

    const result = await pullSyncedQuizContent(GROUP_ID);

    expect(result.behavior).toBeUndefined();
  });

  it('throws when the group doc does not exist', async () => {
    (firestore.getDoc as unknown as Mock).mockResolvedValueOnce({
      exists: () => false,
    });

    await expect(pullSyncedQuizContent(GROUP_ID)).rejects.toThrow(
      'Synced quiz group not found.'
    );
  });
});

// ---------------------------------------------------------------------------
// createSyncedQuizGroup — behavior field threading
// ---------------------------------------------------------------------------

describe('createSyncedQuizGroup — behavior field threading', () => {
  it('includes behavior in setDoc payload when input.behavior is provided', async () => {
    await createSyncedQuizGroup({
      groupId: GROUP_ID,
      uid: UID,
      title: 'New Quiz',
      questions: [],
      behavior: BEHAVIOR,
    });

    expect(firestore.setDoc).toHaveBeenCalledTimes(1);
    const [_ref, payload] = (firestore.setDoc as unknown as Mock).mock
      .calls[0] as [unknown, Record<string, unknown>];
    expect(payload).toMatchObject({ behavior: BEHAVIOR });
  });

  it('omits behavior key from setDoc payload when input.behavior is absent', async () => {
    await createSyncedQuizGroup({
      groupId: GROUP_ID,
      uid: UID,
      title: 'New Quiz',
      questions: [],
    });

    expect(firestore.setDoc).toHaveBeenCalledTimes(1);
    const [_ref, payload] = (firestore.setDoc as unknown as Mock).mock
      .calls[0] as [unknown, Record<string, unknown>];
    expect(payload).not.toHaveProperty('behavior');
  });
});

// ---------------------------------------------------------------------------
// useSyncedQuizGroupsByIds — loading must resolve even with duplicate ids
// ---------------------------------------------------------------------------

describe('useSyncedQuizGroupsByIds — duplicate id handling', () => {
  beforeEach(() => {
    // `doc()` is mocked (top-level beforeEach) to return the joined path string.
    (firestore.onSnapshot as unknown as Mock).mockImplementation(
      (
        ref: string,
        onNext: (snap: { exists: () => boolean; data: () => unknown }) => void
      ) => {
        const id = ref.split('/').pop();
        onNext({ exists: () => true, data: () => ({ title: id }) });
        return () => undefined;
      }
    );
  });

  it('resolves loading to false when the id list contains a duplicate', async () => {
    const { result } = renderHook(() =>
      useSyncedQuizGroupsByIds(['group-1', 'group-1', 'group-2'])
    );

    // Regression for the twin bug already fixed in useSyncedVideoActivityGroups.
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups.size).toBe(2);
  });
});
