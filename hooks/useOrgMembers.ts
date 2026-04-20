import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import type { MemberRecord, UserRecord } from '@/types/organization';

// Response shape returned by the `createOrganizationInvites` callable
// (see `functions/src/organizationInvites.ts`). Mirrored here so view code
// doesn't need to import from functions/.
//
// The CF returns its own `claimUrl` built from a hardcoded prod origin. We
// rewrite it client-side from `window.location.origin` before handing the
// result to callers so invite links minted on a dev/preview deploy stay on
// that deploy — otherwise admins paste a prod URL while testing and the
// claim transaction runs against a different build than they can see.
export interface InviteResult {
  email: string;
  token: string;
  claimUrl: string;
  status: 'created' | 'already_active' | 'skipped';
}
export interface InviteError {
  email: string;
  reason: string;
}
export interface InviteResponse {
  invitations: InviteResult[];
  errors: InviteError[];
}

// Bulk-invite payload: one entry per invitee, each with its own role + buildings.
// Matches the `invitations[]` shape the callable accepts.
export interface BulkInviteIntent {
  email: string;
  roleId: string;
  buildingIds: string[];
  name?: string;
}

// Firestore caps each writeBatch commit at 500 operations; 400 keeps a
// safety margin so future additions to the same batch (e.g. audit-log
// writes) can be appended without risking the limit. Matches the chunk
// size used by useFolders.
const BATCH_CHUNK = 400;

const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

// Derive a display name from an email local-part when the member record
// doesn't carry one. Matches the pattern used by the prototype invite flow.
// Overwrites the CF-minted claimUrl with one pinned to the current browser
// origin. The token is stable across environments (it's the Firestore doc id
// of the invitation), so we just re-wrap it. `skipped` / `already_active`
// entries have empty tokens and stay unchanged.
const rewriteClaimUrls = (response: InviteResponse): InviteResponse => {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : '';
  return {
    ...response,
    invitations: response.invitations.map((inv) =>
      inv.token ? { ...inv, claimUrl: `${origin}/invite/${inv.token}` } : inv
    ),
  };
};

const nameFromEmail = (email: string): string => {
  const local = email.split('@')[0] ?? email;
  return local
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
};

const toUserRecord = (m: MemberRecord, orgId: string): UserRecord => ({
  id: m.email,
  orgId,
  name: m.name ?? nameFromEmail(m.email),
  email: m.email,
  role: m.roleId,
  buildingIds: m.buildingIds ?? [],
  status: m.status,
  lastActive: m.lastActive ?? null,
  invitedAt: m.invitedAt,
});

// Translate a `UserRecord` patch from the UI into the underlying
// `MemberRecord` field names. `role` (UI) ↔ `roleId` (schema); identity
// fields (id/email/orgId) are stripped because they're immutable.
const userPatchToMemberPatch = (
  patch: Partial<UserRecord>
): Record<string, unknown> => {
  const {
    id: _omitId,
    email: _omitEmail,
    orgId: _omitOrg,
    role,
    ...rest
  } = patch;
  const memberPatch: Record<string, unknown> = { ...rest };
  if (role !== undefined) memberPatch.roleId = role;
  return memberPatch;
};

/**
 * Subscribes to `/organizations/{orgId}/members`. Returns both the raw member
 * records and a UI-friendly `UserRecord[]` projection.
 *
 * Writes: `updateMember` / `bulkUpdateMembers` patch member docs (rules scope
 * the allowed fields per actor role). `removeMembers` deletes the docs —
 * rules restrict this to domain+ admins. `inviteMembers` is a Phase 4 stub
 * because the invite flow requires a Cloud Function to mint tokens and send
 * email; it still throws here.
 */
export const useOrgMembers = (orgId: string | null) => {
  const { user } = useAuth();
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [error, setError] = useState<Error | null>(null);

  const shouldSubscribe = !isAuthBypass && Boolean(user) && Boolean(orgId);
  const [loading, setLoading] = useState<boolean>(shouldSubscribe);

  const [prevKey, setPrevKey] = useState(`${shouldSubscribe}:${orgId ?? ''}`);
  const nextKey = `${shouldSubscribe}:${orgId ?? ''}`;
  if (prevKey !== nextKey) {
    setPrevKey(nextKey);
    setLoading(shouldSubscribe);
    if (!shouldSubscribe) {
      setMembers([]);
      setError(null);
    }
  }

  useEffect(() => {
    if (!shouldSubscribe || !orgId) return;

    const unsub = onSnapshot(
      collection(db, 'organizations', orgId, 'members'),
      (snapshot) => {
        const items: MemberRecord[] = snapshot.docs.map(
          (d) => ({ email: d.id, ...d.data() }) as MemberRecord
        );
        setMembers(items);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error(`[useOrgMembers:${orgId}] snapshot error:`, err);
        setError(err);
        setLoading(false);
      }
    );
    return unsub;
  }, [shouldSubscribe, orgId]);

  const users = useMemo<UserRecord[]>(
    () => (orgId ? members.map((m) => toUserRecord(m, orgId)) : []),
    [members, orgId]
  );

  const updateMember = async (
    id: string,
    patch: Partial<UserRecord>
  ): Promise<void> => {
    if (!orgId) {
      throw new Error('No organization selected.');
    }
    const memberPatch = userPatchToMemberPatch(patch);
    if (Object.keys(memberPatch).length === 0) return;
    await updateDoc(
      doc(db, 'organizations', orgId, 'members', id),
      memberPatch
    );
  };

  const bulkUpdateMembers = async (
    ids: string[],
    patch: Partial<UserRecord>
  ): Promise<void> => {
    if (!orgId) {
      throw new Error('No organization selected.');
    }
    const memberPatch = userPatchToMemberPatch(patch);
    if (Object.keys(memberPatch).length === 0 || ids.length === 0) return;
    await Promise.all(
      chunk(ids, BATCH_CHUNK).map((batchIds) => {
        const batch = writeBatch(db);
        for (const id of batchIds) {
          batch.update(
            doc(db, 'organizations', orgId, 'members', id),
            memberPatch
          );
        }
        return batch.commit();
      })
    );
  };

  const removeMembers = async (ids: string[]): Promise<void> => {
    if (!orgId) {
      throw new Error('No organization selected.');
    }
    if (ids.length === 0) return;
    await Promise.all(
      chunk(ids, BATCH_CHUNK).map((batchIds) => {
        const batch = writeBatch(db);
        for (const id of batchIds) {
          batch.delete(doc(db, 'organizations', orgId, 'members', id));
        }
        return batch.commit();
      })
    );
  };

  // Phase 4: invite flow routes through the `createOrganizationInvites`
  // Cloud Function. The CF (Admin SDK) writes both the `members` doc
  // (status: 'invited') and the `invitations/{token}` doc atomically per
  // invitee; the client never touches `invitations` (rules block it).
  //
  // Two entry points share the same callable:
  //   - `inviteMembers(emails, roleId, buildingIds, message?)` — the single-
  //     role invite modal (uniform role/buildings across all emails).
  //   - `bulkInviteMembers(intents, message?)` — the CSV flow, where each
  //     row carries its own role + buildings.
  const inviteMembers = async (
    emails: string[],
    roleId: string,
    buildingIds: string[],
    message?: string
  ): Promise<InviteResponse> => {
    if (!orgId) {
      throw new Error('No organization selected.');
    }
    const callable = httpsCallable<
      {
        orgId: string;
        invitations: BulkInviteIntent[];
        message?: string;
      },
      InviteResponse
    >(functions, 'createOrganizationInvites');
    const result = await callable({
      orgId,
      invitations: emails.map((email) => ({
        email,
        roleId,
        buildingIds,
      })),
      message,
    });
    return rewriteClaimUrls(result.data);
  };

  const bulkInviteMembers = async (
    intents: BulkInviteIntent[],
    message?: string
  ): Promise<InviteResponse> => {
    if (!orgId) {
      throw new Error('No organization selected.');
    }
    if (intents.length === 0) {
      return { invitations: [], errors: [] };
    }
    const callable = httpsCallable<
      {
        orgId: string;
        invitations: BulkInviteIntent[];
        message?: string;
      },
      InviteResponse
    >(functions, 'createOrganizationInvites');
    const result = await callable({ orgId, invitations: intents, message });
    return rewriteClaimUrls(result.data);
  };

  return {
    members,
    users,
    loading,
    error,
    updateMember,
    bulkUpdateMembers,
    removeMembers,
    inviteMembers,
    bulkInviteMembers,
  };
};
