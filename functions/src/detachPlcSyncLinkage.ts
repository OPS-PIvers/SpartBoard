/**
 * PLC clean-detach Cloud Function (Wave 4 — PRD §5.3, Decision 5.3).
 *
 * The inverse of the `plc*SyncJoin` handlers. Given a PLC content header
 * (`plcs/{plcId}/quizzes/{id}` or `plcs/{plcId}/video_activities/{id}`),
 * resolves its canonical `syncGroupId` and removes the *caller's* uid from
 * the canonical `synced_quizzes` / `synced_video_activities` `participants`
 * map.
 *
 * Why a Cloud Function and not a client write? Firestore rules forbid
 * clients from mutating a synced group's `participants` map (a member could
 * otherwise evict teammates or smuggle themselves in). Detach therefore
 * MUST be a server op. This was the "orphanedGroup" gap flagged across the
 * PLC sharing code — unshare tombstoned the PLC header but left the
 * teacher as a phantom participant on the canonical doc forever.
 *
 * Membership validation is server-side (Admin SDK bypasses Firestore
 * rules); we don't accept the caller's word that they belong to a given
 * PLC. The membership read happens inside the transaction so a member who
 * is removed mid-flow can't keep mutating the group.
 *
 * Idempotent: detaching when the caller is not in `participants` is a
 * no-op (returns the current remaining count without bumping `version`).
 * Empty groups are intentionally left in place — mirroring
 * `handleLeaveSyncedQuizGroup`, a future re-paste/re-share of the same
 * group should still resolve the doc and reseed a fresh participant list
 * rather than 404. The nightly `gcPlcOrphans` job reaps truly-empty
 * groups.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import './functionsInit';

export type PlcSyncLinkageKind = 'quiz' | 'video-activity';

/**
 * Maps the public `kind` discriminator to the PLC header subcollection and
 * the canonical synced-group collection it points at.
 */
const KIND_CONFIG: Record<
  PlcSyncLinkageKind,
  { headerCollection: string; groupCollection: string }
> = {
  quiz: {
    headerCollection: 'quizzes',
    groupCollection: 'synced_quizzes',
  },
  'video-activity': {
    headerCollection: 'video_activities',
    groupCollection: 'synced_video_activities',
  },
};

export interface DetachPlcSyncLinkageRequest {
  plcId?: unknown;
  kind?: unknown;
  plcContentId?: unknown;
}

export interface DetachPlcSyncLinkageResponse {
  groupId: string;
  /** Participant count remaining on the canonical group after detach. */
  remainingParticipants: number;
  /** True if the caller was already absent (no write performed). */
  alreadyDetached: boolean;
}

/**
 * Verify membership + detach in one transaction.
 *
 * Throws `HttpsError`:
 *   - `not-found` if the PLC, the PLC content header, or the synced group
 *     can't be located.
 *   - `permission-denied` if the caller isn't a current PLC member.
 *   - `failed-precondition` if the header's `syncGroupId` field is
 *     missing/non-string (data shape regression).
 */
export async function handleDetachPlcSyncLinkage(
  db: admin.firestore.Firestore,
  uid: string,
  plcId: string,
  kind: PlcSyncLinkageKind,
  plcContentId: string
): Promise<DetachPlcSyncLinkageResponse> {
  const { headerCollection, groupCollection } = KIND_CONFIG[kind];
  const plcRef = db.collection('plcs').doc(plcId);
  const headerRef = plcRef.collection(headerCollection).doc(plcContentId);

  return db.runTransaction(async (tx) => {
    // Read membership + header inside the transaction so a member who is
    // removed from `memberUids` mid-flow can't keep mutating the group's
    // participants map (the membership read is a contention point that
    // forces a retry on concurrent change).
    const [plcSnap, headerSnap] = await Promise.all([
      tx.get(plcRef),
      tx.get(headerRef),
    ]);
    if (!plcSnap.exists) {
      throw new HttpsError('not-found', 'PLC not found.');
    }
    const plcData = plcSnap.data() as
      | { members?: Record<string, unknown>; memberUids?: unknown }
      | undefined;
    // Prefer the canonical `members` map (Decision 1.2); fall back to the
    // denormalized `memberUids` index. (memberUids is kept active-only in
    // lockstep post-migration, but checking the map first matches how the rest
    // of the app reads membership and is robust if the index ever lags.)
    // Must require an ACTIVE entry — the map keeps `status: 'removed'` records
    // for audit, and a removed member must NOT be able to detach.
    const memberEntry = (plcData?.members ?? {})[uid] as
      | { status?: unknown }
      | undefined;
    const inMembersMap =
      memberEntry != null && memberEntry.status !== 'removed';
    const memberUids = Array.isArray(plcData?.memberUids)
      ? (plcData?.memberUids as unknown[]).filter(
          (u): u is string => typeof u === 'string'
        )
      : [];
    if (!inMembersMap && !memberUids.includes(uid)) {
      throw new HttpsError(
        'permission-denied',
        'You are not a member of this PLC.'
      );
    }

    if (!headerSnap.exists) {
      throw new HttpsError('not-found', 'PLC content entry not found.');
    }
    const headerData = headerSnap.data() as
      | { syncGroupId?: unknown }
      | undefined;
    const groupId = headerData?.syncGroupId;
    if (typeof groupId !== 'string' || groupId.length === 0) {
      throw new HttpsError(
        'failed-precondition',
        'PLC content entry is not linked to a synced group.'
      );
    }

    const groupRef = db.collection(groupCollection).doc(groupId);
    const groupSnap = await tx.get(groupRef);
    if (!groupSnap.exists) {
      throw new HttpsError('not-found', 'Synced group not found.');
    }
    const groupData = groupSnap.data() as
      | { participants?: Record<string, unknown> }
      | undefined;
    const participants = { ...(groupData?.participants ?? {}) };
    const wasParticipant = Object.prototype.hasOwnProperty.call(
      participants,
      uid
    );
    if (wasParticipant) {
      delete participants[uid];
      tx.update(groupRef, {
        participants,
        // updatedAt tracks any server-side touch; updatedBy is intentionally
        // left at the last content-writer's uid so attribution doesn't
        // flicker on membership changes. Mirrors `syncedQuizGroups.ts`.
        updatedAt: Date.now(),
      });
    }
    return {
      groupId,
      remainingParticipants: Object.keys(participants).length,
      alreadyDetached: !wasParticipant,
    };
  });
}

export const detachPlcSyncLinkage = onCall<DetachPlcSyncLinkageRequest>(
  {
    // Cost posture (PRD §5/§8): a tiny single-doc transaction; pin memory
    // and cap concurrency so an unshare burst can't fan the function out.
    memory: '256MiB',
    maxInstances: 5,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError(
        'unauthenticated',
        'Sign in to detach a PLC sync linkage.'
      );
    }
    const { plcId, kind, plcContentId } = request.data ?? {};
    if (typeof plcId !== 'string' || plcId.length === 0) {
      throw new HttpsError('invalid-argument', 'plcId is required.');
    }
    if (kind !== 'quiz' && kind !== 'video-activity') {
      throw new HttpsError(
        'invalid-argument',
        "kind must be 'quiz' or 'video-activity'."
      );
    }
    if (typeof plcContentId !== 'string' || plcContentId.length === 0) {
      throw new HttpsError('invalid-argument', 'plcContentId is required.');
    }
    return handleDetachPlcSyncLinkage(
      admin.firestore(),
      uid,
      plcId,
      kind,
      plcContentId
    );
  }
);
