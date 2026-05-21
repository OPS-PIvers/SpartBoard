import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc as firestoreDeleteDoc,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc as firestoreUpdateDoc,
  where,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { PlcResource, PlcResourceKind, PlcResourceScope } from '@/types';
import { logError } from '@/utils/logError';

const PLC_RESOURCES_COLLECTION = 'plc_resources';

// ---------------------------------------------------------------------------
// Input type for creating a resource (server-stamped fields omitted)
// ---------------------------------------------------------------------------
export interface CreatePlcResourceInput {
  kind: PlcResourceKind;
  title: string;
  description: string;
  refId: string;
  scope: PlcResourceScope;
  plcIds: string[];
}

// ---------------------------------------------------------------------------
// Admin mode result
// ---------------------------------------------------------------------------
interface UsePlcResourcesAdminResult {
  resources: PlcResource[];
  loading: boolean;
  error: Error | null;
  createResource: (input: CreatePlcResourceInput) => Promise<string>;
  updateResource: (
    id: string,
    patch: Partial<CreatePlcResourceInput>
  ) => Promise<void>;
  deleteResource: (id: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// PLC member mode result
// ---------------------------------------------------------------------------
interface UsePlcResourcesMemberResult {
  resources: PlcResource[];
  loading: boolean;
  error: Error | null;
}

// ---------------------------------------------------------------------------
// Overloads
// ---------------------------------------------------------------------------
export function usePlcResources(opts: {
  asAdmin: true;
}): UsePlcResourcesAdminResult;
export function usePlcResources(opts: {
  plcId: string | null;
}): UsePlcResourcesMemberResult;
export function usePlcResources(
  opts: { asAdmin: true } | { plcId: string | null }
): UsePlcResourcesAdminResult | UsePlcResourcesMemberResult;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------
export function usePlcResources(
  opts: { asAdmin: true } | { plcId: string | null }
): UsePlcResourcesAdminResult | UsePlcResourcesMemberResult {
  const asAdmin = 'asAdmin' in opts && opts.asAdmin === true;
  const plcId = 'plcId' in opts ? opts.plcId : null;

  const { user } = useAuth();

  const [adminResources, setAdminResources] = useState<PlcResource[]>([]);
  const [adminLoading, setAdminLoading] = useState(true);
  const [adminError, setAdminError] = useState<Error | null>(null);

  // PLC-mode: two parallel queries, merged + de-duped
  const [allScopeResources, setAllScopeResources] = useState<PlcResource[]>([]);
  const [selectedScopeResources, setSelectedScopeResources] = useState<
    PlcResource[]
  >([]);
  const [allScopeLoading, setAllScopeLoading] = useState(true);
  const [selectedScopeLoading, setSelectedScopeLoading] = useState(true);
  const [plcError, setPlcError] = useState<Error | null>(null);

  // Reset on plcId change (adjust-state-while-rendering pattern)
  const [prevPlcId, setPrevPlcId] = useState(plcId);
  if (!asAdmin && plcId !== prevPlcId) {
    setPrevPlcId(plcId);
    setAllScopeResources([]);
    setSelectedScopeResources([]);
    setAllScopeLoading(true);
    setSelectedScopeLoading(true);
    setPlcError(null);
  }

  // Admin mode: listen to ALL /plc_resources
  useEffect(() => {
    if (!asAdmin) return;
    if (!user || isAuthBypass) {
      const t = setTimeout(() => {
        setAdminResources([]);
        setAdminLoading(false);
      }, 0);
      return () => clearTimeout(t);
    }
    const q = query(collection(db, PLC_RESOURCES_COLLECTION));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: PlcResource[] = [];
        snap.forEach((d) => {
          const parsed = parseResource(
            d.id,
            d.data() as Record<string, unknown>
          );
          if (parsed) list.push(parsed);
        });
        list.sort((a, b) => b.createdAt - a.createdAt);
        setAdminResources(list);
        setAdminLoading(false);
        setAdminError(null);
      },
      (err) => {
        logError('usePlcResources.admin.snapshot', err, {});
        setAdminLoading(false);
        setAdminError(err instanceof Error ? err : new Error(String(err)));
      }
    );
    return () => unsub();
  }, [asAdmin, user]);

  // PLC mode: query 1 — scope === 'all'
  useEffect(() => {
    if (asAdmin) return;
    if (!plcId || !user || isAuthBypass) {
      const t = setTimeout(() => {
        setAllScopeResources([]);
        setAllScopeLoading(false);
      }, 0);
      return () => clearTimeout(t);
    }
    const q = query(
      collection(db, PLC_RESOURCES_COLLECTION),
      where('scope', '==', 'all')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: PlcResource[] = [];
        snap.forEach((d) => {
          const parsed = parseResource(
            d.id,
            d.data() as Record<string, unknown>
          );
          if (parsed) list.push(parsed);
        });
        setAllScopeResources(list);
        setAllScopeLoading(false);
        // Clear any prior error on a recovered snapshot (mirrors the admin
        // path) so a transient failure doesn't stick after recovery.
        setPlcError(null);
      },
      (err) => {
        logError('usePlcResources.plcMode.allScope', err, { plcId });
        setAllScopeLoading(false);
        setPlcError(err instanceof Error ? err : new Error(String(err)));
      }
    );
    return () => unsub();
  }, [asAdmin, plcId, user]);

  // PLC mode: query 2 — plcIds array-contains plcId
  useEffect(() => {
    if (asAdmin) return;
    if (!plcId || !user || isAuthBypass) {
      const t = setTimeout(() => {
        setSelectedScopeResources([]);
        setSelectedScopeLoading(false);
      }, 0);
      return () => clearTimeout(t);
    }
    const q = query(
      collection(db, PLC_RESOURCES_COLLECTION),
      where('plcIds', 'array-contains', plcId)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: PlcResource[] = [];
        snap.forEach((d) => {
          const parsed = parseResource(
            d.id,
            d.data() as Record<string, unknown>
          );
          if (parsed) list.push(parsed);
        });
        setSelectedScopeResources(list);
        setSelectedScopeLoading(false);
        // Clear any prior error on a recovered snapshot (mirrors the admin
        // path) so a transient failure doesn't stick after recovery.
        setPlcError(null);
      },
      (err) => {
        logError('usePlcResources.plcMode.selectedScope', err, { plcId });
        setSelectedScopeLoading(false);
        setPlcError(err instanceof Error ? err : new Error(String(err)));
      }
    );
    return () => unsub();
  }, [asAdmin, plcId, user]);

  // De-duped merge for PLC mode
  const mergedPlcResources = useMemo<PlcResource[]>(() => {
    if (asAdmin) return [];
    const map = new Map<string, PlcResource>();
    for (const r of allScopeResources) map.set(r.id, r);
    for (const r of selectedScopeResources) map.set(r.id, r);
    const list = Array.from(map.values());
    list.sort((a, b) => b.createdAt - a.createdAt);
    return list;
  }, [asAdmin, allScopeResources, selectedScopeResources]);

  // ---------------------------------------------------------------------------
  // Admin mutators
  // ---------------------------------------------------------------------------
  const createResource = useCallback(
    async (input: CreatePlcResourceInput): Promise<string> => {
      if (!user) throw new Error('Not signed in');
      const ref = doc(collection(db, PLC_RESOURCES_COLLECTION));
      const now = Date.now();
      const resource: PlcResource = {
        id: ref.id,
        kind: input.kind,
        title: input.title,
        description: input.description,
        refId: input.refId,
        scope: input.scope,
        plcIds: input.scope === 'all' ? [] : input.plcIds,
        createdByAdminUid: user.uid,
        createdByAdminEmail: user.email ?? '',
        createdAt: now,
        updatedAt: now,
      };
      await setDoc(ref, resource);
      return ref.id;
    },
    [user]
  );

  const updateResource = useCallback(
    async (
      id: string,
      patch: Partial<CreatePlcResourceInput>
    ): Promise<void> => {
      if (!user) throw new Error('Not signed in');
      const fields: Record<string, unknown> = { updatedAt: Date.now() };
      if (patch.kind !== undefined) fields.kind = patch.kind;
      if (patch.title !== undefined) fields.title = patch.title;
      if (patch.description !== undefined)
        fields.description = patch.description;
      if (patch.refId !== undefined) fields.refId = patch.refId;
      if (patch.scope !== undefined) {
        fields.scope = patch.scope;
        // When switching to 'all', clear plcIds
        if (patch.scope === 'all') fields.plcIds = [];
      }
      if (patch.plcIds !== undefined) fields.plcIds = patch.plcIds;
      await firestoreUpdateDoc(doc(db, PLC_RESOURCES_COLLECTION, id), fields);
    },
    [user]
  );

  const deleteResource = useCallback(
    async (id: string): Promise<void> => {
      if (!user) throw new Error('Not signed in');
      await firestoreDeleteDoc(doc(db, PLC_RESOURCES_COLLECTION, id));
    },
    [user]
  );

  // ---------------------------------------------------------------------------
  // Return the appropriate shape
  // ---------------------------------------------------------------------------
  const adminResult = useMemo<UsePlcResourcesAdminResult>(
    () => ({
      resources: adminResources,
      loading: adminLoading,
      error: adminError,
      createResource,
      updateResource,
      deleteResource,
    }),
    [
      adminResources,
      adminLoading,
      adminError,
      createResource,
      updateResource,
      deleteResource,
    ]
  );

  const memberResult = useMemo<UsePlcResourcesMemberResult>(
    () => ({
      resources: mergedPlcResources,
      loading: allScopeLoading || selectedScopeLoading,
      error: plcError,
    }),
    [mergedPlcResources, allScopeLoading, selectedScopeLoading, plcError]
  );

  return asAdmin ? adminResult : memberResult;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------
function parseResource(
  id: string,
  data: Record<string, unknown>
): PlcResource | null {
  if (
    typeof data.kind !== 'string' ||
    typeof data.title !== 'string' ||
    typeof data.refId !== 'string' ||
    typeof data.scope !== 'string' ||
    !Array.isArray(data.plcIds) ||
    typeof data.createdByAdminUid !== 'string' ||
    typeof data.createdByAdminEmail !== 'string' ||
    typeof data.createdAt !== 'number' ||
    typeof data.updatedAt !== 'number'
  ) {
    return null;
  }
  const validKinds: PlcResourceKind[] = [
    'quiz',
    'video-activity',
    'assignment',
    'doc',
    'board',
  ];
  const validScopes: PlcResourceScope[] = ['all', 'selected'];
  if (!validKinds.includes(data.kind as PlcResourceKind)) return null;
  if (!validScopes.includes(data.scope as PlcResourceScope)) return null;

  return {
    id,
    kind: data.kind as PlcResourceKind,
    title: data.title,
    description: typeof data.description === 'string' ? data.description : '',
    refId: data.refId,
    scope: data.scope as PlcResourceScope,
    plcIds: (data.plcIds as unknown[]).filter(
      (p): p is string => typeof p === 'string'
    ),
    createdByAdminUid: data.createdByAdminUid,
    createdByAdminEmail: data.createdByAdminEmail,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}
