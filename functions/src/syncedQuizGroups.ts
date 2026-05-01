/**
 * Synced quiz group membership Cloud Functions.
 *
 * Two v2 onCall functions back the synced-mode share flow:
 *
 *  - joinSyncedQuizGroup: invoked when a teacher pastes a synced share URL
 *    and picks "Synced" in the import-mode picker. Validates that the
 *    presented `shareId` resolves to a `/shared_assignments/{shareId}` doc
 *    carrying a `syncGroupId`, then adds the caller's uid to that group's
 *    `participants` map. Admin SDK bypasses Firestore rules — clients can't
 *    write to `participants` directly (see firestore.rules → synced_quizzes).
 *
 *  - leaveSyncedQuizGroup: invoked when a teacher chooses "Stop syncing" on
 *    a synced quiz card. Removes the caller from `participants`. Empty
 *    groups are left intact so future paste of the same share URL still
 *    resolves a bootstrap snapshot.
 *
 * Business logic is exposed via thin handlers that take an Admin SDK
 * Firestore reference plus the validated request fields, so the unit tests
 * can drive them with the firebase-admin emulator without rebuilding the
 * onCall wrapper.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

// Guard so this module can be loaded standalone in tests/tooling without
// double-initializing when index.ts already ran initializeApp().
if (!admin.apps.length) {
  admin.initializeApp();
}

// ---------------------------------------------------------------------------
// Types — kept local so the functions tsconfig doesn't cross-import the
// root types.ts. Shape mirrors `SyncedQuizGroup` and `SharedQuizAssignment`.
// ---------------------------------------------------------------------------

export interface SyncedParticipant {
  joinedAt: number;
}

export interface JoinSyncedQuizGroupRequest {
  shareId?: unknown;
}

export interface JoinSyncedQuizGroupResponse {
  groupId: string;
  version: number;
  alreadyJoined: boolean;
}

export interface LeaveSyncedQuizGroupRequest {
  groupId?: unknown;
}

export interface LeaveSyncedQuizGroupResponse {
  remainingParticipants: number;
}

// ---------------------------------------------------------------------------
// Handlers — exported for direct unit-testing against the emulator.
// ---------------------------------------------------------------------------

/**
 * Add `uid` to `/synced_quizzes/{groupId}.participants` after verifying that
 * the presented `shareId` resolves to a `shared_assignments` doc whose
 * `syncGroupId` matches the group. Idempotent: re-joining is a no-op (returns
 * `alreadyJoined: true`) without bumping `version` so listeners on the
 * canonical doc don't churn on duplicate joins.
 *
 * Throws `HttpsError('not-found')` if the share or group is missing,
 * `HttpsError('failed-precondition')` if the share is non-synced.
 */
export async function handleJoinSyncedQuizGroup(
  db: admin.firestore.Firestore,
  uid: string,
  shareId: string
): Promise<JoinSyncedQuizGroupResponse> {
  const shareRef = db.collection('shared_assignments').doc(shareId);
  const shareSnap = await shareRef.get();
  if (!shareSnap.exists) {
    throw new HttpsError('not-found', 'Shared assignment not found.');
  }
  const shareData = shareSnap.data() as { syncGroupId?: string } | undefined;
  const groupId = shareData?.syncGroupId;
  if (!groupId || typeof groupId !== 'string') {
    throw new HttpsError(
      'failed-precondition',
      'This share is not enabled for sync.'
    );
  }

  const groupRef = db.collection('synced_quizzes').doc(groupId);

  // Transactional read-modify-write so concurrent joiners can't corrupt
  // `participants`. Membership writes intentionally don't bump `version`
  // — that field belongs to content listeners.
  return db.runTransaction(async (tx) => {
    const groupSnap = await tx.get(groupRef);
    if (!groupSnap.exists) {
      throw new HttpsError('not-found', 'Synced group not found.');
    }
    const groupData = groupSnap.data() as
      | {
          version: number;
          participants?: Record<string, SyncedParticipant>;
        }
      | undefined;
    const participants = { ...(groupData?.participants ?? {}) };
    const alreadyJoined = Object.prototype.hasOwnProperty.call(
      participants,
      uid
    );
    if (!alreadyJoined) {
      participants[uid] = { joinedAt: Date.now() };
      tx.update(groupRef, {
        participants,
        // updatedAt tracks any server-side touch; updatedBy is left at the
        // last content-writer's uid so attribution doesn't flicker on
        // membership changes.
        updatedAt: Date.now(),
      });
    }
    return {
      groupId,
      version: groupData?.version ?? 1,
      alreadyJoined,
    };
  });
}

/**
 * Remove `uid` from `/synced_quizzes/{groupId}.participants`. Idempotent:
 * leaving a group the caller isn't in returns the current participant count
 * without throwing. Empty groups are intentionally left in place — a future
 * paste of the same share URL should still resolve the doc and reseed a
 * fresh participant list rather than 404.
 *
 * Throws `HttpsError('not-found')` if the group itself is missing.
 */
export async function handleLeaveSyncedQuizGroup(
  db: admin.firestore.Firestore,
  uid: string,
  groupId: string
): Promise<LeaveSyncedQuizGroupResponse> {
  const groupRef = db.collection('synced_quizzes').doc(groupId);
  return db.runTransaction(async (tx) => {
    const groupSnap = await tx.get(groupRef);
    if (!groupSnap.exists) {
      throw new HttpsError('not-found', 'Synced group not found.');
    }
    const groupData = groupSnap.data() as
      | { participants?: Record<string, SyncedParticipant> }
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

// ---------------------------------------------------------------------------
// onCall wrappers — argument validation + auth gating only. Real work lives
// in the handler functions above so tests can target them without a
// callable shim.
// ---------------------------------------------------------------------------

export const joinSyncedQuizGroup = onCall<JoinSyncedQuizGroupRequest>(
  { region: 'us-central1' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in to join a synced quiz.');
    }
    const shareId = request.data?.shareId;
    if (typeof shareId !== 'string' || shareId.length === 0) {
      throw new HttpsError('invalid-argument', 'shareId is required.');
    }
    return handleJoinSyncedQuizGroup(admin.firestore(), uid, shareId);
  }
);

export const leaveSyncedQuizGroup = onCall<LeaveSyncedQuizGroupRequest>(
  { region: 'us-central1' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError(
        'unauthenticated',
        'Sign in to leave a synced quiz.'
      );
    }
    const groupId = request.data?.groupId;
    if (typeof groupId !== 'string' || groupId.length === 0) {
      throw new HttpsError('invalid-argument', 'groupId is required.');
    }
    return handleLeaveSyncedQuizGroup(admin.firestore(), uid, groupId);
  }
);
