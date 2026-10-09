import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  type ActivityPoint,
  type ActivityRange,
  type ActivityUser,
  type ChartWeek,
  type CohortRow,
  type MonthCount,
  activityStats,
  combineDays,
  filterRange,
  formatDay,
  formatMonth,
  joinWeeks,
  recencyBuckets,
  toWeekly,
} from './overviewMetrics';

const NAVY = '#2d3f89';
const SKY = '#0ea5e9';
const AMBER_DARK = '#b45309';
const AMBER = '#f59e0b';
const STUDENT_DASH = '6 4';
const MUTED = '#94a3b8';
const GRID = '#e2e8f0';
const AXIS = '#64748b';
const ESTIMATED_FILL = '#f1f5f9';

const NUMBER = new Intl.NumberFormat();

const Panel: React.FC<
  React.PropsWithChildren<{ title: string; actions?: React.ReactNode }>
> = ({ title, actions, children }) => (
  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm min-w-0">
    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
      <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
        {title}
      </h3>
      {actions}
    </div>
    {children}
  </div>
);

const LegendLine: React.FC<{
  color: string;
  label: string;
  dashed?: boolean;
}> = ({ color, label, dashed }) => (
  <span className="inline-flex items-center gap-1.5">
    <span
      className={`inline-block w-4 border-t-[3px] ${dashed ? 'border-dashed' : ''}`}
      style={{ borderColor: color }}
    />
    {label}
  </span>
);

const LegendSwatch: React.FC<{ color: string; label: string }> = ({
  color,
  label,
}) => (
  <span className="inline-flex items-center gap-1.5">
    <span
      className="inline-block w-3 h-3 rounded-sm"
      style={{ background: color }}
    />
    {label}
  </span>
);

const RANGES: { id: ActivityRange; label: string }[] = [
  { id: '90d', label: '90 days' },
  { id: '1y', label: '1 year' },
  { id: 'all', label: 'All' },
];

const ActivityTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ChartWeek }>;
}) => {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-xl bg-slate-900 px-3 py-2 text-xs text-slate-200 shadow-lg">
      <p className="mb-1 text-slate-400">
        Week of {formatDay(point.week)}
        {point.estimated ? ' · Estimated' : ''}
      </p>
      {(
        [
          ['Staff monthly active', point.mau],
          ['Staff avg daily active', point.dau],
          ['Student monthly active', point.studentMau],
          ['Student avg daily active', point.studentDau],
        ] as const
      ).map(([label, value]) =>
        value === undefined ? null : (
          <p key={label} className="font-semibold">
            {label}: {NUMBER.format(value)}
          </p>
        )
      )}
    </div>
  );
};

export const ActiveUsersPanel: React.FC<{
  days: ActivityPoint[];
  studentDays?: ActivityPoint[];
}> = ({ days, studentDays }) => {
  const [range, setRange] = useState<ActivityRange>('all');
  const weeks = useMemo(
    () =>
      joinWeeks(
        toWeekly(filterRange(days, range)),
        toWeekly(filterRange(studentDays ?? [], range))
      ),
    [days, studentDays, range]
  );
  const hasStudents = (studentDays?.length ?? 0) > 0;
  const stats = useMemo(() => activityStats(days), [days]);
  const estimatedWeeks = weeks.filter((w) => w.estimated);
  const hasEstimated = estimatedWeeks.length > 0;

  return (
    <Panel
      title="Active Users"
      actions={
        <div className="flex flex-wrap items-center gap-5 text-xs text-slate-600">
          <LegendLine color={NAVY} label="Staff monthly active" />
          <LegendLine color={SKY} label="Staff avg daily active" />
          {hasStudents && (
            <>
              <LegendLine
                color={AMBER_DARK}
                label="Student monthly active"
                dashed
              />
              <LegendLine
                color={AMBER}
                label="Student avg daily active"
                dashed
              />
            </>
          )}
          {hasEstimated && <LegendSwatch color={GRID} label="Estimated" />}
          <div className="flex gap-0.5 font-semibold" role="group">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-pressed={range === r.id}
                onClick={() => setRange(r.id)}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  range === r.id
                    ? 'bg-slate-200 text-slate-900'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <div className="flex flex-wrap gap-8 mb-3">
        <div className="text-xs text-slate-500">
          <p className="text-xl font-extrabold text-slate-900">
            {stats.stickiness !== null ? `${stats.stickiness}%` : '—'}
          </p>
          Staff DAU / MAU
        </div>
        <div className="text-xs text-slate-500">
          <p className="text-xl font-extrabold text-slate-900">
            {stats.mauChange !== null
              ? `${stats.mauChange >= 0 ? '+' : ''}${NUMBER.format(stats.mauChange)}`
              : '—'}
          </p>
          Staff MAU vs 30 days ago
        </div>
        <div className="text-xs text-slate-500">
          <p className="text-xl font-extrabold text-slate-900">
            {stats.peak ? NUMBER.format(stats.peak.dau) : '—'}
          </p>
          {stats.peak
            ? `Staff peak DAU · ${formatDay(stats.peak.date)}`
            : 'Staff peak DAU'}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={weeks} margin={{ left: 0, right: 12, top: 8 }}>
          {hasEstimated && (
            <ReferenceArea
              x1={estimatedWeeks[0].week}
              x2={estimatedWeeks[estimatedWeeks.length - 1].week}
              fill={ESTIMATED_FILL}
              fillOpacity={1}
              ifOverflow="hidden"
            />
          )}
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="week"
            tick={{ fill: AXIS, fontSize: 11 }}
            tickFormatter={(w: string) =>
              formatMonth(w.slice(0, 7), w.slice(5, 7) === '01')
            }
            minTickGap={40}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: AXIS, fontSize: 11 }}
            width={40}
          />
          <Tooltip content={<ActivityTooltip />} />
          <Line
            type="monotone"
            dataKey="mau"
            name="Staff monthly active"
            stroke={NAVY}
            strokeWidth={2.4}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="dau"
            name="Staff avg daily active"
            stroke={SKY}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          {hasStudents && (
            <Line
              type="monotone"
              dataKey="studentMau"
              name="Student monthly active"
              stroke={AMBER_DARK}
              strokeWidth={2.4}
              strokeDasharray={STUDENT_DASH}
              dot={false}
              isAnimationActive={false}
            />
          )}
          {hasStudents && (
            <Line
              type="monotone"
              dataKey="studentDau"
              name="Student avg daily active"
              stroke={AMBER}
              strokeWidth={2}
              strokeDasharray={STUDENT_DASH}
              dot={false}
              isAnimationActive={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </Panel>
  );
};

const HEAT_LOW = [224, 242, 254];
const HEAT_HIGH = [30, 58, 138];
const heatColor = (t: number) => {
  const c = HEAT_LOW.map((lo, i) => Math.round(lo + (HEAT_HIGH[i] - lo) * t));
  return `rgb(${c.join(',')})`;
};

type HeatmapGroup = 'all' | 'staff' | 'students';

const HEATMAP_GROUPS: { id: HeatmapGroup; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'staff', label: 'Staff' },
  { id: 'students', label: 'Students' },
];

export const DailyHeatmapPanel: React.FC<{
  days: ActivityPoint[];
  studentDays?: ActivityPoint[];
}> = ({ days: staffDays, studentDays }) => {
  const hasStudents = (studentDays?.length ?? 0) > 0;
  const [group, setGroup] = useState<HeatmapGroup>('all');
  // Every view spans the combined dates so the grid keeps its size and columns when toggling.
  const days = useMemo(() => {
    if (!hasStudents) return staffDays;
    const all = combineDays(staffDays, studentDays ?? []);
    if (group === 'all') return all;
    const pick = new Map(
      (group === 'staff' ? staffDays : (studentDays ?? [])).map((d) => [
        d.date,
        d,
      ])
    );
    return all.map(
      (d) => pick.get(d.date) ?? { ...d, dau: 0, mau: 0, estimated: false }
    );
  }, [hasStudents, group, staffDays, studentDays]);
  const cells = useMemo(() => {
    const recent = days.slice(-371);
    if (recent.length === 0) return [];
    const first = new Date(`${recent[0].date}T12:00:00Z`);
    const offset = first.getUTCDay();
    return recent.map((d, i) => ({
      ...d,
      col: Math.floor((i + offset) / 7),
      row: (i + offset) % 7,
    }));
  }, [days]);
  const max = Math.max(1, ...cells.map((c) => c.dau));
  const cols = cells.length > 0 ? cells[cells.length - 1].col + 1 : 0;
  const size = 14;
  const gap = 3;
  const left = 30;
  const top = 16;
  const width = left + cols * (size + gap);
  const height = top + 7 * (size + gap);
  const monthStarts = cells.filter((c) => c.date.slice(8) === '01');
  // The partial first month only gets a label when it has room before the next one.
  const monthLabels =
    cells.length > 0 &&
    cells[0].date.slice(8) !== '01' &&
    (monthStarts[0]?.col ?? Infinity) - cells[0].col >= 3
      ? [cells[0], ...monthStarts]
      : monthStarts;

  return (
    <Panel
      title="Daily Active Users by Day"
      actions={
        <div className="flex flex-wrap items-center gap-5 text-xs text-slate-500">
          {hasStudents && (
            <div className="flex gap-0.5 font-semibold" role="group">
              {HEATMAP_GROUPS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={group === g.id}
                  onClick={() => setGroup(g.id)}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    group === g.id
                      ? 'bg-slate-200 text-slate-900'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1">
            0
            {[0, 0.25, 0.5, 0.75, 1].map((t) => (
              <span
                key={t}
                className="inline-block w-3 h-3 rounded-sm"
                style={{ background: t === 0 ? ESTIMATED_FILL : heatColor(t) }}
              />
            ))}
            {NUMBER.format(max)}
          </div>
        </div>
      }
    >
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          style={{ minWidth: Math.min(width, 640) }}
          role="img"
          aria-label="Daily active users by day"
        >
          {['Mon', 'Wed', 'Fri'].map((label, i) => (
            <text
              key={label}
              x={0}
              y={top + (1 + 2 * i) * (size + gap) + size - 3}
              fontSize={9}
              fill={AXIS}
            >
              {label}
            </text>
          ))}
          {monthLabels.map((c) => (
            <text
              key={c.date}
              x={left + c.col * (size + gap)}
              y={10}
              fontSize={9}
              fill={AXIS}
            >
              {formatMonth(c.date.slice(0, 7), false)}
            </text>
          ))}
          {cells.map((c) => (
            <rect
              key={c.date}
              x={left + c.col * (size + gap)}
              y={top + c.row * (size + gap)}
              width={size}
              height={size}
              rx={3}
              fill={c.dau === 0 ? ESTIMATED_FILL : heatColor(c.dau / max)}
            >
              <title>{`${formatDay(c.date)}: ${NUMBER.format(c.dau)}${c.estimated ? ' (estimated)' : ''}`}</title>
            </rect>
          ))}
        </svg>
      </div>
    </Panel>
  );
};

export const LastActivePanel: React.FC<{
  users: ActivityUser[];
  asOfMs: number;
}> = ({ users, asOfMs }) => {
  const rows = useMemo(() => recencyBuckets(users, asOfMs), [users, asOfMs]);
  return (
    <Panel title="Last Active">
      <ResponsiveContainer width="100%" height={230}>
        <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 36 }}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={112}
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#334155', fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: ESTIMATED_FILL }}
            formatter={(v) => NUMBER.format(Number(v))}
          />
          <Bar
            dataKey="value"
            name="Users"
            barSize={20}
            radius={[0, 4, 4, 0]}
            isAnimationActive={false}
            label={{
              position: 'right',
              fill: '#0f172a',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {rows.map((row, i) => (
              <Cell key={row.name} fill={i < 3 ? NAVY : MUTED} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  );
};

export const NewUsersPanel: React.FC<{ months: MonthCount[] }> = ({
  months,
}) => {
  const data = useMemo(
    () =>
      months.map((m, i) => ({
        ...m,
        total: months.slice(0, i + 1).reduce((sum, x) => sum + x.count, 0),
      })),
    [months]
  );
  return (
    <Panel
      title="New Users by Month"
      actions={
        <div className="flex gap-4 text-xs text-slate-600">
          <LegendSwatch color={NAVY} label="New" />
          <LegendLine color={SKY} label="Total" />
        </div>
      }
    >
      <ResponsiveContainer width="100%" height={230}>
        <ComposedChart data={data} margin={{ left: 0, right: 0, top: 8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fill: AXIS, fontSize: 10 }}
            tickFormatter={(m: string) => formatMonth(m, m.endsWith('-01'))}
            minTickGap={16}
          />
          <YAxis
            yAxisId="new"
            allowDecimals={false}
            tick={{ fill: AXIS, fontSize: 10 }}
            width={32}
          />
          <YAxis
            yAxisId="total"
            orientation="right"
            allowDecimals={false}
            tick={{ fill: '#0284c7', fontSize: 10 }}
            width={36}
          />
          <Tooltip
            labelFormatter={(m) =>
              typeof m === 'string' ? formatMonth(m) : ''
            }
            formatter={(v) => NUMBER.format(Number(v))}
          />
          <Bar
            yAxisId="new"
            dataKey="count"
            name="New"
            fill={NAVY}
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
          />
          <Line
            yAxisId="total"
            dataKey="total"
            name="Total"
            stroke={SKY}
            strokeWidth={2.2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </Panel>
  );
};

const cohortColor = (pct: number) => heatColor(pct / 100);

export const CohortPanel: React.FC<{ cohorts: CohortRow[] }> = ({
  cohorts,
}) => {
  const span = Math.max(0, ...cohorts.map((c) => c.retained.length));
  return (
    <Panel title="Still Active by Sign-up Month">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-[3px] text-xs">
          <thead>
            <tr className="text-slate-500">
              <th className="text-left font-semibold pr-2">Cohort</th>
              <th className="text-right font-semibold pr-2">Users</th>
              {Array.from({ length: span }, (_, i) => (
                <th key={i} className="font-semibold text-center">
                  M{i}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohorts.map((c) => (
              <tr key={c.month}>
                <td className="text-slate-700 whitespace-nowrap pr-2">
                  {formatMonth(c.month)}
                </td>
                <td className="text-right text-slate-500 pr-2 tabular-nums">
                  {c.users}
                </td>
                {Array.from({ length: span }, (_, i) => {
                  const pct = c.retained[i];
                  if (pct === undefined) return <td key={i} />;
                  if (pct === null)
                    return (
                      <td
                        key={i}
                        className="text-center text-slate-400 rounded"
                        style={{ background: ESTIMATED_FILL }}
                      >
                        –
                      </td>
                    );
                  return (
                    <td
                      key={i}
                      className="text-center h-6 rounded tabular-nums"
                      style={{
                        background: cohortColor(pct),
                        color: pct > 55 ? '#fff' : '#0f172a',
                      }}
                    >
                      {pct}%
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
};

export const BuildingAdoptionPanel: React.FC<{
  rows: { name: string; total: number; monthly: number }[];
}> = ({ rows }) => {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <Panel
      title="Adoption by Building"
      actions={
        <div className="flex gap-4 text-xs text-slate-600">
          <LegendSwatch color={NAVY} label="Monthly active" />
          <LegendSwatch color={GRID} label="Members" />
        </div>
      }
    >
      <div className="space-y-3">
        {rows.map((r) => (
          <div
            key={r.name}
            className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-xs"
          >
            <span className="text-right text-slate-700 truncate" title={r.name}>
              {r.name}
            </span>
            <div className="relative h-5">
              <div
                className="absolute inset-y-0 left-0 rounded"
                style={{ width: `${(r.total / max) * 100}%`, background: GRID }}
              />
              <div
                className="absolute inset-y-0 left-0 rounded"
                style={{
                  width: `${(r.monthly / max) * 100}%`,
                  background: NAVY,
                }}
              />
            </div>
            <span className="whitespace-nowrap tabular-nums">
              <b className="text-slate-900">
                {r.total > 0 ? Math.round((r.monthly / r.total) * 100) : 0}%
              </b>{' '}
              <span className="text-slate-500">
                {r.monthly}/{r.total}
              </span>
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
};
