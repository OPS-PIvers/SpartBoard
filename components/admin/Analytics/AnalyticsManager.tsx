import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { auth } from '@/config/firebase';
import {
  BarChart2,
  Users,
  Zap,
  LayoutGrid,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
} from 'lucide-react';
import { BUILDINGS } from '@/config/buildings';
import { TOOLS } from '@/config/tools';

// ─── Types ───────────────────────────────────────────────────────────────────

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
    usersByType?: Record<string, string[]>;
  };
  api: {
    totalCalls: number;
    activeUsers: number;
    topUsers: { uid: string; count: number; email: string }[];
    avgDailyCalls: number;
    avgDailyCallsPerUser: number;
  };
}

type AnalyticsTab = 'overview' | 'widgets' | 'ai' | 'users';

// ─── Constants ───────────────────────────────────────────────────────────────

const WIDGET_LABELS: Record<string, string> = TOOLS.reduce(
  (acc, tool) => {
    acc[tool.type] = tool.label;
    return acc;
  },
  {} as Record<string, string>
);

const KNOWN_BUILDINGS = new Map(BUILDINGS.map((b) => [b.id, b]));

const PIE_COLORS = [
  '#2d3f89',
  '#4356a0',
  '#6d80c0',
  '#9aaad8',
  '#ad2122',
  '#c13435',
  '#e05d5e',
  '#14b8a6',
];

const NUMBER_FORMATTER = new Intl.NumberFormat();
const formatNumber = (value: number) => NUMBER_FORMATTER.format(value);
const formatRate = (value: number) =>
  Number.isFinite(value) ? `${value.toFixed(1)}%` : '0.0%';

// ─── Sub-components ───────────────────────────────────────────────────────────

const StatCard: React.FC<{
  title: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle?: string;
  accent?: string;
}> = ({
  title,
  value,
  icon,
  subtitle,
  accent = 'text-brand-blue-primary bg-brand-blue-primary/10',
}) => (
  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
    <div className="flex justify-between items-start mb-4">
      <div className={`p-3 rounded-xl ${accent}`}>{icon}</div>
    </div>
    <div>
      <h4 className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">
        {title}
      </h4>
      <div className="text-3xl font-black text-slate-800">{value}</div>
      {subtitle && (
        <div className="text-sm text-slate-500 mt-1">{subtitle}</div>
      )}
    </div>
  </div>
);

// ─── Tab: Overview ────────────────────────────────────────────────────────────

const OverviewPanel: React.FC<{
  data: AnalyticsData;
  filteredTotalUsers: number;
  filteredMonthly: number;
  filteredDaily: number;
}> = ({ data, filteredTotalUsers, filteredMonthly, filteredDaily }) => {
  const monthlyRate =
    filteredTotalUsers > 0 ? (filteredMonthly / filteredTotalUsers) * 100 : 0;
  const dailyRate =
    filteredTotalUsers > 0 ? (filteredDaily / filteredTotalUsers) * 100 : 0;

  const domainPieData = useMemo(
    () =>
      Object.entries(data.users.domains)
        .map(([domain, counts]) => ({ name: domain, value: counts.total }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8),
    [data.users.domains]
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Total Users"
          value={formatNumber(filteredTotalUsers)}
          icon={<Users className="w-5 h-5" />}
          subtitle="Lifetime registered users"
        />
        <StatCard
          title="Monthly Active"
          value={formatNumber(filteredMonthly)}
          icon={<BarChart2 className="w-5 h-5" />}
          subtitle={`${formatRate(monthlyRate)} of total`}
        />
        <StatCard
          title="Daily Active"
          value={formatNumber(filteredDaily)}
          icon={<Zap className="w-5 h-5" />}
          subtitle={`${formatRate(dailyRate)} of total`}
        />
      </div>

      {domainPieData.length > 0 && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">
            Users by Domain
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={domainPieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={({
                  name,
                  percent,
                }: {
                  name?: string;
                  percent?: number;
                }) => `${name ?? ''} (${((percent ?? 0) * 100).toFixed(0)}%)`}
              >
                {domainPieData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => [
                  formatNumber(Number(value ?? 0)),
                  'Users',
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

// ─── Tab: Widgets ─────────────────────────────────────────────────────────────

const WidgetsPanel: React.FC<{ data: AnalyticsData }> = ({ data }) => {
  const [expandedWidget, setExpandedWidget] = useState<string | null>(null);

  const widgetBarData = useMemo(
    () =>
      Object.entries(data.widgets.totalInstances)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 20)
        .map(([type, total]) => ({
          name: WIDGET_LABELS[type] ?? type,
          type,
          total,
          active: data.widgets.activeInstances[type] ?? 0,
        })),
    [data.widgets]
  );

  const toggleWidget = (type: string) => {
    setExpandedWidget((prev) => (prev === type ? null : type));
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-5">
          Widget Adoption (Top 20)
        </h3>
        <ResponsiveContainer
          width="100%"
          height={Math.max(300, widgetBarData.length * 34)}
        >
          <BarChart
            data={widgetBarData}
            layout="vertical"
            margin={{ left: 130, right: 50, top: 4, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={formatNumber}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={125}
              tick={{ fontSize: 12 }}
            />
            <Tooltip
              formatter={(value, name) => [
                formatNumber(Number(value ?? 0)),
                String(name ?? ''),
              ]}
            />
            <Legend />
            <Bar
              dataKey="total"
              name="Total Instances"
              fill="#2d3f89"
              radius={[0, 4, 4, 0]}
            />
            <Bar
              dataKey="active"
              name="Active (30d)"
              fill="#14b8a6"
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
            Widget Details &amp; User Drilldown
          </h3>
        </div>
        <div className="divide-y divide-slate-100">
          {widgetBarData.map(({ type, name, total, active }, index) => {
            const activeRate = total > 0 ? (active / total) * 100 : 0;
            const users = data.widgets.usersByType?.[type] ?? null;
            const isExpanded = expandedWidget === type;

            return (
              <div key={type}>
                <button
                  type="button"
                  onClick={() => toggleWidget(type)}
                  className="w-full flex items-center gap-4 px-6 py-3 hover:bg-slate-50 transition-colors text-left"
                >
                  <span className="w-6 text-center text-xs font-bold text-slate-400">
                    #{index + 1}
                  </span>
                  <span className="flex-1 font-semibold text-slate-700 text-sm">
                    {name}
                  </span>
                  <span className="text-sm text-slate-500 w-20 text-right">
                    {formatNumber(total)} total
                  </span>
                  <span className="text-sm text-teal-600 font-medium w-24 text-right">
                    {formatNumber(active)} active
                  </span>
                  <span className="text-sm text-slate-400 w-16 text-right">
                    {formatRate(activeRate)}
                  </span>
                  <span className="text-xs text-slate-400 w-20 text-right">
                    {users !== null
                      ? `${users.length} user${users.length !== 1 ? 's' : ''}`
                      : '—'}
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </button>
                {isExpanded && (
                  <div className="px-6 py-4 bg-slate-50 border-t border-slate-100">
                    {users === null ? (
                      <p className="text-sm text-slate-500 italic">
                        User drilldown available after deploying the latest
                        Cloud Function.
                      </p>
                    ) : users.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        No users found with this widget.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {users.map((email) => (
                          <span
                            key={email}
                            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-brand-blue-primary/10 text-brand-blue-primary"
                          >
                            {email}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {widgetBarData.length === 0 && (
            <div className="px-6 py-10 text-center text-slate-500 text-sm">
              No widget data available yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Tab: AI Usage ────────────────────────────────────────────────────────────

const AiPanel: React.FC<{ data: AnalyticsData }> = ({ data }) => {
  const safeAvgDailyPerUser =
    data.api.activeUsers > 0
      ? data.api.avgDailyCalls / data.api.activeUsers
      : 0;

  const aiBarData = useMemo(
    () =>
      data.api.topUsers.slice(0, 10).map((u) => ({
        name: u.email.includes('@') ? u.email.split('@')[0] : u.email,
        email: u.email,
        calls: u.count,
      })),
    [data.api.topUsers]
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total API Calls"
          value={formatNumber(data.api.totalCalls)}
          icon={<Zap className="w-5 h-5" />}
          accent="text-purple-600 bg-purple-100"
        />
        <StatCard
          title="Active AI Users"
          value={formatNumber(data.api.activeUsers)}
          icon={<Users className="w-5 h-5" />}
          accent="text-purple-600 bg-purple-100"
        />
        <StatCard
          title="Avg Daily Calls"
          value={formatNumber(data.api.avgDailyCalls)}
          icon={<BarChart2 className="w-5 h-5" />}
          accent="text-purple-600 bg-purple-100"
        />
        <StatCard
          title="Avg Per User/Day"
          value={safeAvgDailyPerUser.toFixed(1)}
          icon={<Users className="w-5 h-5" />}
          accent="text-purple-600 bg-purple-100"
        />
      </div>

      {aiBarData.length > 0 && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-5">
            Top AI Users
          </h3>
          <ResponsiveContainer
            width="100%"
            height={Math.max(240, aiBarData.length * 36)}
          >
            <BarChart
              data={aiBarData}
              layout="vertical"
              margin={{ left: 110, right: 60, top: 4, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={formatNumber}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={105}
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                formatter={(value) => [
                  formatNumber(Number(value ?? 0)),
                  'API Calls',
                ]}
                labelFormatter={(label) => {
                  const found = aiBarData.find((u) => u.name === String(label));
                  return found?.email ?? String(label ?? '');
                }}
              />
              <Bar
                dataKey="calls"
                name="API Calls"
                fill="#ad2122"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {aiBarData.length === 0 && (
        <div className="bg-white rounded-2xl p-10 border border-slate-200 text-center text-slate-500">
          No AI usage data available yet.
        </div>
      )}
    </div>
  );
};

// ─── Tab: Users ───────────────────────────────────────────────────────────────

type SortKey = 'name' | 'total' | 'monthly' | 'daily' | 'monthlyRate';

const SortHeader: React.FC<{
  label: string;
  sortKey: SortKey;
  current: { key: SortKey; dir: 'asc' | 'desc' };
  onToggle: (key: SortKey) => void;
  align?: string;
}> = ({ label, sortKey, current, onToggle, align = 'text-right' }) => (
  <th
    className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider ${align}`}
  >
    <button
      type="button"
      onClick={() => onToggle(sortKey)}
      className={`inline-flex items-center gap-1 transition-colors hover:text-slate-800 ${
        current.key === sortKey ? 'text-brand-blue-primary' : ''
      }`}
    >
      {label}
      <ArrowUpDown className="w-3 h-3" />
    </button>
  </th>
);

type SortableRow = { name: string } & Record<string, number | string>;

function sortRows<T extends SortableRow>(
  rows: T[],
  { key, dir }: { key: SortKey; dir: 'asc' | 'desc' }
): T[] {
  return [...rows].sort((a, b) => {
    const av = key === 'name' ? a.name : a[key];
    const bv = key === 'name' ? b.name : b[key];
    if (typeof av === 'string' && typeof bv === 'string') {
      return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    return dir === 'asc'
      ? (av as number) - (bv as number)
      : (bv as number) - (av as number);
  });
}

const UsersPanel: React.FC<{ data: AnalyticsData }> = ({ data }) => {
  const [domainSort, setDomainSort] = useState<{
    key: SortKey;
    dir: 'asc' | 'desc';
  }>({ key: 'total', dir: 'desc' });
  const [buildingSort, setBuildingSort] = useState<{
    key: SortKey;
    dir: 'asc' | 'desc';
  }>({ key: 'total', dir: 'desc' });

  const domainRows = useMemo(
    () =>
      sortRows(
        Object.entries(data.users.domains).map(([domain, counts]) => ({
          name: domain,
          ...counts,
          monthlyRate:
            counts.total > 0 ? (counts.monthly / counts.total) * 100 : 0,
        })),
        domainSort
      ),
    [data.users.domains, domainSort]
  );

  const buildingRows = useMemo(
    () =>
      sortRows(
        Object.entries(data.users.buildings).map(([id, counts]) => ({
          name:
            id === 'none'
              ? 'No Building Assigned'
              : (KNOWN_BUILDINGS.get(id)?.name ?? `Unknown (${id})`),
          ...counts,
          monthlyRate:
            counts.total > 0 ? (counts.monthly / counts.total) * 100 : 0,
        })),
        buildingSort
      ),
    [data.users.buildings, buildingSort]
  );

  const toggleDomainSort = (key: SortKey) => {
    setDomainSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        : { key, dir: 'desc' }
    );
  };

  const toggleBuildingSort = (key: SortKey) => {
    setBuildingSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        : { key, dir: 'desc' }
    );
  };

  return (
    <div className="space-y-6">
      {/* Domain Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
            Users by Domain
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Multi-district: each school district appears as its own domain row.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <SortHeader
                  label="Domain"
                  sortKey="name"
                  current={domainSort}
                  onToggle={toggleDomainSort}
                  align="text-left"
                />
                <SortHeader
                  label="Total"
                  sortKey="total"
                  current={domainSort}
                  onToggle={toggleDomainSort}
                />
                <SortHeader
                  label="Monthly Active"
                  sortKey="monthly"
                  current={domainSort}
                  onToggle={toggleDomainSort}
                />
                <SortHeader
                  label="MAU %"
                  sortKey="monthlyRate"
                  current={domainSort}
                  onToggle={toggleDomainSort}
                />
                <SortHeader
                  label="Daily Active"
                  sortKey="daily"
                  current={domainSort}
                  onToggle={toggleDomainSort}
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {domainRows.map((row) => (
                <tr
                  key={row.name}
                  className="hover:bg-slate-50 transition-colors"
                >
                  <td className="px-4 py-3 text-sm font-medium text-slate-800">
                    {row.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 text-right">
                    {formatNumber(row.total)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 text-right">
                    {formatNumber(row.monthly)}
                  </td>
                  <td className="px-4 py-3 text-sm text-teal-600 font-medium text-right">
                    {formatRate(row.monthlyRate)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 text-right">
                    {formatNumber(row.daily)}
                  </td>
                </tr>
              ))}
              {domainRows.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-slate-500 text-sm"
                  >
                    No domain data available yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Building Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
            Users by Building
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <SortHeader
                  label="Building"
                  sortKey="name"
                  current={buildingSort}
                  onToggle={toggleBuildingSort}
                  align="text-left"
                />
                <SortHeader
                  label="Total"
                  sortKey="total"
                  current={buildingSort}
                  onToggle={toggleBuildingSort}
                />
                <SortHeader
                  label="Monthly Active"
                  sortKey="monthly"
                  current={buildingSort}
                  onToggle={toggleBuildingSort}
                />
                <SortHeader
                  label="MAU %"
                  sortKey="monthlyRate"
                  current={buildingSort}
                  onToggle={toggleBuildingSort}
                />
                <SortHeader
                  label="Daily Active"
                  sortKey="daily"
                  current={buildingSort}
                  onToggle={toggleBuildingSort}
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {buildingRows.map((row) => (
                <tr
                  key={row.name}
                  className="hover:bg-slate-50 transition-colors"
                >
                  <td className="px-4 py-3 text-sm font-medium text-slate-800">
                    {row.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 text-right">
                    {formatNumber(row.total)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 text-right">
                    {formatNumber(row.monthly)}
                  </td>
                  <td className="px-4 py-3 text-sm text-teal-600 font-medium text-right">
                    {formatRate(row.monthlyRate)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 text-right">
                    {formatNumber(row.daily)}
                  </td>
                </tr>
              ))}
              {buildingRows.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-slate-500 text-sm"
                  >
                    No building data available yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const AnalyticsManager: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<AnalyticsTab>('overview');
  const requestSequenceRef = useRef(0);
  const isMountedRef = useRef(true);

  // Filters
  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const [selectedBuilding, setSelectedBuilding] = useState<string>('all');

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
      setError(
        err instanceof Error
          ? err.message
          : 'An error occurred loading analytics data'
      );
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
    if (!data)
      return { filteredTotalUsers: 0, filteredMonthly: 0, filteredDaily: 0 };

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

  const uniqueDomains = useMemo(
    () => (data ? Object.keys(data.users.domains).filter(Boolean).sort() : []),
    [data]
  );
  const buildingOptions = useMemo(
    () =>
      data
        ? Object.keys(data.users.buildings)
            .filter((id) => id !== 'none')
            .sort()
            .map((id) => ({
              id,
              name: KNOWN_BUILDINGS.get(id)?.name ?? `Unknown (${id})`,
            }))
        : [],
    [data]
  );
  const hasNoBuildingUsers = Boolean(data?.users.buildings.none);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-blue-primary mr-3" />
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

  const TABS: { id: AnalyticsTab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'overview',
      label: 'Overview',
      icon: <LayoutGrid className="w-4 h-4" />,
    },
    {
      id: 'widgets',
      label: 'Widgets',
      icon: <BarChart2 className="w-4 h-4" />,
    },
    { id: 'ai', label: 'AI Usage', icon: <Zap className="w-4 h-4" /> },
    { id: 'users', label: 'Users', icon: <Users className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-5 pb-12">
      {/* Header: filters + refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <select
            value={selectedDomain}
            onChange={(e) => setSelectedDomain(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-blue-primary bg-white"
          >
            <option value="all">All Domains</option>
            {uniqueDomains.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select
            value={selectedBuilding}
            onChange={(e) => setSelectedBuilding(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-blue-primary bg-white"
          >
            <option value="all">All Buildings</option>
            {hasNoBuildingUsers && (
              <option value="none">No Building Assigned</option>
            )}
            {buildingOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void fetchAnalytics()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSelectedTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
              selectedTab === tab.id
                ? 'border-brand-blue-primary text-brand-blue-primary'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div className="animate-in fade-in duration-200">
        {selectedTab === 'overview' && (
          <OverviewPanel
            data={data}
            filteredTotalUsers={filteredTotalUsers}
            filteredMonthly={filteredMonthly}
            filteredDaily={filteredDaily}
          />
        )}
        {selectedTab === 'widgets' && <WidgetsPanel data={data} />}
        {selectedTab === 'ai' && <AiPanel data={data} />}
        {selectedTab === 'users' && <UsersPanel data={data} />}
      </div>
    </div>
  );
};
