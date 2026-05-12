/**
 * Org-scoped analytics computation.
 *
 * Extracted from the inline body of `adminAnalytics` and now driven only by
 * the scheduled `recomputeAdminAnalytics` job in `adminAnalyticsSnapshot.ts`,
 * which calls this once per active org at 5 AM Central daily and stores the
 * result at `/organizations/{orgId}/analytics/snapshot`. The HTTP handler
 * reads that snapshot and returns 503 on a cold-miss — it intentionally does
 * NOT fall back to this helper, because doing so would reintroduce the
 * unbounded-Firestore-reads cost path the snapshot cache exists to amortize.
 *
 * The function performs two unbounded reads — `collectionGroup('dashboards')`
 * and `collection('ai_usage')` — joined against the org's member roster
 * in-memory. That cost is the reason the snapshot cache exists.
 */

import * as admin from 'firebase-admin';

export interface AdminAnalyticsPayload {
  users: {
    total: number;
    registered: number;
    registeredIsFallback: boolean;
    monthly: number;
    daily: number;
    withDashboards: number;
    domains: Record<string, EngagementCounts>;
    buildings: Record<string, EngagementCounts>;
    domainBuilding: Record<string, Record<string, EngagementCounts>>;
    userList: AnalyticsUserRow[];
  };
  widgets: {
    totalInstances: Record<string, number>;
    activeInstances: Record<string, number>;
    usersByType: Record<string, { count: number; emails: string[] }>;
  };
  dashboards: {
    total: number;
    avgWidgetsPerDashboard: number;
  };
  api: {
    totalCalls: number;
    activeUsers: number;
    topUsers: { uid: string; count: number; email: string }[];
    avgDailyCalls: number;
    avgDailyCallsPerUser: number;
    byFeature: Record<string, number>;
  };
  // Compute-time signals. `partial` is set when one or more
  // `auth().getUsers()` chunks failed during compute — the engagement
  // counts that depend on email/uid resolution will be lower than reality.
  // The HTTP handler merges this into the response meta so the UI can
  // surface a "some counts may be lower than actual" banner.
  meta?: {
    partial?: boolean;
  };
}

interface EngagementCounts {
  total: number;
  monthly: number;
  daily: number;
}

interface AnalyticsUserRow {
  email: string;
  buildings: string[];
  lastSignInMs: number;
  lastEditMs: number;
  hasDashboard: boolean;
  isMonthlyActive: boolean;
  isDailyActive: boolean;
}

interface DashboardData {
  updatedAt?: number;
  widgets?: { type: string }[];
}

interface MemberLite {
  email: string;
  uid: string | null;
  buildingIds: string[];
}

/**
 * Compute the full analytics payload for one org. Pure(ish) — only side
 * effects are Firestore reads and `auth().getUsers()` lookups. Caller is
 * expected to have already verified authorization for `orgId`.
 *
 * `logContext` is threaded into the same `[getAdminAnalytics]` log lines the
 * inline implementation used, so existing Cloud Logging filters keep working.
 */
export async function computeAnalyticsForOrg(
  orgId: string,
  logContext: { requestId?: string; scheduled?: boolean } = {}
): Promise<AdminAnalyticsPayload> {
  const db = admin.firestore();
  const now = Date.now();

  // Tracks whether any `auth().getUsers()` chunk silently failed. The
  // compute continues so a single bad chunk doesn't drop a fresh snapshot,
  // but the response carries this flag so admins know the totals may be
  // under-counted.
  let partial = false;

  // 1. Load the org's members as the authoritative user roster. Members
  // without a `uid` (invited but never signed in) still count toward totals
  // but have zero engagement.
  const members: MemberLite[] = [];
  const membersSnap = await db
    .collection(`organizations/${orgId}/members`)
    .get();
  for (const doc of membersSnap.docs) {
    const data = doc.data() as {
      email?: unknown;
      uid?: unknown;
      buildingIds?: unknown;
    };
    const memberEmail =
      typeof data.email === 'string' ? data.email.toLowerCase() : doc.id;
    const uid = typeof data.uid === 'string' && data.uid ? data.uid : null;
    const buildingIds = Array.isArray(data.buildingIds)
      ? data.buildingIds.filter(
          (id): id is string => typeof id === 'string' && id.length > 0
        )
      : [];
    members.push({ email: memberEmail, uid, buildingIds });
  }

  // Resolve Firebase Auth metadata for members with a linked uid. `getUsers`
  // tolerates up to 100 identifiers per call and silently drops uids that no
  // longer exist in Auth, which is the right behavior for a member doc whose
  // uid was revoked.
  const authUsersMap = new Map<
    string,
    { email: string; lastSignInMs: number }
  >();
  const uidsToResolve = members
    .map((m) => m.uid)
    .filter((uid): uid is string => uid !== null);
  const chunks: { uid: string }[][] = [];
  for (let i = 0; i < uidsToResolve.length; i += 100) {
    chunks.push(uidsToResolve.slice(i, i + 100).map((uid) => ({ uid })));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const result = await admin.auth().getUsers(chunk);
        for (const u of result.users) {
          const lastSignIn = u.metadata.lastSignInTime
            ? new Date(u.metadata.lastSignInTime).getTime()
            : 0;
          authUsersMap.set(u.uid, {
            email: u.email ?? '',
            lastSignInMs: lastSignIn,
          });
        }
      } catch (err) {
        partial = true;
        console.warn('[getAdminAnalytics] auth().getUsers() chunk failed', {
          ...logContext,
          orgId,
          chunkSize: chunk.length,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })
  );

  // Build uid → member lookup so downstream dashboard/AI filters can scope to
  // org members without being gated on a successful `auth().getUsers()`
  // round-trip. An auth lookup failure must not silently drop a real member's
  // dashboards or AI usage from the totals.
  const memberUids = new Set<string>();
  for (const m of members) {
    if (m.uid) memberUids.add(m.uid);
  }

  // 2. Time constants & helpers (engagement computed after dashboard stream
  // so we can use last-edit timestamps instead of last-login).
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const oneDayMs = 24 * 60 * 60 * 1000;

  const increment = (
    bucket: Record<string, EngagementCounts>,
    key: string,
    isMonthlyActive: boolean,
    isDailyActive: boolean
  ) => {
    if (!bucket[key]) {
      bucket[key] = { total: 0, monthly: 0, daily: 0 };
    }
    bucket[key].total += 1;
    if (isMonthlyActive) bucket[key].monthly += 1;
    if (isDailyActive) bucket[key].daily += 1;
  };

  // 3. Stream every dashboard doc in the database and join against the
  // member-uid set in memory. This is one of the two unbounded reads the
  // snapshot cache exists to amortize.
  let totalDashboards = 0;
  const totalWidgetCounts: Record<string, number> = {};
  const activeWidgetCounts: Record<string, number> = {};
  const allDashboardOwnerUids = new Set<string>();
  let totalWidgetInstances = 0;
  // Bounded at MAX_WIDGET_USER_TRACK UIDs per type: memory is
  // O(widget_types × limit) instead of O(widget_types × all_users).
  // count = Set.size is exact up to the cap; above the cap it means "≥ cap".
  const MAX_WIDGET_USER_TRACK = 100;
  const widgetToUserUids: Record<string, Set<string>> = {};
  const activeThreshold = now - 30 * 24 * 60 * 60 * 1000;
  const lastEditByUser = new Map<string, number>();

  const dashboardsStream = db
    .collectionGroup('dashboards')
    .select('widgets', 'updatedAt')
    .stream() as unknown as AsyncIterable<admin.firestore.QueryDocumentSnapshot>;

  for await (const dashDoc of dashboardsStream) {
    if (!dashDoc.exists) continue;
    const dashData = dashDoc.data() as DashboardData;
    const updatedAt =
      typeof dashData.updatedAt === 'number' ? dashData.updatedAt : 0;
    const isActive = updatedAt > activeThreshold;

    // Extract owner UID from path: users/{uid}/dashboards/{dashId}
    const ownerUid: string | null = dashDoc.ref.parent.parent?.id ?? null;

    if (!ownerUid || !memberUids.has(ownerUid)) continue;

    totalDashboards++;
    allDashboardOwnerUids.add(ownerUid);

    const prevEdit = lastEditByUser.get(ownerUid) ?? 0;
    if (updatedAt > prevEdit) {
      lastEditByUser.set(ownerUid, updatedAt);
    }

    const widgetCount = Array.isArray(dashData.widgets)
      ? dashData.widgets.length
      : 0;
    totalWidgetInstances += widgetCount;

    if (dashData.widgets && Array.isArray(dashData.widgets)) {
      dashData.widgets.forEach((w: { type: string }) => {
        if (w && w.type) {
          totalWidgetCounts[w.type] = (totalWidgetCounts[w.type] || 0) + 1;
          if (isActive) {
            activeWidgetCounts[w.type] = (activeWidgetCounts[w.type] || 0) + 1;
          }
          if (ownerUid) {
            if (!widgetToUserUids[w.type]) {
              widgetToUserUids[w.type] = new Set<string>();
            }
            const uidSet = widgetToUserUids[w.type];
            if (uidSet.size < MAX_WIDGET_USER_TRACK || uidSet.has(ownerUid)) {
              uidSet.add(ownerUid);
            }
          }
        }
      });
    }
  }

  // 4. Compute engagement from last-edit timestamps. Iterate the org member
  // roster (not just the auth-resolved subset) so invited-but-never-signed-in
  // members count toward totals with zero engagement.
  const usersByDomain: Record<string, EngagementCounts> = {};
  const usersByBuilding: Record<string, EngagementCounts> = {};
  const usersByDomainAndBuilding: Record<
    string,
    Record<string, EngagementCounts>
  > = {};
  const totalEngagement: EngagementCounts = {
    total: 0,
    monthly: 0,
    daily: 0,
  };

  for (const member of members) {
    const userEmail = member.email;
    const domain = userEmail.includes('@')
      ? userEmail.split('@')[1]
      : 'unknown';
    const lastEditMs = member.uid ? (lastEditByUser.get(member.uid) ?? 0) : 0;
    const isMonthlyActive = lastEditMs > 0 && now - lastEditMs <= thirtyDaysMs;
    const isDailyActive = lastEditMs > 0 && now - lastEditMs <= oneDayMs;

    totalEngagement.total += 1;
    if (isMonthlyActive) totalEngagement.monthly += 1;
    if (isDailyActive) totalEngagement.daily += 1;

    increment(usersByDomain, domain, isMonthlyActive, isDailyActive);

    const buildings = member.buildingIds;
    if (buildings.length === 0) {
      increment(usersByBuilding, 'none', isMonthlyActive, isDailyActive);
      if (!usersByDomainAndBuilding[domain]) {
        usersByDomainAndBuilding[domain] = {};
      }
      increment(
        usersByDomainAndBuilding[domain],
        'none',
        isMonthlyActive,
        isDailyActive
      );
    } else {
      for (const building of buildings) {
        increment(usersByBuilding, building, isMonthlyActive, isDailyActive);
        if (!usersByDomainAndBuilding[domain]) {
          usersByDomainAndBuilding[domain] = {};
        }
        increment(
          usersByDomainAndBuilding[domain],
          building,
          isMonthlyActive,
          isDailyActive
        );
      }
    }
  }

  const userList: AnalyticsUserRow[] = members.map((member) => {
    const authInfo = member.uid ? authUsersMap.get(member.uid) : undefined;
    const lastSignInMs = authInfo?.lastSignInMs ?? 0;
    const lastEditMs = member.uid ? (lastEditByUser.get(member.uid) ?? 0) : 0;
    return {
      email: member.email,
      buildings: member.buildingIds,
      lastSignInMs,
      lastEditMs,
      hasDashboard: member.uid ? allDashboardOwnerUids.has(member.uid) : false,
      isMonthlyActive: lastEditMs > 0 && now - lastEditMs <= thirtyDaysMs,
      isDailyActive: lastEditMs > 0 && now - lastEditMs <= oneDayMs,
    };
  });

  const totalRegisteredUsers = authUsersMap.size;

  // Resolve widget UIDs to emails (cap at 200 unique UIDs total).
  const allWidgetUids = new Set<string>();
  outer: for (const uids of Object.values(widgetToUserUids)) {
    for (const uid of uids) {
      if (allWidgetUids.size >= 200) break outer;
      allWidgetUids.add(uid);
    }
  }

  const widgetUserEmails: Record<string, string> = {};
  const resolveUserEmailsViaAuthFallback = async (
    uids: string[],
    targetMap: Record<string, string>,
    warningContext: string
  ): Promise<void> => {
    const identifiers = uids.map((uid) => ({ uid }));
    const chunks: { uid: string }[][] = [];
    for (let i = 0; i < identifiers.length; i += 100) {
      chunks.push(identifiers.slice(i, i + 100));
    }

    await Promise.all(
      chunks.map(async (chunk, chunkIdx) => {
        try {
          const result = await admin.auth().getUsers(chunk);
          result.users.forEach((u) => {
            if (u.email) {
              targetMap[u.uid] = u.email;
            }
          });
        } catch (error) {
          partial = true;
          console.warn(
            `[getAdminAnalytics] Failed to resolve user emails via auth fallback for ${warningContext}`,
            {
              ...logContext,
              orgId,
              chunkSize: chunk.length,
              chunkStart: chunkIdx * 100,
              totalIdentifiers: identifiers.length,
              totalUids: uids.length,
              error: error instanceof Error ? error.message : String(error),
            }
          );
        }
      })
    );
  };

  const allWidgetUidArray = Array.from(allWidgetUids);
  for (let i = 0; i < allWidgetUidArray.length; i += 30) {
    const uidChunk = allWidgetUidArray.slice(i, i + 30);
    if (uidChunk.length === 0) continue;
    const snapshot = await db
      .collection('users')
      .where(admin.firestore.FieldPath.documentId(), 'in', uidChunk)
      .select('email')
      .get();
    snapshot.docs.forEach((d) => {
      const userData = d.data();
      if (
        typeof userData['email'] === 'string' &&
        userData['email'].length > 0
      ) {
        widgetUserEmails[d.id] = userData['email'];
      }
    });
  }
  const unresolvedWidgetUids = allWidgetUidArray.filter(
    (uid) => !widgetUserEmails[uid]
  );
  if (unresolvedWidgetUids.length > 0) {
    await resolveUserEmailsViaAuthFallback(
      unresolvedWidgetUids,
      widgetUserEmails,
      'widget drilldowns'
    );
  }

  const usersByType: Record<string, { count: number; emails: string[] }> = {};
  for (const [widgetType, uidSet] of Object.entries(widgetToUserUids)) {
    usersByType[widgetType] = {
      count: uidSet.size,
      emails: Array.from(uidSet)
        .slice(0, 20)
        .map((uid) => widgetUserEmails[uid] ?? `Unknown (${uid})`)
        .sort(),
    };
  }

  // 5. Stream every ai_usage doc and filter by member uid. Second unbounded
  // read; same amortization story as dashboards.
  let totalAiCalls = 0;
  const callsPerUser: Record<string, number> = {};
  const dailyCallCounts: Record<string, number> = {};
  const aiCallsByFeature: Record<string, number> = {};

  const GEMINI_SPECIFIC_FEATURES = [
    'smart-poll',
    'embed-mini-app',
    'video-activity-audio-transcription',
    'quiz',
    'ocr',
    'guided-learning',
  ];

  const aiUsageStream = db
    .collection('ai_usage')
    .select('count')
    .stream() as unknown as AsyncIterable<admin.firestore.QueryDocumentSnapshot>;

  for await (const usageDoc of aiUsageStream) {
    if (!usageDoc.exists) continue;
    const idParts = usageDoc.id.split('_');
    if (idParts.length < 2) continue;

    const datePart = idParts[idParts.length - 1];
    const secondToLast = idParts[idParts.length - 2];
    const isSpecificFeature = GEMINI_SPECIFIC_FEATURES.includes(secondToLast);

    const uidParts = idParts.slice(0, isSpecificFeature ? -2 : -1);
    const uid = uidParts.join('_');

    if (!uid || !datePart) continue;

    if (!memberUids.has(uid)) continue;

    const usageData = usageDoc.data();
    const count = typeof usageData.count === 'number' ? usageData.count : 0;

    if (isSpecificFeature) {
      aiCallsByFeature[secondToLast] =
        (aiCallsByFeature[secondToLast] ?? 0) + count;
    }

    // ONLY count "overall" records for total analytics to avoid double counting
    // (per-feature records are for rate-limit enforcement, overall tracks all).
    if (!isSpecificFeature) {
      totalAiCalls += count;
      callsPerUser[uid] = (callsPerUser[uid] ?? 0) + count;
      dailyCallCounts[datePart] = (dailyCallCounts[datePart] ?? 0) + count;
    }
  }

  const uniqueDays = Object.keys(dailyCallCounts).length || 1;
  const avgDailyCalls = Math.round(totalAiCalls / uniqueDays);
  const activeAiUsers = Object.keys(callsPerUser).length || 1;
  const avgDailyCallsPerUser =
    Math.round((avgDailyCalls / activeAiUsers) * 10) / 10;
  const topUserUids = Object.entries(callsPerUser)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 25)
    .map(([uid]) => uid);
  const topUserEmails: Record<string, string> = {};

  const uidChunks: string[][] = [];
  for (let i = 0; i < topUserUids.length; i += 10) {
    uidChunks.push(topUserUids.slice(i, i + 10));
  }

  await Promise.all(
    uidChunks.map(async (uidChunk) => {
      if (uidChunk.length === 0) return;
      const usersSnapshot = await db
        .collection('users')
        .where(admin.firestore.FieldPath.documentId(), 'in', uidChunk)
        .select('email')
        .get();

      usersSnapshot.docs.forEach((doc) => {
        const userData = doc.data();
        if (typeof userData.email === 'string' && userData.email.length > 0) {
          topUserEmails[doc.id] = userData.email;
        }
      });
    })
  );
  const unresolvedTopUserUids = topUserUids.filter(
    (uid) => !topUserEmails[uid]
  );
  if (unresolvedTopUserUids.length > 0) {
    await resolveUserEmailsViaAuthFallback(
      unresolvedTopUserUids,
      topUserEmails,
      'AI top users'
    );
  }

  const topUsers = Object.entries(callsPerUser)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 25)
    .map(([uid, count]) => ({
      uid,
      count,
      email: topUserEmails[uid] ?? `Unknown (${uid})`,
    }));

  return {
    users: {
      total: totalEngagement.total,
      registered: totalRegisteredUsers,
      registeredIsFallback: false,
      monthly: totalEngagement.monthly,
      daily: totalEngagement.daily,
      withDashboards: allDashboardOwnerUids.size,
      domains: usersByDomain,
      buildings: usersByBuilding,
      domainBuilding: usersByDomainAndBuilding,
      userList,
    },
    widgets: {
      totalInstances: totalWidgetCounts,
      activeInstances: activeWidgetCounts,
      usersByType,
    },
    dashboards: {
      total: totalDashboards,
      avgWidgetsPerDashboard:
        totalDashboards > 0
          ? Math.round((totalWidgetInstances / totalDashboards) * 10) / 10
          : 0,
    },
    api: {
      totalCalls: totalAiCalls,
      activeUsers: Object.keys(callsPerUser).length,
      topUsers,
      avgDailyCalls,
      avgDailyCallsPerUser,
      byFeature: aiCallsByFeature,
    },
    // Only emit `meta` when something noteworthy happened during compute —
    // keeps the snapshot payload identical to the previous shape for the
    // common all-chunks-succeeded path.
    ...(partial ? { meta: { partial: true } } : {}),
  };
}
