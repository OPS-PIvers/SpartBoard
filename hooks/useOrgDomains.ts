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
import type {
  AuthMethod,
  DomainRecord,
  DomainRole,
} from '@/types/organization';
import { slugOrFallback } from '@/utils/slug';

/**
 * Subscribes to `/organizations/{orgId}/domains`. Reads allowed for org
 * members + super admins via Firestore rules.
 *
 * Writes (add/remove) are scoped to domain+ admins at the rules tier.
 */
export const useOrgDomains = (orgId: string | null) => {
  const { user } = useAuth();
  const [domains, setDomains] = useState<DomainRecord[]>([]);
  const [error, setError] = useState<Error | null>(null);

  const shouldSubscribe = !isAuthBypass && Boolean(user) && Boolean(orgId);
  const [loading, setLoading] = useState<boolean>(shouldSubscribe);

  const [prevKey, setPrevKey] = useState(`${shouldSubscribe}:${orgId ?? ''}`);
  const nextKey = `${shouldSubscribe}:${orgId ?? ''}`;
  if (prevKey !== nextKey) {
    setPrevKey(nextKey);
    setLoading(shouldSubscribe);
    if (!shouldSubscribe) {
      setDomains([]);
      setError(null);
    }
  }

  useEffect(() => {
    if (!shouldSubscribe || !orgId) return;

    const unsub = onSnapshot(
      collection(db, 'organizations', orgId, 'domains'),
      (snapshot) => {
        const items: DomainRecord[] = snapshot.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as DomainRecord
        );
        setDomains(items);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error(`[useOrgDomains:${orgId}] snapshot error:`, err);
        setError(err);
        setLoading(false);
      }
    );
    return unsub;
  }, [shouldSubscribe, orgId]);

  const addDomain = async (domain: Partial<DomainRecord>): Promise<void> => {
    if (!orgId) {
      throw new Error('No organization selected.');
    }
    if (!domain.domain) {
      throw new Error('Domain is required.');
    }
    const id = domain.id ?? slugOrFallback(domain.domain, 'domain');
    // `status`, `users`, and `addedAt` are server-managed (status is
    // DNS-verified by a Cloud Function; users is a derived count; addedAt is
    // the admin's create stamp). Hard-code safe defaults so caller data can
    // never spoof the verification state — the rules also reject a
    // client-supplied `status != 'pending'` on create.
    const record: DomainRecord = {
      id,
      orgId,
      domain: domain.domain,
      authMethod: (domain.authMethod as AuthMethod) ?? 'google',
      status: 'pending',
      role: (domain.role as DomainRole) ?? 'staff',
      users: 0,
      addedAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'organizations', orgId, 'domains', id), record);
  };

  const removeDomain = async (id: string): Promise<void> => {
    if (!orgId) {
      throw new Error('No organization selected.');
    }
    await deleteDoc(doc(db, 'organizations', orgId, 'domains', id));
  };

  return {
    domains,
    loading,
    error,
    addDomain,
    removeDomain,
  };
};
