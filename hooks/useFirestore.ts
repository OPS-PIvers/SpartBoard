import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  type DocumentReference,
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
  runTransaction,
  updateDoc,
  waitForPendingWrites,
  writeBatch,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { assertViewAsCanWrite, isViewAsTab } from '@/utils/viewAsTab';
import {
  mergeDashboardForSave,
  type SaveBaseline,
} from '@/utils/dashboardSaveMerge';
import { migrateBoardForCollections } from '@/utils/collectionsMigration';
import { migrateDashboardWidgets } from '@/utils/migrateProportionalLayout';
import { migrateBoardWidgets } from '@/utils/migration';
import {
  mergeSharedBoard,
  type SharedBoardBaseline,
} from '@/utils/sharedBoardMerge';
import {
  Dashboard,
  SharedBoardIntendedMode,
  SharedBoardParticipant,
  SubstituteShareDriveGrant,
  SubstituteShareRoster,
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
  /** `/linked_collections/{id}` the share belongs to, when part of a shared collection. */
  linkedCollectionId?: string;
  /** Uid of the teacher who created the share. */
  originalAuthor?: string;
  participants?: Record<string, SharedBoardParticipant>;
};

/**
 * Singleton pattern for mock storage in bypass mode.
 * This prevents HMR (Hot Module Replacement) issues and ensures proper
 * lifecycle management during development and testing.
 */
class MockDashboardStore {
  private static instance: MockDashboardStore;
  private dashboards: Dashboard[] = [];
  // Listeners are keyed by a per-subscription id rather than stored in a Set
  // keyed by callback reference. A Set would dedupe two subscriptions that
  // happen to share the same callback reference, so a double-subscribe +
  // single-unsubscribe could tear down a still-live listener. The id Map
  // makes each subscription independently tracked and removed.
  private listeners = new Map<
    number,
    (dashboards: Dashboard[], hasPendingWrites: boolean) => void
  >();
  private nextListenerId = 0;

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

  /**
   * Register a listener and return its own unsubscribe function. Each call
   * gets a distinct id, so subscribing the same callback twice yields two
   * independent registrations and two independent teardowns.
   */
  addListener(
    callback: (dashboards: Dashboard[], hasPendingWrites: boolean) => void
  ): () => void {
    const id = this.nextListenerId++;
    this.listeners.set(id, callback);
    return () => {
      this.listeners.delete(id);
    };
  }

  private notifyListeners(): void {
    const sorted = this.getDashboards();
    // Map.forEach yields (value, key); value is the listener callback.
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
  // Per-share buckets are keyed by a per-subscription id (not by callback
  // reference) so that subscribing the same callback to a share twice yields
  // two independent registrations; a single unsubscribe then removes only one,
  // leaving the other still firing.
  private listeners: Map<
    string,
    Map<number, (d: Record<string, unknown> | null) => void>
  > = new Map();
  private nextListenerId = 0;

  private constructor() {
    // Private constructor for singleton
  }

  static getInstance(): MockSharedStore {
    if (!MockSharedStore.instance) {
      MockSharedStore.instance = new MockSharedStore();
    }
    return MockSharedStore.instance;
  }

  add(
    dashboard: Dashboard | Record<string, unknown>,
    fixedId?: string
  ): string {
    if (fixedId && this.shared.has(fixedId)) return fixedId;
    const id = fixedId ?? 'share-' + Date.now();
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
      bucket = new Map();
      this.listeners.set(id, bucket);
    }
    const listenerId = this.nextListenerId++;
    bucket.set(listenerId, cb);
    cb(this.get(id) ?? null);
    return () => {
      this.listeners.get(id)?.delete(listenerId);
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
  const base = record as unknown as Dashboard;
  const { linkedCollectionId: rawLinkId, ...rest } = record;
  const hostUid =
    typeof record.originalAuthor === 'string' && record.originalAuthor
      ? record.originalAuthor
      : undefined;
  return {
    ...(rest as unknown as Dashboard),
    widgets: migrateBoardWidgets(base.widgets ?? []),
    id: shareId,
    ...(originalAuthorName ? { linkedShareHostName: originalAuthorName } : {}),
    ...(hostUid ? { linkedShareHostUid: hostUid } : {}),
    ...(intendedMode ? { intendedMode } : {}),
    ...(typeof rawLinkId === 'string' ? { linkedCollectionId: rawLinkId } : {}),
  };
}

/**
 * Bring a raw server doc up to the same shape the snapshot path produces
 * before merging against it. Without this the merge folds an un-migrated
 * legacy doc back in — widgets with no proportional bounds, boards with no
 * `collectionId` — and writes that regression to Firestore.
 */
const normalizeServerBoard = (board: Dashboard): Dashboard => {
  const withCollections = migrateBoardForCollections(board);
  // Snapshot-path order: without migrateWidget the merge folds a legacy timer config onto a migrated time-tool widget.
  const typeMigrated = migrateBoardWidgets(withCollections.widgets ?? []);
  const widgets = migrateDashboardWidgets(
    typeMigrated,
    withCollections.viewportWidth,
    withCollections.viewportHeight
  );
  return { ...withCollections, widgets };
};

/** The only Firestore codes that mean "no server round trip happened". */
const OFFLINE_ERROR_CODES = new Set(['unavailable', 'deadline-exceeded']);

/**
 * Firestore transactions reject outright while offline; a blind write queues
 * instead. Gated on the error code alone — `navigator.onLine === false` may
 * corroborate but must never stand in for it, or a permission-denied
 * transaction while offline would fall through to a blind overwrite.
 */
const isOfflineError = (err: unknown): boolean => {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && OFFLINE_ERROR_CODES.has(code);
};

interface DeferredSave {
  dashboard: Dashboard;
  baseline: SaveBaseline;
  updatedAt: number;
  onFailed?: (err: unknown) => void;
}

/**
 * Another device may have written since this one last synced; merge inside
 * the transaction so that write survives. The merge runs on every baselined
 * save rather than only when `updatedAt` moved: this device's own merged
 * write advances the server timestamp to a value it then treats as its own,
 * so a timestamp gate would let the very next save blind-write over the edit
 * that was just folded in. When the server still matches the baseline the
 * merge is a no-op by construction.
 */
const commitMergedSave = (
  docRef: DocumentReference,
  dashboard: Dashboard,
  baseline: SaveBaseline,
  updatedAt: number,
  // Queued retries pass this so a superseded or deleted board is never written back.
  shouldWrite?: () => boolean
) =>
  runTransaction(db, async (tx) => {
    const snap = await tx.get(docRef);
    if (shouldWrite && !shouldWrite()) return;
    const server = snap.exists()
      ? normalizeServerBoard({ ...snap.data(), id: snap.id } as Dashboard)
      : null;
    const toWrite = server
      ? mergeDashboardForSave(dashboard, server, baseline)
      : dashboard;
    tx.set(docRef, { ...toWrite, updatedAt });
  });

/** Resolves when `promise` settles or after `ms`, whichever is first. */
const settleWithin = (promise: Promise<unknown>, ms: number) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    void Promise.resolve(promise)
      .catch(() => undefined)
      .then(() => {
        clearTimeout(timer);
        resolve();
      });
  });

/** Waits 2s, 4s, 8s … up to 30s before the next offline retry, or less if the browser comes back online. */
const waitToRetry = (attempt: number) =>
  new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener('online', done);
      resolve();
    };
    const timer = setTimeout(done, Math.min(30_000, 2000 * 2 ** attempt));
    window.addEventListener('online', done);
  });

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

  // Offline saves per board, oldest first; each later save on that board queues behind them.
  const deferredSavesRef = useRef(new Map<string, DeferredSave[]>());
  // A signed-out or switched account must not keep retrying the previous one's saves.
  useEffect(() => {
    const queues = deferredSavesRef.current;
    return () => queues.clear();
  }, [dashboardsRef]);

  const deferSave = useCallback(
    (
      docRef: DocumentReference,
      dashboard: Dashboard,
      baseline: SaveBaseline,
      updatedAt: number,
      onFailed?: (err: unknown) => void
    ) => {
      const queues = deferredSavesRef.current;
      const job: DeferredSave = { dashboard, baseline, updatedAt, onFailed };
      const existing = queues.get(dashboard.id);
      if (existing) {
        existing.push(job);
        return;
      }
      const queue = [job];
      queues.set(dashboard.id, queue);
      void (async () => {
        let attempt = 0;
        // The save that queued this just failed offline, so wait before the first retry.
        await waitToRetry(attempt++);
        // Stops once a whole-board write replaced this queue.
        while (queues.get(dashboard.id) === queue && queue.length > 0) {
          const next = queue[0];
          try {
            // A board created offline is a queued whole write; let it reach the server before merging against it.
            await settleWithin(waitForPendingWrites(db), 30_000);
            await commitMergedSave(
              docRef,
              next.dashboard,
              next.baseline,
              next.updatedAt,
              () => queues.get(dashboard.id) === queue
            );
          } catch (err) {
            if (isOfflineError(err)) {
              await waitToRetry(attempt++);
              continue;
            }
            console.error('[useFirestore] Deferred offline save failed:', err);
            next.onFailed?.(err);
          }
          attempt = 0;
          queue.shift();
        }
        if (queues.get(dashboard.id) === queue) queues.delete(dashboard.id);
      })();
    },
    []
  );

  const saveWithBaseline = useCallback(
    async (
      docRef: DocumentReference,
      dashboard: Dashboard,
      baseline: SaveBaseline,
      updatedAt: number,
      onDeferredWriteFailed?: (err: unknown) => void
    ): Promise<void> => {
      // A queued offline save for this board must land first, or this one would merge against a server that never saw it.
      if (deferredSavesRef.current.has(dashboard.id)) {
        deferSave(
          docRef,
          dashboard,
          baseline,
          updatedAt,
          onDeferredWriteFailed
        );
        return;
      }
      try {
        await commitMergedSave(docRef, dashboard, baseline, updatedAt);
      } catch (err) {
        // Queued, not awaited: waiting would hang the caller's save and its saving indicator for the whole outage.
        if (!isOfflineError(err)) throw err;
        deferSave(
          docRef,
          dashboard,
          baseline,
          updatedAt,
          onDeferredWriteFailed
        );
      }
    },
    [deferSave]
  );

  const hasDeferredSave = useCallback(
    (dashboardId: string) => deferredSavesRef.current.has(dashboardId),
    []
  );

  // What the server held before this board's queued offline saves, so a snapshot can tell their deletions from another device's additions.
  const deferredSaveBaseline = useCallback(
    (dashboardId: string): SaveBaseline | undefined =>
      deferredSavesRef.current.get(dashboardId)?.[0]?.baseline,
    []
  );

  const saveDashboard = useCallback(
    async (
      dashboard: Dashboard,
      baseline?: SaveBaseline,
      onDeferredWriteFailed?: (err: unknown) => void
    ): Promise<number> => {
      // View as never autosaves boards (plan D11); the tab edits a local copy.
      if (isViewAsTab) return Date.now();
      if (isAuthBypass) {
        mockStore.saveDashboard(dashboard);
        return Date.now();
      }

      if (!dashboardsRef) throw new Error('User not authenticated');
      const docRef = doc(dashboardsRef, dashboard.id);
      const updatedAt = Date.now();
      if (!baseline) {
        // The whole board supersedes any queued offline save of it.
        deferredSavesRef.current.delete(dashboard.id);
        await setDoc(docRef, { ...dashboard, updatedAt });
        return updatedAt;
      }
      await saveWithBaseline(
        docRef,
        dashboard,
        baseline,
        updatedAt,
        onDeferredWriteFailed
      );
      return updatedAt;
    },
    [dashboardsRef, saveWithBaseline]
  );

  const saveDashboards = useCallback(
    async (
      dashboards: Dashboard[],
      // Boards with a baseline merge per widget like saveDashboard; the rest are written whole.
      baselines?: ReadonlyMap<string, SaveBaseline>,
      onDeferredWriteFailed?: (err: unknown) => void
    ): Promise<void> => {
      if (isViewAsTab) return;
      if (isAuthBypass) {
        mockStore.saveDashboards(dashboards);
        return Promise.resolve();
      }

      if (!dashboardsRef) throw new Error('User not authenticated');
      const updatedAt = Date.now();
      const whole = dashboards.filter((d) => !baselines?.has(d.id));
      const writes = dashboards.flatMap((d) => {
        const baseline = baselines?.get(d.id);
        return baseline
          ? [
              saveWithBaseline(
                doc(dashboardsRef, d.id),
                d,
                baseline,
                updatedAt,
                onDeferredWriteFailed
              ),
            ]
          : [];
      });
      if (whole.length > 0) {
        const batch = writeBatch(db);
        whole.forEach((dashboard) => {
          deferredSavesRef.current.delete(dashboard.id);
          batch.set(doc(dashboardsRef, dashboard.id), {
            ...dashboard,
            updatedAt,
          });
        });
        writes.push(batch.commit());
      }
      await Promise.all(writes);
    },
    [dashboardsRef, saveWithBaseline]
  );

  const deleteDashboard = useCallback(
    async (dashboardId: string): Promise<void> => {
      if (isViewAsTab) return;
      if (isAuthBypass) {
        mockStore.deleteDashboard(dashboardId);
        return Promise.resolve();
      }

      if (!dashboardsRef) throw new Error('User not authenticated');
      deferredSavesRef.current.delete(dashboardId);
      await deleteDoc(doc(dashboardsRef, dashboardId));
    },
    [dashboardsRef]
  );

  const subscribeToDashboards = useCallback(
    (
      callback: (
        dashboards: Dashboard[],
        hasPendingWrites: boolean,
        // Boards whose own copy carries this tab's unconfirmed writes.
        pendingDashboardIds?: ReadonlySet<string>
      ) => void
    ) => {
      if (isAuthBypass) {
        const unsubscribe = mockStore.addListener(callback);
        // Initial callback with current state
        callback(mockStore.getDashboards(), false);
        return unsubscribe;
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
          const pendingIds = new Set(
            snapshot.docs
              .filter((d) => d.metadata.hasPendingWrites)
              .map((d) => d.id)
          );
          callback(dashboards, snapshot.metadata.hasPendingWrites, pendingIds);
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
      plcId?: string,
      /** The `/linked_collections` link this board share belongs to. */
      linkedCollectionId?: string,
      /** Fixed share id: written only if no share has it yet, so two tabs share a board once. */
      shareId?: string
    ): Promise<string> => {
      assertViewAsCanWrite();
      if (isAuthBypass) {
        // Stash the host display name on the mock doc under the same field
        // the live path uses so loadSharedDashboard's mapping works in bypass.
        return mockSharedStore.add(
          {
            ...dashboard,
            ...(hostDisplayName ? { originalAuthorName: hostDisplayName } : {}),
            ...(intendedMode ? { intendedMode } : {}),
            ...(plcId ? { plcId } : {}),
            ...(linkedCollectionId ? { linkedCollectionId } : {}),
          },
          shareId
        );
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
        linkedShareHostUid: _lshu,
        linkedShareEnded: _lse,
        ...data
      } = dashboard;

      const payload = {
        ...data,
        sharedAt: Date.now(),
        originalAuthor: userId,
        ...(hostDisplayName ? { originalAuthorName: hostDisplayName } : {}),
        ...(intendedMode ? { intendedMode } : {}),
        ...(plcId ? { plcId } : {}),
        ...(linkedCollectionId ? { linkedCollectionId } : {}),
        participants: {},
        updatedAt: Date.now(),
        updatedBy: userId,
      };
      if (shareId) {
        const ref = doc(shareRef, shareId);
        await runTransaction(db, async (tx) => {
          if (!(await tx.get(ref)).exists()) tx.set(ref, payload);
        });
        return shareId;
      }
      const docRef = await addDoc(shareRef, payload);
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
      sharedRosters?: SubstituteShareRoster[];
      hostDisplayName?: string;
    }): Promise<string> => {
      const {
        dashboard,
        expiresAt,
        buildingId,
        subEmails,
        driveGrants,
        sharedRosters,
        hostDisplayName,
      } = params;

      assertViewAsCanWrite();
      if (isAuthBypass) {
        return mockSharedStore.add({
          ...dashboard,
          ...(hostDisplayName ? { originalAuthorName: hostDisplayName } : {}),
          intendedMode: 'substitute',
          ...(sharedRosters?.length ? { sharedRosters } : {}),
        });
      }

      const shareRef = collection(db, 'shared_boards');
      // Strip link metadata so the frozen snapshot can never reference itself
      // as a parent, mirroring the regular `shareDashboard` write path.
      const {
        id: _id,
        linkedShareId: _ls,
        linkedShareRole: _lsr,
        linkedShareHostName: _lsh,
        linkedShareHostUid: _lshu,
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
        ...(sharedRosters && sharedRosters.length > 0 ? { sharedRosters } : {}),
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
   * other side. With a baseline, the write folds in a co-teacher's edits the
   * local copy has not received yet instead of overwriting them.
   */
  const mirrorSharedBoard = useCallback(
    async (
      shareId: string,
      dashboard: Dashboard,
      baseline?: SharedBoardBaseline
    ): Promise<Dashboard | undefined> => {
      if (isViewAsTab) return undefined;
      const withServer = (raw: unknown): Dashboard =>
        baseline && raw
          ? {
              ...dashboard,
              ...mergeSharedBoard(
                dashboard,
                mapSharedDocToDashboard(raw, shareId),
                baseline
              ),
            }
          : dashboard;
      if (isAuthBypass) {
        const written = withServer(mockSharedStore.get(shareId));
        const {
          id: _id,
          linkedShareId: _ls,
          linkedShareRole: _lsr,
          linkedShareHostName: _lsh,
          linkedShareHostUid: _lshu,
          linkedShareEnded: _lse,
          ...patch
        } = written;
        mockSharedStore.update(shareId, {
          ...patch,
          updatedAt: Date.now(),
          updatedBy: userId ?? 'mock',
        });
        return written;
      }

      if (!userId) return undefined;
      const docRef = doc(db, 'shared_boards', shareId);
      const toPatch = (board: Dashboard) => {
        const {
          id: _id,
          linkedShareId: _ls,
          linkedShareRole: _lsr,
          linkedShareHostName: _lsh,
          linkedShareHostUid: _lshu,
          linkedShareEnded: _lse,
          ...patch
        } = board;
        return { ...patch, updatedAt: Date.now(), updatedBy: userId };
      };
      // update (not set) preserves participants/originalAuthor/sharedAt so
      // guests and host bookkeeping survive across mirrors.
      if (!baseline) {
        await updateDoc(docRef, toPatch(dashboard));
        return dashboard;
      }
      try {
        return await runTransaction(db, async (tx) => {
          const snap = await tx.get(docRef);
          const written = withServer(snap.exists() ? snap.data() : null);
          tx.update(docRef, toPatch(written));
          return written;
        });
      } catch (err) {
        // Offline: queue the plain write, as saveDashboard does.
        if (!isOfflineError(err)) throw err;
        await updateDoc(docRef, toPatch(dashboard));
        return dashboard;
      }
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
      // Capture the unsubscribe so the error path can tear down its own listener
      // (preventing a stacked listener on re-subscribe). Initialize to a no-op
      // and reassign once onSnapshot returns: referencing a
      // `const unsubscribe = onSnapshot(...)` from its own error callback would
      // be a temporal-dead-zone access if the error ever fired synchronously.
      // The no-op default keeps the teardown call safe in that theoretical case
      // (nothing is registered yet) without a non-null assertion.
      let unsubscribe: () => void = () => {
        // no-op until onSnapshot (below) returns the real unsubscribe
      };
      unsubscribe = onSnapshot(
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
      assertViewAsCanWrite();
      if (isAuthBypass) {
        const existing = mockSharedStore.get(shareId);
        if (!existing) return;
        const participants = {
          ...(existing.participants as
            Record<string, SharedBoardParticipant> | undefined),
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
      assertViewAsCanWrite();
      if (isAuthBypass) {
        const existing = mockSharedStore.get(shareId);
        if (!existing) return;
        const participants = {
          ...(existing.participants as
            Record<string, SharedBoardParticipant> | undefined),
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
      assertViewAsCanWrite();
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
    hasDeferredSave,
    deferredSaveBaseline,
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
