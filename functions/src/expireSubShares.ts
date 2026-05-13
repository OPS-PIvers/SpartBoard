/**
 * Hourly sweep that deletes expired substitute-mode `/shared_boards`
 * docs so the substitute portal stays uncluttered and stale snapshots
 * don't sit in Firestore indefinitely.
 *
 * Drive-permission revocation note (Phase 5 limitation):
 * --------------------------------------------------------------------
 * When a teacher grants a sub Drive access to their rosters at share-
 * creation time, the resulting permissions belong to the teacher's own
 * Drive — not the service account's. Revoking them requires either
 * (a) the teacher's OAuth refresh token (we don't store one), or
 * (b) Google Workspace domain-wide delegation so the function can
 *     impersonate the teacher.
 *
 * For v1 we ship neither path. The function logs which Drive grants
 * SHOULD be revoked and continues with the share-doc delete; the
 * teacher gets a follow-up in-app notification (Phase 6) prompting
 * manual revocation. Once domain-wide delegation is configured in the
 * district's Workspace admin console, this function can be extended to
 * actually call `drive.permissions.delete` using a delegated client.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

/** Cap per-run delete count to keep one slow sweep from monopolising. */
const MAX_DELETES_PER_RUN = 500;

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

    // Query only substitute shares. `expiresAt` is a number field; the
    // inequality filter on `expiresAt` alone keeps this single-field, so
    // no composite index is required.
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

    // Log Drive grants that *should* be revoked. See the file-header note
    // for why we can't revoke them server-side yet.
    let revokesPending = 0;
    for (const doc of snap.docs) {
      const data = doc.data() as SubstituteShareData;
      const grants = Array.isArray(data.driveGrants) ? data.driveGrants : [];
      if (grants.length > 0) {
        revokesPending += grants.length;
        console.log(
          `[expireSubShares] share ${doc.id} (host ${data.originalAuthor}) — ` +
            `${grants.length} Drive permissions need manual revocation: ` +
            grants
              .map((g) => `${g.email}@${g.fileId}:${g.permissionId}`)
              .join(', ')
        );
      }
    }

    // Batched delete. Firestore caps each batch at 500 ops which lines up
    // with MAX_DELETES_PER_RUN; we still chunk defensively.
    const batchSize = 250;
    let deleted = 0;
    for (let i = 0; i < snap.docs.length; i += batchSize) {
      const batch = db.batch();
      const chunk = snap.docs.slice(i, i + batchSize);
      for (const doc of chunk) batch.delete(doc.ref);
      await batch.commit();
      deleted += chunk.length;
    }

    console.log(
      `[expireSubShares] deleted ${deleted} expired substitute shares; ` +
        `${revokesPending} Drive permissions still pending manual revocation`
    );
  }
);
