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
      try {
        const payload = await computeAnalyticsForOrg(orgId, {
          scheduled: true,
        });
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
        // Per-org failures must not abort the batch — a single misconfigured
        // org shouldn't starve the rest of the fleet of fresh analytics.
        console.error('[recomputeAdminAnalytics] org failed', {
          orgId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    console.log('[recomputeAdminAnalytics] done', {
      succeeded,
      failed,
      totalDurationMs: Date.now() - startedAt,
    });
  }
);

/**
 * Read a single org's analytics snapshot. Returns `null` when no snapshot
 * exists yet (new org pre-first-scheduled-run) or when the stored
 * `schemaVersion` doesn't match — both treated as "not yet computed" so the
 * hot path returns a deterministic 503 rather than serving stale or
 * mis-shaped data.
 */
export async function readAnalyticsSnapshot(
  orgId: string
): Promise<AnalyticsSnapshotDoc | null> {
  const db = admin.firestore();
  const snap = await db.doc(`organizations/${orgId}/analytics/snapshot`).get();
  if (!snap.exists) return null;
  const data = snap.data() as Partial<AnalyticsSnapshotDoc> | undefined;
  if (!data || data.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    return null;
  }
  if (
    typeof data.computedAt !== 'number' ||
    typeof data.nextRecomputeAt !== 'number' ||
    typeof data.computeDurationMs !== 'number' ||
    !data.payload
  ) {
    return null;
  }
  return data as AnalyticsSnapshotDoc;
}
