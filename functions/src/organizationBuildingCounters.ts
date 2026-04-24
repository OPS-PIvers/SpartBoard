import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Maximum age (in seconds) of an inbound event that this trigger will still
 * attempt to process. Older deliveries are dropped with a structured error so
 * a persistent permission/quota failure does not log-spam for the v2 default
 * `retry`-on-error budget (Eventarc retries failures for up to 7 days).
 *
 * Firebase Functions v2 does NOT expose `maxRetrySeconds` on the trigger
 * options object (the v1 retry-config knob is not on
 * `EventHandlerOptions`); the documented v2 pattern for bounding retries is
 * to enable `retry: true` and check the event age in-handler. After this
 * budget is exhausted the failure dead-letters quietly and the next
 * create/delete recount will self-heal.
 *
 * 600s (10 min) was chosen to allow a few minutes of transient Firestore /
 * Eventarc instability while keeping the failure feedback loop short for
 * permission/quota-class regressions that are not going to self-resolve.
 */
const MAX_EVENT_AGE_SECONDS = 600;

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
 *
 * `retry: true` on the trigger lets Cloud Functions retry transient recount
 * failures (recount IS idempotent, unlike increment). The in-handler
 * `MAX_EVENT_AGE_SECONDS` guard caps the effective retry budget — see the
 * constant doc-comment for the rationale.
 */
export const organizationBuildingCounters = onDocumentWritten(
  {
    document: 'organizations/{orgId}/buildings/{buildingId}',
    retry: true,
  },
  async (event) => {
    const { orgId, buildingId } = event.params;
    const change = event.data;

    // Bound the effective retry budget. v2 lacks a `maxRetrySeconds` option;
    // dropping events older than the budget lets persistent failures
    // dead-letter quietly instead of log-spamming for the v2 default of
    // ~7 days of retries.
    const eventTimeMs = event.time ? Date.parse(event.time) : NaN;
    if (Number.isFinite(eventTimeMs)) {
      const ageSeconds = (Date.now() - eventTimeMs) / 1000;
      if (ageSeconds > MAX_EVENT_AGE_SECONDS) {
        logger.error(
          'organizationBuildingCounters: dropping event past retry budget; counter may be stale until next create/delete. action_required:run a manual recount if drift persists',
          {
            orgId,
            buildingId,
            ageSeconds,
            maxEventAgeSeconds: MAX_EVENT_AGE_SECONDS,
            eventTime: event.time,
            action_required: 'verify buildings counter; rerun create/delete',
          }
        );
        return;
      }
    }
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
