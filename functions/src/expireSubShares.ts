/**
 * Hourly sweep that deletes expired substitute-mode `/shared_boards`
 * docs so the substitute portal stays uncluttered and stale snapshots
 * don't sit in Firestore indefinitely.
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

    // Equality on intendedMode + range on expiresAt — requires a composite
    // index on (intendedMode ASC, expiresAt ASC); declared in
    // firestore.indexes.json.
    const snap = await db
      .collection('shared_boards')
      .where('intendedMode', '==', 'substitute')
      .where('expiresAt', '<=', now)
      .limit(MAX_DELETES_PER_RUN)
      .get();

    if (snap.empty) {
      console.log('[expireSubShares] no expired substitute shares');
      return;
    }

    // Bucket each expired doc into "ready to delete" vs "give the client
    // revoker more time". A doc is ready when it has no grants OR it's
    // been expired longer than the orphan-grace window.
    const readyToDelete: typeof snap.docs = [];
    const stillInGrace: typeof snap.docs = [];
    let orphanedGrantCount = 0;

    for (const doc of snap.docs) {
      const data = doc.data() as SubstituteShareData;
      const grants = Array.isArray(data.driveGrants) ? data.driveGrants : [];
      const expiredAt = typeof data.expiresAt === 'number' ? data.expiresAt : 0;
      const inGrace = grants.length > 0 && expiredAt > now - ORPHAN_GRACE_MS;

      if (inGrace) {
        stillInGrace.push(doc);
        continue;
      }

      // If we're deleting a doc that still has grants (i.e. grace expired),
      // log the orphans so a Workspace admin can clean up by hand.
      if (grants.length > 0) {
        orphanedGrantCount += grants.length;
        console.warn(
          `[expireSubShares] DELETING share ${doc.id} (host ${data.originalAuthor}) ` +
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
        `[expireSubShares] ${stillInGrace.length} expired shares in grace window — waiting for host to clean up`
      );
      return;
    }

    // Batched delete. Firestore caps each batch at 500 ops which lines up
    // with MAX_DELETES_PER_RUN; we still chunk defensively.
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
      `[expireSubShares] deleted ${deleted} expired substitute shares ` +
        `(${stillInGrace.length} still in ${ORPHAN_GRACE_DAYS}-day grace window; ` +
        `${orphanedGrantCount} Drive permissions logged as needing manual revocation)`
    );
  }
);
