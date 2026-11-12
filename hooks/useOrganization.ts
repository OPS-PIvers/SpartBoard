import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { useOrgSubscriptionReset } from '@/hooks/useOrgSubscriptionReset';
import type { OrgRecord } from '@/types/organization';
import { callOrgAdmin } from '@/utils/orgAdminClient';

/**
 * Subscribes to a single `/organizations/{orgId}` doc. Reads are gated at the
 * rules layer to org members + super admins; non-members will see an error.
 *
 * Writes: `updateOrg` patches the org doc; `archiveOrg` soft-archives by
 * setting `status: 'archived'` (the rules don't allow client delete at the
 * domain-admin tier, and hard-delete cascades across sub-collections). Both
 * mutations require the `org-admin-writes` feature flag to be enabled in the
 * client gate — the rules still enforce role scoping regardless.
 */
const same = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

// Keys the snapshot now carries with the pending value are no longer pending.
const dropLanded = (
  pending: Partial<OrgRecord>,
  org: OrgRecord | null
): Partial<OrgRecord> => {
  if (!org) return pending;
  const entries = Object.entries(pending).filter(
    ([k, v]) => !same(org[k as keyof OrgRecord], v)
  );
  return entries.length === Object.keys(pending).length
    ? pending
    : Object.fromEntries(entries);
};

// A refused edit stops showing, unless a later keystroke already replaced it.
const dropFailed = (
  pending: Partial<OrgRecord>,
  failed: Partial<OrgRecord>
): Partial<OrgRecord> =>
  Object.fromEntries(
    Object.entries(pending).filter(
      ([k, v]) => !(k in failed) || !same(failed[k as keyof OrgRecord], v)
    )
  );

export const useOrganization = (orgId: string | null) => {
  const { user } = useAuth();
  const [organization, setOrganization] = useState<OrgRecord | null>(null);
  const [error, setError] = useState<Error | null>(null);
  // Edits sent to the server but not yet seen in a snapshot, shown at once so typed fields don't snap back.
  const [pending, setPending] = useState<Partial<OrgRecord>>({});

  const shouldSubscribe = !isAuthBypass && Boolean(user) && Boolean(orgId);
  const [loading, setLoading] = useState<boolean>(shouldSubscribe);

  useOrgSubscriptionReset(shouldSubscribe, orgId, (shouldClear) => {
    setLoading(shouldSubscribe);
    if (shouldClear) {
      setOrganization(null);
      setError(null);
      setPending({});
    }
  });

  useEffect(() => {
    if (!shouldSubscribe || !orgId) return;

    const unsub = onSnapshot(
      doc(db, 'organizations', orgId),
      (snap) => {
        const next = snap.exists()
          ? ({ id: snap.id, ...snap.data() } as OrgRecord)
          : null;
        setOrganization(next);
        setPending((p) => dropLanded(p, next));
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
    setPending((p) => ({ ...p, ...rest }));
    try {
      await callOrgAdmin({ action: 'updateOrg', orgId, patch: rest });
    } catch (err) {
      setPending((p) => dropFailed(p, rest));
      throw err;
    }
  };

  const shown = useMemo(
    () =>
      organization && Object.keys(pending).length > 0
        ? { ...organization, ...pending }
        : organization,
    [organization, pending]
  );

  const archiveOrg = async (): Promise<void> => {
    if (!orgId) {
      throw new Error('No organization selected.');
    }
    await callOrgAdmin({
      action: 'updateOrg',
      orgId,
      patch: { status: 'archived' },
    });
  };

  return {
    organization: shown,
    loading,
    error,
    updateOrg,
    archiveOrg,
  };
};
