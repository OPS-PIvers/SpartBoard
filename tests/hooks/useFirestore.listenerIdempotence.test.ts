import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// Drive the mock stores through the public hook API in bypass mode. The mock
// stores (MockDashboardStore / MockSharedStore) are module-private singletons,
// so we exercise their listener bookkeeping via subscribeToDashboards /
// subscribeToSharedBoard rather than reaching in directly.
vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: true }));

import { useFirestore } from '@/hooks/useFirestore';
import type { Dashboard } from '@/types';

const makeDashboard = (id: string): Dashboard => ({
  id,
  name: id,
  background: 'bg-slate-900',
  widgets: [],
  createdAt: Date.now(),
});

describe('useFirestore – mock-store listener idempotence (bypass mode)', () => {
  beforeEach(() => {
    // Each MockSharedStore subscription persists to sessionStorage; clear so a
    // prior test's share docs don't leak the initial value into this test.
    sessionStorage.clear();
  });

  describe('subscribeToDashboards (MockDashboardStore)', () => {
    it('double-subscribe + single-unsubscribe leaves one live listener', async () => {
      const { result } = renderHook(() => useFirestore('user-1'));
      const { subscribeToDashboards, saveDashboard } = result.current;

      const cbA = vi.fn();
      const cbB = vi.fn();

      const unsubA = subscribeToDashboards(cbA);
      const unsubB = subscribeToDashboards(cbB);

      cbA.mockClear();
      cbB.mockClear();

      // Tear down only the first subscription.
      unsubA();

      // A write should notify the surviving subscription, not the torn-down one.
      await saveDashboard(makeDashboard('d1'));

      expect(cbA).not.toHaveBeenCalled();
      expect(cbB).toHaveBeenCalledTimes(1);

      unsubB();
    });

    it('two subscriptions sharing the same callback reference are tracked independently', async () => {
      const { result } = renderHook(() => useFirestore('user-1'));
      const { subscribeToDashboards, saveDashboard } = result.current;

      // Same reference subscribed twice — a Set would collapse these into one
      // entry, so a single unsubscribe would kill the still-live second one.
      const shared = vi.fn();
      const unsub1 = subscribeToDashboards(shared);
      const unsub2 = subscribeToDashboards(shared);

      shared.mockClear();

      // Remove one registration; the other must keep firing.
      unsub1();
      await saveDashboard(makeDashboard('d2'));
      expect(shared).toHaveBeenCalledTimes(1);

      // Removing the second registration silences it entirely.
      shared.mockClear();
      unsub2();
      await saveDashboard(makeDashboard('d3'));
      expect(shared).not.toHaveBeenCalled();
    });

    it('unsubscribing twice is a no-op (does not throw or drop others)', async () => {
      const { result } = renderHook(() => useFirestore('user-1'));
      const { subscribeToDashboards, saveDashboard } = result.current;

      const cb = vi.fn();
      const other = vi.fn();
      const unsub = subscribeToDashboards(cb);
      const unsubOther = subscribeToDashboards(other);

      unsub();
      expect(() => unsub()).not.toThrow();

      other.mockClear();
      await saveDashboard(makeDashboard('d4'));
      expect(other).toHaveBeenCalledTimes(1);

      unsubOther();
    });
  });

  describe('subscribeToSharedBoard (MockSharedStore)', () => {
    it('double-subscribe + single-unsubscribe leaves one live listener', async () => {
      const { result } = renderHook(() => useFirestore('user-1'));
      const { shareDashboard, mirrorSharedBoard, subscribeToSharedBoard } =
        result.current;

      const shareId = await shareDashboard(makeDashboard('src'));

      const cbA = vi.fn();
      const cbB = vi.fn();

      const unsubA = subscribeToSharedBoard(shareId, cbA);
      const unsubB = subscribeToSharedBoard(shareId, cbB);

      cbA.mockClear();
      cbB.mockClear();

      unsubA();

      // A mirror write notifies surviving subscribers of the same share id.
      await mirrorSharedBoard(shareId, makeDashboard('src'));

      expect(cbA).not.toHaveBeenCalled();
      expect(cbB).toHaveBeenCalledTimes(1);

      unsubB();
    });

    it('same callback reference subscribed twice to a share is tracked independently', async () => {
      const { result } = renderHook(() => useFirestore('user-1'));
      const { shareDashboard, mirrorSharedBoard, subscribeToSharedBoard } =
        result.current;

      const shareId = await shareDashboard(makeDashboard('src'));

      const shared = vi.fn();
      const unsub1 = subscribeToSharedBoard(shareId, shared);
      const unsub2 = subscribeToSharedBoard(shareId, shared);

      shared.mockClear();

      unsub1();
      await mirrorSharedBoard(shareId, makeDashboard('src'));
      expect(shared).toHaveBeenCalledTimes(1);

      shared.mockClear();
      unsub2();
      await mirrorSharedBoard(shareId, makeDashboard('src'));
      expect(shared).not.toHaveBeenCalled();
    });
  });
});
