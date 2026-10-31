import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { db, isAuthBypass } from '@/config/firebase';
import { aiModelLabel } from '@/config/aiModels';
import { logError } from '@/utils/logError';
import { fillSpendDays, formatUsd, summarizeModelSpend } from './aiModelSpend';

const RANGES = [
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
] as const;
type RangeDays = (typeof RANGES)[number]['days'];

const NAVY = '#2d3f89';
const RED = '#ad2122';
const GRID = '#e2e8f0';
const AXIS = '#64748b';
const NUMBER = new Intl.NumberFormat();

const isoDay = (msAgo: number) =>
  new Date(Date.now() - msAgo).toISOString().slice(0, 10);

const SpendTooltip = ({
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
      {payload.map((entry, idx) => (
        <p key={`${entry.name ?? 'item'}-${idx}`} className="font-medium">
          {entry.name}: {formatUsd(Number(entry.value ?? 0))}
        </p>
      ))}
    </div>
  );
};

const Kpi: React.FC<{ title: string; value: string; subtitle?: string }> = ({
  title,
  value,
  subtitle,
}) => (
  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
      {title}
    </p>
    <p className="text-3xl font-black text-slate-900 mt-1">{value}</p>
    {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
  </div>
);

/** Calls and estimated spend per AI model, read from `ai_call_log`. */
export const AiModelSpendPanel: React.FC = () => {
  const [range, setRange] = useState<RangeDays>(30);
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(
    isAuthBypass ? [] : null
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (isAuthBypass) return;
    let cancelled = false;
    const since = isoDay((RANGES[RANGES.length - 1].days - 1) * 86_400_000);
    getDocs(query(collection(db, 'ai_call_log'), where('date', '>=', since)))
      .then((snap) => {
        if (!cancelled) setRows(snap.docs.map((d) => d.data()));
      })
      .catch((err: unknown) => {
        logError('analytics.aiCallLog', err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const since = isoDay((range - 1) * 86_400_000);
  const today = isoDay(0);
  const summary = useMemo(
    () =>
      summarizeModelSpend(
        (rows ?? []).filter(
          (r) => typeof r.date === 'string' && r.date >= since
        )
      ),
    [rows, since]
  );

  const chartDays = useMemo(
    () =>
      fillSpendDays(summary.days, since, today).map((d) => {
        let claude = 0;
        let gemini = 0;
        for (const [model, cost] of Object.entries(d.byModel)) {
          if (model.startsWith('claude-')) claude += cost;
          else gemini += cost;
        }
        return { day: d.date.slice(5), Claude: claude, Gemini: gemini };
      }),
    [summary.days, since, today]
  );

  const rangeToggle = (
    <div className="flex gap-0.5 text-sm font-semibold" role="group">
      {RANGES.map((r) => (
        <button
          key={r.days}
          type="button"
          aria-pressed={range === r.days}
          onClick={() => setRange(r.days)}
          className={`px-2.5 py-1 rounded-md transition-colors ${
            range === r.days
              ? 'bg-slate-200 text-slate-900'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3
          className="text-sm font-bold text-slate-700 uppercase tracking-wider"
          title="Tokens times each model's list price. Your Google Cloud and Anthropic bills are the exact figures. Per-model logging began October 12, 2026."
        >
          Usage and estimated spend by model
        </h3>
        {rangeToggle}
      </div>

      {failed ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
          <p className="text-sm text-slate-500">Couldn&apos;t load AI usage.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <Kpi title="Estimated spend" value={formatUsd(summary.totalCost)} />
            <Kpi
              title="Gemini spend"
              value={formatUsd(summary.costByProvider.gemini)}
            />
            <Kpi
              title="Claude spend"
              value={formatUsd(summary.costByProvider.claude)}
            />
            <Kpi
              title="Model calls"
              value={NUMBER.format(summary.totalCalls)}
            />
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs min-w-0">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">
              Daily estimated spend
            </h3>
            {rows === null ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartDays} margin={{ left: 0, right: 12 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: AXIS, fontSize: 12 }}
                    minTickGap={16}
                  />
                  <YAxis
                    tick={{ fill: AXIS, fontSize: 12 }}
                    tickFormatter={(v: number) => `$${v.toFixed(2)}`}
                    width={56}
                  />
                  <Tooltip content={<SpendTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Gemini" stackId="spend" fill={NAVY} />
                  <Bar
                    dataKey="Claude"
                    stackId="spend"
                    fill={RED}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs min-w-0">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">
              By model
            </h3>
            {rows !== null && summary.models.length === 0 ? (
              <p className="text-sm text-slate-500">
                No AI calls logged in this range.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                      <th className="py-2 pr-4">Model</th>
                      <th className="py-2 pr-4 text-right">Calls</th>
                      <th className="py-2 pr-4 text-right">Input tokens</th>
                      <th className="py-2 pr-4 text-right">Output tokens</th>
                      <th className="py-2 pr-4 text-right">Est. spend</th>
                      <th
                        className="py-2 pr-4 text-right"
                        title="Calls this Gemini model answered after a Claude attempt failed"
                      >
                        Fallbacks
                      </th>
                      <th className="py-2 text-right">Failed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.models.map((m) => (
                      <tr
                        key={m.model}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="py-2 pr-4 font-medium text-slate-800">
                          {aiModelLabel(m.model)}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {NUMBER.format(m.calls)}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {NUMBER.format(m.inputTokens)}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {NUMBER.format(m.outputTokens)}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums font-semibold text-slate-900">
                          {formatUsd(m.cost)}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {m.provider === 'gemini'
                            ? NUMBER.format(m.fallbacks)
                            : ''}
                        </td>
                        <td
                          className={`py-2 text-right tabular-nums ${
                            m.errors > 0
                              ? 'font-semibold text-brand-red-primary'
                              : ''
                          }`}
                        >
                          {NUMBER.format(m.errors)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
