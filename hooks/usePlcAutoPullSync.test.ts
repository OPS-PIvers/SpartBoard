import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  usePlcAutoPullSync,
  type PlcSyncReplica,
  type PlcCanonicalGroupVersion,
} from './usePlcAutoPullSync';

vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

interface Meta extends PlcSyncReplica {
  id: string;
  title: string;
  sync?: { groupId: string; lastSyncedVersion: number };
}

const replica = (over: Partial<Meta> = {}): Meta => ({
  id: 'r1',
  title: 'Unit 4 CFA',
  sync: { groupId: 'g1', lastSyncedVersion: 1 },
  ...over,
});

const canonical = (
  entries: Array<[string, number]>
): Map<string, PlcCanonicalGroupVersion> =>
  new Map(entries.map(([id, version]) => [id, { version }]));

// Promise-returning (non-async) mock factories so the lint rule
// `require-await` doesn't flag mocks that intentionally don't `await`.
const pullMock = () => vi.fn((r: Meta) => Promise.resolve(r));
const ackMock = () => vi.fn(() => Promise.resolve());

describe('usePlcAutoPullSync', () => {
  beforeEach(() => vi.clearAllMocks());

  it('auto-pulls a clean replica when canonical advances, and toasts', async () => {
    const pull = vi.fn((r: Meta) =>
      Promise.resolve({
        ...r,
        sync: { groupId: 'g1', lastSyncedVersion: 2 },
      })
    );
    const onAutoPulled = vi.fn();
    renderHook(() =>
      usePlcAutoPullSync<Meta>({
        replicas: [replica()],
        canonicalGroups: canonical([['g1', 2]]),
        dirtyReplicaId: null,
        pull,
        acknowledgeVersion: ackMock(),
        onAutoPulled,
      })
    );
    await waitFor(() => expect(pull).toHaveBeenCalledTimes(1));
    expect(onAutoPulled).toHaveBeenCalledTimes(1);
  });

  it('does NOT auto-pull when canonical is not ahead', async () => {
    const pull = pullMock();
    renderHook(() =>
      usePlcAutoPullSync<Meta>({
        replicas: [replica({ sync: { groupId: 'g1', lastSyncedVersion: 2 } })],
        canonicalGroups: canonical([['g1', 2]]),
        dirtyReplicaId: null,
        pull,
        acknowledgeVersion: ackMock(),
      })
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(pull).not.toHaveBeenCalled();
  });

  it('surfaces a conflict (no auto-pull) when the dirty replica advances', async () => {
    const pull = pullMock();
    const { result } = renderHook(() =>
      usePlcAutoPullSync<Meta>({
        replicas: [replica()],
        canonicalGroups: canonical([['g1', 2]]),
        dirtyReplicaId: 'r1',
        pull,
        acknowledgeVersion: ackMock(),
      })
    );
    await waitFor(() => expect(result.current.conflicts).toHaveLength(1));
    expect(result.current.conflicts[0]).toMatchObject({
      groupId: 'g1',
      replicaId: 'r1',
      canonicalVersion: 2,
    });
    expect(pull).not.toHaveBeenCalled();
  });

  it('resolveConflict("theirs") pulls and clears the prompt', async () => {
    const pull = pullMock();
    const onConflictPulled = vi.fn();
    const { result } = renderHook(() =>
      usePlcAutoPullSync<Meta>({
        replicas: [replica()],
        canonicalGroups: canonical([['g1', 2]]),
        dirtyReplicaId: 'r1',
        pull,
        acknowledgeVersion: ackMock(),
        onConflictPulled,
      })
    );
    await waitFor(() => expect(result.current.conflicts).toHaveLength(1));
    act(() => {
      result.current.resolveConflict('g1', 'theirs');
    });
    await waitFor(() => expect(pull).toHaveBeenCalledTimes(1));
    expect(onConflictPulled).toHaveBeenCalledTimes(1);
    expect(result.current.conflicts).toHaveLength(0);
  });

  it('resolveConflict("mine") acknowledges the version without pulling', async () => {
    const pull = pullMock();
    const acknowledgeVersion = ackMock();
    const { result } = renderHook(() =>
      usePlcAutoPullSync<Meta>({
        replicas: [replica()],
        canonicalGroups: canonical([['g1', 2]]),
        dirtyReplicaId: 'r1',
        pull,
        acknowledgeVersion,
      })
    );
    await waitFor(() => expect(result.current.conflicts).toHaveLength(1));
    act(() => {
      result.current.resolveConflict('g1', 'mine');
    });
    await waitFor(() =>
      expect(acknowledgeVersion).toHaveBeenCalledWith(expect.anything(), 2)
    );
    expect(pull).not.toHaveBeenCalled();
    expect(result.current.conflicts).toHaveLength(0);
  });

  it('is inert when disabled', async () => {
    const pull = pullMock();
    const { result } = renderHook(() =>
      usePlcAutoPullSync<Meta>({
        replicas: [replica()],
        canonicalGroups: canonical([['g1', 2]]),
        dirtyReplicaId: 'r1',
        pull,
        acknowledgeVersion: ackMock(),
        enabled: false,
      })
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(pull).not.toHaveBeenCalled();
    expect(result.current.conflicts).toHaveLength(0);
  });

  it('does not re-pull the same canonical version twice', async () => {
    const pull = pullMock();
    const { rerender } = renderHook(
      (props: { groups: Map<string, PlcCanonicalGroupVersion> }) =>
        usePlcAutoPullSync<Meta>({
          replicas: [replica()],
          canonicalGroups: props.groups,
          dirtyReplicaId: null,
          pull,
          acknowledgeVersion: ackMock(),
        }),
      { initialProps: { groups: canonical([['g1', 2]]) } }
    );
    await waitFor(() => expect(pull).toHaveBeenCalledTimes(1));
    // Re-render with a fresh-but-equal canonical map; same version => no re-pull.
    rerender({ groups: canonical([['g1', 2]]) });
    await new Promise((r) => setTimeout(r, 0));
    expect(pull).toHaveBeenCalledTimes(1);
  });
});
