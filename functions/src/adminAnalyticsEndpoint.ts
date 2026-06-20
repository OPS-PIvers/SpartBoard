/**
 * `adminAnalytics` HTTP endpoint (F12 split out of the old monolithic
 * `index.ts`). Read-only hot path that returns the precomputed analytics
 * snapshot for an org; the heavy compute lives in `adminAnalyticsCompute.ts`
 * and runs nightly from the scheduled job in `adminAnalyticsSnapshot.ts`.
 */
import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { randomUUID } from 'node:crypto';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { readAnalyticsSnapshot } from './adminAnalyticsSnapshot';
import './functionsInit';

/**
 * Cloud Function to fetch administrative analytics.
 *
 * Read-only hot path: returns the snapshot at
 * `/organizations/{orgId}/analytics/snapshot` (written nightly by
 * `recomputeAdminAnalytics`). The previous implementation computed the
 * payload inline on every call, doing two unbounded reads
 * (`collectionGroup('dashboards').stream()` + `collection('ai_usage').stream()`)
 * that dominated the bill once user counts grew. The compute helper itself
 * still lives in `adminAnalyticsCompute.ts`; it now runs once a day from the
 * scheduled job in `adminAnalyticsSnapshot.ts` instead of on every page load.
 *
 * Memory is held at 1 GiB rather than the legacy 4 GiB because no streaming
 * reads happen here anymore — only the snapshot doc read plus the auth/authz
 * doc reads. Could probably drop further; leaving headroom for the JSON
 * serialization of large snapshots.
 */
export const adminAnalytics = onRequest(
  {
    memory: '1GiB',
    timeoutSeconds: 30,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  async (req, res) => {
    // Correlation id for log triage. Emitted on the response (body +
    // X-Request-Id header) and threaded through every `[getAdminAnalytics]`
    // log line so a Cloud Logging alert can be pivoted back to the exact
    // client-visible response.
    const requestId = randomUUID();
    res.setHeader('X-Request-Id', requestId);

    // 1. Verify caller is authenticated via Bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('[getAdminAnalytics] Unauthenticated access attempt', {
        requestId,
      });
      res.status(401).json({ error: 'unauthenticated', requestId });
      return;
    }

    let email: string;
    try {
      const idToken = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      if (!decodedToken.email) {
        res.status(401).json({ error: 'unauthenticated', requestId });
        return;
      }
      email = decodedToken.email.toLowerCase();
    } catch {
      res.status(401).json({ error: 'unauthenticated', requestId });
      return;
    }

    // 1b. Require an orgId in the request body so analytics can be scoped to
    // a single tenant. The previous behavior listed every Firebase Auth user
    // globally, which leaked foreign-domain accounts into the calling admin's
    // analytics view.
    const rawBody = req.body as { orgId?: unknown } | undefined;
    const orgId =
      rawBody && typeof rawBody.orgId === 'string' ? rawBody.orgId.trim() : '';
    if (!orgId) {
      res.status(400).json({
        error: 'invalid-argument',
        message: 'orgId is required',
        requestId,
      });
      return;
    }

    const db = admin.firestore();

    // 2. Verify caller is authorized for the requested org. Two paths:
    //   - Super admin: exists in `/admins/{email}`. May view any org.
    //   - Org admin: has a member doc at `/organizations/{orgId}/members/{email}`
    //     whose `roleId` is in the admin-tier set. Mirrors the role gating in
    //     `assertCallerIsOrgAdmin` (organizationInvites.ts) but also admits
    //     building_admin, since reading analytics is a lesser privilege than
    //     inviting members.
    const ORG_ADMIN_ROLE_IDS = new Set([
      'super_admin',
      'domain_admin',
      'building_admin',
    ]);
    const [adminDoc, memberDoc] = await Promise.all([
      db.collection('admins').doc(email).get(),
      db.doc(`organizations/${orgId}/members/${email}`).get(),
    ]);
    const memberData = memberDoc.exists
      ? (memberDoc.data() as { roleId?: unknown })
      : undefined;
    const memberRoleId =
      typeof memberData?.roleId === 'string' ? memberData.roleId.trim() : '';
    const isSuperAdmin = adminDoc.exists;
    const isOrgAdmin = memberDoc.exists && ORG_ADMIN_ROLE_IDS.has(memberRoleId);
    if (!isSuperAdmin && !isOrgAdmin) {
      console.error('[getAdminAnalytics] Unauthorized access', {
        requestId,
        email,
        orgId,
      });
      res.status(403).json({ error: 'permission-denied', requestId });
      return;
    }

    try {
      // Hot path is now snapshot-only. The compute logic that used to live
      // here (~500 LOC) has moved to `adminAnalyticsCompute.ts` and runs
      // once a day from the scheduled job in `adminAnalyticsSnapshot.ts`.
      //
      // Three reads total at this point: admin doc, member doc (both fetched
      // above for the authz gate), and the snapshot doc. Compared to the
      // pre-cache implementation this skips a `collectionGroup('dashboards')`
      // stream over every dashboard in the database plus an `ai_usage`
      // stream over every per-user counter — the two reads that were
      // dominating the bill.
      const snapshot = await readAnalyticsSnapshot(orgId);
      if (!snapshot) {
        // No snapshot yet — either a brand-new org pre-first-scheduled-run,
        // or the snapshot was written under an older schemaVersion that the
        // reader rejects. Either way, surface a 503 with a deterministic
        // payload shape so the UI can show "Analytics will be ready after
        // the next scheduled refresh" rather than spinning forever.
        console.log('[getAdminAnalytics] no snapshot available', {
          requestId,
          orgId,
        });
        res.status(503).json({
          error: 'not-yet-computed',
          message:
            'Analytics for this organization have not been computed yet. The next scheduled refresh runs at 5:00 AM Central daily.',
          requestId,
        });
        return;
      }

      const { meta: payloadMeta, ...payloadWithoutMeta } = snapshot.payload;
      res.json({
        ...payloadWithoutMeta,
        meta: {
          ...(payloadMeta ?? {}),
          computedAt: snapshot.computedAt,
          nextRecomputeAt: snapshot.nextRecomputeAt,
          computeDurationMs: snapshot.computeDurationMs,
        },
      });
    } catch (err: unknown) {
      console.error('[getAdminAnalytics] Error reading snapshot', {
        requestId,
        orgId,
        error: err instanceof Error ? err.message : String(err),
      });
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'An internal error occurred reading analytics.';
      res
        .status(500)
        .json({ error: 'internal', message: errorMessage, requestId });
    }
  }
);
