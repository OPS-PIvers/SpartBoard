// Unit coverage for the synced-quiz version-history logic (PRD §5.1 / §3.10,
// Decision 5.1) layered into `useSyncedQuizGroups`. Proves the four behaviors
// the acceptance criteria pin:
//   1. Publishing writes a PRE-edit snapshot of the canonical content into
//      `versions/{baseVersion}` (fire-and-forget, after the canonical commit).
//   2. The `versions` subcollection is pruned to the newest
//      `VERSION_HISTORY_LIMIT` (10).
//   3. `listSyncedVersions` returns the history newest-first.
//   4. `restoreSyncedVersion` re-publishes a snapshot's content via the normal
//      version-precondition publish path, bumping `version`.
//
// Firestore is mocked with a tiny stateful in-memory store so the publish →
// snapshot → prune → list → restore chain runs end-to-end without an emulator.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as firestore from 'firebase/firestore';
import {
  publishSyncedQuiz,
  listSyncedVersions,
  restoreSyncedVersion,
  VERSION_HISTORY_LIMIT,
} from './useSyncedQuizGroups';
import type { SyncedQuizGroup, SyncedQuizVersionSnapshot } from '@/types';

vi.mock('firebase/firestore');
vi.mock('@/config/firebase', () => ({ db: {}, functions: {} }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

// ---------------------------------------------------------------------------
// In-memory Firestore store. Docs are keyed by their slash path; refs carry
// both their path and the trailing id so collection/query/getDocs can
// reconstruct membership and `data()` reads.
// ---------------------------------------------------------------------------

interface FakeRef {
  path: string;
  id: string;
}

const store = new Map<string, Record<string, unknown>>();

const GROUP_ID = 'group-1';
const GROUP_PATH = `synced_quizzes/${GROUP_ID}`;
const VERSIONS_PREFIX = `${GROUP_PATH}/versions/`;
const UID = 'teacher-a';

function seedGroup(overrides: Partial<SyncedQuizGroup> = {}): void {
  const group: SyncedQuizGroup = {
    id: GROUP_ID,
    version: 1,
    title: 'Original Title',
    questions: [],
    participants: { [UID]: { joinedAt: 1000 } },
    createdAt: 1000,
    updatedAt: 1000,
    updatedBy: UID,
    ...overrides,
  };
  store.set(GROUP_PATH, group as unknown as Record<string, unknown>);
}

/** Flush queued microtasks so the fire-and-forget snapshot write settles. */
async function flush(): Promise<void> {
  // Two awaits clear the chained `void writeQuizVersionSnapshot(...)` promise
  // and its inner setDoc → pruneQuizVersions continuation.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function makeSnap(path: string) {
  const data = store.get(path);
  return {
    exists: () => data !== undefined,
    data: () => data,
    ref: { path, id: path.split('/').pop() ?? '' } as FakeRef,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();

  const doc = firestore.doc as unknown as ReturnType<typeof vi.fn>;
  doc.mockImplementation((_db: unknown, ...segments: string[]) => {
    const path = segments.join('/');
    return { path, id: segments[segments.length - 1] } as FakeRef;
  });

  const collection = firestore.collection as unknown as ReturnType<
    typeof vi.fn
  >;
  collection.mockImplementation((_db: unknown, ...segments: string[]) => {
    const path = segments.join('/');
    return { path, id: segments[segments.length - 1] } as FakeRef;
  });

  // query/orderBy just thread the collection ref through with the requested
  // sort direction so getDocs can order the in-memory results.
  const orderBy = firestore.orderBy as unknown as ReturnType<typeof vi.fn>;
  orderBy.mockImplementation((field: string, dir: 'asc' | 'desc' = 'asc') => ({
    field,
    dir,
  }));
  const query = firestore.query as unknown as ReturnType<typeof vi.fn>;
  query.mockImplementation(
    (collRef: FakeRef, order: { field: string; dir: 'asc' | 'desc' }) => ({
      collRef,
      order,
    })
  );

  const getDoc = firestore.getDoc as unknown as ReturnType<typeof vi.fn>;
  getDoc.mockImplementation((ref: FakeRef) =>
    Promise.resolve(makeSnap(ref.path))
  );

  const getDocs = firestore.getDocs as unknown as ReturnType<typeof vi.fn>;
  getDocs.mockImplementation(
    (q: {
      collRef: FakeRef;
      order: { field: string; dir: 'asc' | 'desc' };
    }) => {
      const prefix = `${q.collRef.path}/`;
      const docs = [...store.entries()]
        .filter(([path]) => path.startsWith(prefix))
        // Only direct children (no nested deeper paths).
        .filter(([path]) => !path.slice(prefix.length).includes('/'))
        .map(([path, data]) => ({
          id: path.split('/').pop() ?? '',
          ref: { path, id: path.split('/').pop() ?? '' } as FakeRef,
          data: () => data,
          exists: () => true,
        }));
      const field = q.order.field;
      docs.sort((a, b) => {
        const av = (a.data() as Record<string, number>)[field] ?? 0;
        const bv = (b.data() as Record<string, number>)[field] ?? 0;
        return q.order.dir === 'desc' ? bv - av : av - bv;
      });
      return Promise.resolve({ docs });
    }
  );

  const setDoc = firestore.setDoc as unknown as ReturnType<typeof vi.fn>;
  setDoc.mockImplementation((ref: FakeRef, data: unknown) => {
    store.set(ref.path, data as Record<string, unknown>);
    return Promise.resolve();
  });

  const deleteDoc = firestore.deleteDoc as unknown as ReturnType<typeof vi.fn>;
  deleteDoc.mockImplementation((ref: FakeRef) => {
    store.delete(ref.path);
    return Promise.resolve();
  });

  const runTransaction = firestore.runTransaction as unknown as ReturnType<
    typeof vi.fn
  >;
  runTransaction.mockImplementation(
    (
      _db: unknown,
      updateFn: (tx: {
        get: (ref: FakeRef) => Promise<ReturnType<typeof makeSnap>>;
        update: (ref: FakeRef, data: Record<string, unknown>) => void;
      }) => Promise<unknown>
    ) => {
      const tx = {
        get: (ref: FakeRef) => Promise.resolve(makeSnap(ref.path)),
        update: (ref: FakeRef, data: Record<string, unknown>) => {
          const existing = store.get(ref.path) ?? {};
          store.set(ref.path, { ...existing, ...data });
        },
      };
      return updateFn(tx);
    }
  );
});

function canonicalGroup(): SyncedQuizGroup {
  return store.get(GROUP_PATH) as unknown as SyncedQuizGroup;
}

function versionDocs(): Array<{ id: string; snap: SyncedQuizVersionSnapshot }> {
  return [...store.entries()]
    .filter(([path]) => path.startsWith(VERSIONS_PREFIX))
    .map(([path, data]) => ({
      id: path.slice(VERSIONS_PREFIX.length),
      snap: data as unknown as SyncedQuizVersionSnapshot,
    }));
}

describe('publishSyncedQuiz — version snapshots', () => {
  it('writes a PRE-edit snapshot keyed by the base version and bumps canonical', async () => {
    seedGroup({ version: 1, title: 'Original Title' });

    const result = await publishSyncedQuiz(GROUP_ID, {
      title: 'Edited Title',
      questions: [],
      expectedVersion: 1,
      uid: UID,
    });
    await flush();

    // Canonical advanced to 2.
    expect(result.version).toBe(2);
    expect(canonicalGroup().version).toBe(2);
    expect(canonicalGroup().title).toBe('Edited Title');

    // A snapshot of the PRE-edit (version 1, "Original Title") content exists,
    // keyed by the base version.
    const snapshots = versionDocs();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].id).toBe('1');
    expect(snapshots[0].snap.version).toBe(1);
    expect(snapshots[0].snap.content.title).toBe('Original Title');
    expect(snapshots[0].snap.savedBy).toBe(UID);
    expect(typeof snapshots[0].snap.savedAt).toBe('number');
  });

  it('prunes the versions subcollection to the newest VERSION_HISTORY_LIMIT', async () => {
    seedGroup({ version: 1, title: 'v1' });

    // Publish enough times to exceed the cap. Each publish snapshots the
    // pre-edit version, so N publishes from v1 produce snapshots 1..N.
    const PUBLISHES = VERSION_HISTORY_LIMIT + 3;
    for (let i = 0; i < PUBLISHES; i++) {
      const current = canonicalGroup().version;
      await publishSyncedQuiz(GROUP_ID, {
        title: `v${current + 1}`,
        questions: [],
        expectedVersion: current,
        uid: UID,
      });
      await flush();
    }

    const snapshots = versionDocs();
    expect(snapshots).toHaveLength(VERSION_HISTORY_LIMIT);

    // The oldest snapshots (1, 2, 3) were pruned; the newest 10 remain.
    const keptVersions = snapshots
      .map((s) => s.snap.version)
      .sort((a, b) => a - b);
    expect(keptVersions[0]).toBe(PUBLISHES - VERSION_HISTORY_LIMIT + 1);
    expect(keptVersions[keptVersions.length - 1]).toBe(PUBLISHES);
  });
});

describe('listSyncedVersions', () => {
  it('returns the version history newest-first', async () => {
    seedGroup({ version: 1, title: 'v1' });
    for (let i = 0; i < 3; i++) {
      const current = canonicalGroup().version;
      await publishSyncedQuiz(GROUP_ID, {
        title: `v${current + 1}`,
        questions: [],
        expectedVersion: current,
        uid: UID,
      });
      await flush();
    }

    const history = await listSyncedVersions(GROUP_ID);
    expect(history.map((h) => h.version)).toEqual([3, 2, 1]);
  });
});

describe('restoreSyncedVersion', () => {
  it('re-publishes a snapshot content bumping version', async () => {
    seedGroup({ version: 1, title: 'Original Title' });

    // Edit once → snapshot of v1 ("Original Title") archived, canonical now v2.
    await publishSyncedQuiz(GROUP_ID, {
      title: 'Edited Title',
      questions: [],
      expectedVersion: 1,
      uid: UID,
    });
    await flush();
    expect(canonicalGroup().version).toBe(2);

    // Restore the archived v1 content → republished as v3.
    const restored = await restoreSyncedVersion(GROUP_ID, 1, UID);
    await flush();

    expect(restored.version).toBe(3);
    const canonical = canonicalGroup();
    expect(canonical.version).toBe(3);
    // Content was restored to the snapshot's title.
    expect(canonical.title).toBe('Original Title');
    expect(canonical.updatedBy).toBe(UID);
  });

  it('throws when the requested snapshot does not exist', async () => {
    seedGroup({ version: 1 });
    await expect(restoreSyncedVersion(GROUP_ID, 99, UID)).rejects.toThrow(
      /snapshot not found/i
    );
  });
});
