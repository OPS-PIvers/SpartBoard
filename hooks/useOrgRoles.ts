import { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import type { RoleRecord } from '@/types/organization';

/**
 * Subscribes to `/organizations/{orgId}/roles`. Reads allowed for org members
 * + super admins via Firestore rules.
 *
 * Writes: `saveRoles(working)` diffs the working set against live state and
 * upserts / deletes custom roles (system roles are never touched — the rules
 * block updates on `system:true`). `resetRoles()` deletes every custom role
 * (system roles remain as seeded by the migration script).
 */
export const useOrgRoles = (orgId: string | null) => {
  const { user } = useAuth();
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [error, setError] = useState<Error | null>(null);

  const shouldSubscribe = !isAuthBypass && Boolean(user) && Boolean(orgId);
  const [loading, setLoading] = useState<boolean>(shouldSubscribe);

  const [prevKey, setPrevKey] = useState(`${shouldSubscribe}:${orgId ?? ''}`);
  const nextKey = `${shouldSubscribe}:${orgId ?? ''}`;
  if (prevKey !== nextKey) {
    setPrevKey(nextKey);
    setLoading(shouldSubscribe);
    if (!shouldSubscribe) {
      setRoles([]);
      setError(null);
    }
  }

  useEffect(() => {
    if (!shouldSubscribe || !orgId) return;

    const unsub = onSnapshot(
      collection(db, 'organizations', orgId, 'roles'),
      (snapshot) => {
        const items: RoleRecord[] = snapshot.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as RoleRecord
        );
        setRoles(items);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error(`[useOrgRoles:${orgId}] snapshot error:`, err);
        setError(err);
        setLoading(false);
      }
    );
    return unsub;
  }, [shouldSubscribe, orgId]);

  const saveRoles = async (workingRoles: RoleRecord[]): Promise<void> => {
    if (!orgId) {
      throw new Error('No organization selected.');
    }

    const workingIds = new Set(workingRoles.map((r) => r.id));
    // Upsert every non-system role from the working set. System roles are
    // intentionally skipped: rules reject `system:true` updates from clients,
    // and the UI never mutates them (clone-to-customize creates a new role).
    const upserts = workingRoles
      .filter((r) => !r.system)
      .map((r) =>
        setDoc(doc(db, 'organizations', orgId, 'roles', r.id), {
          id: r.id,
          name: r.name,
          blurb: r.blurb ?? '',
          color: r.color,
          system: false,
          perms: r.perms ?? {},
        })
      );

    // Delete custom roles that disappeared from the working set.
    const deletions = roles
      .filter((r) => !r.system && !workingIds.has(r.id))
      .map((r) => deleteDoc(doc(db, 'organizations', orgId, 'roles', r.id)));

    await Promise.all([...upserts, ...deletions]);
  };

  const resetRoles = async (): Promise<void> => {
    if (!orgId) {
      throw new Error('No organization selected.');
    }
    // Client-side reset is "drop all custom roles". System role perms live in
    // the migration script and `config/organizationCapabilities.ts`; re-seeding
    // those happens out-of-band (the rules block client writes to
    // `system:true` docs).
    const deletions = roles
      .filter((r) => !r.system)
      .map((r) => deleteDoc(doc(db, 'organizations', orgId, 'roles', r.id)));
    await Promise.all(deletions);
  };

  return {
    roles,
    loading,
    error,
    saveRoles,
    resetRoles,
  };
};
