import { useCallback, useMemo } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  writeBatch,
} from 'firebase/firestore';
import { db, isAuthBypass } from '../config/firebase';
import { Dashboard } from '../types';

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
    try {
      sessionStorage.setItem('mock_shared_' + id, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save mock share to storage', e);
    }
    return id;
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
    async (dashboard: Dashboard): Promise<string> => {
      if (isAuthBypass) {
        return mockSharedStore.add(dashboard);
      }

      const shareRef = collection(db, 'shared_boards');
      // We exclude the ID when creating a new shared document
      const { id: _id, ...data } = dashboard;

      const docRef = await addDoc(shareRef, {
        ...data,
        sharedAt: Date.now(),
        originalAuthor: userId,
      });
      return docRef.id;
    },
    [userId]
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
  };
};
