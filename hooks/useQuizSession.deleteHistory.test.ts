import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import * as firestore from 'firebase/firestore';
import {
  useQuizSessionTeacher,
  isHistoryDocInRemovalWindow,
  snapshotAtToMillis,
  HISTORY_REMOVAL_WINDOW_SKEW_MS,
} from '@/hooks/useQuizSession';
import { auth } from '@/config/firebase';

vi.mock('firebase/firestore');
vi.mock('firebase/auth', () => ({
  signInAnonymously: vi.fn().mockResolvedValue({ user: { uid: 'anon-uid' } }),
  signInWithCustomToken: vi.fn(),
}));

// ─── Pure helper: snapshotAtToMillis ─────────────────────────────────────────

describe('snapshotAtToMillis', () => {
  it('passes finite numbers through unchanged', () => {
    expect(snapshotAtToMillis(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  it('converts a Firestore Timestamp via toMillis()', () => {
    expect(snapshotAtToMillis({ toMillis: () => 12345 })).toBe(12345);
  });

  it('falls back to seconds * 1000 when only seconds is present', () => {
    expect(snapshotAtToMillis({ seconds: 100 })).toBe(100_000);
  });

  it('returns null for unparseable shapes (undefined, null, NaN, junk)', () => {
    expect(snapshotAtToMillis(undefined)).toBeNull();
    expect(snapshotAtToMillis(null)).toBeNull();
    expect(snapshotAtToMillis(Number.NaN)).toBeNull();
    expect(snapshotAtToMillis('nope')).toBeNull();
    expect(snapshotAtToMillis({})).toBeNull();
    expect(snapshotAtToMillis({ toMillis: () => Number.NaN })).toBeNull();
  });
});

// ─── Pure helper: isHistoryDocInRemovalWindow ────────────────────────────────

describe('isHistoryDocInRemovalWindow', () => {
  const joinedAt = 1_000_000;
  const removalTime = 2_000_000;

  it('keeps a doc whose snapshotAt falls inside [joinedAt, removalTime]', () => {
    expect(isHistoryDocInRemovalWindow(1_500_000, joinedAt, removalTime)).toBe(
      true
    );
  });

  it('excludes a prior occupant snapshot written before joinedAt', () => {
    // A classmate sharing the PIN key answered an entire session earlier.
    expect(isHistoryDocInRemovalWindow(500_000, joinedAt, removalTime)).toBe(
      false
    );
  });

  it('excludes a snapshot written after the removal time', () => {
    expect(isHistoryDocInRemovalWindow(3_000_000, joinedAt, removalTime)).toBe(
      false
    );
  });

  it('keeps boundary entries within the skew pad on both ends', () => {
    // Just below joinedAt but inside the skew tolerance → kept (it is the
    // current occupant whose client clock ran slightly ahead of the server).
    expect(
      isHistoryDocInRemovalWindow(
        joinedAt - HISTORY_REMOVAL_WINDOW_SKEW_MS + 1,
        joinedAt,
        removalTime
      )
    ).toBe(true);
    // Beyond the skew pad → excluded.
    expect(
      isHistoryDocInRemovalWindow(
        joinedAt - HISTORY_REMOVAL_WINDOW_SKEW_MS - 1,
        joinedAt,
        removalTime
      )
    ).toBe(false);
  });

  it('conservatively keeps (does not delete) a doc with an unreadable snapshotAt', () => {
    // null timestamp on a shared key — ownership unprovable, so leave it.
    expect(isHistoryDocInRemovalWindow(null, joinedAt, removalTime)).toBe(
      false
    );
  });
});

// ─── Integration: removeStudent on a shared pin-{period}-{pin} key ───────────

type SnapshotCallback = (snap: unknown) => void;

interface HistoryDocFixture {
  id: string;
  snapshotAtMs: number | null;
}

interface RemoveStudentEnv {
  sessionCallback: SnapshotCallback | null;
  responsesCallback: SnapshotCallback | null;
  batch: {
    set: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    commit: ReturnType<typeof vi.fn>;
  };
}

const SHARED_KEY = 'pin-period_1-9999';

function buildHistoryDocs(fixtures: HistoryDocFixture[]) {
  return fixtures.map((f) => ({
    id: f.id,
    ref: {
      __type: 'doc',
      path: [
        'quiz_sessions',
        'sess-1',
        'responses',
        SHARED_KEY,
        'history',
        f.id,
      ],
    },
    data: () => ({
      questionId: 'q1',
      answer: 'a',
      answeredAt: f.snapshotAtMs ?? 0,
      status: 'submitted' as const,
      snapshotAt:
        f.snapshotAtMs === null
          ? undefined
          : { toMillis: () => f.snapshotAtMs as number },
    }),
  }));
}

function setupEnv(): RemoveStudentEnv {
  const env: RemoveStudentEnv = {
    sessionCallback: null,
    responsesCallback: null,
    batch: {
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    },
  };

  (firestore.doc as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (...args: unknown[]) => ({ __type: 'doc', path: args.slice(1) })
  );
  (
    firestore.collection as unknown as ReturnType<typeof vi.fn>
  ).mockImplementation((...args: unknown[]) => ({
    __type: 'collection',
    path: args.slice(1),
  }));

  let snapshotCallIndex = 0;
  (
    firestore.onSnapshot as unknown as ReturnType<typeof vi.fn>
  ).mockImplementation((_target: unknown, onNext: SnapshotCallback) => {
    if (snapshotCallIndex === 0) env.sessionCallback = onNext;
    else env.responsesCallback = onNext;
    snapshotCallIndex += 1;
    return vi.fn();
  });

  (firestore.writeBatch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
    env.batch
  );
  (
    firestore.updateDoc as unknown as ReturnType<typeof vi.fn>
  ).mockResolvedValue(undefined);
  (
    firestore.serverTimestamp as unknown as ReturnType<typeof vi.fn>
  ).mockReturnValue('server-ts');

  return env;
}

/**
 * Resolve `target` (and thus the removed student's `joinedAt` occupancy
 * window) through removeStudent's fallback getDoc — the same path the
 * existing removeStudent tests use. `joinedAt = null` simulates an
 * unresolved/legacy doc with no usable join anchor.
 */
function mockResponseFetch(
  data: { studentUid: string; joinedAt: number } | null
) {
  const getDocMock = firestore.getDoc as unknown as ReturnType<typeof vi.fn>;
  if (data === null) {
    getDocMock.mockResolvedValue({ exists: () => false });
    return;
  }
  getDocMock.mockResolvedValueOnce({
    exists: () => true,
    id: SHARED_KEY,
    data: () => ({
      studentUid: data.studentUid,
      joinedAt: data.joinedAt,
      status: 'in-progress',
      answers: [],
      score: null,
      submittedAt: null,
    }),
  });
}

describe('useQuizSessionTeacher — removeStudent history scoping (F7)', () => {
  let env: RemoveStudentEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    (auth as unknown as { currentUser: { uid: string } | null }).currentUser = {
      uid: 'teacher-1',
    };
    env = setupEnv();
  });

  it("second occupant's removal preserves the first occupant's in-window history", async () => {
    // Timeline on one shared pin-{period}-{pin} key (real epoch ms, spaced far
    // beyond the clock-skew pad). Occupant A held the key during one class
    // period; occupant B took it over an hour later:
    //   occupant A joins ~10:00, snapshots A1 & A2 in that window
    //   occupant B joins ~11:00, snapshots B1 & B2 in that window
    // The teacher removes B. Only B's snapshots (in [B.joinedAt±skew]) should
    // be deleted; A's earlier snapshots must survive.
    const A_JOIN = 1_700_000_000_000; // ~10:00
    const B_JOIN = A_JOIN + 3_600_000; // +1h
    const historyDocs = buildHistoryDocs([
      { id: 'a1', snapshotAtMs: A_JOIN + 1_000 },
      { id: 'a2', snapshotAtMs: A_JOIN + 2_000 },
      { id: 'b1', snapshotAtMs: B_JOIN + 1_000 },
      { id: 'b2', snapshotAtMs: B_JOIN + 2_000 },
    ]);
    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({ docs: historyDocs, empty: false });
    // Occupant B currently holds the key.
    mockResponseFetch({ studentUid: 'anon-B', joinedAt: B_JOIN });

    const { result } = renderHook(() => useQuizSessionTeacher('sess-1'));

    await act(async () => {
      await result.current.removeStudent(SHARED_KEY);
    });

    const deletedHistoryIds = env.batch.delete.mock.calls
      .map((c) => (c[0] as { path: string[] }).path)
      .filter((p) => p[4] === 'history')
      .map((p) => p[5]);

    // B's snapshots deleted; A's preserved.
    expect(deletedHistoryIds.sort()).toEqual(['b1', 'b2']);
    expect(deletedHistoryIds).not.toContain('a1');
    expect(deletedHistoryIds).not.toContain('a2');
  });

  it('single-occupant pin key deletes every history doc (behavior unchanged)', async () => {
    // One occupant; all snapshots after the join. The window
    // [joinedAt±skew, removal±skew] contains them all → identical to the
    // legacy whole-subcollection delete.
    const ONLY_JOIN = 1_700_000_000_000;
    const historyDocs = buildHistoryDocs([
      { id: 'h1', snapshotAtMs: ONLY_JOIN + 1_000 },
      { id: 'h2', snapshotAtMs: ONLY_JOIN + 2_000 },
      { id: 'h3', snapshotAtMs: ONLY_JOIN + 3_000 },
    ]);
    (
      firestore.getDocs as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({ docs: historyDocs, empty: false });
    mockResponseFetch({ studentUid: 'anon-only', joinedAt: ONLY_JOIN });

    const { result } = renderHook(() => useQuizSessionTeacher('sess-1'));

    await act(async () => {
      await result.current.removeStudent(SHARED_KEY);
    });

    const deletedHistoryIds = env.batch.delete.mock.calls
      .map((c) => (c[0] as { path: string[] }).path)
      .filter((p) => p[4] === 'history')
      .map((p) => p[5]);

    expect(deletedHistoryIds.sort()).toEqual(['h1', 'h2', 'h3']);
  });

  it('falls back to deleting all history when joinedAt is unknown (legacy / unresolved target)', async () => {
    // No response in the snapshot list and the fallback getDoc finds nothing,
    // so `target` (and its joinedAt) is unresolved. Without a window anchor we
    // preserve the legacy whole-subcollection delete rather than orphaning.
    const historyDocs = buildHistoryDocs([
      { id: 'x1', snapshotAtMs: 1100 },
      { id: 'x2', snapshotAtMs: null }, // unreadable timestamp
    ]);
    (firestore.getDocs as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ docs: historyDocs, empty: false })
      .mockResolvedValue({ docs: [], empty: true });
    // Fallback getDoc for the response → not found, so target stays undefined.
    (firestore.getDoc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      { exists: () => false }
    );

    const { result } = renderHook(() => useQuizSessionTeacher('sess-1'));

    await act(async () => {
      await result.current.removeStudent(SHARED_KEY);
    });

    const deletedHistoryIds = env.batch.delete.mock.calls
      .map((c) => (c[0] as { path: string[] }).path)
      .filter((p) => p[4] === 'history')
      .map((p) => p[5]);

    // Both deleted (including the null-timestamp doc) — legacy behavior.
    expect(deletedHistoryIds.sort()).toEqual(['x1', 'x2']);
  });
});
