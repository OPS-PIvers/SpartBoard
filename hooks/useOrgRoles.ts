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
import { useOrgSubscriptionReset } from '@/hooks/useOrgSubscriptionReset';
import type { CapabilityId, RoleRecord } from '@/types/organization';

// Key-by-key compare so we can't be tripped up by key-ordering differences
// between a Firestore snapshot and the working state. Both sides are flat
// CapabilityId→enum maps.
const permsEqual = (
  a: RoleRecord['perms'] | undefined,
  b: RoleRecord['perms'] | undefined
): boolean => {
  const left = (a ?? {}) as RoleRecord['perms'];
  const right = (b ?? {}) as RoleRecord['perms'];
  const leftKeys = Object.keys(left) as CapabilityId[];
  if (leftKeys.length !== Object.keys(right).length) return false;
  for (const key of leftKeys) {
    if (left[key] !== right[key]) return false;
  }
  return true;
};

/**
 * Subscribes to `/organizations/{orgId}/roles`. Reads allowed for org members
 * + super admins via Firestore rules.
 *
 * Writes: `saveRoles(working, { canEditSystemRoles })` diffs the working set
 * against live state, upserts / deletes custom roles, and — when the caller
 * is a super admin — patches `perms` on system roles as well. Domain admins
 * can't touch system roles; the rules still reject those writes.
 * `resetRoles()` deletes every custom role (system roles remain as seeded by
 * the migration script).
 */
export const useOrgRoles = (orgId: string | null) => {
  const { user } = useAuth();
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [error, setError] = useState<Error | null>(null);

  const shouldSubscribe = !isAuthBypass && Boolean(user) && Boolean(orgId);
  const [loading, setLoading] = useState<boolean>(shouldSubscribe);

  useOrgSubscriptionReset(shouldSubscribe, orgId, (shouldClear) => {
    setLoading(shouldSubscribe);
    if (shouldClear) {
      setRoles([]);
      setError(null);
    }
  });

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

  const saveRoles = async (
    workingRoles: RoleRecord[],
    options: { canEditSystemRoles?: boolean } = {}
  ): Promise<void> => {
    if (!orgId) {
      throw new Error('No organization selected.');
    }

    const workingIds = new Set(workingRoles.map((r) => r.id));
    // Custom roles: full setDoc upsert. The seed flag is always false because
    // the rules reject any client write that tries to flip `system:true`.
    const customUpserts = workingRoles
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

    // System roles: only super admins may edit them, and only `perms` is
    // writable (rules enforce this). Diff against the live snapshot so we
    // skip no-op writes and avoid touching identity fields.
    const liveById = new Map(roles.map((r) => [r.id, r]));
    const systemPatches = options.canEditSystemRoles
      ? workingRoles
          .filter((r) => r.system)
          .filter((r) => {
            const live = liveById.get(r.id);
            if (!live) return false;
            return !permsEqual(live.perms, r.perms);
          })
          .map((r) =>
            updateDoc(doc(db, 'organizations', orgId, 'roles', r.id), {
              perms: r.perms ?? {},
            })
          )
      : [];

    // Delete custom roles that disappeared from the working set.
    const deletions = roles
      .filter((r) => !r.system && !workingIds.has(r.id))
      .map((r) => deleteDoc(doc(db, 'organizations', orgId, 'roles', r.id)));

    await Promise.all([...customUpserts, ...systemPatches, ...deletions]);
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
