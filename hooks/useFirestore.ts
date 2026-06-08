import { useCallback, useMemo } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  deleteDoc,
  deleteField,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import {
  Dashboard,
  SharedBoardIntendedMode,
  SharedBoardParticipant,
  SubstituteShareDriveGrant,
  WidgetData,
} from '@/types';

/**
 * Snapshot returned from `loadSharedDashboard` — a normalized Dashboard plus
 * the host-chosen `intendedMode` from the shared doc. Kept separate from the
 * `Dashboard` type because intendedMode is doc-side metadata, not a per-user
 * link field.
 */
export type SharedBoardSnapshot = Dashboard & {
  intendedMode?: SharedBoardIntendedMode;
};

/**
 * Singleton pattern for mock storage in bypass mode.
 * This prevents HMR (Hot Module Replacement) issues and ensures proper
 * lifecycle management during development and testing.
 */
class MockDashboardStore {
  private static instance: MockDashboardStore;
  private dashboards: Dashboard[] = [];
  private listeners = new Set<
    (dashboards: Dashboard[], hasPendingWrites: boolean) => void
  >();

  private constructor() {
    // Private constructor for singleton
  }

  static getInstance(): MockDashboardStore {
    if (!MockDashboardStore.instance) {
      MockDashboardStore.instance = new MockDashboardStore();
    }
    return MockDashboardStore.instance;
  }

  getDashboards(): Dashboard[] {
    return [...this.dashboards].sort(
      (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
    );
  }

  saveDashboard(dashboard: Dashboard): void {
    const index = this.dashboards.findIndex((d) => d.id === dashboard.id);
    if (index >= 0) {
      this.dashboards[index] = { ...dashboard };
    } else {
      this.dashboards.push({ ...dashboard });
    }
    this.notifyListeners();
  }

  saveDashboards(dashboards: Dashboard[]): void {
    dashboards.forEach((dashboard) => {
      const index = this.dashboards.findIndex((d) => d.id === dashboard.id);
      if (index >= 0) {
        this.dashboards[index] = { ...dashboard };
      } else {
        this.dashboards.push({ ...dashboard });
      }
    });
    this.notifyListeners();
  }

  deleteDashboard(dashboardId: string): void {
    const index = this.dashboards.findIndex((d) => d.id === dashboardId);
    if (index >= 0) {
      this.dashboards.splice(index, 1);
      this.notifyListeners();
    }
  }

  addListener(
    callback: (dashboards: Dashboard[], hasPendingWrites: boolean) => void
  ): void {
    this.listeners.add(callback);
  }

  removeListener(
    callback: (dashboards: Dashboard[], hasPendingWrites: boolean) => void
  ): void {
    this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    const sorted = this.getDashboards();
    this.listeners.forEach((callback) => callback(sorted, false));
  }

  /**
   * Reset the store - useful for testing and clearing state.
   */
  reset(): void {
    this.dashboards = [];
    this.listeners.clear();
  }
}

class MockSharedStore {
  private static instance: MockSharedStore;
  // Stored docs may carry shared-only fields (intendedMode, originalAuthorName);
  // typed loosely to match the live Firestore shape without polluting Dashboard.
  private shared: Map<string, Record<string, unknown>> = new Map();
  private listeners: Map<
    string,
    Set<(d: Record<string, unknown> | null) => void>
  > = new Map();

  private constructor() {
    // Private constructor for singleton
  }

  static getInstance(): MockSharedStore {
    if (!MockSharedStore.instance) {
      MockSharedStore.instance = new MockSharedStore();
    }
    return MockSharedStore.instance;
  }

  add(dashboard: Dashboard | Record<string, unknown>): string {
    const id = 'share-' + Date.now();
    const data = { ...(dashboard as Record<string, unknown>), id };
    this.shared.set(id, data);
    this.persist(id, data);
    return id;
  }

  update(
    id: string,
    patch: Partial<Dashboard> | Record<string, unknown>
  ): void {
    const existing = this.get(id);
    if (!existing) return;
    const updated = {
      ...existing,
      ...(patch as Record<string, unknown>),
      id,
    };
    this.shared.set(id, updated);
    this.persist(id, updated);
    this.notify(id, updated);
  }

  remove(id: string): void {
    this.shared.delete(id);
    try {
      sessionStorage.removeItem('mock_shared_' + id);
    } catch {
      /* no-op */
    }
    this.notify(id, null);
  }

  get(id: string): Record<string, unknown> | undefined {
    if (this.shared.has(id)) return this.shared.get(id);
    try {
      const item = sessionStorage.getItem('mock_shared_' + id);
      if (item) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const data = JSON.parse(item);
        this.shared.set(id, data as Record<string, unknown>);
        return data as Record<string, unknown>;
      }
    } catch (e) {
      console.error('Failed to load mock share from storage', e);
    }
    return undefined;
  }

  subscribe(
    id: string,
    cb: (d: Record<string, unknown> | null) => void
  ): () => void {
    let bucket = this.listeners.get(id);
    if (!bucket) {
      bucket = new Set();
      this.listeners.set(id, bucket);
    }
    bucket.add(cb);
    cb(this.get(id) ?? null);
    return () => {
      this.listeners.get(id)?.delete(cb);
    };
  }

  private persist(id: string, data: Record<string, unknown>): void {
    try {
      sessionStorage.setItem('mock_shared_' + id, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save mock share to storage', e);
    }
  }

  private notify(id: string, data: Record<string, unknown> | null): void {
    this.listeners.get(id)?.forEach((cb) => cb(data));
  }
}

const mockStore = MockDashboardStore.getInstance();
const mockSharedStore = MockSharedStore.getInstance();

/**
 * Normalize a /shared_boards/{shareId} doc payload into a Dashboard the
 * client can consume directly. The shared doc stores the host's display
 * name under `originalAuthorName` (the per-user link bookkeeping field
 * `linkedShareHostName` is intentionally stripped on write — it's
 * per-recipient state, not part of the broadcast). Map it back here so
 * downstream callers see a single canonical field.
 */
function mapSharedDocToDashboard(
  data: unknown,
  shareId: string
): SharedBoardSnapshot {
  const record = (data ?? {}) as Record<string, unknown>;
  const originalAuthorName =
    typeof record.originalAuthorName === 'string'
      ? record.originalAuthorName
      : undefined;
  const rawIntendedMode = record.intendedMode;
  const intendedMode: SharedBoardIntendedMode | undefined =
    rawIntendedMode === 'copy' ||
    rawIntendedMode === 'synced' ||
    rawIntendedMode === 'view-only'
      ? rawIntendedMode
      : undefined;
  return {
    ...(record as unknown as Dashboard),
    id: shareId,
    ...(originalAuthorName ? { linkedShareHostName: originalAuthorName } : {}),
    ...(intendedMode ? { intendedMode } : {}),
  };
}

export const useFirestore = (userId: string | null) => {
  const dashboardsRef = useMemo(
    () =>
      !isAuthBypass && userId
        ? collection(db, 'users', userId, 'dashboards')
        : null,
    [userId]
  );

  const loadDashboards = useCallback(async (): Promise<Dashboard[]> => {
    if (isAuthBypass) {
      return mockStore.getDashboards();
    }
    if (!dashboardsRef) return [];
    const snapshot = await getDocs(
      query(dashboardsRef, orderBy('createdAt', 'desc'))
    );
    return snapshot.docs.map(
      (doc) => ({ ...doc.data(), id: doc.id }) as Dashboard
    );
  }, [dashboardsRef]);

  const saveDashboard = useCallback(
    async (dashboard: Dashboard): Promise<number> => {
      if (isAuthBypass) {
        mockStore.saveDashboard(dashboard);
        return Date.now();
      }

      if (!dashboardsRef) throw new Error('User not authenticated');
      const docRef = doc(dashboardsRef, dashboard.id);
      const updatedAt = Date.now();
      await setDoc(docRef, {
        ...dashboard,
        updatedAt,
      });
      return updatedAt;
    },
    [dashboardsRef]
  );

  const saveDashboards = useCallback(
    async (dashboards: Dashboard[]): Promise<void> => {
      if (isAuthBypass) {
        mockStore.saveDashboards(dashboards);
        return Promise.resolve();
      }

      if (!dashboardsRef) throw new Error('User not authenticated');
      const batch = writeBatch(db);
      dashboards.forEach((dashboard) => {
        const docRef = doc(dashboardsRef, dashboard.id);
        batch.set(docRef, {
          ...dashboard,
          updatedAt: Date.now(),
        });
      });
      await batch.commit();
    },
    [dashboardsRef]
  );

  const deleteDashboard = useCallback(
    async (dashboardId: string): Promise<void> => {
      if (isAuthBypass) {
        mockStore.deleteDashboard(dashboardId);
        return Promise.resolve();
      }

      if (!dashboardsRef) throw new Error('User not authenticated');
      await deleteDoc(doc(dashboardsRef, dashboardId));
    },
    [dashboardsRef]
  );

  const subscribeToDashboards = useCallback(
    (
      callback: (dashboards: Dashboard[], hasPendingWrites: boolean) => void
    ) => {
      if (isAuthBypass) {
        mockStore.addListener(callback);
        // Initial callback with current state
        callback(mockStore.getDashboards(), false);
        return () => {
          mockStore.removeListener(callback);
        };
      }

      if (!dashboardsRef)
        return () => {
          /* no-op */
        };
      return onSnapshot(
        query(dashboardsRef, orderBy('createdAt', 'desc')),
        (snapshot) => {
          const dashboards = snapshot.docs.map(
            (doc) => ({ ...doc.data(), id: doc.id }) as Dashboard
          );
          callback(dashboards, snapshot.metadata.hasPendingWrites);
        }
      );
    },
    [dashboardsRef]
  );

  const shareDashboard = useCallback(
    async (
      dashboard: Dashboard,
      intendedMode?: SharedBoardIntendedMode,
      hostDisplayName?: string,
      /**
       * Phase 6 — when set, tags the resulting `/shared_boards/{id}` doc
       * with `plcId` so members of that PLC see it on the PLC Dashboard's
       * Shared Boards tab. Mutating the field post-create is restricted
       * to the host (rules pin it immutable for collaborators).
       */
      plcId?: string
    ): Promise<string> => {
      if (isAuthBypass) {
        // Stash the host display name on the mock doc under the same field
        // the live path uses so loadSharedDashboard's mapping works in bypass.
        return mockSharedStore.add({
          ...dashboard,
          ...(hostDisplayName
            ? ({ originalAuthorName: hostDisplayName } as Partial<Dashboard>)
            : {}),
          ...(intendedMode
            ? ({ intendedMode } as unknown as Partial<Dashboard>)
            : {}),
          ...(plcId ? ({ plcId } as unknown as Partial<Dashboard>) : {}),
        } as Dashboard);
      }

      const shareRef = collection(db, 'shared_boards');
      // Drop link metadata from the snapshot so guests don't inherit the
      // host's role bookkeeping and so a shared board can never reference
      // itself as a parent.
      const {
        id: _id,
        linkedShareId: _ls,
        linkedShareRole: _lsr,
        linkedShareHostName: _lsh,
        linkedShareEnded: _lse,
        ...data
      } = dashboard;

      const docRef = await addDoc(shareRef, {
        ...data,
        sharedAt: Date.now(),
        originalAuthor: userId,
        ...(hostDisplayName ? { originalAuthorName: hostDisplayName } : {}),
        ...(intendedMode ? { intendedMode } : {}),
        ...(plcId ? { plcId } : {}),
        participants: {},
        updatedAt: Date.now(),
        updatedBy: userId,
      });
      return docRef.id;
    },
    [userId]
  );

  /**
   * Write a substitute-mode share. Distinct from `shareDashboard()` because
   * substitute shares carry extra fields (expiresAt, buildingId, initialState,
   * subEmails, driveGrants) and have different lifecycle semantics — no live
   * mirror, no linkedShareId on the host's dashboard, expiration sweeps
   * remove them.
   *
   * `driveGrants` is passed in here (not added via a follow-up updateDoc)
   * so the share doc lands with the grants atomically. A crash after Drive
   * grants succeed but before this write would orphan permissions; the
   * caller is responsible for ordering: grant first, then call this. Even
   * with that sequencing, the failure window is one network call instead
   * of two.
   */
  const shareSubstituteDashboard = useCallback(
    async (params: {
      dashboard: Dashboard;
      expiresAt: number;
      buildingId: string;
      subEmails?: string[];
      driveGrants?: SubstituteShareDriveGrant[];
      hostDisplayName?: string;
    }): Promise<string> => {
      const {
        dashboard,
        expiresAt,
        buildingId,
        subEmails,
        driveGrants,
        hostDisplayName,
      } = params;

      if (isAuthBypass) {
        return mockSharedStore.add({
          ...dashboard,
          ...(hostDisplayName
            ? ({ originalAuthorName: hostDisplayName } as Partial<Dashboard>)
            : {}),
          intendedMode: 'substitute',
        } as Dashboard);
      }

      const shareRef = collection(db, 'shared_boards');
      // Strip link metadata so the frozen snapshot can never reference itself
      // as a parent, mirroring the regular `shareDashboard` write path.
      const {
        id: _id,
        linkedShareId: _ls,
        linkedShareRole: _lsr,
        linkedShareHostName: _lsh,
        linkedShareEnded: _lse,
        ...data
      } = dashboard;

      // The widgets array is captured both at the top level (for renderers
      // that read `widgets`) and as `initialState` (for the sub-board
      // "Reset board" action to deep-clone from). Two copies are deliberate
      // and stay in sync only at creation time — the host can't update
      // either after the fact.
      const initialState = JSON.parse(
        JSON.stringify(data.widgets ?? [])
      ) as WidgetData[];

      const docRef = await addDoc(shareRef, {
        ...data,
        sharedAt: Date.now(),
        originalAuthor: userId,
        ...(hostDisplayName ? { originalAuthorName: hostDisplayName } : {}),
        intendedMode: 'substitute' as SharedBoardIntendedMode,
        expiresAt,
        buildingId,
        initialState,
        ...(subEmails && subEmails.length > 0 ? { subEmails } : {}),
        ...(driveGrants && driveGrants.length > 0 ? { driveGrants } : {}),
        participants: {},
        updatedAt: Date.now(),
        updatedBy: userId,
      });
      return docRef.id;
    },
    [userId]
  );

  /**
   * Push the host or collaborator's local dashboard state into the shared
   * doc. Strips the doc id and link bookkeeping so they don't leak to the
   * other side. `updatedBy` is the local user's uid so subscribers can
   * skip echoes of their own writes.
   */
  const mirrorSharedBoard = useCallback(
    async (shareId: string, dashboard: Dashboard): Promise<void> => {
      if (isAuthBypass) {
        const {
          id: _id,
          linkedShareId: _ls,
          linkedShareRole: _lsr,
          linkedShareHostName: _lsh,
          linkedShareEnded: _lse,
          ...patch
        } = dashboard;
        mockSharedStore.update(shareId, {
          ...patch,
          updatedAt: Date.now(),
          updatedBy: userId ?? 'mock',
        } as Partial<Dashboard>);
        return;
      }

      if (!userId) return;
      const docRef = doc(db, 'shared_boards', shareId);
      const {
        id: _id,
        linkedShareId: _ls,
        linkedShareRole: _lsr,
        linkedShareHostName: _lsh,
        linkedShareEnded: _lse,
        ...patch
      } = dashboard;
      // updateDoc preserves participants/originalAuthor/sharedAt so guests
      // and host bookkeeping survive across mirrors.
      await updateDoc(docRef, {
        ...patch,
        updatedAt: Date.now(),
        updatedBy: userId,
      });
    },
    [userId]
  );

  const subscribeToSharedBoard = useCallback(
    (
      shareId: string,
      callback: (dashboard: SharedBoardSnapshot | null) => void
    ): (() => void) => {
      if (isAuthBypass) {
        return mockSharedStore.subscribe(shareId, (raw) => {
          callback(raw ? mapSharedDocToDashboard(raw, shareId) : null);
        });
      }
      const docRef = doc(db, 'shared_boards', shareId);
      // Capture the unsubscribe so the error path can tear down its own
      // listener — a synchronously-erroring onSnapshot would otherwise leave
      // a live listener stacked on the shared doc on every re-subscribe.
      const unsubscribe = onSnapshot(
        docRef,
        (snap) => {
          if (!snap.exists()) {
            callback(null);
            return;
          }
          callback(mapSharedDocToDashboard(snap.data(), snap.id));
        },
        (err) => {
          console.error('Failed to subscribe to shared board:', err);
          unsubscribe();
          callback(null);
        }
      );
      return unsubscribe;
    },
    []
  );

  const joinSharedBoard = useCallback(
    async (
      shareId: string,
      role: SharedBoardParticipant['role'],
      displayName?: string
    ): Promise<void> => {
      if (!userId) return;
      const entry: SharedBoardParticipant = {
        role,
        joinedAt: Date.now(),
        ...(displayName ? { displayName } : {}),
      };
      if (isAuthBypass) {
        const existing = mockSharedStore.get(shareId);
        if (!existing) return;
        const participants = {
          ...(existing.participants as
            | Record<string, SharedBoardParticipant>
            | undefined),
          [userId]: entry,
        };
        mockSharedStore.update(shareId, { participants });
        return;
      }
      const docRef = doc(db, 'shared_boards', shareId);
      await updateDoc(docRef, {
        [`participants.${userId}`]: entry,
      });
    },
    [userId]
  );

  const leaveSharedBoard = useCallback(
    async (shareId: string): Promise<void> => {
      if (!userId) return;
      if (isAuthBypass) {
        const existing = mockSharedStore.get(shareId);
        if (!existing) return;
        const participants = {
          ...(existing.participants as
            | Record<string, SharedBoardParticipant>
            | undefined),
        };
        delete participants[userId];
        mockSharedStore.update(shareId, { participants });
        return;
      }
      const docRef = doc(db, 'shared_boards', shareId);
      await updateDoc(docRef, {
        [`participants.${userId}`]: deleteField(),
      });
    },
    [userId]
  );

  /** Host-only: tear down the shared doc so guests detect a "share ended" state. */
  const stopSharingBoard = useCallback(
    async (shareId: string): Promise<void> => {
      if (isAuthBypass) {
        mockSharedStore.remove(shareId);
        return;
      }
      const docRef = doc(db, 'shared_boards', shareId);
      await deleteDoc(docRef);
    },
    []
  );

  const loadSharedDashboard = useCallback(
    async (shareId: string): Promise<SharedBoardSnapshot | null> => {
      if (isAuthBypass) {
        const mock = mockSharedStore.get(shareId) ?? null;
        return mock ? mapSharedDocToDashboard(mock, shareId) : null;
      }

      const docRef = doc(db, 'shared_boards', shareId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return mapSharedDocToDashboard(snap.data(), snap.id);
      }
      return null;
    },
    []
  );

  return {
    loadDashboards,
    saveDashboard,
    saveDashboards,
    deleteDashboard,
    subscribeToDashboards,
    shareDashboard,
    shareSubstituteDashboard,
    loadSharedDashboard,
    mirrorSharedBoard,
    subscribeToSharedBoard,
    joinSharedBoard,
    leaveSharedBoard,
    stopSharingBoard,
  };
};
