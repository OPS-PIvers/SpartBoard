import { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
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
  const { user } = useAuth();
  const [buildings, setBuildings] = useState<BuildingRecord[]>([]);
  const [error, setError] = useState<Error | null>(null);

  const shouldSubscribe = !isAuthBypass && Boolean(user) && Boolean(orgId);
  const [loading, setLoading] = useState<boolean>(shouldSubscribe);

  const [prevKey, setPrevKey] = useState(`${shouldSubscribe}:${orgId ?? ''}`);
  const nextKey = `${shouldSubscribe}:${orgId ?? ''}`;
  if (prevKey !== nextKey) {
    setPrevKey(nextKey);
    setLoading(shouldSubscribe);
    if (!shouldSubscribe) {
      setBuildings([]);
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
        setBuildings(items);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error(`[useOrgBuildings:${orgId}] snapshot error:`, err);
        setError(err);
        setLoading(false);
      }
    );
    return unsub;
  }, [shouldSubscribe, orgId]);

  const addBuilding = async (
    building: Partial<BuildingRecord>
  ): Promise<void> => {
    if (!orgId) {
      throw new Error('No organization selected.');
    }
    const id = building.id ?? slugOrFallback(building.name ?? '', 'building');
    const record: BuildingRecord = {
      id,
      orgId,
      name: building.name ?? '',
      type: (building.type as BuildingType) ?? 'other',
      address: building.address ?? '',
      grades: building.grades ?? '',
      users: building.users ?? 0,
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
    const { id: _omitId, orgId: _omitOrg, ...rest } = patch;
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
