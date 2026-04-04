import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import { auth } from '@/config/firebase';
import {
  BarChart,
  Users,
  Zap,
  LayoutGrid,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { BUILDINGS } from '@/config/buildings';
import { TOOLS } from '@/config/tools';
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
} from 'recharts';

interface EngagementCounts {
  total: number;
  monthly: number;
  daily: number;
}

interface AnalyticsData {
  users: {
    total: number;
    monthly: number;
    daily: number;
    domains: Record<string, EngagementCounts>;
    buildings: Record<string, EngagementCounts>;
    domainBuilding: Record<string, Record<string, EngagementCounts>>;
  };
  widgets: {
    totalInstances: Record<string, number>;
    activeInstances: Record<string, number>;
    usersByType: Record<string, string[]>;
  };
  api: {
    totalCalls: number;
    activeUsers: number;
    topUsers: {
      uid: string;
      count: number;
      email: string;
    }[];
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

const KNOWN_BUILDINGS = new Map(
  BUILDINGS.map((building) => [building.id, building])
);
const NUMBER_FORMATTER = new Intl.NumberFormat();
const formatNumber = (value: number) => NUMBER_FORMATTER.format(value);

const formatRate = (value: number) =>
  Number.isFinite(value) ? `${value.toFixed(1)}%` : '0.0%';

const StatCard: React.FC<{
  title: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle?: string;
}> = ({ title, value, icon, subtitle }) => (
  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
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
  const requestSequenceRef = useRef(0);
  const isMountedRef = useRef(true);

  // Filters
  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const [selectedBuilding, setSelectedBuilding] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<
    'overview' | 'widgets' | 'ai' | 'users'
  >('overview');
  const [expandedWidget, setExpandedWidget] = useState<string | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      requestSequenceRef.current += 1;
    };
  }, []);

  const fetchAnalytics = useCallback(async () => {
    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;

    try {
      setLoading(true);
      setError(null);

      const user = auth.currentUser;
      if (!user) throw new Error('Not authenticated');

      const token = await user.getIdToken();
      const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string;
      const url = `https://us-central1-${projectId}.cloudfunctions.net/adminAnalytics`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          message?: string;
          error?: string;
        };
        const msg = body.message ?? body.error ?? `HTTP ${response.status}`;
        throw new Error(msg);
      }

      const nextData = (await response.json()) as AnalyticsData;
      if (!isMountedRef.current || requestId !== requestSequenceRef.current) {
        return;
      }
      setData(nextData);
    } catch (err: unknown) {
      console.error('Failed to load analytics', err);
      if (!isMountedRef.current || requestId !== requestSequenceRef.current) {
        return;
      }
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'An error occurred loading analytics data';
      setError(errorMessage);
    } finally {
      if (isMountedRef.current && requestId === requestSequenceRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchAnalytics();
  }, [fetchAnalytics]);

  const { filteredTotalUsers, filteredMonthly, filteredDaily } = useMemo(() => {
    if (!data) {
      return { filteredTotalUsers: 0, filteredMonthly: 0, filteredDaily: 0 };
    }

    if (selectedDomain === 'all' && selectedBuilding === 'all') {
      return {
        filteredTotalUsers: data.users.total,
        filteredMonthly: data.users.monthly,
        filteredDaily: data.users.daily,
      };
    }

    if (selectedDomain === 'all') {
      const bucket = data.users.buildings[selectedBuilding];
      return {
        filteredTotalUsers: bucket?.total ?? 0,
        filteredMonthly: bucket?.monthly ?? 0,
        filteredDaily: bucket?.daily ?? 0,
      };
    }

    if (selectedBuilding === 'all') {
      const bucket = data.users.domains[selectedDomain];
      return {
        filteredTotalUsers: bucket?.total ?? 0,
        filteredMonthly: bucket?.monthly ?? 0,
        filteredDaily: bucket?.daily ?? 0,
      };
    }

    const bucket =
      data.users.domainBuilding[selectedDomain]?.[selectedBuilding];
    return {
      filteredTotalUsers: bucket?.total ?? 0,
      filteredMonthly: bucket?.monthly ?? 0,
      filteredDaily: bucket?.daily ?? 0,
    };
  }, [data, selectedDomain, selectedBuilding]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const uniqueDomains = useMemo(() => {
    if (!data) return [];
    return Object.keys(data.users.domains).filter(Boolean).sort();
  }, [data]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const hasNoBuildingUsers = Boolean(data?.users.buildings.none);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const buildingOptions = useMemo(() => {
    if (!data) return [];
    return Object.keys(data.users.buildings)
      .filter((id) => id !== 'none')
      .sort()
      .map((id) => {
        const building = KNOWN_BUILDINGS.get(id);
        return {
          id,
          name: building?.name ?? `Unknown Building (${id})`,
        };
      });
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

  const sortedWidgets = Object.entries(data.widgets.totalInstances)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15);

  const topAiUsers = data.api.topUsers.slice(0, 10);
  const monthlyEngagementRate =
    filteredTotalUsers > 0 ? (filteredMonthly / filteredTotalUsers) * 100 : 0;
  const dailyEngagementRate =
    filteredTotalUsers > 0 ? (filteredDaily / filteredTotalUsers) * 100 : 0;
  const safeAvgDailyPerUser =
    data.api.activeUsers > 0
      ? data.api.avgDailyCalls / data.api.activeUsers
      : 0;

  return (
    <div className="space-y-8 pb-12">
      {' '}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-2xl font-black text-slate-800">
            Platform Analytics
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Real-time usage and engagement metrics
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <select
            value={selectedDomain}
            onChange={(e) => setSelectedDomain(e.target.value)}
            className="flex-1 md:flex-none px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-brand-blue-primary/20 transition-all"
          >
            <option value="all">All Domains</option>
            {Object.keys(data.users.domains).map((domain) => (
              <option key={domain} value={domain}>
                {domain}
              </option>
            ))}
          </select>

          <select
            value={selectedBuilding}
            onChange={(e) => setSelectedBuilding(e.target.value)}
            disabled={selectedDomain === 'all'}
            className="flex-1 md:flex-none px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-brand-blue-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="all">All Buildings</option>
            {selectedDomain !== 'all' &&
              Object.keys(data.users.domainBuilding[selectedDomain] || {}).map(
                (buildingId) => (
                  <option key={buildingId} value={buildingId}>
                    {KNOWN_BUILDINGS.get(buildingId) || buildingId}
                  </option>
                )
              )}
          </select>

          <button
            onClick={() => void fetchAnalytics()}
            className="p-2 text-slate-400 hover:text-brand-blue-primary hover:bg-brand-blue-primary/10 rounded-lg transition-colors"
            title="Refresh Analytics"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>
      {/* Tabs */}
      <div className="flex space-x-2 border-b border-slate-200 mb-6 pb-2 overflow-x-auto">
        {(['overview', 'widgets', 'ai', 'users'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-t-lg font-semibold transition-colors whitespace-nowrap ${
              activeTab === tab
                ? 'text-brand-blue-primary border-b-2 border-brand-blue-primary bg-slate-50'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            {tab.charAt(0).toUpperCase() +
              tab.slice(1).replace('Ai', 'AI Usage')}
          </button>
        ))}
      </div>
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total Users"
              value={formatNumber(filteredTotalUsers)}
              icon={<Users className="w-6 h-6" />}
              subtitle="Lifetime registered users"
            />
            <StatCard
              title="Monthly Active"
              value={formatNumber(filteredMonthly)}
              icon={<BarChart className="w-6 h-6" />}
              subtitle={`${formatRate(monthlyEngagementRate)} engagement`}
            />
            <StatCard
              title="Daily Active"
              value={formatNumber(filteredDaily)}
              icon={<Zap className="w-6 h-6" />}
              subtitle={`${formatRate(dailyEngagementRate)} engagement`}
            />

            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col items-center justify-center">
              <h4 className="text-sm font-semibold text-slate-500 mb-2 w-full text-left">
                Engagement Rate
              </h4>
              <div className="w-full h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart
                    cx="50%"
                    cy="50%"
                    innerRadius="60%"
                    outerRadius="100%"
                    barSize={10}
                    data={[
                      {
                        name: 'MAU',
                        uv: monthlyEngagementRate,
                        fill: '#14b8a6',
                      },
                    ]}
                    startAngle={90}
                    endAngle={-270}
                  >
                    <RadialBar
                      background
                      clockWise
                      dataKey="uv"
                      cornerRadius={10}
                    />
                    <text
                      x="50%"
                      y="50%"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="text-xl font-bold fill-slate-800"
                    >
                      {formatRate(monthlyEngagementRate)}
                    </text>
                  </RadialBarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-brand-blue-primary" />
              Domain Distribution
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={Object.entries(data.users.domains).map(
                      ([domain, counts]) => ({
                        name: domain,
                        value: counts.total,
                      })
                    )}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }) =>
                      `${name} (${(percent * 100).toFixed(0)}%)`
                    }
                  >
                    {Object.keys(data.users.domains).map((entry, index) => {
                      const COLORS = [
                        '#2d3f89',
                        '#14b8a6',
                        '#f59e0b',
                        '#ef4444',
                        '#8b5cf6',
                        '#ec4899',
                        '#10b981',
                        '#3b82f6',
                      ];
                      return (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      );
                    })}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [formatNumber(value), 'Users']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
      {activeTab === 'widgets' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-brand-blue-primary" />
              Widget Usage Summary
            </h3>
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsBarChart
                  data={sortedWidgets.map(([type, count]) => ({
                    name: WIDGET_LABELS[type] || type,
                    total: count,
                    active: data.widgets.activeInstances[type] || 0,
                  }))}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={120}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value, name) => [
                      formatNumber(value),
                      typeof name === 'string'
                        ? name.charAt(0).toUpperCase() + name.slice(1)
                        : name,
                    ]}
                    contentStyle={{
                      borderRadius: '8px',
                      border: 'none',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                  />
                  <Legend />
                  <Bar
                    dataKey="total"
                    fill="#2d3f89"
                    name="Total Instances"
                    radius={[0, 4, 4, 0]}
                  />
                  <Bar
                    dataKey="active"
                    fill="#14b8a6"
                    name="Active Instances"
                    radius={[0, 4, 4, 0]}
                  />
                </RechartsBarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 overflow-hidden">
            <h3 className="text-lg font-bold text-slate-800 mb-6">
              Widget Details
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="p-3 font-semibold text-slate-600 text-sm">
                      Rank
                    </th>
                    <th className="p-3 font-semibold text-slate-600 text-sm">
                      Widget
                    </th>
                    <th className="p-3 font-semibold text-slate-600 text-sm">
                      Total
                    </th>
                    <th className="p-3 font-semibold text-slate-600 text-sm">
                      Active
                    </th>
                    <th className="p-3 font-semibold text-slate-600 text-sm">
                      Active %
                    </th>
                    <th className="p-3 font-semibold text-slate-600 text-sm">
                      Users
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedWidgets.map(([type, count], index) => {
                    const activeCount = data.widgets.activeInstances[type] || 0;
                    const percentage =
                      count > 0 ? (activeCount / count) * 100 : 0;
                    const isExpanded = expandedWidget === type;
                    const widgetUsers = data.widgets.usersByType?.[type] || [];

                    return (
                      <React.Fragment key={type}>
                        <tr className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="p-3 text-sm text-slate-500 font-medium">
                            #{index + 1}
                          </td>
                          <td className="p-3 text-sm font-semibold text-slate-800">
                            {WIDGET_LABELS[type] || type}
                          </td>
                          <td className="p-3 text-sm text-slate-600">
                            {formatNumber(count)}
                          </td>
                          <td className="p-3 text-sm text-brand-blue-primary font-medium">
                            {formatNumber(activeCount)}
                          </td>
                          <td className="p-3 text-sm text-slate-500">
                            {formatRate(percentage)}
                          </td>
                          <td className="p-3 text-sm">
                            <button
                              onClick={() =>
                                setExpandedWidget(isExpanded ? null : type)
                              }
                              className="text-brand-purple hover:underline flex items-center gap-1"
                            >
                              {widgetUsers.length} Users{' '}
                              {isExpanded ? '▼' : '▶'}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <td colSpan={6} className="p-4">
                              <div className="text-xs text-slate-600 max-h-40 overflow-y-auto grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                {widgetUsers.length > 0 ? (
                                  widgetUsers.map((email, i) => (
                                    <div
                                      key={i}
                                      className="truncate bg-white p-1 rounded border border-slate-200"
                                      title={email}
                                    >
                                      {email}
                                    </div>
                                  ))
                                ) : (
                                  <div className="text-slate-400 italic">
                                    No users found.
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {activeTab === 'ai' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total API Calls"
              value={formatNumber(data.api.totalCalls)}
              icon={<Zap className="w-6 h-6" />}
            />
            <StatCard
              title="Active AI Users"
              value={formatNumber(data.api.activeUsers)}
              icon={<Users className="w-6 h-6" />}
            />
            <StatCard
              title="Avg Daily Calls"
              value={formatNumber(data.api.avgDailyCalls)}
              icon={<BarChart className="w-6 h-6" />}
            />
            <StatCard
              title="Avg Daily Per User"
              value={safeAvgDailyPerUser.toFixed(1)}
              icon={<Users className="w-6 h-6" />}
              subtitle="Derived from avg daily calls / active AI users"
            />
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
              <Zap className="w-5 h-5 text-brand-blue-primary" />
              Top AI Users
            </h3>
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsBarChart
                  data={topAiUsers.map((u) => ({
                    email: u.email,
                    count: u.count,
                    shortEmail: u.email.split('@')[0],
                  }))}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 60, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" />
                  <YAxis
                    dataKey="shortEmail"
                    type="category"
                    width={100}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value) => [formatNumber(value), 'API Calls']}
                    labelFormatter={(label: string, payload: unknown[]) =>
                      (payload[0] as { payload?: { email?: string } })?.payload
                        ?.email ?? label
                    }
                    contentStyle={{
                      borderRadius: '8px',
                      border: 'none',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill="#8b5cf6"
                    name="Calls"
                    radius={[0, 4, 4, 0]}
                  />
                </RechartsBarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
      {activeTab === 'users' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-6">
              Domain Breakdown
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="p-3 font-semibold text-slate-600 text-sm">
                      Domain
                    </th>
                    <th className="p-3 font-semibold text-slate-600 text-sm">
                      Total
                    </th>
                    <th className="p-3 font-semibold text-slate-600 text-sm">
                      Monthly Active
                    </th>
                    <th className="p-3 font-semibold text-slate-600 text-sm">
                      Daily Active
                    </th>
                    <th className="p-3 font-semibold text-slate-600 text-sm">
                      MAU %
                    </th>
                    <th className="p-3 font-semibold text-slate-600 text-sm">
                      DAU %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.users.domains)
                    .sort(([, a], [, b]) => b.total - a.total)
                    .map(([domain, counts]) => (
                      <tr
                        key={domain}
                        className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                      >
                        <td className="p-3 text-sm font-semibold text-slate-800">
                          {domain === 'all' ? 'All Domains' : domain}
                        </td>
                        <td className="p-3 text-sm text-slate-600">
                          {formatNumber(counts.total)}
                        </td>
                        <td className="p-3 text-sm text-brand-blue-primary font-medium">
                          {formatNumber(counts.monthly)}
                        </td>
                        <td className="p-3 text-sm text-brand-purple font-medium">
                          {formatNumber(counts.daily)}
                        </td>
                        <td className="p-3 text-sm text-slate-500">
                          {formatRate(
                            counts.total > 0
                              ? (counts.monthly / counts.total) * 100
                              : 0
                          )}
                        </td>
                        <td className="p-3 text-sm text-slate-500">
                          {formatRate(
                            counts.total > 0
                              ? (counts.daily / counts.total) * 100
                              : 0
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-6">
              Building Breakdown
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="p-3 font-semibold text-slate-600 text-sm">
                      Building Name
                    </th>
                    <th className="p-3 font-semibold text-slate-600 text-sm">
                      Total
                    </th>
                    <th className="p-3 font-semibold text-slate-600 text-sm">
                      Monthly Active
                    </th>
                    <th className="p-3 font-semibold text-slate-600 text-sm">
                      Daily Active
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.users.buildings)
                    .sort(([, a], [, b]) => b.total - a.total)
                    .map(([buildingId, counts]) => (
                      <tr
                        key={buildingId}
                        className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                      >
                        <td className="p-3 text-sm font-semibold text-slate-800">
                          {buildingId === 'unknown'
                            ? 'No building assigned'
                            : KNOWN_BUILDINGS.get(buildingId) || buildingId}
                        </td>
                        <td className="p-3 text-sm text-slate-600">
                          {formatNumber(counts.total)}
                        </td>
                        <td className="p-3 text-sm text-brand-blue-primary font-medium">
                          {formatNumber(counts.monthly)}
                        </td>
                        <td className="p-3 text-sm text-brand-purple font-medium">
                          {formatNumber(counts.daily)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalyticsManager;
