import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { auth } from '@/config/firebase';
import {
  AlertCircle,
  ArrowDownUp,
  ArrowUp,
  ArrowDown,
  BarChart2,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  RefreshCw,
  School,
  Search,
  Users,
  WandSparkles,
  Zap,
} from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { BUILDINGS } from '@/config/buildings';
import { TOOLS } from '@/config/tools';

interface EngagementCounts {
  total: number;
  monthly: number;
  daily: number;
}

interface KpiUser {
  email: string;
  buildings: string[];
  lastSignInMs: number;
  lastEditMs: number;
  hasDashboard: boolean;
  isMonthlyActive: boolean;
  isDailyActive: boolean;
}

type KpiCategory =
  | 'registered'
  | 'withDashboards'
  | 'monthlyActive'
  | 'dailyActive';

const KPI_TITLES: Record<KpiCategory, string> = {
  registered: 'Registered Users',
  withDashboards: 'Users with Dashboards',
  monthlyActive: 'Monthly Active Users',
  dailyActive: 'Daily Active Users',
};

interface AnalyticsData {
  users: {
    total: number;
    registered: number;
    registeredIsFallback?: boolean;
    monthly: number;
    daily: number;
    withDashboards: number;
    domains: Record<string, EngagementCounts>;
    buildings: Record<string, EngagementCounts>;
    domainBuilding: Record<string, Record<string, EngagementCounts>>;
    userList?: KpiUser[];
  };
  widgets: {
    totalInstances: Record<string, number>;
    activeInstances: Record<string, number>;
    usersByType?: Record<string, { count: number; emails: string[] }>;
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
}

type AnalyticsTab = 'overview' | 'widgets' | 'ai' | 'users';

const WIDGET_LABELS: Record<string, string> = TOOLS.reduce(
  (acc, tool) => {
    acc[tool.type] = tool.label;
    return acc;
  },
  {} as Record<string, string>
);

const KNOWN_BUILDINGS = new Map(BUILDINGS.map((b) => [b.id, b]));
const _CHART_COLORS = [
  '#2d3f89',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#ef4444',
  '#06b6d4',
  '#84cc16',
  '#f97316',
  '#64748b',
];

const NUMBER_FORMATTER = new Intl.NumberFormat();
const formatNumber = (value: number) => NUMBER_FORMATTER.format(value);
const formatRate = (value: number) =>
  Number.isFinite(value) ? `${value.toFixed(1)}%` : '0.0%';

const chartTheme = {
  grid: '#e2e8f0',
  axisText: '#64748b',
};

const CustomTooltip = ({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ name?: string; value?: number | string }>;
}) => {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-slate-200 shadow-lg">
      {label != null && <p className="mb-1 text-slate-400">{label}</p>}
      <div className="space-y-1">
        {payload.map((entry, idx) => (
          <p key={`${entry.name ?? 'item'}-${idx}`} className="font-medium">
            {entry.name}: {formatNumber(Number(entry.value ?? 0))}
          </p>
        ))}
      </div>
    </div>
  );
};

const KpiCard: React.FC<{
  title: string;
  value: string | number;
  subtitle?: string;
  accentColor: string;
  accentBg: string;
  icon: React.ReactNode;
  onClick?: () => void;
}> = ({ title, value, subtitle, accentColor, accentBg, icon, onClick }) => (
  <div
    className={`bg-white border border-slate-200 rounded-2xl p-5 shadow-sm relative overflow-hidden${onClick ? ' cursor-pointer hover:border-slate-300 hover:shadow-md transition-all' : ''}`}
    onClick={onClick}
    onKeyDown={
      onClick
        ? (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onClick();
            }
          }
        : undefined
    }
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
  >
    <div
      className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
      style={{ background: accentColor }}
    />
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {title}
        </p>
        <p className="text-3xl font-black text-slate-900 mt-1">{value}</p>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      <div className="p-3 rounded-xl" style={{ background: accentBg }}>
        {icon}
      </div>
    </div>
  </div>
);

const PanelCard: React.FC<React.PropsWithChildren<{ title: string }>> = ({
  title,
  children,
}) => (
  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
    <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">
      {title}
    </h3>
    {children}
  </div>
);

const OverviewPanel: React.FC<{
  data: AnalyticsData;
  filteredTotalUsers: number;
  filteredMonthly: number;
  filteredDaily: number;
  registeredUsers: number;
  registeredIsFallback: boolean;
  usersWithDashboards: number;
  dashboards: { total: number; avgWidgetsPerDashboard: number };
  onKpiClick?: (category: KpiCategory) => void;
}> = ({
  data,
  filteredTotalUsers,
  filteredMonthly,
  filteredDaily,
  registeredUsers,
  registeredIsFallback,
  usersWithDashboards,
  dashboards,
  onKpiClick,
}) => {
  const funnel = useMemo(
    () => [
      { name: 'Registered', value: registeredUsers, fill: '#2d3f89' },
      { name: 'With Dashboards', value: usersWithDashboards, fill: '#10b981' },
      { name: 'Monthly Active', value: filteredMonthly, fill: '#3b82f6' },
      { name: 'Daily Active', value: filteredDaily, fill: '#f59e0b' },
    ],
    [filteredDaily, filteredMonthly, registeredUsers, usersWithDashboards]
  );

  const domainRows = useMemo(
    () =>
      Object.entries(data.users.domains)
        .map(([domain, counts]) => ({
          domain,
          total: counts.total,
          monthly: counts.monthly,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10),
    [data.users.domains]
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          title={registeredIsFallback ? 'Known User Docs' : 'Registered Users'}
          value={formatNumber(registeredUsers)}
          subtitle={
            registeredIsFallback
              ? 'Fallback: Firestore user profiles'
              : 'Firebase Auth'
          }
          accentColor="#4356a0"
          accentBg="rgba(67,86,160,0.2)"
          icon={<Users className="w-5 h-5 text-blue-700" />}
          onClick={onKpiClick ? () => onKpiClick('registered') : undefined}
        />
        <KpiCard
          title="Users with Dashboards"
          value={formatNumber(usersWithDashboards)}
          subtitle="Unique dashboard owners"
          accentColor="#10b981"
          accentBg="rgba(16,185,129,0.12)"
          icon={<LayoutGrid className="w-5 h-5 text-emerald-600" />}
          onClick={onKpiClick ? () => onKpiClick('withDashboards') : undefined}
        />
        <KpiCard
          title="Monthly Active"
          value={formatNumber(filteredMonthly)}
          subtitle={`${formatRate(filteredTotalUsers > 0 ? (filteredMonthly / filteredTotalUsers) * 100 : 0)} of visible users`}
          accentColor="#3b82f6"
          accentBg="rgba(59,130,246,0.12)"
          icon={<BarChart2 className="w-5 h-5 text-blue-500" />}
          onClick={onKpiClick ? () => onKpiClick('monthlyActive') : undefined}
        />
        <KpiCard
          title="Daily Active"
          value={formatNumber(filteredDaily)}
          subtitle={`${formatRate(filteredTotalUsers > 0 ? (filteredDaily / filteredTotalUsers) * 100 : 0)} of visible users`}
          accentColor="#f59e0b"
          accentBg="rgba(245,158,11,0.12)"
          icon={<Zap className="w-5 h-5 text-amber-500" />}
          onClick={onKpiClick ? () => onKpiClick('dailyActive') : undefined}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <KpiCard
          title="Total Dashboards"
          value={formatNumber(dashboards.total)}
          accentColor="#6366f1"
          accentBg="rgba(99,102,241,0.12)"
          icon={<LayoutGrid className="w-5 h-5 text-indigo-500" />}
        />
        <KpiCard
          title="Avg Widgets / Dashboard"
          value={dashboards.avgWidgetsPerDashboard.toFixed(1)}
          accentColor="#f59e0b"
          accentBg="rgba(245,158,11,0.12)"
          icon={<WandSparkles className="w-5 h-5 text-amber-500" />}
        />
      </div>

      <PanelCard title="User Engagement Funnel">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart
            data={funnel}
            layout="vertical"
            margin={{ left: 20, right: 15 }}
          >
            <CartesianGrid stroke={chartTheme.grid} horizontal={false} />
            <XAxis
              type="number"
              tick={{ fill: chartTheme.axisText, fontSize: 12 }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={130}
              tick={{ fill: chartTheme.axisText, fontSize: 12 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" barSize={24} radius={[0, 8, 8, 0]}>
              {funnel.map((row, idx) => (
                <Cell key={`${row.name}-${idx}`} fill={row.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </PanelCard>

      <PanelCard title="Top Domains (Total vs Monthly Active)">
        <ResponsiveContainer
          width="100%"
          height={Math.max(280, domainRows.length * 34)}
        >
          <BarChart
            data={domainRows}
            layout="vertical"
            margin={{ left: 10, right: 24 }}
          >
            <CartesianGrid stroke={chartTheme.grid} horizontal={false} />
            <XAxis
              type="number"
              tick={{ fill: chartTheme.axisText, fontSize: 12 }}
            />
            <YAxis
              type="category"
              dataKey="domain"
              width={130}
              tick={{ fill: chartTheme.axisText, fontSize: 12 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ color: chartTheme.axisText }} />
            <Bar
              dataKey="total"
              fill="#2d3f89"
              name="Total"
              radius={[0, 8, 8, 0]}
              barSize={16}
            />
            <Bar
              dataKey="monthly"
              fill="#3b82f6"
              name="Monthly Active"
              radius={[0, 8, 8, 0]}
              barSize={16}
            />
          </BarChart>
        </ResponsiveContainer>
      </PanelCard>
    </div>
  );
};

type WidgetSortKey = 'name' | 'total' | 'active' | 'activeRate' | 'users';

const WidgetsPanel: React.FC<{ data: AnalyticsData }> = ({ data }) => {
  const [expandedWidget, setExpandedWidget] = useState<string | null>(null);
  const [widgetSearch, setWidgetSearch] = useState('');
  const [emailSearch, setEmailSearch] = useState('');
  const [widgetSort, setWidgetSort] = useState<{
    key: WidgetSortKey;
    dir: 'asc' | 'desc';
  }>({ key: 'total', dir: 'desc' });

  const rows = useMemo(() => {
    const usersByType = data.widgets.usersByType;
    const usersAvailable = usersByType !== undefined;
    return Object.entries(data.widgets.totalInstances)
      .map(([type, total]) => {
        const active = data.widgets.activeInstances[type] ?? 0;
        const usersEntry = usersByType?.[type];
        return {
          type,
          name: WIDGET_LABELS[type] ?? type,
          total,
          active,
          usersAvailable,
          users: usersEntry?.count ?? 0,
          emails: usersEntry?.emails ?? [],
          activeRate: total > 0 ? (active / total) * 100 : 0,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [data.widgets]);

  const filteredRows = useMemo(() => {
    let result = rows;
    if (widgetSearch) {
      const q = widgetSearch.toLowerCase();
      result = result.filter((r) => r.name.toLowerCase().includes(q));
    }
    const { key, dir } = widgetSort;
    return [...result].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (typeof av === 'string' && typeof bv === 'string') {
        return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return dir === 'asc' ? Number(av) - Number(bv) : Number(bv) - Number(av);
    });
  }, [rows, widgetSearch, widgetSort]);

  const chartRows = useMemo(
    () =>
      rows.slice(0, 12).map((r) => ({
        name: r.name,
        total: r.total,
        active: r.active,
        users: r.users,
      })),
    [rows]
  );

  const toggleWidgetSort = (key: WidgetSortKey) => {
    setWidgetSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        : { key, dir: 'desc' }
    );
  };

  const widgetHeader = (
    label: string,
    key: WidgetSortKey,
    align = 'text-right'
  ) => {
    const ariaSort =
      widgetSort.key === key
        ? widgetSort.dir === 'desc'
          ? 'descending'
          : 'ascending'
        : 'none';
    return (
      <th
        scope="col"
        aria-sort={ariaSort}
        className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 ${align}`}
      >
        <button
          type="button"
          onClick={() => toggleWidgetSort(key)}
          className="hover:text-slate-900 transition-colors"
        >
          {label}
          {widgetSort.key === key
            ? widgetSort.dir === 'desc'
              ? ' ↓'
              : ' ↑'
            : ' ↕'}
        </button>
      </th>
    );
  };

  return (
    <div className="space-y-5">
      <PanelCard title="Top Widgets (Total / Active / Users)">
        <ResponsiveContainer
          width="100%"
          height={Math.max(300, chartRows.length * 38)}
        >
          <BarChart
            data={chartRows}
            layout="vertical"
            margin={{ left: 120, right: 30 }}
          >
            <CartesianGrid stroke={chartTheme.grid} horizontal={false} />
            <XAxis
              type="number"
              tick={{ fill: chartTheme.axisText, fontSize: 12 }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              tick={{ fill: chartTheme.axisText, fontSize: 11 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ color: chartTheme.axisText }} />
            <Bar
              dataKey="total"
              name="Total"
              fill="#2d3f89"
              barSize={20}
              radius={[0, 8, 8, 0]}
            />
            <Bar
              dataKey="active"
              name="Active (30d)"
              fill="#3b82f6"
              barSize={20}
              radius={[0, 8, 8, 0]}
            />
            <Bar
              dataKey="users"
              name="Users"
              fill="#10b981"
              barSize={20}
              radius={[0, 8, 8, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </PanelCard>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
            All Widgets
          </h3>
          <input
            type="text"
            placeholder="Search widgets..."
            value={widgetSearch}
            onChange={(e) => setWidgetSearch(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 bg-white outline-none focus:ring-2 focus:ring-blue-500 w-48"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 text-right w-12"
                >
                  #
                </th>
                {widgetHeader('Widget Name', 'name', 'text-left')}
                {widgetHeader('Total', 'total')}
                {widgetHeader('Active (30d)', 'active')}
                {widgetHeader('Active %', 'activeRate')}
                {widgetHeader('Users', 'users')}
                <th
                  scope="col"
                  className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 w-16"
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map((row, index) => {
                const expanded = expandedWidget === row.type;
                const filteredEmails = emailSearch
                  ? row.emails.filter((e) =>
                      e.toLowerCase().includes(emailSearch.toLowerCase())
                    )
                  : [...row.emails].sort();
                return (
                  <React.Fragment key={row.type}>
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-sm text-slate-400 text-right">
                        {index + 1}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">
                        {row.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700 text-right font-semibold">
                        {formatNumber(row.total)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700 text-right">
                        {formatNumber(row.active)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2 w-28 justify-end">
                          <span className="text-sm text-slate-700">
                            {formatRate(row.activeRate)}
                          </span>
                          <span className="relative h-1.5 w-12 rounded-full bg-slate-200 overflow-hidden">
                            <span
                              className="absolute inset-y-0 left-0 rounded-full bg-blue-500"
                              style={{
                                width: `${Math.min(100, row.activeRate)}%`,
                              }}
                            />
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700 text-right">
                        {row.usersAvailable ? formatNumber(row.users) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          disabled={!row.usersAvailable}
                          onClick={() => {
                            setExpandedWidget((prev) =>
                              prev === row.type ? null : row.type
                            );
                            setEmailSearch('');
                          }}
                          className="text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          {expanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={7} className="px-6 py-3 bg-slate-50">
                          {!row.usersAvailable ? (
                            <p className="text-sm text-slate-500">
                              User drilldown is unavailable until the latest
                              Cloud Function is deployed.
                            </p>
                          ) : row.emails.length === 0 ? (
                            <p className="text-sm text-slate-500">
                              No users found with this widget.
                            </p>
                          ) : (
                            <div className="space-y-2">
                              <input
                                type="text"
                                placeholder="Search emails..."
                                value={emailSearch}
                                onChange={(e) => setEmailSearch(e.target.value)}
                                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 bg-white outline-none focus:ring-2 focus:ring-blue-500 w-64"
                              />
                              <div className="max-h-48 overflow-y-auto space-y-0.5">
                                {filteredEmails.map((email) => (
                                  <div
                                    key={email}
                                    className="text-sm text-slate-700 py-0.5 px-1"
                                  >
                                    {email}
                                  </div>
                                ))}
                                {filteredEmails.length === 0 && (
                                  <p className="text-sm text-slate-400 py-1">
                                    No matching emails.
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {filteredRows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-slate-400 text-sm"
                  >
                    No widgets found.
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

const AI_FEATURE_LABELS: Record<string, string> = {
  'smart-poll': 'Smart Poll',
  'embed-mini-app': 'Mini App',
  'video-activity-audio-transcription': 'Video Activity',
  quiz: 'Quiz Generation',
  ocr: 'OCR',
  'guided-learning': 'Guided Learning',
};

const AiPanel: React.FC<{ data: AnalyticsData }> = ({ data }) => {
  const featureRows = useMemo(
    () =>
      Object.entries(data.api.byFeature ?? {})
        .map(([feature, count]) => ({
          feature: AI_FEATURE_LABELS[feature] ?? feature,
          count,
        }))
        .sort((a, b) => b.count - a.count),
    [data.api.byFeature]
  );

  const userRows = useMemo(
    () =>
      data.api.topUsers.slice(0, 10).map((u) => ({
        email: u.email,
        calls: u.count,
      })),
    [data.api.topUsers]
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          title="Total API Calls"
          value={formatNumber(data.api.totalCalls)}
          accentColor="#ad2122"
          accentBg="rgba(173,33,34,0.12)"
          icon={<Zap className="w-5 h-5 text-red-600" />}
        />
        <KpiCard
          title="Active AI Users"
          value={formatNumber(data.api.activeUsers)}
          accentColor="#c13435"
          accentBg="rgba(193,52,53,0.12)"
          icon={<Users className="w-5 h-5 text-red-500" />}
        />
        <KpiCard
          title="Avg Daily Calls"
          value={formatNumber(data.api.avgDailyCalls)}
          accentColor="#6366f1"
          accentBg="rgba(99,102,241,0.12)"
          icon={<BarChart2 className="w-5 h-5 text-indigo-500" />}
        />
        <KpiCard
          title="Avg Per User/Day"
          value={data.api.avgDailyCallsPerUser.toFixed(1)}
          accentColor="#10b981"
          accentBg="rgba(16,185,129,0.12)"
          icon={<WandSparkles className="w-5 h-5 text-emerald-500" />}
        />
      </div>

      <PanelCard title="AI Feature Breakdown">
        {featureRows.length === 0 ? (
          <p className="text-sm text-slate-500">
            No feature-level usage data available yet.
          </p>
        ) : (
          <ResponsiveContainer
            width="100%"
            height={Math.max(260, featureRows.length * 36)}
          >
            <BarChart
              data={featureRows}
              layout="vertical"
              margin={{ left: 120, right: 20 }}
            >
              <CartesianGrid stroke={chartTheme.grid} horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: chartTheme.axisText, fontSize: 12 }}
              />
              <YAxis
                type="category"
                dataKey="feature"
                width={120}
                tick={{ fill: chartTheme.axisText, fontSize: 12 }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="count"
                fill="#ad2122"
                radius={[0, 8, 8, 0]}
                barSize={20}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </PanelCard>

      <PanelCard title="Top AI Users">
        {userRows.length === 0 ? (
          <p className="text-sm text-slate-500">No AI users found.</p>
        ) : (
          <ResponsiveContainer
            width="100%"
            height={Math.max(260, userRows.length * 36)}
          >
            <BarChart
              data={userRows}
              layout="vertical"
              margin={{ left: 90, right: 20 }}
            >
              <defs>
                <linearGradient
                  id="aiUsersGradient"
                  x1="0"
                  y1="0"
                  x2="1"
                  y2="0"
                >
                  <stop offset="0%" stopColor="#ad2122" />
                  <stop offset="100%" stopColor="#c13435" />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={chartTheme.grid} horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: chartTheme.axisText, fontSize: 12 }}
              />
              <YAxis
                type="category"
                dataKey="email"
                width={180}
                tick={{ fill: chartTheme.axisText, fontSize: 12 }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="calls"
                fill="url(#aiUsersGradient)"
                radius={[0, 8, 8, 0]}
                barSize={20}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </PanelCard>
    </div>
  );
};

type SortKey = 'name' | 'total' | 'monthly' | 'daily' | 'monthlyRate';
type SortState = { key: SortKey; dir: 'asc' | 'desc' };

type SortableRow = {
  name: string;
  total: number;
  monthly: number;
  daily: number;
  monthlyRate: number;
};

function sortRows<T extends SortableRow>(rows: T[], sort: SortState): T[] {
  const { key, dir } = sort;
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === 'string' && typeof bv === 'string') {
      return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    return dir === 'asc' ? Number(av) - Number(bv) : Number(bv) - Number(av);
  });
}

const UsersPanel: React.FC<{ data: AnalyticsData }> = ({ data }) => {
  const [domainSort, setDomainSort] = useState<SortState>({
    key: 'total',
    dir: 'desc',
  });
  const [buildingSort, setBuildingSort] = useState<SortState>({
    key: 'total',
    dir: 'desc',
  });

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

  const buildingChartRows = useMemo(
    () =>
      Object.entries(data.users.buildings)
        .map(([id, counts]) => ({
          name:
            id === 'none'
              ? 'No Building Assigned'
              : (KNOWN_BUILDINGS.get(id)?.name ?? `Unknown (${id})`),
          total: counts.total,
        }))
        .sort((a, b) => b.total - a.total),
    [data.users.buildings]
  );

  const toggleSort = (
    setter: React.Dispatch<React.SetStateAction<SortState>>,
    key: SortKey
  ) => {
    setter((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        : { key, dir: 'desc' }
    );
  };

  return (
    <div className="space-y-5">
      <PanelCard title="Users by Building (Distribution)">
        <ResponsiveContainer
          width="100%"
          height={Math.max(260, buildingChartRows.length * 36)}
        >
          <BarChart
            data={buildingChartRows}
            layout="vertical"
            margin={{ left: 120, right: 20 }}
          >
            <CartesianGrid stroke={chartTheme.grid} horizontal={false} />
            <XAxis
              type="number"
              tick={{ fill: chartTheme.axisText, fontSize: 12 }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              tick={{ fill: chartTheme.axisText, fontSize: 12 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              dataKey="total"
              fill="#2d3f89"
              radius={[0, 8, 8, 0]}
              barSize={20}
            />
          </BarChart>
        </ResponsiveContainer>
      </PanelCard>

      <DataTable
        title="Users by Domain"
        rows={domainRows}
        sort={domainSort}
        onSort={(key) => toggleSort(setDomainSort, key)}
      />
      <DataTable
        title="Users by Building"
        rows={buildingRows}
        sort={buildingSort}
        onSort={(key) => toggleSort(setBuildingSort, key)}
      />
    </div>
  );
};

/* ─── relative-time helper ─── */
const formatRelativeTime = (ms: number): string => {
  if (ms <= 0) return 'Never';
  const diff = Date.now() - ms;
  if (diff < 0) return 'Just now';
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ms).toLocaleDateString();
};

type KpiSortKey = 'email' | 'building' | 'lastEdit';

const KpiUserModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  category: KpiCategory;
  users: KpiUser[];
}> = ({ isOpen, onClose, category, users }) => {
  const [emailSearch, setEmailSearch] = useState('');
  const [buildingFilter, setBuildingFilter] = useState('all');
  const [sortKey, setSortKey] = useState<KpiSortKey>('email');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (key: KpiSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const renderSortIcon = (column: KpiSortKey) => {
    if (sortKey !== column)
      return <ArrowDownUp className="w-3.5 h-3.5 text-slate-400" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-slate-700" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-slate-700" />
    );
  };

  // Filter by KPI category
  const categoryUsers = useMemo(() => {
    switch (category) {
      case 'registered':
        return users;
      case 'withDashboards':
        return users.filter((u) => u.hasDashboard);
      case 'monthlyActive':
        return users.filter((u) => u.isMonthlyActive);
      case 'dailyActive':
        return users.filter((u) => u.isDailyActive);
    }
  }, [users, category]);

  // Collect unique buildings for the dropdown
  const availableBuildings = useMemo(() => {
    const ids = new Set<string>();
    categoryUsers.forEach((u) =>
      u.buildings.length > 0
        ? u.buildings.forEach((b) => ids.add(b))
        : ids.add('none')
    );
    return Array.from(ids).sort();
  }, [categoryUsers]);

  // Apply search + building filter + sort
  const displayUsers = useMemo(() => {
    let list = categoryUsers;

    if (emailSearch) {
      const q = emailSearch.toLowerCase();
      list = list.filter((u) => u.email.toLowerCase().includes(q));
    }

    if (buildingFilter !== 'all') {
      list = list.filter((u) =>
        buildingFilter === 'none'
          ? u.buildings.length === 0
          : u.buildings.includes(buildingFilter)
      );
    }

    const sorted = [...list];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'email':
          cmp = a.email.localeCompare(b.email);
          break;
        case 'building': {
          const aName = a.buildings[0]
            ? (KNOWN_BUILDINGS.get(a.buildings[0])?.name ?? a.buildings[0])
            : '';
          const bName = b.buildings[0]
            ? (KNOWN_BUILDINGS.get(b.buildings[0])?.name ?? b.buildings[0])
            : '';
          cmp = aName.localeCompare(bName);
          break;
        }
        case 'lastEdit':
          cmp = (a.lastEditMs ?? 0) - (b.lastEditMs ?? 0);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [categoryUsers, emailSearch, buildingFilter, sortKey, sortDir]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={KPI_TITLES[category]}
      maxWidth="max-w-3xl"
    >
      <div className="space-y-4 pb-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by email…"
              value={emailSearch}
              onChange={(e) => setEmailSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            value={buildingFilter}
            onChange={(e) => setBuildingFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Buildings</option>
            {availableBuildings.map((id) => (
              <option key={id} value={id}>
                {id === 'none'
                  ? 'No Building Assigned'
                  : (KNOWN_BUILDINGS.get(id)?.name ?? `Unknown (${id})`)}
              </option>
            ))}
          </select>
        </div>

        {/* Count */}
        <p className="text-xs text-slate-500">
          Showing {formatNumber(displayUsers.length)} of{' '}
          {formatNumber(categoryUsers.length)} users
        </p>

        {/* Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th
                  className="text-left px-4 py-2.5 font-semibold text-slate-600 cursor-pointer select-none hover:bg-slate-100 transition-colors"
                  onClick={() => handleSort('email')}
                >
                  <span className="inline-flex items-center gap-1">
                    Email {renderSortIcon('email')}
                  </span>
                </th>
                <th
                  className="text-left px-4 py-2.5 font-semibold text-slate-600 cursor-pointer select-none hover:bg-slate-100 transition-colors"
                  onClick={() => handleSort('building')}
                >
                  <span className="inline-flex items-center gap-1">
                    Building {renderSortIcon('building')}
                  </span>
                </th>
                <th
                  className="text-left px-4 py-2.5 font-semibold text-slate-600 cursor-pointer select-none hover:bg-slate-100 transition-colors"
                  onClick={() => handleSort('lastEdit')}
                >
                  <span className="inline-flex items-center gap-1">
                    Last Edit {renderSortIcon('lastEdit')}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {displayUsers.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="text-center py-8 text-slate-400 text-sm"
                  >
                    No users match the current filters.
                  </td>
                </tr>
              ) : (
                displayUsers.map((u) => (
                  <tr
                    key={u.email}
                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-2.5 text-slate-800 font-medium">
                      {u.email}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {u.buildings.length > 0
                        ? u.buildings
                            .map(
                              (b) =>
                                KNOWN_BUILDINGS.get(b)?.name ?? `Unknown (${b})`
                            )
                            .join(', ')
                        : '—'}
                    </td>
                    <td
                      className="px-4 py-2.5 text-slate-600"
                      title={
                        (u.lastEditMs ?? 0) > 0
                          ? new Date(u.lastEditMs).toLocaleString()
                          : 'No edits'
                      }
                    >
                      {formatRelativeTime(u.lastEditMs ?? 0)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
};

const DataTable: React.FC<{
  title: string;
  rows: SortableRow[];
  sort: SortState;
  onSort: (key: SortKey) => void;
}> = ({ title, rows, sort, onSort }) => {
  const header = (label: string, key: SortKey, align = 'text-right') => {
    const ariaSort =
      sort.key === key
        ? sort.dir === 'desc'
          ? 'descending'
          : 'ascending'
        : 'none';
    return (
      <th
        scope="col"
        aria-sort={ariaSort}
        className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 ${align}`}
      >
        <button
          type="button"
          onClick={() => onSort(key)}
          className="hover:text-slate-900 transition-colors"
        >
          {label}
          {sort.key === key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ' ↕'}
        </button>
      </th>
    );
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
          {title}
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px]">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              {header('Name', 'name', 'text-left')}
              {header('Total', 'total')}
              {header('Monthly', 'monthly')}
              {header('MAU %', 'monthlyRate')}
              {header('Daily', 'daily')}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr
                key={row.name}
                className="hover:bg-slate-50 transition-colors"
              >
                <td className="px-4 py-3 text-sm font-medium text-slate-900">
                  {row.name}
                </td>
                <td className="px-4 py-3 text-sm text-slate-700 text-right">
                  {formatNumber(row.total)}
                </td>
                <td className="px-4 py-3 text-sm text-slate-700 text-right">
                  {formatNumber(row.monthly)}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-2 w-32 justify-end">
                    <span className="text-sm text-blue-600">
                      {formatRate(row.monthlyRate)}
                    </span>
                    <span className="relative h-1.5 w-12 rounded-full bg-slate-200 overflow-hidden">
                      <span
                        className="absolute inset-y-0 left-0 rounded-full bg-blue-500"
                        style={{ width: `${Math.min(100, row.monthlyRate)}%` }}
                      />
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-slate-700 text-right">
                  {formatNumber(row.daily)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-slate-400 text-sm"
                >
                  No data available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const AnalyticsManager: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<AnalyticsTab>('overview');
  const [selectedDomain, setSelectedDomain] = useState('all');
  const [selectedBuilding, setSelectedBuilding] = useState('all');
  const [kpiModal, setKpiModal] = useState<KpiCategory | null>(null);

  const requestSequenceRef = useRef(0);
  const isMountedRef = useRef(true);

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

      const raw = (await response.json()) as Partial<AnalyticsData>;
      const normalized: AnalyticsData = {
        users: {
          total: raw.users?.total ?? 0,
          registered: raw.users?.registered ?? raw.users?.total ?? 0,
          registeredIsFallback:
            raw.users?.registeredIsFallback ??
            raw.users?.registered === undefined,
          monthly: raw.users?.monthly ?? 0,
          daily: raw.users?.daily ?? 0,
          withDashboards: raw.users?.withDashboards ?? 0,
          domains: raw.users?.domains ?? {},
          buildings: raw.users?.buildings ?? {},
          domainBuilding: raw.users?.domainBuilding ?? {},
          userList: raw.users?.userList,
        },
        widgets: {
          totalInstances: raw.widgets?.totalInstances ?? {},
          activeInstances: raw.widgets?.activeInstances ?? {},
          usersByType: raw.widgets?.usersByType,
        },
        dashboards: raw.dashboards ?? { total: 0, avgWidgetsPerDashboard: 0 },
        api: {
          totalCalls: raw.api?.totalCalls ?? 0,
          activeUsers: raw.api?.activeUsers ?? 0,
          topUsers: raw.api?.topUsers ?? [],
          avgDailyCalls: raw.api?.avgDailyCalls ?? 0,
          avgDailyCallsPerUser: raw.api?.avgDailyCallsPerUser ?? 0,
          byFeature: raw.api?.byFeature ?? {},
        },
      };

      if (!isMountedRef.current || requestId !== requestSequenceRef.current) {
        return;
      }
      setData(normalized);
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
  }, [data, selectedBuilding, selectedDomain]);

  const filteredUserList = useMemo(() => {
    const list = data?.users.userList ?? [];
    if (selectedDomain === 'all' && selectedBuilding === 'all') return list;
    return list.filter((u) => {
      if (selectedDomain !== 'all') {
        const domain = u.email.includes('@')
          ? u.email.split('@')[1]
          : 'unknown';
        if (domain !== selectedDomain) return false;
      }
      if (selectedBuilding !== 'all') {
        if (selectedBuilding === 'none') {
          if (u.buildings.length > 0) return false;
        } else {
          if (!u.buildings.includes(selectedBuilding)) return false;
        }
      }
      return true;
    });
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

  const tabs: { id: AnalyticsTab; label: string; icon: React.ReactNode }[] = [
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
    { id: 'ai', label: 'AI Usage', icon: <WandSparkles className="w-4 h-4" /> },
    { id: 'users', label: 'Users', icon: <School className="w-4 h-4" /> },
  ];

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm animate-pulse"
            >
              <div className="h-3 w-20 bg-slate-200 rounded mb-3" />
              <div className="h-8 w-16 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-800 p-6 rounded-2xl flex items-start gap-3">
        <AlertCircle className="w-6 h-6 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-bold mb-1">Failed to Load Analytics</h3>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-5 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <select
            value={selectedDomain}
            onChange={(e) => setSelectedDomain(e.target.value)}
            aria-label="Filter by domain"
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 bg-white outline-none focus:ring-2 focus:ring-blue-500"
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
            aria-label="Filter by building"
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 bg-white outline-none focus:ring-2 focus:ring-blue-500"
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
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div
        className="sticky top-0 z-10 bg-slate-100 rounded-xl border border-slate-200 p-1.5"
        role="tablist"
      >
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              type="button"
              aria-label={tab.label}
              aria-selected={selectedTab === tab.id}
              id={`tab-${tab.id}`}
              aria-controls={`panel-${tab.id}`}
              tabIndex={selectedTab === tab.id ? 0 : -1}
              onClick={() => setSelectedTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold border transition-colors ${
                selectedTab === tab.id
                  ? 'bg-white border-slate-300 text-slate-900 shadow-sm'
                  : 'bg-transparent border-transparent text-slate-500 hover:text-slate-700 hover:bg-white/60'
              }`}
            >
              {tab.icon}
              <span className="sr-only sm:not-sr-only sm:inline">
                {tab.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {selectedTab === 'overview' && (
        <div role="tabpanel" id="panel-overview" aria-labelledby="tab-overview">
          <OverviewPanel
            data={data}
            filteredTotalUsers={filteredTotalUsers}
            filteredMonthly={filteredMonthly}
            filteredDaily={filteredDaily}
            registeredUsers={data.users.registered ?? data.users.total}
            registeredIsFallback={data.users.registeredIsFallback ?? false}
            usersWithDashboards={data.users.withDashboards ?? 0}
            dashboards={
              data.dashboards ?? { total: 0, avgWidgetsPerDashboard: 0 }
            }
            onKpiClick={filteredUserList.length > 0 ? setKpiModal : undefined}
          />
        </div>
      )}
      {selectedTab === 'widgets' && (
        <div role="tabpanel" id="panel-widgets" aria-labelledby="tab-widgets">
          <WidgetsPanel data={data} />
        </div>
      )}
      {selectedTab === 'ai' && (
        <div role="tabpanel" id="panel-ai" aria-labelledby="tab-ai">
          <AiPanel data={data} />
        </div>
      )}
      {selectedTab === 'users' && (
        <div role="tabpanel" id="panel-users" aria-labelledby="tab-users">
          <UsersPanel data={data} />
        </div>
      )}

      {kpiModal && (
        <KpiUserModal
          isOpen={!!kpiModal}
          onClose={() => setKpiModal(null)}
          category={kpiModal}
          users={filteredUserList}
        />
      )}
    </div>
  );
};
