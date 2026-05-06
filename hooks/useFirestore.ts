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
import { db, isAuthBypass } from '../config/firebase';
import { Dashboard, SharedBoardParticipant } from '../types';

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
  private shared: Map<string, Dashboard> = new Map();
  private listeners: Map<string, Set<(d: Dashboard | null) => void>> =
    new Map();

  private constructor() {
    // Private constructor for singleton
  }

  static getInstance(): MockSharedStore {
    if (!MockSharedStore.instance) {
      MockSharedStore.instance = new MockSharedStore();
    }
    return MockSharedStore.instance;
  }

  add(dashboard: Dashboard): string {
    const id = 'share-' + Date.now();
    const data = { ...dashboard, id };
    this.shared.set(id, data);
    this.persist(id, data);
    return id;
  }

  update(id: string, patch: Partial<Dashboard>): void {
    const existing = this.get(id);
    if (!existing) return;
    const updated = { ...existing, ...patch, id };
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

  get(id: string): Dashboard | undefined {
    if (this.shared.has(id)) return this.shared.get(id);
    try {
      const item = sessionStorage.getItem('mock_shared_' + id);
      if (item) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const data = JSON.parse(item);
        this.shared.set(id, data as Dashboard);
        return data as Dashboard;
      }
    } catch (e) {
      console.error('Failed to load mock share from storage', e);
    }
    return undefined;
  }

  subscribe(id: string, cb: (d: Dashboard | null) => void): () => void {
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

  private persist(id: string, data: Dashboard): void {
    try {
      sessionStorage.setItem('mock_shared_' + id, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save mock share to storage', e);
    }
  }

  private notify(id: string, data: Dashboard | null): void {
    this.listeners.get(id)?.forEach((cb) => cb(data));
  }
}

const mockStore = MockDashboardStore.getInstance();
const mockSharedStore = MockSharedStore.getInstance();

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
    async (dashboard: Dashboard, hostDisplayName?: string): Promise<string> => {
      if (isAuthBypass) {
        return mockSharedStore.add(dashboard);
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
      callback: (dashboard: Dashboard | null) => void
    ): (() => void) => {
      if (isAuthBypass) {
        return mockSharedStore.subscribe(shareId, callback);
      }
      const docRef = doc(db, 'shared_boards', shareId);
      return onSnapshot(
        docRef,
        (snap) => {
          if (!snap.exists()) {
            callback(null);
            return;
          }
          callback({ ...snap.data(), id: snap.id } as Dashboard);
        },
        (err) => {
          console.error('Failed to subscribe to shared board:', err);
          callback(null);
        }
      );
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
          ...((existing as unknown as Record<string, unknown>).participants as
            | Record<string, SharedBoardParticipant>
            | undefined),
          [userId]: entry,
        };
        mockSharedStore.update(shareId, {
          ...({ participants } as unknown as Partial<Dashboard>),
        });
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
          ...((existing as unknown as Record<string, unknown>).participants as
            | Record<string, SharedBoardParticipant>
            | undefined),
        };
        delete participants[userId];
        mockSharedStore.update(shareId, {
          ...({ participants } as unknown as Partial<Dashboard>),
        });
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
    async (shareId: string): Promise<Dashboard | null> => {
      if (isAuthBypass) {
        return mockSharedStore.get(shareId) ?? null;
      }

      const docRef = doc(db, 'shared_boards', shareId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        return { ...data, id: snap.id } as Dashboard;
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
    loadSharedDashboard,
    mirrorSharedBoard,
    subscribeToSharedBoard,
    joinSharedBoard,
    leaveSharedBoard,
    stopSharingBoard,
  };
};
