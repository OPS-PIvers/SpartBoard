/**
 * Hourly sweep that deletes expired substitute-mode `/shared_boards` AND
 * `/shared_collections` docs so the substitute portal stays uncluttered and
 * stale snapshots don't sit in Firestore indefinitely.
 *
 * Collection shares additionally carry a `boards/` subcollection of frozen
 * Board snapshots; when a Collection parent is deleted, its board sub-docs are
 * deleted first so nothing is orphaned.
 *
 * Two-stage delete (grace period):
 * --------------------------------------------------------------------
 *   Docs WITHOUT `driveGrants[]` are deleted immediately on expiration
 *   (nothing to revoke; nothing to coordinate with the client revoker).
 *
 *   Docs WITH `driveGrants[]` get a 7-day grace window so the client-
 *   side reconciler (`useReconcileExpiredSubShares`) has time to:
 *     1. fetch the host's still-active substitute shares
 *     2. refcount each permissionId
 *     3. revoke only the permissions that no active share still uses
 *     4. delete the share doc once all revokes succeed
 *
 *   If the host never signs in within 7 days, we give up: the doc is
 *   deleted with a Cloud Logging WARNING listing every unrevoked
 *   (email, fileId, permissionId) so an admin can manually clean them
 *   up via Drive Admin tools.
 *
 * Why no server-side revoke: revoking permissions on a teacher's own
 * Drive files requires either the teacher's OAuth refresh token (we
 * don't store one) or Google Workspace domain-wide delegation (the
 * district hasn't enabled it, and the GCP docs flag DWD as a
 * privilege-escalation risk because it lets the service account
 * impersonate any user including super-admins).
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

/** Cap per-run delete count to keep one slow sweep from monopolising. */
const MAX_DELETES_PER_RUN = 500;

/** Days a doc with unrevoked grants is left in place for the client revoker. */
const ORPHAN_GRACE_DAYS = 7;
const ORPHAN_GRACE_MS = ORPHAN_GRACE_DAYS * 24 * 60 * 60 * 1000;

interface SubstituteShareData {
  intendedMode?: string;
  expiresAt?: number;
  originalAuthor?: string;
  driveGrants?: Array<{
    email?: string;
    fileId?: string;
    permissionId?: string;
  }>;
}

type ExpiredDocSnap =
  FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>;

interface SweepResult {
  deleted: number;
  inGrace: number;
  orphanedGrants: number;
}

/**
 * Sweep one substitute-share collection. `hostField` is the doc field holding
 * the host uid (`originalAuthor` on /shared_boards, `hostUid` on
 * /shared_collections) — only used for logging. When `deleteBoardsSubcollection`
 * is set, each doc's `boards/` subcollection is reaped before the parent.
 */
async function sweepCollection(
  db: FirebaseFirestore.Firestore,
  collectionName: string,
  now: number,
  hostField: 'originalAuthor' | 'hostUid',
  deleteBoardsSubcollection: boolean
): Promise<SweepResult> {
  // Equality on intendedMode + range on expiresAt — requires a composite
  // index on (intendedMode ASC, expiresAt ASC); declared in
  // firestore.indexes.json for both collections.
  const snap = await db
    .collection(collectionName)
    .where('intendedMode', '==', 'substitute')
    .where('expiresAt', '<=', now)
    .limit(MAX_DELETES_PER_RUN)
    .get();

  if (snap.empty) {
    console.log(`[expireSubShares] no expired substitute ${collectionName}`);
    return { deleted: 0, inGrace: 0, orphanedGrants: 0 };
  }

  // Bucket each expired doc into "ready to delete" vs "give the client
  // revoker more time". A doc is ready when it has no grants OR it's
  // been expired longer than the orphan-grace window.
  const readyToDelete: ExpiredDocSnap[] = [];
  let stillInGrace = 0;
  let orphanedGrantCount = 0;

  for (const doc of snap.docs) {
    const data = doc.data() as SubstituteShareData & { hostUid?: string };
    const grants = Array.isArray(data.driveGrants) ? data.driveGrants : [];
    const expiredAt = typeof data.expiresAt === 'number' ? data.expiresAt : 0;
    const inGrace = grants.length > 0 && expiredAt > now - ORPHAN_GRACE_MS;

    if (inGrace) {
      stillInGrace += 1;
      continue;
    }

    // If we're deleting a doc that still has grants (i.e. grace expired),
    // log the orphans so a Workspace admin can clean up by hand.
    if (grants.length > 0) {
      orphanedGrantCount += grants.length;
      const host = data[hostField] ?? data.originalAuthor ?? data.hostUid;
      console.warn(
        `[expireSubShares] DELETING ${collectionName} share ${doc.id} (host ${host}) ` +
          `with ${grants.length} unrevoked Drive permissions — host never ` +
          `returned to clean up. Manual revocation needed for: ` +
          grants
            .map((g) => `${g.email}@${g.fileId}:${g.permissionId}`)
            .join(', ')
      );
    }
    readyToDelete.push(doc);
  }

  if (readyToDelete.length === 0) {
    console.log(
      `[expireSubShares] ${stillInGrace} expired ${collectionName} in grace window — waiting for host to clean up`
    );
    return { deleted: 0, inGrace: stillInGrace, orphanedGrants: 0 };
  }

  // Collection parents carry a `boards/` subcollection — reap those sub-docs
  // first so the parent delete doesn't orphan them. Done before the batched
  // parent delete because subcollections aren't cascaded by Firestore.
  if (deleteBoardsSubcollection) {
    // Reap each parent's boards/ subcollection. Parallelize across parents
    // (with bounded concurrency) so a sweep that catches many expired
    // Collection shares — each with its own get() + batch-commit chain —
    // doesn't serialize toward the function timeout. The cap keeps us well
    // under Firestore's per-client connection limits rather than fanning out
    // all (up to MAX_DELETES_PER_RUN) parents at once.
    const BOARD_CLEANUP_CONCURRENCY = 10;
    const boardBatchSize = 250;
    for (let i = 0; i < readyToDelete.length; i += BOARD_CLEANUP_CONCURRENCY) {
      const group = readyToDelete.slice(i, i + BOARD_CLEANUP_CONCURRENCY);
      await Promise.all(
        group.map(async (doc) => {
          const boardsSnap = await doc.ref.collection('boards').get();
          if (boardsSnap.empty) return;
          for (let j = 0; j < boardsSnap.docs.length; j += boardBatchSize) {
            const batch = db.batch();
            for (const b of boardsSnap.docs.slice(j, j + boardBatchSize)) {
              batch.delete(b.ref);
            }
            await batch.commit();
          }
        })
      );
    }
  }

  // Batched delete of parents. Firestore caps each batch at 500 ops which
  // lines up with MAX_DELETES_PER_RUN; we still chunk defensively.
  const batchSize = 250;
  let deleted = 0;
  for (let i = 0; i < readyToDelete.length; i += batchSize) {
    const batch = db.batch();
    const chunk = readyToDelete.slice(i, i + batchSize);
    for (const doc of chunk) batch.delete(doc.ref);
    await batch.commit();
    deleted += chunk.length;
  }

  console.log(
    `[expireSubShares] deleted ${deleted} expired substitute ${collectionName} ` +
      `(${stillInGrace} still in ${ORPHAN_GRACE_DAYS}-day grace window; ` +
      `${orphanedGrantCount} Drive permissions logged as needing manual revocation)`
  );
  return { deleted, inGrace: stillInGrace, orphanedGrants: orphanedGrantCount };
}

export const expireSubShares = onSchedule(
  {
    schedule: 'every 60 minutes',
    timeZone: 'America/Chicago',
    memory: '256MiB',
    timeoutSeconds: 120,
  },
  async () => {
    const db = admin.firestore();
    const now = Date.now();

    // Run both sweeps independently: a failure in one (Firestore quota, a
    // batch-commit error, a missing index) must not abort the other and leave
    // its expired shares un-reaped for the hour.
    const [boardsResult, collectionsResult] = await Promise.allSettled([
      sweepCollection(db, 'shared_boards', now, 'originalAuthor', false),
      sweepCollection(db, 'shared_collections', now, 'hostUid', true),
    ]);
    const failures: unknown[] = [];
    if (boardsResult.status === 'rejected') {
      console.error(
        '[expireSubShares] shared_boards sweep failed:',
        boardsResult.reason
      );
      failures.push(boardsResult.reason);
    }
    if (collectionsResult.status === 'rejected') {
      console.error(
        '[expireSubShares] shared_collections sweep failed:',
        collectionsResult.reason
      );
      failures.push(collectionsResult.reason);
    }
    // Both sweeps have already completed (allSettled above guarantees neither
    // aborted the other), so re-throwing here is safe and surfaces a persistent
    // failure as a failed invocation — an error metric that can drive a Cloud
    // Monitoring alert — instead of a silent success that lets expired shares
    // accumulate until someone notices the logs.
    if (failures.length > 0) {
      throw new Error(
        `[expireSubShares] ${failures.length} sweep(s) failed; see logged reasons above.`
      );
    }
  }
);
