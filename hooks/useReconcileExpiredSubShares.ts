/**
 * useReconcileExpiredSubShares — once-per-session sweep that revokes Drive
 * permissions and deletes share docs for the signed-in teacher's expired
 * substitute shares. Covers BOTH single-board substitute shares
 * (/shared_boards) and substitute Collection shares (/shared_collections,
 * whose Drive grants live on the parent doc and whose `boards/` subcollection
 * is reaped before the parent on cleanup).
 *
 * Why client-side: revoking permissions on a teacher's own Drive files
 * requires either their OAuth refresh token (we don't store one) or
 * Workspace domain-wide delegation (district hasn't enabled, and the GCP
 * docs flag it as a privilege-escalation risk). Doing the revoke client-
 * side reuses the teacher's existing browser OAuth session — same scope
 * they granted for normal Drive use, no new attack surface.
 *
 * Permission refcounting:
 *   Drive's `permissions.create` is idempotent — granting (file, email)
 *   twice returns the SAME permissionId. So two overlapping substitute
 *   shares can both list the same permissionId in their driveGrants[].
 *   When share A expires first, we MUST NOT revoke a permissionId that
 *   share B (still active) still references — that would silently strip
 *   roster access from a sub viewing share B. This module fetches all of
 *   the host's substitute shares up front and only revokes permissionIds
 *   that no still-active share references.
 *
 * Partial-failure handling:
 *   - The session throttle (sessionStorage) is set only AFTER a successful
 *     sweep, so a failed sweep is retried next session.
 *   - For each expired share: if any per-grant revoke fails, the share
 *     doc is LEFT IN PLACE so the next session (or the cloud function
 *     grace-period fallback) gets another shot. Only docs whose revokes
 *     all succeeded (or had no grants to begin with) get deleted here.
 *
 * The `expireSubShares` cloud function still runs hourly as a fallback in
 * case the teacher never returns (e.g. left the district). It honours a
 * 7-day grace period for docs that still carry unrevoked grants so this
 * client-side path has a chance to run first.
 */

import { useEffect, useRef } from 'react';
import {
  collection,
  deleteDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { readAllDocsPaged } from '@/utils/firestorePaging';
import type { GoogleDriveService } from '@/utils/googleDriveService';

const SESSION_KEY_PREFIX = 'spart_sub_reconcile_';

interface PersistedGrant {
  email?: string;
  fileId?: string;
  permissionId?: string;
}

interface ReconcileArgs {
  uid: string | null | undefined;
  driveService: GoogleDriveService | null | undefined;
  /**
   * Called when the sweep finishes with at least one failed revoke. The
   * sweep already logs + leaves the doc behind for next-session retry, but
   * without an in-app signal the teacher has no way to know a stale Drive
   * grant is still attached to their files. Callers wire this to `addToast`
   * (or similar) so reconnecting the Drive auth surfaces as a user-visible
   * nudge rather than only a Cloud Logging warning.
   */
  onPartialFailure?: () => void;
}

export function useReconcileExpiredSubShares({
  uid,
  driveService,
  onPartialFailure,
}: ReconcileArgs): void {
  const didRunRef = useRef(false);
  // Latch the callback so changes to it across renders don't retrigger the
  // sweep effect — only `uid` and `driveService` should gate it. The ref
  // is updated from an effect (not inline in render) to avoid mutating a
  // ref during the render phase (React Compiler / React 19 constraint);
  // the sweep's catch handler reads `.current` long after the effect runs
  // so always-latest is correct.
  const onPartialFailureRef = useRef(onPartialFailure);
  useEffect(() => {
    onPartialFailureRef.current = onPartialFailure;
  }, [onPartialFailure]);

  useEffect(() => {
    if (!uid || !driveService) return;
    if (didRunRef.current) return;
    didRunRef.current = true;

    // Cap to once per session per uid. Read the flag up front so we know
    // whether to even try; SET the flag only on successful completion so
    // a failed sweep gets retried next session.
    const storageKey = `${SESSION_KEY_PREFIX}${uid}`;
    try {
      if (
        typeof window !== 'undefined' &&
        window.sessionStorage.getItem(storageKey)
      ) {
        return;
      }
    } catch {
      // sessionStorage unavailable (private browsing) — the per-mount ref
      // still guards against re-entry within the same component lifecycle.
    }

    void reconcileExpiredSubShares(uid, driveService)
      .then(() => {
        try {
          if (typeof window !== 'undefined') {
            window.sessionStorage.setItem(storageKey, '1');
          }
        } catch {
          // ignore — the per-mount ref already prevents duplicate runs.
        }
      })
      .catch((err) => {
        console.error('[useReconcileExpiredSubShares] sweep failed:', err);
        // No throttle set → retry next session. Also surface to the user
        // so they know to reconnect Drive — the cloud-function fallback
        // is non-actionable from their POV.
        onPartialFailureRef.current?.();
      });
  }, [uid, driveService]);
}

async function reconcileExpiredSubShares(
  uid: string,
  driveService: GoogleDriveService
): Promise<void> {
  // Pull ALL of the host's substitute shares — both expired (candidates
  // for cleanup) and active (so we know which permissionIds are still
  // referenced and must NOT be revoked). Drive grants live on TWO surfaces:
  //   - single-board substitute shares: /shared_boards (keyed on
  //     `originalAuthor`), and
  //   - substitute Collection shares: /shared_collections (keyed on
  //     `hostUid`), with grants on the parent doc.
  // A roster file granted via both surfaces shares ONE Drive permissionId
  // (permissions.create is idempotent), so we must refcount across BOTH
  // before revoking anything.
  const boardsQuery = query(
    collection(db, 'shared_boards'),
    where('originalAuthor', '==', uid),
    where('intendedMode', '==', 'substitute')
  );
  const collectionsQuery = query(
    collection(db, 'shared_collections'),
    where('hostUid', '==', uid),
    where('intendedMode', '==', 'substitute')
  );
  // Read in bounded pages so a teacher with a large share history can't pull
  // the whole filtered result set into memory in a single unbounded read.
  // We iterate every doc below (to decide expired vs. still-referenced), so a
  // full paged read — not a capped limit() — is the right bound here.
  const [boardDocs, collectionDocs] = await Promise.all([
    readAllDocsPaged(boardsQuery),
    readAllDocsPaged(collectionsQuery),
  ]);
  const allDocs = [...boardDocs, ...collectionDocs];
  if (allDocs.length === 0) return;

  const now = Date.now();
  const stillReferenced = new Set<string>();
  const expiredDocs: Array<{
    ref: import('firebase/firestore').DocumentReference;
    grants: PersistedGrant[];
  }> = [];

  for (const docSnap of allDocs) {
    const data = docSnap.data() as {
      expiresAt?: number;
      driveGrants?: PersistedGrant[];
    };
    const grants = Array.isArray(data.driveGrants) ? data.driveGrants : [];
    const isExpired = (data.expiresAt ?? 0) <= now;

    if (isExpired) {
      expiredDocs.push({ ref: docSnap.ref, grants });
    } else {
      // Active share — every permissionId it holds is off-limits to revoke.
      for (const g of grants) {
        if (g.permissionId) stillReferenced.add(g.permissionId);
      }
    }
  }

  if (expiredDocs.length === 0) return;

  let revoked = 0;
  let failed = 0;
  let deleteFailed = 0;

  for (const { ref, grants } of expiredDocs) {
    let allRevokesOk = true;

    for (const g of grants) {
      if (!g.fileId || !g.permissionId) continue;
      if (stillReferenced.has(g.permissionId)) {
        // Another active substitute share still uses this permission. Skip
        // — the LAST share to reference it will handle the actual revoke.
        continue;
      }
      try {
        await driveService.deletePermission(g.fileId, g.permissionId);
        revoked += 1;
      } catch (err) {
        allRevokesOk = false;
        failed += 1;
        console.error(
          `[reconcileExpiredSubShares] revoke failed for ${g.email} on ${g.fileId}:`,
          err
        );
      }
    }

    if (allRevokesOk) {
      // Safe to clean up the share doc — every grant is either revoked
      // already or owned by another active share.
      try {
        // Collection shares carry a `boards/` subcollection of frozen Board
        // snapshots. Deleting only the parent would orphan those sub-docs
        // (they're read-gated by the parent's expiresAt, but never reaped).
        // Delete them first so the parent delete leaves nothing behind. The
        // parent collection id distinguishes a Collection doc (path
        // `shared_collections/{id}`) from a single-board share.
        if (ref.parent?.id === 'shared_collections') {
          const boardsSnap = await getDocs(collection(ref, 'boards'));
          for (const boardDoc of boardsSnap.docs) {
            await deleteDoc(boardDoc.ref);
          }
        }
        await deleteDoc(ref);
      } catch (err) {
        // Don't abort the whole sweep — a single delete failure here would
        // otherwise skip Drive-grant revocation for every remaining expired
        // share. Count it, leave the doc for the next-session / cloud-function
        // retry, and continue. `deleteFailed` keeps the throttle unset below.
        console.error('[reconcileExpiredSubShares] doc delete failed:', err);
        deleteFailed += 1;
      }
    }
    // If any revoke failed, leave the doc behind. The throttle won't fire
    // (sweep throws on the next operation OR returns "partial" — see
    // below), so next session will try again. After 7 days the cloud
    // function fallback gives up and deletes the doc with a Cloud Logging
    // warning about the orphaned permissionIds.
  }

  if (failed > 0) {
    console.warn(
      `[reconcileExpiredSubShares] revoked ${revoked} Drive permissions across ${expiredDocs.length} expired shares, ${failed} revoke failures, ${deleteFailed} delete failures (will retry next session)`
    );
    // Throw so the caller's .then() doesn't set the throttle (retry next
    // session) AND its .catch() surfaces the reconnect-Drive nudge — correct
    // guidance only when a Drive REVOKE failed.
    throw new Error(
      `Substitute-share reconciliation partial failure: ${failed} revoke failure(s), ${deleteFailed} delete failure(s)`
    );
  } else if (deleteFailed > 0) {
    // All Drive revokes succeeded; only the Firestore deleteDoc failed. Do NOT
    // throw: onPartialFailure's toast tells the teacher to reconnect Drive,
    // which is wrong here (Drive is fine, grants ARE revoked) and would send
    // them down a spurious reconnect loop. The grant-free orphaned doc is
    // reaped by the expireSubShares cloud-function fallback, so letting the
    // throttle set is safe.
    console.warn(
      `[reconcileExpiredSubShares] revoked ${revoked} Drive permissions; ${deleteFailed} expired share doc delete(s) failed (grants already revoked — cloud function will reap the orphaned doc(s))`
    );
  }
}
