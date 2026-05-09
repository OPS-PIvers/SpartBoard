/**
 * Synced Video Activity group membership Cloud Functions. Counterpart to
 * `syncedQuizGroups.ts`, scoped to Video Activity's parallel collections:
 *
 *  - `/shared_video_activity_assignments/{shareId}` — pasted share doc
 *  - `/synced_video_activities/{groupId}` — canonical synced content
 *
 * Two v2 onCall functions back the synced-mode share flow:
 *
 *  - joinSyncedVideoActivityGroup: invoked when a teacher pastes a synced
 *    share URL and picks "Synced" in the import-mode picker. Validates that
 *    the presented `shareId` resolves to a doc carrying a `syncGroupId`,
 *    then adds the caller's uid to that group's `participants` map. Admin
 *    SDK bypasses Firestore rules — clients can't write to `participants`
 *    directly.
 *
 *  - leaveSyncedVideoActivityGroup: invoked when a teacher chooses "Stop
 *    syncing" on a synced activity card. Removes the caller from
 *    `participants`. Empty groups are left intact so future paste of the
 *    same share URL still resolves a bootstrap snapshot.
 *
 * Business logic is exposed via thin handlers that take an Admin SDK
 * Firestore reference plus the validated request fields, so unit tests can
 * drive them with the firebase-admin emulator without rebuilding the onCall
 * wrapper. Mirrors syncedQuizGroups.ts pattern.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const SHARED_COLLECTION = 'shared_video_activity_assignments';
const SYNCED_COLLECTION = 'synced_video_activities';

export interface SyncedVideoActivityParticipant {
  joinedAt: number;
}

export interface JoinSyncedVideoActivityGroupRequest {
  shareId?: unknown;
}

export interface JoinSyncedVideoActivityGroupResponse {
  groupId: string;
  version: number;
  alreadyJoined: boolean;
}

export interface LeaveSyncedVideoActivityGroupRequest {
  groupId?: unknown;
}

export interface LeaveSyncedVideoActivityGroupResponse {
  remainingParticipants: number;
}

export async function handleJoinSyncedVideoActivityGroup(
  db: admin.firestore.Firestore,
  uid: string,
  shareId: string
): Promise<JoinSyncedVideoActivityGroupResponse> {
  const shareRef = db.collection(SHARED_COLLECTION).doc(shareId);
  const shareSnap = await shareRef.get();
  if (!shareSnap.exists) {
    throw new HttpsError('not-found', 'Shared video activity not found.');
  }
  const shareData = shareSnap.data() as { syncGroupId?: string } | undefined;
  const groupId = shareData?.syncGroupId;
  if (!groupId || typeof groupId !== 'string') {
    throw new HttpsError(
      'failed-precondition',
      'This share is not enabled for sync.'
    );
  }

  const groupRef = db.collection(SYNCED_COLLECTION).doc(groupId);

  return db.runTransaction(async (tx) => {
    const groupSnap = await tx.get(groupRef);
    if (!groupSnap.exists) {
      throw new HttpsError(
        'not-found',
        'Synced video activity group not found.'
      );
    }
    const groupData = groupSnap.data() as
      | {
          version: number;
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
        // flicker on membership changes. Mirrors `syncedQuizGroups.ts`.
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

export async function handleLeaveSyncedVideoActivityGroup(
  db: admin.firestore.Firestore,
  uid: string,
  groupId: string
): Promise<LeaveSyncedVideoActivityGroupResponse> {
  const groupRef = db.collection(SYNCED_COLLECTION).doc(groupId);
  return db.runTransaction(async (tx) => {
    const groupSnap = await tx.get(groupRef);
    if (!groupSnap.exists) {
      throw new HttpsError(
        'not-found',
        'Synced video activity group not found.'
      );
    }
    const groupData = groupSnap.data() as
      | { participants?: Record<string, SyncedVideoActivityParticipant> }
      | undefined;
    const participants = { ...(groupData?.participants ?? {}) };
    if (Object.prototype.hasOwnProperty.call(participants, uid)) {
      delete participants[uid];
      tx.update(groupRef, {
        participants,
        updatedAt: Date.now(),
      });
    }
    return { remainingParticipants: Object.keys(participants).length };
  });
}

export const joinSyncedVideoActivityGroup =
  onCall<JoinSyncedVideoActivityGroupRequest>(
    { region: 'us-central1' },
    async (request) => {
      const uid = request.auth?.uid;
      if (!uid) {
        throw new HttpsError(
          'unauthenticated',
          'Sign in to join a synced video activity.'
        );
      }
      const shareId = request.data?.shareId;
      if (typeof shareId !== 'string' || shareId.length === 0) {
        throw new HttpsError('invalid-argument', 'shareId is required.');
      }
      return handleJoinSyncedVideoActivityGroup(
        admin.firestore(),
        uid,
        shareId
      );
    }
  );

export const leaveSyncedVideoActivityGroup =
  onCall<LeaveSyncedVideoActivityGroupRequest>(
    { region: 'us-central1' },
    async (request) => {
      const uid = request.auth?.uid;
      if (!uid) {
        throw new HttpsError(
          'unauthenticated',
          'Sign in to leave a synced video activity.'
        );
      }
      const groupId = request.data?.groupId;
      if (typeof groupId !== 'string' || groupId.length === 0) {
        throw new HttpsError('invalid-argument', 'groupId is required.');
      }
      return handleLeaveSyncedVideoActivityGroup(
        admin.firestore(),
        uid,
        groupId
      );
    }
  );
