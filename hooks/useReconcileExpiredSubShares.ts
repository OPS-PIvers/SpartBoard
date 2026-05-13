/**
 * useReconcileExpiredSubShares — once-per-session sweep that revokes Drive
 * permissions and deletes share docs for the signed-in teacher's expired
 * substitute shares.
 *
 * Why client-side: revoking permissions on a teacher's own Drive files
 * requires either their OAuth refresh token (we don't store one) or
 * Workspace domain-wide delegation (district hasn't enabled, and the GCP
 * docs flag it as a privilege-escalation risk). Doing the revoke client-
 * side reuses the teacher's existing browser OAuth session — same scope
 * they granted for normal Drive use, no new attack surface.
 *
 * The `expireSubShares` cloud function still runs hourly as a fallback in
 * case the teacher never returns (e.g. left the district). When that
 * happens the share doc gets deleted but the Drive permissions stay; the
 * function logs which permissionIds went unrevoked.
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
}

export function useReconcileExpiredSubShares({
  uid,
  driveService,
}: ReconcileArgs): void {
  const didRunRef = useRef(false);

  useEffect(() => {
    if (!uid || !driveService) return;
    if (didRunRef.current) return;

    // Cap to once per session per uid. The teacher returning after a long
    // weekend gets one sweep; rapid sign-out/sign-in cycles don't hammer
    // Firestore.
    try {
      const key = `${SESSION_KEY_PREFIX}${uid}`;
      if (typeof window !== 'undefined' && window.sessionStorage.getItem(key)) {
        didRunRef.current = true;
        return;
      }
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(key, '1');
      }
    } catch {
      // sessionStorage unavailable (private browsing) — fall through to the
      // ref guard, which still caps to once per mount.
    }
    didRunRef.current = true;

    void reconcileExpiredSubShares(uid, driveService).catch((err) => {
      console.error('[useReconcileExpiredSubShares] sweep failed:', err);
    });
  }, [uid, driveService]);
}

async function reconcileExpiredSubShares(
  uid: string,
  driveService: GoogleDriveService
): Promise<void> {
  const now = Date.now();
  const expiredQuery = query(
    collection(db, 'shared_boards'),
    where('originalAuthor', '==', uid),
    where('intendedMode', '==', 'substitute'),
    where('expiresAt', '<=', now)
  );
  const snap = await getDocs(expiredQuery);
  if (snap.empty) return;

  let revoked = 0;
  let failed = 0;
  for (const docSnap of snap.docs) {
    const data = docSnap.data() as { driveGrants?: PersistedGrant[] };
    const grants = Array.isArray(data.driveGrants) ? data.driveGrants : [];

    // Best-effort revoke for each persisted permission. A 404 is treated
    // as "already gone" inside `deletePermission` and resolves silently.
    for (const grant of grants) {
      if (!grant.fileId || !grant.permissionId) continue;
      try {
        await driveService.deletePermission(grant.fileId, grant.permissionId);
        revoked += 1;
      } catch (err) {
        failed += 1;
        console.error(
          `[reconcileExpiredSubShares] revoke failed for ${grant.email} on ${grant.fileId}:`,
          err
        );
      }
    }

    // Whether or not every revoke succeeded, delete the share doc — the
    // cloud function would do the same on its hourly tick.
    try {
      await deleteDoc(docSnap.ref);
    } catch (err) {
      console.error('[reconcileExpiredSubShares] doc delete failed:', err);
    }
  }

  if (failed > 0) {
    console.warn(
      `[reconcileExpiredSubShares] revoked ${revoked} Drive permissions across ${snap.size} expired shares, ${failed} failures (will retry next session)`
    );
  }
}
