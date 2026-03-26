import * as functionsV1 from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

// Extend types to match what we need
interface DashboardData {
  updatedAt?: number;
  widgets?: { type: string }[];
}

export const getAdminAnalytics = functionsV1.https.onCall(
  async (data, context) => {
    // 1. Verify caller is authenticated
    if (!context.auth || !context.auth.token.email) {
      throw new functionsV1.https.HttpsError(
        'unauthenticated',
        'User must be logged in.'
      );
    }

    const email = context.auth.token.email.toLowerCase();
    const db = admin.firestore();

    // 2. Verify caller is an admin
    const adminDoc = await db.collection('admins').doc(email).get();
    if (!adminDoc.exists) {
      throw new functionsV1.https.HttpsError(
        'permission-denied',
        'This function is restricted to administrators.'
      );
    }

    try {
      const now = Date.now();

      // 3. Fetch Users
      // We will read the denormalized `buildings` array from the root user docs
      const usersSnap = await db.collection('users').get();
      const usersData = usersSnap.docs.map((userDoc) => {
        const userData = userDoc.data();
        const userEmail =
          typeof userData.email === 'string' ? userData.email : '';
        const domain = userEmail.includes('@')
          ? userEmail.split('@')[1]
          : 'unknown';

        let buildings: string[] = [];
        if (Array.isArray(userData.buildings)) {
          buildings = userData.buildings.map(String);
        }

        return {
          id: userDoc.id,
          email: userEmail,
          domain,
          lastLogin:
            typeof userData.lastLogin === 'number'
              ? userData.lastLogin
              : undefined,
          buildings,
        };
      });

      const totalUsers = usersData.length;

      // 4. Fetch Dashboards for Widget Stats
      // Use collectionGroup on backend safely bypassing the user-only read rules
      const totalWidgetCounts: Record<string, number> = {};
      const activeWidgetCounts: Record<string, number> = {};
      const dashboardsSnap = await db.collectionGroup('dashboards').get();
      const activeThreshold = now - 30 * 24 * 60 * 60 * 1000; // 30 days

      for (const dashDoc of dashboardsSnap.docs) {
        const dashData = dashDoc.data() as DashboardData;
        const isActive =
          (dashData.updatedAt && dashData.updatedAt > activeThreshold) ?? false;

        if (dashData.widgets && Array.isArray(dashData.widgets)) {
          dashData.widgets.forEach((w: { type: string }) => {
            if (w && w.type) {
              totalWidgetCounts[w.type] = (totalWidgetCounts[w.type] || 0) + 1;
              if (isActive) {
                activeWidgetCounts[w.type] =
                  (activeWidgetCounts[w.type] || 0) + 1;
              }
            }
          });
        }
      }

      // 5. Fetch AI Usage
      // Unbounded read is safer in a scheduled job, but here we can at least do it on the backend
      // without affecting the client directly. To scale, we could bound this to recent days,
      // but for this PR, we'll keep the logic the same to maintain stats but parsing safely.
      let totalAiCalls = 0;
      const callsPerUser: Record<string, number> = {};
      const dailyCallCounts: Record<string, number> = {};

      const aiUsageSnap = await db.collection('ai_usage').get();
      aiUsageSnap.docs.forEach((usageDoc) => {
        const idParts = usageDoc.id.split('_');
        if (idParts.length < 2) return;

        const datePart = idParts[idParts.length - 1];
        const maybeAudioMarker = idParts[idParts.length - 2];
        const hasAudioMarker = maybeAudioMarker === 'audio';
        const uidParts = idParts.slice(0, hasAudioMarker ? -2 : -1);
        const uid = uidParts.join('_');

        if (!uid || !datePart) return;

        const usageData = usageDoc.data();
        const count = typeof usageData.count === 'number' ? usageData.count : 0;

        totalAiCalls += count;
        callsPerUser[uid] = (callsPerUser[uid] ?? 0) + count;
        dailyCallCounts[datePart] = (dailyCallCounts[datePart] ?? 0) + count;
      });

      const uniqueDays = Object.keys(dailyCallCounts).length || 1;
      const avgDailyCalls = Math.round(totalAiCalls / uniqueDays);
      const activeAiUsers = Object.keys(callsPerUser).length || 1;
      const avgDailyCallsPerUser =
        Math.round((avgDailyCalls / activeAiUsers) * 10) / 10;

      return {
        users: {
          total: totalUsers,
          data: usersData,
        },
        widgets: {
          totalInstances: totalWidgetCounts,
          activeInstances: activeWidgetCounts,
        },
        api: {
          totalCalls: totalAiCalls,
          callsPerUser,
          avgDailyCalls,
          avgDailyCallsPerUser,
        },
      };
    } catch (err: unknown) {
      console.error('Error fetching analytics:', err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'An internal error occurred fetching analytics.';
      throw new functionsV1.https.HttpsError('internal', errorMessage);
    }
  }
);
