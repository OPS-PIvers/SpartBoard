import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import type { OrgRecord } from '@/types/organization';
import { slugOrFallback } from '@/utils/slug';

/**
 * Subscribes to the top-level `/organizations` collection.
 *
 * Firestore rules allow org reads only for members of that org or super
 * admins; a non-super-admin non-member will see a permission error. The hook
 * gates the subscription behind `isSuperAdmin` so the common teacher path
 * never triggers a failing listener.
 *
 * Writes (create / archive) are super-admin-only at the rules tier. Archive
 * is a soft-archive (sets `status: 'archived'`) rather than a hard delete so
 * sub-collections aren't orphaned — the rules allow hard delete via
 * super-admin, but we keep archive non-destructive by default.
 */
export const useOrganizations = () => {
  const { user, userRoles } = useAuth();
  const [organizations, setOrganizations] = useState<OrgRecord[]>([]);
  const [error, setError] = useState<Error | null>(null);

  const isSuperAdmin = Boolean(
    user?.email &&
    userRoles?.superAdmins?.some(
      (e) => e.toLowerCase() === user.email?.toLowerCase()
    )
  );

  const shouldSubscribe = !isAuthBypass && Boolean(user) && isSuperAdmin;
  const [loading, setLoading] = useState<boolean>(shouldSubscribe);

  // Adjust state during render when the subscription gate flips — avoids the
  // react-hooks/set-state-in-effect anti-pattern while still clearing stale
  // data when the user signs out or loses super-admin status.
  const [prevShouldSubscribe, setPrevShouldSubscribe] =
    useState(shouldSubscribe);
  if (shouldSubscribe !== prevShouldSubscribe) {
    setPrevShouldSubscribe(shouldSubscribe);
    setLoading(shouldSubscribe);
    if (!shouldSubscribe) {
      setOrganizations([]);
      setError(null);
    }
  }

  useEffect(() => {
    if (!shouldSubscribe) return;

    const unsub = onSnapshot(
      collection(db, 'organizations'),
      (snapshot) => {
        const orgs: OrgRecord[] = snapshot.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as OrgRecord
        );
        setOrganizations(orgs);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error('[useOrganizations] snapshot error:', err);
        setError(err);
        setLoading(false);
      }
    );
    return unsub;
  }, [shouldSubscribe]);

  const createOrg = async (partial: Partial<OrgRecord>): Promise<void> => {
    const name = partial.name?.trim();
    if (!name) {
      throw new Error('Organization name is required.');
    }
    const id = partial.id ?? slugOrFallback(name, 'org');
    const record = {
      id,
      name,
      shortName: partial.shortName ?? name,
      shortCode: partial.shortCode ?? name.slice(0, 4).toUpperCase(),
      state: partial.state ?? '',
      plan: partial.plan ?? 'basic',
      aiEnabled: partial.aiEnabled ?? false,
      primaryAdminEmail: partial.primaryAdminEmail ?? '',
      createdAt: new Date().toISOString(),
      users: 0,
      buildings: 0,
      status: partial.status ?? 'trial',
      seedColor: partial.seedColor ?? 'bg-indigo-600',
      ...(partial.supportUrl ? { supportUrl: partial.supportUrl } : {}),
    };
    await setDoc(doc(db, 'organizations', id), record);
  };

  const archiveOrg = async (orgId: string): Promise<void> => {
    if (!orgId) {
      throw new Error('Organization id is required.');
    }
    await updateDoc(doc(db, 'organizations', orgId), { status: 'archived' });
  };

  return {
    organizations,
    loading,
    error,
    createOrg,
    archiveOrg,
  };
};
