/**
 * Scheduled analytics recompute + snapshot read helper.
 *
 * The previous `adminAnalytics` HTTP function did two unbounded Firestore
 * reads (`collectionGroup('dashboards').stream()` and
 * `collection('ai_usage').stream()`) on every admin page load. Once the user
 * base grew past a handful of teachers, that path dominated the Cloud
 * Functions + Firestore bill (see `docs/CLOUD_FUNCTIONS_COST_OPTIMIZATION.md`).
 *
 * The cache architecture:
 *   - `recomputeAdminAnalytics` runs once a day at 5 AM Central, iterates
 *     every non-archived org, and writes the computed payload to
 *     `/organizations/{orgId}/analytics/snapshot` with `computedAt` and
 *     `nextRecomputeAt` timestamps.
 *   - `adminAnalytics` (hot path, lives in `index.ts`) reads the snapshot and
 *     returns it verbatim. Total reads per admin page load: 3 (admin gate,
 *     member doc, snapshot). No streaming reads.
 *   - First-ever load for a newly created org returns a 503 so the UI shows
 *     "Analytics will be ready after the next scheduled refresh" until the
 *     scheduler runs once.
 *
 * The Refresh button in the UI is gone — analytics are a luxury read,
 * once-daily refresh is acceptable, and any client-initiated recompute would
 * just reintroduce the cost path we're amortizing.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import {
  computeAnalyticsForOrg,
  type AdminAnalyticsPayload,
} from './adminAnalyticsCompute';

// Skip archived orgs. Active + trial both get recomputed.
const ACTIVE_ORG_STATUSES = new Set(['active', 'trial']);

/**
 * Bumped if the snapshot shape ever changes incompatibly. The reader at the
 * hot path will reject mismatched versions and fall through to the
 * "not-yet-computed" branch, forcing the next scheduled run to overwrite the
 * stale doc with a current-shape payload.
 */
export const SNAPSHOT_SCHEMA_VERSION = 1;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface AnalyticsSnapshotDoc {
  schemaVersion: number;
  computedAt: number;
  nextRecomputeAt: number;
  computeDurationMs: number;
  payload: AdminAnalyticsPayload;
}

/**
 * Scheduled daily recompute. 5 AM America/Chicago — off-peak for US-Central
 * teachers, well clear of the morning login wave. 4 GiB / 540 s ceilings
 * mirror the previous HTTP handler since the compute work itself is
 * unchanged; only its trigger surface moved.
 */
export const recomputeAdminAnalytics = onSchedule(
  {
    schedule: '0 5 * * *',
    timeZone: 'America/Chicago',
    memory: '4GiB',
    timeoutSeconds: 540,
  },
  async () => {
    const startedAt = Date.now();
    const db = admin.firestore();

    const orgsSnap = await db.collection('organizations').get();
    const targetOrgs: string[] = [];
    for (const doc of orgsSnap.docs) {
      const data = doc.data() as { status?: unknown };
      const status = typeof data.status === 'string' ? data.status : 'active';
      if (ACTIVE_ORG_STATUSES.has(status)) {
        targetOrgs.push(doc.id);
      }
    }

    console.log('[recomputeAdminAnalytics] starting', {
      orgCount: targetOrgs.length,
      orgIds: targetOrgs,
    });

    let succeeded = 0;
    let failed = 0;

    // Sequential, not parallel: each org's compute streams two unbounded
    // collections. Running them concurrently would multiply peak memory by
    // the org count and risk OOM on the 4 GiB instance.
    for (const orgId of targetOrgs) {
      const orgStartedAt = Date.now();
      let payload;
      try {
        payload = await computeAnalyticsForOrg(orgId, { scheduled: true });
      } catch (err) {
        failed += 1;
        // Per-org failures must not abort the batch — a single misconfigured
        // org shouldn't starve the rest of the fleet of fresh analytics.
        // `phase` is split from the write branch below so log-based alerts
        // can distinguish "compute logic is broken" from "Firestore is
        // flaky on the write path" without parsing error messages.
        console.error('[recomputeAdminAnalytics] org failed', {
          orgId,
          phase: 'compute',
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      try {
        const computedAt = Date.now();
        const snapshot: AnalyticsSnapshotDoc = {
          schemaVersion: SNAPSHOT_SCHEMA_VERSION,
          computedAt,
          nextRecomputeAt: computedAt + ONE_DAY_MS,
          computeDurationMs: computedAt - orgStartedAt,
          payload,
        };
        await db.doc(`organizations/${orgId}/analytics/snapshot`).set(snapshot);
        succeeded += 1;
      } catch (err) {
        failed += 1;
        console.error('[recomputeAdminAnalytics] org failed', {
          orgId,
          phase: 'write',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // If every org failed there's no point letting Scheduler treat the run
    // as healthy — throw so the run is marked failed and the next-run alert
    // fires. Mixed results stay at info-level so a single bad org doesn't
    // spam alerts when the rest succeeded; the per-org error lines above are
    // the right hook for "investigate this specific org" log alerts.
    const totalDurationMs = Date.now() - startedAt;
    if (failed > 0 && succeeded === 0 && targetOrgs.length > 0) {
      console.error('[recomputeAdminAnalytics] all orgs failed', {
        failed,
        totalDurationMs,
      });
      throw new Error(
        `recomputeAdminAnalytics: all ${failed} org(s) failed; see prior log lines for per-org error details`
      );
    }

    console.log('[recomputeAdminAnalytics] done', {
      succeeded,
      failed,
      totalDurationMs,
    });
  }
);

/**
 * Read a single org's analytics snapshot. Returns `null` when no usable
 * snapshot exists for any of three reasons. All three collapse into a 503
 * `not-yet-computed` at the HTTP handler because the user-facing remedy is
 * the same (wait for the next scheduled refresh), but they log at distinct
 * severities so Cloud Logging triage can tell them apart:
 *
 *   - `missing`          — doc doesn't exist (new org pre-first-run). Quiet
 *                          path; logged at debug only since this is the
 *                          expected cold-start state and would otherwise
 *                          spam logs every page load until the next 5 AM.
 *   - `stale-schema`     — `schemaVersion` mismatch. Expected for ~24h
 *                          after a snapshot-shape bump; logs at warn so a
 *                          spike post-deploy is visible but not alarming.
 *   - `malformed`        — required fields missing/wrong-typed. Unexpected
 *                          (the scheduler always writes a valid shape), so
 *                          logged at error and worth investigating.
 */
export async function readAnalyticsSnapshot(
  orgId: string
): Promise<AnalyticsSnapshotDoc | null> {
  const db = admin.firestore();
  const snap = await db.doc(`organizations/${orgId}/analytics/snapshot`).get();
  if (!snap.exists) {
    console.debug('[readAnalyticsSnapshot] missing', { orgId });
    return null;
  }
  const data = snap.data() as Partial<AnalyticsSnapshotDoc> | undefined;
  if (!data) {
    console.error('[readAnalyticsSnapshot] malformed: empty doc data', {
      orgId,
    });
    return null;
  }
  if (data.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    console.warn('[readAnalyticsSnapshot] stale-schema', {
      orgId,
      observedSchemaVersion: data.schemaVersion,
      expectedSchemaVersion: SNAPSHOT_SCHEMA_VERSION,
    });
    return null;
  }
  if (
    typeof data.computedAt !== 'number' ||
    typeof data.nextRecomputeAt !== 'number' ||
    typeof data.computeDurationMs !== 'number' ||
    !data.payload
  ) {
    console.error('[readAnalyticsSnapshot] malformed: required fields', {
      orgId,
      hasComputedAt: typeof data.computedAt === 'number',
      hasNextRecomputeAt: typeof data.nextRecomputeAt === 'number',
      hasComputeDurationMs: typeof data.computeDurationMs === 'number',
      hasPayload: !!data.payload,
    });
    return null;
  }
  return data as AnalyticsSnapshotDoc;
}
