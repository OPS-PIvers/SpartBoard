import { useEffect, useState } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import type { OrgRecord } from '@/types/organization';

/**
 * Subscribes to a single `/organizations/{orgId}` doc. Reads are gated at the
 * rules layer to org members + super admins; non-members will see an error.
 *
 * Writes: `updateOrg` patches the org doc; `archiveOrg` soft-archives by
 * setting `status: 'archived'` (the rules don't allow client delete at the
 * domain-admin tier, and hard-delete cascades across sub-collections). Both
 * mutations require the `orgAdminWrites` feature flag to be enabled in the
 * client gate — the rules still enforce role scoping regardless.
 */
export const useOrganization = (orgId: string | null) => {
  const { user } = useAuth();
  const [organization, setOrganization] = useState<OrgRecord | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const shouldSubscribe = !isAuthBypass && Boolean(user) && Boolean(orgId);
  const [loading, setLoading] = useState<boolean>(shouldSubscribe);

  const [prevKey, setPrevKey] = useState(`${shouldSubscribe}:${orgId ?? ''}`);
  const nextKey = `${shouldSubscribe}:${orgId ?? ''}`;
  if (prevKey !== nextKey) {
    setPrevKey(nextKey);
    setLoading(shouldSubscribe);
    if (!shouldSubscribe) {
      setOrganization(null);
      setError(null);
    }
  }

  useEffect(() => {
    if (!shouldSubscribe || !orgId) return;

    const unsub = onSnapshot(
      doc(db, 'organizations', orgId),
      (snap) => {
        setOrganization(
          snap.exists() ? ({ id: snap.id, ...snap.data() } as OrgRecord) : null
        );
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error(`[useOrganization:${orgId}] snapshot error:`, err);
        setError(err);
        setLoading(false);
      }
    );
    return unsub;
  }, [shouldSubscribe, orgId]);

  const updateOrg = async (patch: Partial<OrgRecord>): Promise<void> => {
    if (!orgId) {
      throw new Error('No organization selected.');
    }
    // Never let a client clobber the doc id field.
    const { id: _omit, ...rest } = patch;
    if (Object.keys(rest).length === 0) return;
    await updateDoc(doc(db, 'organizations', orgId), rest);
  };

  const archiveOrg = async (): Promise<void> => {
    if (!orgId) {
      throw new Error('No organization selected.');
    }
    await updateDoc(doc(db, 'organizations', orgId), { status: 'archived' });
  };

  return {
    organization,
    loading,
    error,
    updateOrg,
    archiveOrg,
  };
};
