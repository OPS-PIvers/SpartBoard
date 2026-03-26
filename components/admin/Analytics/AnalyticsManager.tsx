import React, { useState, useEffect, useMemo } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import { BarChart, Users, Zap, LayoutGrid, AlertCircle } from 'lucide-react';
import { BUILDINGS } from '@/config/buildings';
import { TOOLS } from '@/config/tools';

interface AnalyticsData {
  users: {
    total: number;
    monthly: number;
    daily: number;
    data: {
      id: string;
      email: string;
      lastLogin?: number;
      buildings: string[];
      domain: string;
    }[];
  };
  widgets: {
    totalInstances: Record<string, number>;
    activeInstances: Record<string, number>;
  };
  api: {
    totalCalls: number;
    callsPerUser: Record<string, number>;
    avgDailyCalls: number;
    avgDailyCallsPerUser: number;
  };
}

const WIDGET_LABELS: Record<string, string> = TOOLS.reduce(
  (acc, tool) => {
    acc[tool.type] = tool.label;
    return acc;
  },
  {} as Record<string, string>
);

const StatCard: React.FC<{
  title: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle?: string;
}> = ({ title, value, icon, subtitle }) => (
  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
    <div className="flex justify-between items-start mb-4">
      <div className="p-3 bg-brand-blue-primary/10 rounded-xl text-brand-blue-primary">
        {icon}
      </div>
    </div>
    <div>
      <h4 className="text-slate-500 text-sm font-semibold uppercase tracking-wider mb-1">
        {title}
      </h4>
      <div className="text-3xl font-black text-slate-800">{value}</div>
      {subtitle && (
        <div className="text-sm text-slate-500 mt-2">{subtitle}</div>
      )}
    </div>
  </div>
);

export const AnalyticsManager: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const [selectedBuilding, setSelectedBuilding] = useState<string>('all');

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true);
        setError(null);

        const getAnalyticsData = httpsCallable<void, AnalyticsData>(
          functions,
          'getAdminAnalytics'
        );

        const result = await getAnalyticsData();
        const dataPayload = result.data;

        setData({
          ...dataPayload,
          users: {
            ...dataPayload.users,
            monthly: 0, // Calculated dynamically by the memo below
            daily: 0,
          },
        });
      } catch (err: unknown) {
        console.error('Failed to load analytics', err);
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'An error occurred loading analytics data';
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    void fetchAnalytics();
  }, []);

  // Derived filtered users memoized to avoid expensive loops on every render
  const { filteredTotalUsers, filteredMonthly, filteredDaily } = useMemo(() => {
    if (!data)
      return { filteredTotalUsers: 0, filteredMonthly: 0, filteredDaily: 0 };

    let users = data.users.data;
    if (selectedDomain !== 'all') {
      users = users.filter((u) => u.domain === selectedDomain);
    }
    if (selectedBuilding !== 'all') {
      users = users.filter((u) => u.buildings.includes(selectedBuilding));
    }

    let monthly = 0;
    let daily = 0;
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const oneDayMs = 24 * 60 * 60 * 1000;

    users.forEach((u) => {
      if (u.lastLogin) {
        if (now - u.lastLogin <= thirtyDaysMs) monthly++;
        if (now - u.lastLogin <= oneDayMs) daily++;
      }
    });

    return {
      filteredTotalUsers: users.length,
      filteredMonthly: monthly,
      filteredDaily: daily,
    };
  }, [data, selectedDomain, selectedBuilding]);

  // Extract unique domains for the filter
  const uniqueDomains = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.users.data.map((u) => u.domain)))
      .filter(Boolean)
      .sort();
  }, [data]);

  const userMap = useMemo(() => {
    if (!data) return new Map<string, { email: string }>();
    return new Map(data.users.data.map((u) => [u.id, u]));
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-blue-primary mr-3"></div>
        Processing analytics...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-700 p-6 rounded-2xl flex items-start gap-3">
        <AlertCircle className="w-6 h-6 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-bold mb-1">Failed to Load Analytics</h3>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // Sort widgets by popularity
  const sortedWidgets = Object.entries(data.widgets.totalInstances)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15); // Top 15

  // Sorted API users
  const topAiUsers = Object.entries(data.api.callsPerUser)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  return (
    <div className="space-y-8 pb-12">
      {/* Overview Section */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Users className="w-5 h-5 text-brand-blue-primary" />
            User Engagement
          </h3>
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={selectedDomain}
              onChange={(e) => setSelectedDomain(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-blue-primary"
            >
              <option value="all">All Domains</option>
              {uniqueDomains.map((d: string) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              value={selectedBuilding}
              onChange={(e) => setSelectedBuilding(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-blue-primary"
            >
              <option value="all">All Buildings</option>
              {BUILDINGS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            title="Total Users"
            value={filteredTotalUsers}
            icon={<Users className="w-6 h-6" />}
            subtitle="Lifetime registered users"
          />
          <StatCard
            title="Monthly Active"
            value={filteredMonthly}
            icon={<BarChart className="w-6 h-6" />}
            subtitle="Users active in last 30 days"
          />
          <StatCard
            title="Daily Active"
            value={filteredDaily}
            icon={<Zap className="w-6 h-6" />}
            subtitle="Users active in last 24 hours"
          />
        </div>
      </div>

      {/* API Usage Section */}
      <div>
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-brand-purple" />
          Gemini AI Usage
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total API Calls"
            value={data.api.totalCalls}
            icon={<Zap className="w-6 h-6" />}
          />
          <StatCard
            title="Active AI Users"
            value={Object.keys(data.api.callsPerUser).length}
            icon={<Users className="w-6 h-6" />}
          />
          <StatCard
            title="Avg Daily Calls"
            value={data.api.avgDailyCalls}
            icon={<BarChart className="w-6 h-6" />}
          />
          <StatCard
            title="Avg Daily Per User"
            value={data.api.avgDailyCallsPerUser}
            icon={<Users className="w-6 h-6" />}
          />
        </div>
      </div>

      {/* Widget Usage Section */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
        <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
          <LayoutGrid className="w-5 h-5 text-brand-blue-primary" />
          Top Widgets
        </h3>
        <div className="space-y-4">
          {sortedWidgets.map(([type, count], index) => {
            const label = WIDGET_LABELS[type] || type;
            const maxCount = sortedWidgets[0]?.[1] || 1;
            const percentage = Math.max(5, (count / maxCount) * 100);
            const activeCount = data.widgets.activeInstances[type] || 0;

            return (
              <div key={type} className="flex items-center gap-4">
                <div className="w-8 text-center text-sm font-bold text-slate-400">
                  #{index + 1}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-semibold text-slate-700">
                      {label}
                    </span>
                    <div className="flex gap-3">
                      <span className="text-slate-500">{count} total</span>
                      <span className="text-brand-blue-primary font-medium">
                        {activeCount} active
                      </span>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-blue-primary rounded-full transition-all duration-1000"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}

          {sortedWidgets.length === 0 && (
            <div className="text-center py-8 text-slate-500">
              No widget data available yet.
            </div>
          )}
        </div>
      </div>

      {/* Top API Users List */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
        <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
          <Zap className="w-5 h-5 text-brand-blue-primary" />
          Top AI Users
        </h3>
        <div className="space-y-4">
          {topAiUsers.map(([uid, count], index) => {
            const user = userMap.get(uid);
            const label = user ? user.email : `Unknown (${uid})`;
            const maxCount = topAiUsers[0]?.[1] || 1;
            const percentage = Math.max(5, (count / maxCount) * 100);

            return (
              <div key={uid} className="flex items-center gap-4">
                <div className="w-8 text-center text-sm font-bold text-slate-400">
                  #{index + 1}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-semibold text-slate-700">
                      {label}
                    </span>
                    <span className="text-slate-500">{count} calls</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-purple rounded-full transition-all duration-1000"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}

          {topAiUsers.length === 0 && (
            <div className="text-center py-8 text-slate-500">
              No API usage data available yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
