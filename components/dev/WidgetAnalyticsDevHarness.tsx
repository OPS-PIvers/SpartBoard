// Admin Settings > Analytics > Widgets on fixtures at /widget-analytics-dev (auth-bypass builds only).

import React, { useMemo } from 'react';
import {
  WidgetsPanel,
  type AnalyticsData,
} from '@/components/admin/Analytics/AnalyticsManager';
import { AuthContext, type AuthContextType } from '@/context/AuthContextValue';
import type { WidgetUsage } from '@/components/admin/Analytics/widgetUsage';

const DAY = 24 * 60 * 60 * 1000;
const BUILDING_IDS = ['schumann', 'intermediate', 'middle', 'high'];
const NAMES = [
  'abaker',
  'bcarlson',
  'cdavis',
  'deriksen',
  'efischer',
  'fgarcia',
  'ghansen',
  'hiverson',
  'ijohnson',
  'jkim',
  'klarson',
  'lmiller',
  'mnelson',
  'nolson',
  'opeterson',
  'pquinn',
  'rrasmussen',
  'ssmith',
  'tthompson',
  'uulrich',
  'vvang',
  'wwilson',
  'xxiong',
  'yyoung',
];

// [type, open, users, daily, dailyPrev, monthly, monthlyPrev]
const ROWS: [string, number, number, number, number, number, number | null][] =
  [
    ['embed', 240, 36, 14, 13, 31, 27],
    ['time-tool', 183, 60, 31, 33, 52, 49],
    ['text', 166, 39, 18, 18, 33, 35],
    ['clock', 124, 42, 6, 5, 21, 21],
    ['schedule', 98, 30, 22, 20, 28, 26],
    ['lunchCount', 61, 24, 19, 21, 23, 23],
    ['checklist', 58, 22, 7, 9, 15, 12],
    ['random', 44, 19, 9, 6, 16, 11],
    ['traffic', 31, 14, 3, 0, 8, null],
  ];

const now = Date.now();

const buildFixture = (): AnalyticsData => {
  const userList = NAMES.map((n, i) => ({
    email: `${n}@district.org`,
    buildings: i % 7 === 6 ? [] : [BUILDING_IDS[i % 4]],
    lastSignInMs: now - i * DAY,
    lastEditMs: now - i * DAY,
    hasDashboard: true,
    isMonthlyActive: true,
    isDailyActive: i < 10,
  }));
  const totalInstances: Record<string, number> = {};
  const activeInstances: Record<string, number> = {};
  const usersByType: Record<string, { count: number; emails: string[] }> = {};
  const usage: Record<string, WidgetUsage> = {};
  for (const [
    type,
    open,
    users,
    daily,
    dailyPrev,
    monthly,
    monthlyPrev,
  ] of ROWS) {
    totalInstances[type] = open;
    activeInstances[type] = Math.round(open * 0.85);
    usersByType[type] = { count: users, emails: [] };
    const buildings: Record<string, number> = {};
    const share = [0.3, 0.25, 0.25, 0.15];
    BUILDING_IDS.forEach((id, i) => {
      buildings[id] = Math.round(users * share[i]);
    });
    const none = users - Object.values(buildings).reduce((a, b) => a + b, 0);
    if (none > 0) buildings.none = none;
    usage[type] = {
      daily,
      monthly,
      dailyPrev,
      monthlyPrev,
      buildings,
      users: userList.map((u, i) => ({
        email: u.email,
        lastUsedMs:
          i < 4 ? now - (i + 1) * 3_600_000 : i < 20 ? now - i * DAY : 0,
      })),
    };
  }
  return {
    users: {
      total: NAMES.length,
      registered: NAMES.length,
      monthly: NAMES.length,
      daily: 10,
      withDashboards: NAMES.length,
      domains: {},
      buildings: {},
      domainBuilding: {},
      userList,
    },
    widgets: { totalInstances, activeInstances, usersByType, usage },
    dashboards: { total: 80, avgWidgetsPerDashboard: 6 },
    api: {
      totalCalls: 0,
      activeUsers: 0,
      topUsers: [],
      avgDailyCalls: 0,
      avgDailyCallsPerUser: 0,
      byFeature: {},
    },
  };
};

export const WidgetAnalyticsDevHarness: React.FC = () => {
  const data = useMemo(() => buildFixture(), []);
  const auth = useMemo(
    () => ({ orgId: 'orono', orgBuildings: [] }) as unknown as AuthContextType,
    []
  );
  return (
    <AuthContext.Provider value={auth}>
      <div className="h-screen h-dvh overflow-y-auto bg-slate-50 p-6 pb-24 font-sans">
        <WidgetsPanel data={data} />
      </div>
    </AuthContext.Provider>
  );
};
