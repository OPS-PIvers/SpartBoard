import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Firestore trigger that keeps the denormalized `buildings` count on
 * `/organizations/{orgId}` in sync with the live
 * `/organizations/{orgId}/buildings` subcollection.
 *
 * Firestore rules forbid clients (including domain admins) from writing the
 * `buildings` counter on the org doc, so this trigger — running on the
 * Admin SDK — is the only path that updates it.
 *
 * Uses a recount-on-every-write strategy (rather than `FieldValue.increment`)
 * because the collection is tiny (≤ dozens of buildings per org) and recount
 * self-heals any drift from at-least-once event delivery or pre-trigger state.
 */
export const organizationBuildingCounters = onDocumentWritten(
  'organizations/{orgId}/buildings/{buildingId}',
  async (event) => {
    const { orgId, buildingId } = event.params;
    const change = event.data;
    if (!change) {
      logger.warn('organizationBuildingCounters: received event without data', {
        orgId,
        buildingId,
      });
      return;
    }

    const created = !change.before.exists && change.after.exists;
    const deleted = change.before.exists && !change.after.exists;
    if (!created && !deleted) {
      // Update-only events don't change the count; skip the recount write.
      return;
    }

    const db = admin.firestore();
    try {
      const snap = await db
        .collection(`organizations/${orgId}/buildings`)
        .count()
        .get();
      const count = snap.data().count;
      await db.doc(`organizations/${orgId}`).update({ buildings: count });
      logger.info('organizationBuildingCounters: updated count', {
        orgId,
        buildingId,
        count,
        trigger: created ? 'create' : 'delete',
      });
    } catch (err) {
      logger.error('organizationBuildingCounters: recount failed', {
        orgId,
        buildingId,
        error: err instanceof Error ? err.message : String(err),
      });
      // Rethrow so Cloud Functions retries the invocation. The counter is
      // supposed to self-heal drift; swallowing transient errors would leave
      // it stale until the next create/delete.
      throw err instanceof Error
        ? err
        : new Error(
            `organizationBuildingCounters: recount failed for org ${orgId}, building ${buildingId}: ${String(err)}`
          );
    }
  }
);
