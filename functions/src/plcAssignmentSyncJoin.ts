/**
 * PLC assignment-template sync-join Cloud Function (Phase 3).
 *
 * Sibling of `plcQuizSyncJoin.handleJoinPlcQuizSyncGroup`. Where Phase 2
 * resolves `syncGroupId` via `plcs/{plcId}/quizzes/{plcQuizId}`, this
 * one resolves it via `plcs/{plcId}/assignments/{plcAssignmentId}` —
 * the new PLC-authored assignment template subcollection.
 *
 * Membership validation is server-side (Admin SDK bypasses Firestore
 * rules — clients can't write `participants` directly); we don't accept
 * the caller's word that they belong to a given PLC.
 *
 * Idempotent: re-joining is a no-op (returns `alreadyJoined: true`)
 * without bumping `version`, matching the Phase 2 sibling.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import type { SyncedParticipant } from './syncedQuizGroups';

if (!admin.apps.length) {
  admin.initializeApp();
}

export interface JoinPlcAssignmentSyncGroupRequest {
  plcId?: unknown;
  plcAssignmentId?: unknown;
}

export interface JoinPlcAssignmentSyncGroupResponse {
  groupId: string;
  version: number;
  alreadyJoined: boolean;
}

/**
 * Verify membership + group join in one transaction so a member who's
 * removed mid-flow can't sneak into the participants map.
 *
 * Throws `HttpsError`:
 *   - `not-found` if the PLC, the PLC assignment template, or the
 *     synced group can't be located.
 *   - `permission-denied` if the caller isn't a current PLC member.
 *   - `failed-precondition` if the template's `syncGroupId` field is
 *     missing/non-string (data shape regression).
 */
export async function handleJoinPlcAssignmentSyncGroup(
  db: admin.firestore.Firestore,
  uid: string,
  plcId: string,
  plcAssignmentId: string
): Promise<JoinPlcAssignmentSyncGroupResponse> {
  const plcRef = db.collection('plcs').doc(plcId);
  const templateRef = plcRef.collection('assignments').doc(plcAssignmentId);

  return db.runTransaction(async (tx) => {
    const [plcSnap, templateSnap] = await Promise.all([
      tx.get(plcRef),
      tx.get(templateRef),
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

    if (!templateSnap.exists) {
      throw new HttpsError('not-found', 'PLC assignment template not found.');
    }
    const templateData = templateSnap.data() as
      | { syncGroupId?: unknown }
      | undefined;
    const groupId = templateData?.syncGroupId;
    if (typeof groupId !== 'string' || groupId.length === 0) {
      throw new HttpsError(
        'failed-precondition',
        'PLC assignment template is not linked to a synced group.'
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

export const joinPlcAssignmentSyncGroup =
  onCall<JoinPlcAssignmentSyncGroupRequest>(
    { region: 'us-central1' },
    async (request) => {
      const uid = request.auth?.uid;
      if (!uid) {
        throw new HttpsError(
          'unauthenticated',
          'Sign in to join a PLC assignment sync group.'
        );
      }
      const { plcId, plcAssignmentId } = request.data ?? {};
      if (typeof plcId !== 'string' || plcId.length === 0) {
        throw new HttpsError('invalid-argument', 'plcId is required.');
      }
      if (typeof plcAssignmentId !== 'string' || plcAssignmentId.length === 0) {
        throw new HttpsError(
          'invalid-argument',
          'plcAssignmentId is required.'
        );
      }
      return handleJoinPlcAssignmentSyncGroup(
        admin.firestore(),
        uid,
        plcId,
        plcAssignmentId
      );
    }
  );
