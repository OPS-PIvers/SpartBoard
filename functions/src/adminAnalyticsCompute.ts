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
import {
  type AnalyticsHistory,
  type DayActivityDoc,
  buildActivitySeries,
  buildCohorts,
  buildNewUsersByMonth,
  estimateActivityDays,
  measuredDateKey,
  readActivityDays,
  writeActivityDays,
} from './adminAnalyticsHistory';

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
  history?: AnalyticsHistory;
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
  lastActiveMs: number;
  hasAccount: boolean;
  hasDashboard: boolean;
  isMonthlyActive: boolean;
  isDailyActive: boolean;
}

interface DashboardData {
  createdAt?: number;
  updatedAt?: number;
  widgets?: { type: string }[];
}

interface MemberLite {
  email: string;
  uid: string | null;
  buildingIds: string[];
  lastActiveStampMs: number;
}

const parseTimeMs = (raw: unknown): number => {
  if (typeof raw !== 'string' || !raw) return 0;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
};

/**
 * Compute the full analytics payload for one org. Pure(ish) — only side
 * effects are Firestore reads and `auth().getUsers()` lookups. Caller is
 * expected to have already verified authorization for `orgId`.
 *
 * `logContext` is threaded into the same `[getAdminAnalytics]` log lines the
 * inline implementation used, so existing Cloud Logging filters keep working.
 */
export interface HistoryOptions {
  // Write today's measured day and attach the history series.
  record: boolean;
  // Once per org, fill days before the first measured one from dated records.
  estimate: boolean;
}

// Library collections under users/{uid} whose createdAt/updatedAt mark a day of use.
const ESTIMATE_LIBRARY_COLLECTIONS = [
  'quizzes',
  'quiz_assignments',
  'guided_learning',
  'miniapps',
  'activity_wall_activities',
  'notebooks',
  'rubrics',
];

const toMs = (raw: unknown): number => {
  if (typeof raw === 'number') return raw;
  const ts = raw as { toMillis?: () => number } | null;
  return typeof ts?.toMillis === 'function' ? ts.toMillis() : 0;
};

export async function computeAnalyticsForOrg(
  orgId: string,
  logContext: { requestId?: string; scheduled?: boolean } = {},
  historyOptions: HistoryOptions = { record: false, estimate: false }
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
      lastActive?: unknown;
    };
    const memberEmail =
      typeof data.email === 'string' ? data.email.toLowerCase() : doc.id;
    const uid = typeof data.uid === 'string' && data.uid ? data.uid : null;
    const buildingIds = Array.isArray(data.buildingIds)
      ? data.buildingIds.filter(
          (id): id is string => typeof id === 'string' && id.length > 0
        )
      : [];
    members.push({
      email: memberEmail,
      uid,
      buildingIds,
      lastActiveStampMs: parseTimeMs(data.lastActive),
    });
  }

  // Resolve Firebase Auth metadata. Only invite claims write `uid` onto a
  // member doc, so members added any other way (seeded admins, roster sync)
  // are resolved by email instead of being reported as never active.
  const authUsersMap = new Map<
    string,
    {
      email: string;
      lastSignInMs: number;
      lastRefreshMs: number;
      creationMs: number;
    }
  >();
  const uidByEmail = new Map<string, string>();
  const identifiers: admin.auth.UserIdentifier[] = members.map((m) =>
    m.uid ? { uid: m.uid } : { email: m.email }
  );
  const chunks: admin.auth.UserIdentifier[][] = [];
  for (let i = 0; i < identifiers.length; i += 100) {
    chunks.push(identifiers.slice(i, i + 100));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const result = await admin.auth().getUsers(chunk);
        for (const u of result.users) {
          authUsersMap.set(u.uid, {
            email: u.email ?? '',
            lastSignInMs: parseTimeMs(u.metadata.lastSignInTime),
            lastRefreshMs: parseTimeMs(u.metadata.lastRefreshTime),
            creationMs: parseTimeMs(u.metadata.creationTime),
          });
          if (u.email) uidByEmail.set(u.email.toLowerCase(), u.uid);
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
  for (const m of members) {
    if (!m.uid) m.uid = uidByEmail.get(m.email) ?? null;
  }

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
  // Dated (uid, ms) events, only kept when estimating past history.
  const datedEvents: [string, number][] = [];

  const dashboardsStream = db
    .collectionGroup('dashboards')
    .select('widgets', 'updatedAt', 'createdAt')
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
    if (historyOptions.estimate) {
      datedEvents.push([ownerUid, toMs(dashData.createdAt)]);
      datedEvents.push([ownerUid, updatedAt]);
    }

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

  // 4. Compute engagement from the latest of board edit, sign-in, token
  // refresh (any open tab refreshes hourly) and the member-doc lastActive
  // stamp. Iterate the whole roster so invited members count toward totals.
  const lastActiveFor = (member: MemberLite): number => {
    const authInfo = member.uid ? authUsersMap.get(member.uid) : undefined;
    return Math.max(
      member.uid ? (lastEditByUser.get(member.uid) ?? 0) : 0,
      authInfo?.lastSignInMs ?? 0,
      authInfo?.lastRefreshMs ?? 0,
      member.lastActiveStampMs
    );
  };
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
    const lastActiveMs = lastActiveFor(member);
    const isMonthlyActive =
      lastActiveMs > 0 && now - lastActiveMs <= thirtyDaysMs;
    const isDailyActive = lastActiveMs > 0 && now - lastActiveMs <= oneDayMs;

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
    const lastActiveMs = lastActiveFor(member);
    return {
      email: member.email,
      buildings: member.buildingIds,
      lastSignInMs,
      lastEditMs,
      lastActiveMs,
      hasAccount: authInfo !== undefined,
      hasDashboard: member.uid ? allDashboardOwnerUids.has(member.uid) : false,
      isMonthlyActive: lastActiveMs > 0 && now - lastActiveMs <= thirtyDaysMs,
      isDailyActive: lastActiveMs > 0 && now - lastActiveMs <= oneDayMs,
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

  // Feature IDs that have dedicated per-feature ai_usage counters written by
  // specific Cloud Functions. Each entry corresponds to a `specificFeatureId`
  // that a function actually writes to ai_usage as `{uid}_{featureId}_{date}`.
  //
  // SYNC REQUIREMENT: this list must contain EXACTLY the set of feature IDs
  // that production Cloud Functions write as per-feature ai_usage docs. Adding
  // a genType mapping (specificFeatureId) in aiGeneration.ts or a new per-feature
  // counter in any other function REQUIRES a matching entry here. Removing a
  // function that wrote per-feature docs REQUIRES removing the entry here.
  //
  // DO NOT add entries for functions that skip the per-feature counter (e.g.
  // admin-only functions that bypass usage counting entirely). A phantom entry
  // causes any matching doc to be excluded from totalAiCalls and silently
  // classified into a bucket that will never have real data in production.
  //
  // Current writers (by function → featureId):
  //   generateWithAI (aiGeneration.ts): mini-app→embed-mini-app (Embed) or
  //     mini-app-ai (Mini App), poll→smart-poll, quiz→quiz, ocr→ocr,
  //     ocr+drawing→drawing-ai, ocr+webcam→webcam-ai, blooms-ai→blooms-ai,
  //     video-activity-recommend→video-activity-ai,
  //     dashboard-layout→dashboard-layout, instructional-routine→instructional-routine,
  //     widget-builder→widget-builder, widget-explainer→widget-explainer
  //   generateVideoActivity (aiGeneration.ts): video-activity-ai
  //   generateGuidedLearning, draftGuidedLearningStepTextV1 (aiGeneration.ts): guided-learning-ai
  //   transcribeVideoWithGemini (aiGeneration.ts): video-activity-audio-transcription
  //   paper handwriting worker (paperHandwritingQuota.ts): paper-handwritten-responses, in pages
  //
  // Kept for existing docs only: video-activity-recommend (now counted as video-activity-ai).
  //
  // IMPORTANT: Keep in sync with the mirror in
  // tests/components/admin/Analytics/AiFeatureLabels.test.ts — that test's
  // exhaustiveness check validates AI_FEATURE_LABELS against this list.
  const GEMINI_SPECIFIC_FEATURES = [
    'smart-poll',
    'embed-mini-app',
    'video-activity-audio-transcription',
    'quiz',
    'ocr',
    'blooms-ai',
    'video-activity-recommend',
    'dashboard-layout',
    'instructional-routine',
    'widget-builder',
    'widget-explainer',
    'tts',
    'translation',
    'paper-handwritten-responses',
    'video-activity-ai',
    'guided-learning-ai',
    'mini-app-ai',
    'drawing-ai',
    'webcam-ai',
  ];

  const aiUsageStream = db
    .collection('ai_usage')
    .select('count', 'backCount')
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
      // Back-translation writes `backCount`, not `count` — both are translation calls.
      const backCount =
        typeof usageData.backCount === 'number' ? usageData.backCount : 0;
      aiCallsByFeature[secondToLast] =
        (aiCallsByFeature[secondToLast] ?? 0) + count + backCount;
    }

    // ONLY count "overall" records for total analytics to avoid double counting
    // (per-feature records are for rate-limit enforcement, overall tracks all).
    if (!isSpecificFeature) {
      totalAiCalls += count;
      callsPerUser[uid] = (callsPerUser[uid] ?? 0) + count;
      dailyCallCounts[datePart] = (dailyCallCounts[datePart] ?? 0) + count;
      // Usage dates are UTC; midday UTC keeps them on the same district day.
      if (historyOptions.estimate && count > 0) {
        datedEvents.push([uid, parseTimeMs(`${datePart}T17:00:00Z`)]);
      }
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

  let history: AnalyticsHistory | undefined;
  if (historyOptions.record) {
    history = await recordAndBuildHistory({
      orgId,
      now,
      dailyActiveUids: members
        .filter((m) => m.uid && now - lastActiveFor(m) <= oneDayMs)
        .map((m) => m.uid as string),
      memberUids,
      authUsersMap,
      datedEvents,
      estimate: historyOptions.estimate,
    });
  }

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
    ...(history ? { history } : {}),
    // Only emit `meta` when something noteworthy happened during compute —
    // keeps the snapshot payload identical to the previous shape for the
    // common all-chunks-succeeded path.
    ...(partial ? { meta: { partial: true } } : {}),
  };
}

async function recordAndBuildHistory(input: {
  orgId: string;
  now: number;
  dailyActiveUids: string[];
  memberUids: Set<string>;
  authUsersMap: Map<
    string,
    { lastSignInMs: number; lastRefreshMs: number; creationMs: number }
  >;
  datedEvents: [string, number][];
  estimate: boolean;
}): Promise<AnalyticsHistory> {
  const { orgId, now, memberUids, authUsersMap } = input;
  const today = measuredDateKey(now);
  const existing = await readActivityDays(orgId);
  const toWrite: DayActivityDoc[] = [
    {
      date: today,
      activeUids: [...new Set(input.dailyActiveUids)].sort(),
      estimated: false,
    },
  ];

  // A marker, not the estimated docs, records the fill so an org with nothing to estimate is not rescanned nightly.
  const markerRef = admin
    .firestore()
    .doc(`organizations/${orgId}/analytics/history_estimate`);
  const alreadyEstimated =
    input.estimate && (await markerRef.get()).exists === true;
  if (input.estimate && !alreadyEstimated) {
    const firstMeasured = existing
      .filter((d) => !d.estimated)
      .map((d) => d.date)
      .reduce((min, d) => (d < min ? d : min), today);
    const events = [...input.datedEvents];
    for (const [uid, info] of authUsersMap) {
      events.push([uid, info.creationMs], [uid, info.lastSignInMs]);
    }
    events.push(...(await readLibraryEvents(memberUids)));
    toWrite.push(...estimateActivityDays(events, firstMeasured));
  }

  await writeActivityDays(orgId, toWrite);
  if (input.estimate && !alreadyEstimated) {
    await markerRef.set({
      estimatedAt: now,
      days: toWrite.length - 1,
    });
  }
  const byDate = new Map(existing.map((d) => [d.date, d]));
  for (const d of toWrite) byDate.set(d.date, d);
  const days = [...byDate.values()];

  const signupByUid = new Map<string, number>();
  for (const [uid, info] of authUsersMap) signupByUid.set(uid, info.creationMs);

  return {
    days: buildActivitySeries(days),
    newUsersByMonth: buildNewUsersByMonth([...signupByUid.values()], now),
    cohorts: buildCohorts(signupByUid, days, now),
  };
}

async function readLibraryEvents(
  memberUids: Set<string>
): Promise<[string, number][]> {
  const db = admin.firestore();
  const events: [string, number][] = [];
  for (const name of ESTIMATE_LIBRARY_COLLECTIONS) {
    const stream = db
      .collectionGroup(name)
      .select('createdAt', 'updatedAt')
      .stream() as unknown as AsyncIterable<admin.firestore.QueryDocumentSnapshot>;
    for await (const doc of stream) {
      const owner = doc.ref.parent.parent;
      if (!owner || owner.parent.id !== 'users') continue;
      if (!memberUids.has(owner.id)) continue;
      const data = doc.data();
      events.push([owner.id, toMs(data.createdAt)]);
      events.push([owner.id, toMs(data.updatedAt)]);
    }
  }
  return events;
}
