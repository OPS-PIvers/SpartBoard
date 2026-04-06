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
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { auth } from '@/config/firebase';
import {
  AlertCircle,
  BarChart2,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  RefreshCw,
  School,
  Users,
  WandSparkles,
  Zap,
} from 'lucide-react';
import { BUILDINGS } from '@/config/buildings';
import { TOOLS } from '@/config/tools';

interface EngagementCounts {
  total: number;
  monthly: number;
  daily: number;
}

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
const CHART_COLORS = [
  '#2d3f89',
  '#4356a0',
  '#6d80c0',
  '#9aaad8',
  '#ad2122',
  '#c13435',
  '#e05d5e',
  '#14b8a6',
  '#0d9488',
  '#a855f7',
  '#f59e0b',
  '#10b981',
];

const NUMBER_FORMATTER = new Intl.NumberFormat();
const formatNumber = (value: number) => NUMBER_FORMATTER.format(value);
const formatRate = (value: number) =>
  Number.isFinite(value) ? `${value.toFixed(1)}%` : '0.0%';

const chartTheme = {
  grid: '#ffffff15',
  axisText: '#94a3b8',
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
}> = ({ title, value, subtitle, accentColor, accentBg, icon }) => (
  <div className="bg-slate-800/60 backdrop-blur-sm border border-white/10 rounded-2xl p-5 relative overflow-hidden">
    <div
      className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
      style={{ background: accentColor }}
    />
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {title}
        </p>
        <p className="text-3xl font-black text-white mt-1">{value}</p>
        {subtitle && <p className="text-sm text-slate-400 mt-1">{subtitle}</p>}
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
  <div className="bg-slate-800/60 backdrop-blur-sm border border-white/10 rounded-2xl p-5">
    <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4">
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
}> = ({
  data,
  filteredTotalUsers,
  filteredMonthly,
  filteredDaily,
  registeredUsers,
  registeredIsFallback,
  usersWithDashboards,
  dashboards,
}) => {
  const funnel = useMemo(
    () => [
      { name: 'Registered', value: registeredUsers, fill: '#4356a0' },
      { name: 'With Dashboards', value: usersWithDashboards, fill: '#14b8a6' },
      { name: 'Monthly Active', value: filteredMonthly, fill: '#a855f7' },
      { name: 'Daily Active', value: filteredDaily, fill: '#10b981' },
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
          icon={<Users className="w-5 h-5 text-blue-200" />}
        />
        <KpiCard
          title="Users with Dashboards"
          value={formatNumber(usersWithDashboards)}
          subtitle="Unique dashboard owners"
          accentColor="#14b8a6"
          accentBg="rgba(20,184,166,0.2)"
          icon={<LayoutGrid className="w-5 h-5 text-teal-200" />}
        />
        <KpiCard
          title="Monthly Active"
          value={formatNumber(filteredMonthly)}
          subtitle={`${formatRate(filteredTotalUsers > 0 ? (filteredMonthly / filteredTotalUsers) * 100 : 0)} of visible users`}
          accentColor="#a855f7"
          accentBg="rgba(168,85,247,0.2)"
          icon={<BarChart2 className="w-5 h-5 text-purple-200" />}
        />
        <KpiCard
          title="Daily Active"
          value={formatNumber(filteredDaily)}
          subtitle={`${formatRate(filteredTotalUsers > 0 ? (filteredDaily / filteredTotalUsers) * 100 : 0)} of visible users`}
          accentColor="#10b981"
          accentBg="rgba(16,185,129,0.2)"
          icon={<Zap className="w-5 h-5 text-emerald-200" />}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <KpiCard
          title="Total Dashboards"
          value={formatNumber(dashboards.total)}
          accentColor="#6d80c0"
          accentBg="rgba(109,128,192,0.2)"
          icon={<LayoutGrid className="w-5 h-5 text-blue-200" />}
        />
        <KpiCard
          title="Avg Widgets / Dashboard"
          value={dashboards.avgWidgetsPerDashboard.toFixed(1)}
          accentColor="#f59e0b"
          accentBg="rgba(245,158,11,0.2)"
          icon={<WandSparkles className="w-5 h-5 text-amber-200" />}
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
              fill="#4356a0"
              name="Total"
              radius={[0, 8, 8, 0]}
              barSize={16}
            />
            <Bar
              dataKey="monthly"
              fill="#14b8a6"
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

const WidgetsPanel: React.FC<{ data: AnalyticsData }> = ({ data }) => {
  const [expandedWidget, setExpandedWidget] = useState<string | null>(null);

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

  const radarData = useMemo(
    () =>
      rows.slice(0, 8).map((row) => ({
        widget: row.name,
        total: row.total,
        active: row.active,
      })),
    [rows]
  );

  return (
    <div className="space-y-5">
      <PanelCard title="Widget Popularity + Active Users">
        <ResponsiveContainer
          width="100%"
          height={Math.max(300, rows.slice(0, 12).length * 38)}
        >
          <BarChart
            data={rows.slice(0, 12)}
            layout="vertical"
            margin={{ left: 120, right: 30 }}
          >
            <defs>
              <linearGradient
                id="widgetTotalGradient"
                x1="0"
                y1="0"
                x2="1"
                y2="0"
              >
                <stop offset="0%" stopColor="#4356a0" />
                <stop offset="100%" stopColor="#6d80c0" />
              </linearGradient>
            </defs>
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
              fill="url(#widgetTotalGradient)"
              barSize={20}
              radius={[0, 8, 8, 0]}
            />
            <Bar
              dataKey="active"
              name="Active (30d)"
              fill="#14b8a6"
              barSize={20}
              radius={[0, 8, 8, 0]}
            />
            <Bar
              dataKey="users"
              name="Users"
              fill="#a855f7"
              barSize={20}
              radius={[0, 8, 8, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </PanelCard>

      {radarData.length > 0 && (
        <PanelCard title="Top Widget Comparison (Radar)">
          <ResponsiveContainer width="100%" height={320}>
            <RadarChart data={radarData}>
              <PolarGrid stroke={chartTheme.grid} />
              <PolarAngleAxis
                dataKey="widget"
                tick={{ fill: chartTheme.axisText, fontSize: 11 }}
              />
              <PolarRadiusAxis
                tick={{ fill: chartTheme.axisText, fontSize: 10 }}
              />
              <Radar
                name="Total"
                dataKey="total"
                stroke="#6d80c0"
                fill="#6d80c0"
                fillOpacity={0.35}
              />
              <Radar
                name="Active"
                dataKey="active"
                stroke="#14b8a6"
                fill="#14b8a6"
                fillOpacity={0.28}
              />
              <Legend wrapperStyle={{ color: chartTheme.axisText }} />
            </RadarChart>
          </ResponsiveContainer>
        </PanelCard>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {rows.map((row, index) => {
          const expanded = expandedWidget === row.type;
          const color = CHART_COLORS[index % CHART_COLORS.length];
          return (
            <div
              key={row.type}
              className="bg-slate-800/60 backdrop-blur-sm border border-white/10 rounded-2xl p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: color }}
                  />
                  <h4 className="text-sm font-semibold text-white truncate">
                    {row.name}
                  </h4>
                </div>
                <span className="text-xs text-slate-400">#{index + 1}</span>
              </div>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide">
                    Total instances
                  </p>
                  <p className="text-2xl font-black text-white">
                    {formatNumber(row.total)}
                  </p>
                </div>
                <span className="rounded-full bg-purple-500/20 text-purple-200 text-xs px-2.5 py-1 font-semibold">
                  {row.usersAvailable
                    ? `${formatNumber(row.users)} users`
                    : 'Users unavailable'}
                </span>
              </div>
              <div className="mt-3">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Active 30d: {formatNumber(row.active)}</span>
                  <span>{formatRate(row.activeRate)}</span>
                </div>
                <div className="h-2 rounded-full bg-white/10 mt-1.5 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, row.activeRate)}%`,
                      background: color,
                    }}
                  />
                </div>
              </div>
              <button
                type="button"
                disabled={!row.usersAvailable}
                onClick={() =>
                  setExpandedWidget((prev) =>
                    prev === row.type ? null : row.type
                  )
                }
                className="mt-4 w-full rounded-lg border border-white/10 text-slate-300 hover:text-white hover:bg-white/5 text-xs font-semibold px-2 py-1.5 flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {expanded ? 'Hide emails' : 'Show emails'}
                {expanded ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
              {expanded && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {!row.usersAvailable ? (
                    <p className="text-xs text-slate-400">
                      User drilldown is unavailable until the latest Cloud
                      Function is deployed.
                    </p>
                  ) : row.emails.length === 0 ? (
                    <p className="text-xs text-slate-400">
                      No users found with this widget.
                    </p>
                  ) : (
                    row.emails.map((email) => (
                      <span
                        key={email}
                        className="text-[11px] rounded-full bg-blue-500/15 text-blue-200 px-2 py-1"
                      >
                        {email}
                      </span>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const AiPanel: React.FC<{ data: AnalyticsData }> = ({ data }) => {
  const featureRows = useMemo(
    () =>
      Object.entries(data.api.byFeature ?? {})
        .map(([feature, count]) => ({ feature, count }))
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
          accentBg="rgba(173,33,34,0.2)"
          icon={<Zap className="w-5 h-5 text-red-200" />}
        />
        <KpiCard
          title="Active AI Users"
          value={formatNumber(data.api.activeUsers)}
          accentColor="#e05d5e"
          accentBg="rgba(224,93,94,0.2)"
          icon={<Users className="w-5 h-5 text-red-200" />}
        />
        <KpiCard
          title="Avg Daily Calls"
          value={formatNumber(data.api.avgDailyCalls)}
          accentColor="#a855f7"
          accentBg="rgba(168,85,247,0.2)"
          icon={<BarChart2 className="w-5 h-5 text-purple-200" />}
        />
        <KpiCard
          title="Avg Per User/Day"
          value={data.api.avgDailyCallsPerUser.toFixed(1)}
          accentColor="#10b981"
          accentBg="rgba(16,185,129,0.2)"
          icon={<WandSparkles className="w-5 h-5 text-emerald-200" />}
        />
      </div>

      <PanelCard title="AI Feature Breakdown">
        {featureRows.length === 0 ? (
          <p className="text-sm text-slate-400">
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
                fill="#14b8a6"
                radius={[0, 8, 8, 0]}
                barSize={20}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </PanelCard>

      <PanelCard title="Top AI Users">
        {userRows.length === 0 ? (
          <p className="text-sm text-slate-400">No AI users found.</p>
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
                  <stop offset="100%" stopColor="#e05d5e" />
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
              fill="#0d9488"
              radius={[0, 8, 8, 0]}
              barSize={20}
            />
          </BarChart>
        </ResponsiveContainer>
      </PanelCard>

      <DarkTable
        title="Users by Domain"
        rows={domainRows}
        sort={domainSort}
        onSort={(key) => toggleSort(setDomainSort, key)}
      />
      <DarkTable
        title="Users by Building"
        rows={buildingRows}
        sort={buildingSort}
        onSort={(key) => toggleSort(setBuildingSort, key)}
      />
    </div>
  );
};

const DarkTable: React.FC<{
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
        className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400 ${align}`}
      >
        <button
          type="button"
          onClick={() => onSort(key)}
          className="hover:text-white transition-colors"
        >
          {label}
          {sort.key === key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ' ↕'}
        </button>
      </th>
    );
  };

  return (
    <div className="bg-slate-800/60 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/10">
        <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
          {title}
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px]">
          <thead className="border-b border-white/10 bg-slate-900/40">
            <tr>
              {header('Name', 'name', 'text-left')}
              {header('Total', 'total')}
              {header('Monthly', 'monthly')}
              {header('MAU %', 'monthlyRate')}
              {header('Daily', 'daily')}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rows.map((row) => (
              <tr key={row.name} className="hover:bg-white/5 transition-colors">
                <td className="px-4 py-3 text-sm font-medium text-slate-200">
                  {row.name}
                </td>
                <td className="px-4 py-3 text-sm text-slate-300 text-right">
                  {formatNumber(row.total)}
                </td>
                <td className="px-4 py-3 text-sm text-slate-300 text-right">
                  {formatNumber(row.monthly)}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-2 w-32 justify-end">
                    <span className="text-sm text-teal-300">
                      {formatRate(row.monthlyRate)}
                    </span>
                    <span className="relative h-1.5 w-12 rounded-full bg-white/15 overflow-hidden">
                      <span
                        className="absolute inset-y-0 left-0 rounded-full bg-teal-400"
                        style={{ width: `${Math.min(100, row.monthlyRate)}%` }}
                      />
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-slate-300 text-right">
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
              className="bg-slate-800/60 border border-white/10 rounded-2xl p-5 animate-pulse"
            >
              <div className="h-3 w-20 bg-slate-700 rounded mb-3" />
              <div className="h-8 w-16 bg-slate-700 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/25 border border-red-400/30 text-red-200 p-6 rounded-2xl flex items-start gap-3">
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
            className="border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-200 bg-slate-900/60 outline-none focus:ring-2 focus:ring-blue-500"
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
            className="border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-200 bg-slate-900/60 outline-none focus:ring-2 focus:ring-blue-500"
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
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-1.5 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div
        className="sticky top-0 z-10 bg-slate-950/70 backdrop-blur-md rounded-xl border border-white/10 p-1.5"
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
                  ? 'bg-blue-500/20 border-blue-400/60 text-blue-100'
                  : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
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
    </div>
  );
};
