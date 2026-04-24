import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  runTransaction,
  arrayUnion,
  updateDoc,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { PlcInvitation } from '@/types';
import { QuizDriveService } from '@/utils/quizDriveService';
import { getPlcMemberEmails } from '@/utils/plc';

const INVITATIONS_COLLECTION = 'plc_invitations';
const PLCS_COLLECTION = 'plcs';

/**
 * Deterministic invitation doc id used by both the client and the Firestore
 * security rule (`plcInviteDocId` in firestore.rules). Keeps the rule's
 * accept-flow check `O(1)` — no enumeration required.
 *
 * Re-sending an invite to the same email overwrites the previous record,
 * which is the desired behavior (re-arms a declined invite).
 */
export function plcInvitationDocId(plcId: string, emailLower: string): string {
  return `${plcId}_${emailLower}`;
}

interface SendInviteArgs {
  plcId: string;
  plcName: string;
  inviteeEmail: string;
}

interface UsePlcInvitationsResult {
  /** Pending invites addressed to the current user's email. */
  pendingInvites: PlcInvitation[];
  /** Invites the current user has sent (any status), grouped by the leader UI. */
  sentInvites: PlcInvitation[];
  loading: boolean;
  /** Count of pending invites — drives the sidebar badge. */
  inviteCount: number;
  /** Lead-only: send (or re-send) an invite to an email address. */
  sendInvite: (args: SendInviteArgs) => Promise<void>;
  /**
   * Invitee accepts an invitation. Atomically marks the invite accepted and
   * adds the current user to the target PLC's memberUids + memberEmails.
   */
  acceptInvite: (invite: PlcInvitation) => Promise<void>;
  /** Invitee declines an invitation (kept in storage for audit). */
  declineInvite: (invite: PlcInvitation) => Promise<void>;
  /** Lead-only: revoke a pending invite. */
  revokeInvite: (invite: PlcInvitation) => Promise<void>;
}

function parseInvite(
  id: string,
  data: Record<string, unknown>
): PlcInvitation | null {
  if (
    typeof data.plcId !== 'string' ||
    typeof data.plcName !== 'string' ||
    typeof data.inviteeEmailLower !== 'string' ||
    typeof data.invitedByUid !== 'string' ||
    typeof data.invitedByName !== 'string' ||
    typeof data.invitedAt !== 'number'
  ) {
    return null;
  }
  const status = data.status;
  if (status !== 'pending' && status !== 'accepted' && status !== 'declined') {
    return null;
  }
  const invite: PlcInvitation = {
    id,
    plcId: data.plcId,
    plcName: data.plcName,
    inviteeEmailLower: data.inviteeEmailLower,
    invitedByUid: data.invitedByUid,
    invitedByName: data.invitedByName,
    invitedAt: data.invitedAt,
    status,
  };
  if (typeof data.respondedAt === 'number') {
    invite.respondedAt = data.respondedAt;
  }
  return invite;
}

/**
 * Live PLC invitation queries:
 *   - `pendingInvites` — addressed to the current user's email, status pending.
 *     Drives the "Invites" panel and sidebar badge.
 *   - `sentInvites` — sent by the current user. Drives the lead's "Outstanding"
 *     row in the PLC details panel.
 *
 * Mutations live alongside the queries because send/accept/decline all share
 * the deterministic doc id and email-normalization logic.
 */
export const usePlcInvitations = (): UsePlcInvitationsResult => {
  const { user, googleAccessToken } = useAuth();
  const [pendingInvites, setPendingInvites] = useState<PlcInvitation[]>([]);
  const [sentInvites, setSentInvites] = useState<PlcInvitation[]>([]);
  const [pendingLoaded, setPendingLoaded] = useState(false);
  const [sentLoaded, setSentLoaded] = useState(false);

  const myEmailLower = (user?.email ?? '').toLowerCase();

  useEffect(() => {
    if (!user || isAuthBypass || !myEmailLower) {
      // Defer so we don't trip react-hooks/set-state-in-effect. Same pattern as
      // useRosters.ts for the signed-out branch.
      const timer = setTimeout(() => {
        setPendingInvites([]);
        setPendingLoaded(true);
      }, 0);
      return () => clearTimeout(timer);
    }
    const q = query(
      collection(db, INVITATIONS_COLLECTION),
      where('inviteeEmailLower', '==', myEmailLower),
      where('status', '==', 'pending')
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list: PlcInvitation[] = [];
        snap.forEach((d) => {
          const parsed = parseInvite(d.id, d.data() as Record<string, unknown>);
          if (parsed) list.push(parsed);
        });
        list.sort((a, b) => b.invitedAt - a.invitedAt);
        setPendingInvites(list);
        setPendingLoaded(true);
      },
      (err) => {
        console.error('PLC pending-invites snapshot error:', err);
        setPendingLoaded(true);
      }
    );
    return () => unsubscribe();
  }, [user, myEmailLower]);

  useEffect(() => {
    if (!user || isAuthBypass) {
      // Defer so we don't trip react-hooks/set-state-in-effect.
      const timer = setTimeout(() => {
        setSentInvites([]);
        setSentLoaded(true);
      }, 0);
      return () => clearTimeout(timer);
    }
    const q = query(
      collection(db, INVITATIONS_COLLECTION),
      where('invitedByUid', '==', user.uid)
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list: PlcInvitation[] = [];
        snap.forEach((d) => {
          const parsed = parseInvite(d.id, d.data() as Record<string, unknown>);
          if (parsed) list.push(parsed);
        });
        list.sort((a, b) => b.invitedAt - a.invitedAt);
        setSentInvites(list);
        setSentLoaded(true);
      },
      (err) => {
        console.error('PLC sent-invites snapshot error:', err);
        setSentLoaded(true);
      }
    );
    return () => unsubscribe();
  }, [user]);

  const sendInvite = useCallback(
    async ({ plcId, plcName, inviteeEmail }: SendInviteArgs) => {
      if (!user) throw new Error('Not signed in');
      const emailLower = inviteeEmail.trim().toLowerCase();
      if (!emailLower || !emailLower.includes('@')) {
        throw new Error('Valid email required');
      }
      if (emailLower === myEmailLower) {
        throw new Error('You are already a member of this PLC');
      }
      const trimmedDisplayName = user.displayName?.trim() ?? '';
      const invitedByName =
        trimmedDisplayName !== ''
          ? trimmedDisplayName
          : (user.email ?? 'A teacher');
      const inviteId = plcInvitationDocId(plcId, emailLower);
      await setDoc(doc(db, INVITATIONS_COLLECTION, inviteId), {
        plcId,
        plcName,
        inviteeEmailLower: emailLower,
        invitedByUid: user.uid,
        invitedByName,
        invitedAt: Date.now(),
        status: 'pending',
      });
    },
    [user, myEmailLower]
  );

  const acceptInvite = useCallback(
    async (invite: PlcInvitation) => {
      if (!user) throw new Error('Not signed in');
      if (invite.inviteeEmailLower !== myEmailLower) {
        throw new Error('Invitation is addressed to a different account');
      }
      // Mirror the rules' status check client-side so a stale invite (e.g.
      // already declined in another tab) surfaces a friendly message instead
      // of a raw PERMISSION_DENIED from the rejected transaction.
      if (invite.status !== 'pending') {
        throw new Error('Invitation is no longer pending');
      }
      const inviteRef = doc(db, INVITATIONS_COLLECTION, invite.id);
      const plcRef = doc(db, PLCS_COLLECTION, invite.plcId);
      // Blind write: the accept-flow rule (isAcceptingPlcInvite) validates
      // the update without requiring the invitee to read the PLC doc first —
      // which they can't, because non-members can't read `/plcs/{plcId}`.
      // `arrayUnion` satisfies the rule's size-delta check and dotted-path
      // `memberEmails.<uid>` keeps the diff scoped to a single key.
      try {
        await runTransaction(db, (tx) => {
          tx.update(plcRef, {
            memberUids: arrayUnion(user.uid),
            [`memberEmails.${user.uid}`]: myEmailLower,
            updatedAt: Date.now(),
          });
          tx.update(inviteRef, {
            status: 'accepted',
            respondedAt: Date.now(),
          });
          return Promise.resolve();
        });
      } catch (err) {
        // Edge case: the lead added this teacher to memberUids manually
        // between send and accept. The rule's `newMembers.size() ==
        // oldMembers.size() + 1` check then refuses the PLC update (arrayUnion
        // becomes a no-op). Close out the invite on its own so the UI stops
        // showing it as pending.
        const code = (err as { code?: string } | null)?.code;
        if (code === 'permission-denied') {
          await updateDoc(inviteRef, {
            status: 'accepted',
            respondedAt: Date.now(),
          });
          return;
        }
        throw err;
      }

      // Post-accept: if the PLC already has a shared Google Sheet, best-
      // effort grant the new member writer access so they can append
      // submissions immediately. No-op when:
      //   - the sheet hasn't been created yet (first PLC assignment will
      //     pick up the new member via memberEmails)
      //   - the accepter doesn't have a Google OAuth token (rare, but
      //     sign-in could still be in progress)
      //   - the accepter isn't the sheet owner (403 on permissions list) —
      //     the actual owner will reconcile next time they assign
      // Any failure here is swallowed; membership has already been
      // persisted, so the invite-accept flow shouldn't regress on a
      // Drive-side hiccup.
      try {
        if (googleAccessToken) {
          const plcSnap = await getDoc(plcRef);
          if (plcSnap.exists()) {
            const data = plcSnap.data() as {
              sharedSheetUrl?: unknown;
              memberEmails?: Record<string, unknown>;
              memberUids?: unknown;
              leadUid?: unknown;
              name?: unknown;
              createdAt?: unknown;
              updatedAt?: unknown;
            };
            const sheetUrl =
              typeof data.sharedSheetUrl === 'string'
                ? data.sharedSheetUrl
                : null;
            if (sheetUrl) {
              // Reconstruct the minimal Plc shape the helper consumes.
              // The accept transaction has just committed so the post-
              // accept doc must include this user in memberEmails.
              const memberEmails: Record<string, string> = {};
              for (const [k, v] of Object.entries(data.memberEmails ?? {})) {
                if (typeof v === 'string') memberEmails[k] = v;
              }
              const emails = getPlcMemberEmails({
                id: invite.plcId,
                name: typeof data.name === 'string' ? data.name : '',
                leadUid: typeof data.leadUid === 'string' ? data.leadUid : '',
                memberUids: Array.isArray(data.memberUids)
                  ? data.memberUids.filter(
                      (u): u is string => typeof u === 'string'
                    )
                  : [],
                memberEmails,
                sharedSheetUrl: sheetUrl,
                createdAt:
                  typeof data.createdAt === 'number' ? data.createdAt : 0,
                updatedAt:
                  typeof data.updatedAt === 'number' ? data.updatedAt : 0,
              });
              const service = new QuizDriveService(googleAccessToken);
              await service.reconcilePlcSheetPermissions({
                sheetUrl,
                memberEmailsToShareWith: emails,
              });
            }
          }
        }
      } catch (reconcileErr) {
        console.error(
          '[usePlcInvitations] PLC sheet reconcile after accept failed:',
          reconcileErr
        );
      }
    },
    [user, myEmailLower, googleAccessToken]
  );

  const declineInvite = useCallback(
    async (invite: PlcInvitation) => {
      if (!user) throw new Error('Not signed in');
      if (invite.inviteeEmailLower !== myEmailLower) {
        throw new Error('Invitation is addressed to a different account');
      }
      await setDoc(
        doc(db, INVITATIONS_COLLECTION, invite.id),
        { status: 'declined', respondedAt: Date.now() },
        { merge: true }
      );
    },
    [user, myEmailLower]
  );

  const revokeInvite = useCallback(
    async (invite: PlcInvitation) => {
      if (!user) throw new Error('Not signed in');
      await deleteDoc(doc(db, INVITATIONS_COLLECTION, invite.id));
    },
    [user]
  );

  return useMemo(
    () => ({
      pendingInvites,
      sentInvites,
      loading: !pendingLoaded || !sentLoaded,
      inviteCount: pendingInvites.length,
      sendInvite,
      acceptInvite,
      declineInvite,
      revokeInvite,
    }),
    [
      pendingInvites,
      sentInvites,
      pendingLoaded,
      sentLoaded,
      sendInvite,
      acceptInvite,
      declineInvite,
      revokeInvite,
    ]
  );
};
