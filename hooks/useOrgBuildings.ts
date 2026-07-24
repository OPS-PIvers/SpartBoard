import { useContext, useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { AuthContext } from '@/context/AuthContextValue';
import type { BuildingRecord, BuildingType } from '@/types/organization';
import { slugOrFallback } from '@/utils/slug';

/**
 * Subscribes to `/organizations/{orgId}/buildings`. Reads allowed for org
 * members + super admins via Firestore rules.
 *
 * Writes (add/update/remove) are scoped at the rules tier: domain+ admins
 * can CRUD any building in their org; building admins can only update
 * buildings listed in their own `buildingIds`.
 */
export const useOrgBuildings = (orgId: string | null) => {
  // Use useContext directly so callers rendered outside AuthProvider (e.g. a
  // test harness) don't throw; they'll simply skip the Firestore subscription
  // and let the consumer fall back to seed data.
  const auth = useContext(AuthContext);
  const user = auth?.user ?? null;

  // AuthContext already runs a live onSnapshot on
  // `/organizations/{orgId}/buildings` for the user's active org (grade-level
  // resolution depends on it). When this hook is asked for that SAME org,
  // reuse AuthContext's `orgBuildings` instead of opening a second listener on
  // the identical path — otherwise every admin session that opens the
  // Organization panel pays doubled Firestore reads on this collection. Super
  // admins inspecting a DIFFERENT org (orgId !== auth.orgId) still fall through
  // to their own subscription below.
  const reuseAuthBuildings = Boolean(orgId) && auth?.orgId === orgId;

  const [ownBuildings, setOwnBuildings] = useState<BuildingRecord[]>([]);
  const [error, setError] = useState<Error | null>(null);

  const shouldSubscribe =
    !isAuthBypass && Boolean(user) && Boolean(orgId) && !reuseAuthBuildings;
  const [ownLoading, setOwnLoading] = useState<boolean>(shouldSubscribe);

  const [prevKey, setPrevKey] = useState(`${shouldSubscribe}:${orgId ?? ''}`);
  const nextKey = `${shouldSubscribe}:${orgId ?? ''}`;
  if (prevKey !== nextKey) {
    setPrevKey(nextKey);
    setOwnLoading(shouldSubscribe);
    if (!shouldSubscribe) {
      setOwnBuildings([]);
      setError(null);
    }
  }

  useEffect(() => {
    if (!shouldSubscribe || !orgId) return;

    const unsub = onSnapshot(
      collection(db, 'organizations', orgId, 'buildings'),
      (snapshot) => {
        const items: BuildingRecord[] = snapshot.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as BuildingRecord
        );
        setOwnBuildings(items);
        setError(null);
        setOwnLoading(false);
      },
      (err) => {
        console.error(`[useOrgBuildings:${orgId}] snapshot error:`, err);
        setError(err);
        setOwnLoading(false);
      }
    );
    return unsub;
  }, [shouldSubscribe, orgId]);

  // Prefer AuthContext's already-subscribed data for the active org; fall back
  // to this hook's own subscription for other orgs (or when no AuthProvider is
  // present, e.g. a test harness).
  const buildings = reuseAuthBuildings
    ? (auth?.orgBuildings ?? [])
    : ownBuildings;
  const loading = reuseAuthBuildings
    ? !(auth?.orgBuildingsLoaded ?? false)
    : ownLoading;

  const addBuilding = async (
    building: Partial<BuildingRecord>
  ): Promise<void> => {
    if (!orgId) {
      throw new Error('No organization selected.');
    }
    const id = building.id ?? slugOrFallback(building.name ?? '', 'building');
    // `users` is a derived count maintained server-side; `id`/`orgId` are
    // fixed by the path. Hard-code safe defaults so caller data can't
    // spoof counts — the rules also pin `users == 0` on create.
    const record: BuildingRecord = {
      id,
      orgId,
      name: building.name ?? '',
      type: (building.type as BuildingType) ?? 'other',
      address: building.address ?? '',
      grades: building.grades ?? '',
      users: 0,
      adminEmails: building.adminEmails ?? [],
    };
    await setDoc(doc(db, 'organizations', orgId, 'buildings', id), record);
  };

  const updateBuilding = async (
    id: string,
    patch: Partial<BuildingRecord>
  ): Promise<void> => {
    if (!orgId) {
      throw new Error('No organization selected.');
    }
    // Strip identity + server-managed fields defensively — rules reject these
    // via the field whitelist, but filtering client-side avoids the round-trip.
    const { id: _omitId, orgId: _omitOrg, users: _omitUsers, ...rest } = patch;
    if (Object.keys(rest).length === 0) return;
    await updateDoc(doc(db, 'organizations', orgId, 'buildings', id), rest);
  };

  const removeBuilding = async (id: string): Promise<void> => {
    if (!orgId) {
      throw new Error('No organization selected.');
    }
    await deleteDoc(doc(db, 'organizations', orgId, 'buildings', id));
  };

  return {
    buildings,
    loading,
    error,
    addBuilding,
    updateBuilding,
    removeBuilding,
  };
};
