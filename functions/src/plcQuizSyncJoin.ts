/**
 * PLC quiz sync-join Cloud Function (Phase 2).
 *
 * Sibling of `syncedQuizGroups.handleJoinSyncedQuizGroup` for the PLC
 * Quiz Library entry point. Where the existing handler uses a
 * `shared_assignments/{shareId}` doc to resolve `syncGroupId`, this one
 * uses `plcs/{plcId}/quizzes/{plcQuizId}` and additionally verifies that
 * the caller is a current member of the parent PLC.
 *
 * Membership validation is server-side (Admin SDK bypasses Firestore
 * rules — clients can't write `participants` directly); we don't accept
 * the caller's word that they belong to a given PLC.
 *
 * Idempotent: re-joining is a no-op (returns `alreadyJoined: true`)
 * without bumping `version`, matching the share-id sibling.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import type { SyncedParticipant } from './syncedQuizGroups';

if (!admin.apps.length) {
  admin.initializeApp();
}

export interface JoinPlcQuizSyncGroupRequest {
  plcId?: unknown;
  plcQuizId?: unknown;
}

export interface JoinPlcQuizSyncGroupResponse {
  groupId: string;
  version: number;
  alreadyJoined: boolean;
}

/**
 * Verify membership + group join in one transaction so a member who's
 * removed mid-flow can't sneak into the participants map.
 *
 * Throws `HttpsError`:
 *   - `not-found` if the PLC, the PLC quiz entry, or the synced group
 *     can't be located.
 *   - `permission-denied` if the caller isn't a current PLC member.
 *   - `failed-precondition` if the PLC quiz entry's `syncGroupId` field
 *     is missing/non-string (data shape regression).
 */
export async function handleJoinPlcQuizSyncGroup(
  db: admin.firestore.Firestore,
  uid: string,
  plcId: string,
  plcQuizId: string
): Promise<JoinPlcQuizSyncGroupResponse> {
  const plcRef = db.collection('plcs').doc(plcId);
  const plcQuizRef = plcRef.collection('quizzes').doc(plcQuizId);

  return db.runTransaction(async (tx) => {
    // Read membership + plc quiz inside the transaction so a member who
    // is removed from `memberUids` mid-flow can't sneak into the synced
    // group's `participants` map (the membership read becomes a
    // contention point that forces a retry on concurrent change).
    const [plcSnap, plcQuizSnap] = await Promise.all([
      tx.get(plcRef),
      tx.get(plcQuizRef),
    ]);
    if (!plcSnap.exists) {
      throw new HttpsError('not-found', 'PLC not found.');
    }
    const plcData = plcSnap.data() as { memberUids?: unknown } | undefined;
    const memberUids = Array.isArray(plcData?.memberUids)
      ? (plcData?.memberUids as unknown[]).filter(
          (u): u is string => typeof u === 'string'
        )
      : [];
    if (!memberUids.includes(uid)) {
      throw new HttpsError(
        'permission-denied',
        'You are not a member of this PLC.'
      );
    }

    if (!plcQuizSnap.exists) {
      throw new HttpsError('not-found', 'PLC quiz not found.');
    }
    const plcQuizData = plcQuizSnap.data() as
      | { syncGroupId?: unknown }
      | undefined;
    const groupId = plcQuizData?.syncGroupId;
    if (typeof groupId !== 'string' || groupId.length === 0) {
      throw new HttpsError(
        'failed-precondition',
        'PLC quiz is not linked to a synced group.'
      );
    }

    const groupRef = db.collection('synced_quizzes').doc(groupId);
    const groupSnap = await tx.get(groupRef);
    if (!groupSnap.exists) {
      throw new HttpsError('not-found', 'Synced group not found.');
    }
    const groupData = groupSnap.data() as
      | {
          version?: number;
          participants?: Record<string, SyncedParticipant>;
        }
      | undefined;
    const participants = { ...(groupData?.participants ?? {}) };
    const alreadyJoined = Object.prototype.hasOwnProperty.call(
      participants,
      uid
    );
    if (!alreadyJoined) {
      const now = Date.now();
      participants[uid] = { joinedAt: now };
      tx.update(groupRef, {
        participants,
        updatedAt: now,
      });
    }
    return {
      groupId,
      version: groupData?.version ?? 1,
      alreadyJoined,
    };
  });
}

export const joinPlcQuizSyncGroup = onCall<JoinPlcQuizSyncGroupRequest>(
  { region: 'us-central1' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError(
        'unauthenticated',
        'Sign in to join a PLC quiz sync group.'
      );
    }
    const { plcId, plcQuizId } = request.data ?? {};
    if (typeof plcId !== 'string' || plcId.length === 0) {
      throw new HttpsError('invalid-argument', 'plcId is required.');
    }
    if (typeof plcQuizId !== 'string' || plcQuizId.length === 0) {
      throw new HttpsError('invalid-argument', 'plcQuizId is required.');
    }
    return handleJoinPlcQuizSyncGroup(admin.firestore(), uid, plcId, plcQuizId);
  }
);
