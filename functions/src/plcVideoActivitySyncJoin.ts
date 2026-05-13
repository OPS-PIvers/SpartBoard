/**
 * PLC video activity sync-join Cloud Function (Phase 4).
 *
 * Sibling of `plcQuizSyncJoin.handleJoinPlcQuizSyncGroup` for the PLC
 * Video Activity Library. Resolves `syncGroupId` via
 * `plcs/{plcId}/video_activities/{plcVideoActivityId}` and joins the
 * caller into `synced_video_activities/{groupId}.participants`.
 *
 * Membership validation is server-side (Admin SDK bypasses Firestore
 * rules — clients can't write `participants` directly); we don't accept
 * the caller's word that they belong to a given PLC.
 *
 * Idempotent: re-joining is a no-op (returns `alreadyJoined: true`)
 * without bumping `version`, matching the Phase 2/3 siblings.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import type { SyncedVideoActivityParticipant } from './syncedVideoActivityGroups';

if (!admin.apps.length) {
  admin.initializeApp();
}

export interface JoinPlcVideoActivitySyncGroupRequest {
  plcId?: unknown;
  plcVideoActivityId?: unknown;
}

export interface JoinPlcVideoActivitySyncGroupResponse {
  groupId: string;
  version: number;
  alreadyJoined: boolean;
}

/**
 * Verify membership + group join in one transaction so a member who's
 * removed mid-flow can't sneak into the participants map.
 *
 * Throws `HttpsError`:
 *   - `not-found` if the PLC, the PLC video activity entry, or the
 *     synced group can't be located.
 *   - `permission-denied` if the caller isn't a current PLC member.
 *   - `failed-precondition` if the entry's `syncGroupId` field is
 *     missing/non-string (data shape regression).
 */
export async function handleJoinPlcVideoActivitySyncGroup(
  db: admin.firestore.Firestore,
  uid: string,
  plcId: string,
  plcVideoActivityId: string
): Promise<JoinPlcVideoActivitySyncGroupResponse> {
  const plcRef = db.collection('plcs').doc(plcId);
  const entryRef = plcRef
    .collection('video_activities')
    .doc(plcVideoActivityId);

  return db.runTransaction(async (tx) => {
    const [plcSnap, entrySnap] = await Promise.all([
      tx.get(plcRef),
      tx.get(entryRef),
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

    if (!entrySnap.exists) {
      throw new HttpsError('not-found', 'PLC video activity not found.');
    }
    const entryData = entrySnap.data() as { syncGroupId?: unknown } | undefined;
    const groupId = entryData?.syncGroupId;
    if (typeof groupId !== 'string' || groupId.length === 0) {
      throw new HttpsError(
        'failed-precondition',
        'PLC video activity is not linked to a synced group.'
      );
    }

    const groupRef = db.collection('synced_video_activities').doc(groupId);
    const groupSnap = await tx.get(groupRef);
    if (!groupSnap.exists) {
      throw new HttpsError('not-found', 'Synced group not found.');
    }
    const groupData = groupSnap.data() as
      | {
          version?: number;
          participants?: Record<string, SyncedVideoActivityParticipant>;
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
        // updatedAt tracks any server-side touch; updatedBy is intentionally
        // left at the last content-writer's uid so attribution doesn't
        // flicker on membership changes. Mirrors `plcQuizSyncJoin.ts`.
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

export const joinPlcVideoActivitySyncGroup =
  onCall<JoinPlcVideoActivitySyncGroupRequest>(
    { region: 'us-central1' },
    async (request) => {
      const uid = request.auth?.uid;
      if (!uid) {
        throw new HttpsError(
          'unauthenticated',
          'Sign in to join a PLC video activity sync group.'
        );
      }
      const { plcId, plcVideoActivityId } = request.data ?? {};
      if (typeof plcId !== 'string' || plcId.length === 0) {
        throw new HttpsError('invalid-argument', 'plcId is required.');
      }
      if (
        typeof plcVideoActivityId !== 'string' ||
        plcVideoActivityId.length === 0
      ) {
        throw new HttpsError(
          'invalid-argument',
          'plcVideoActivityId is required.'
        );
      }
      return handleJoinPlcVideoActivitySyncGroup(
        admin.firestore(),
        uid,
        plcId,
        plcVideoActivityId
      );
    }
  );
