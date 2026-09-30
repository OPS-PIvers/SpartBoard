import React, { useCallback, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ProficiencyLevel } from '@/utils/gradebook/gradebookCore';
import {
  formatDueDate,
  levelForPct as levelOf,
  studentTargets,
  type StudentGradesData,
  type TargetEvidenceView,
  type TargetView,
} from '@/utils/gradebook/studentGrades';

type Cutoffs = StudentGradesData['cutoffs'];

const LEVEL: Record<
  ProficiencyLevel,
  { bar: string; cell: string; text: string; hex: string }
> = {
  0: {
    bar: 'bg-emerald-600',
    cell: 'bg-emerald-100 text-emerald-800',
    text: 'text-emerald-700',
    hex: '#059669',
  },
  1: {
    bar: 'bg-amber-600',
    cell: 'bg-amber-100 text-amber-800',
    text: 'text-amber-700',
    hex: '#d97706',
  },
  2: {
    bar: 'bg-brand-red-primary',
    cell: 'bg-rose-100 text-rose-800',
    text: 'text-rose-700',
    hex: '#ad2122',
  },
};

const EvidenceChart: React.FC<{
  evidence: TargetEvidenceView[];
  cutoffs: Cutoffs;
}> = ({ evidence, cutoffs }) => {
  const [W, setW] = useState(420);
  const observe = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setW(Math.max(240, Math.round(e.contentRect.width)))
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 180;
  const L = 30;
  const R = 12;
  const T = 10;
  const B = 22;
  const x = (n: number) =>
    evidence.length < 2
      ? (L + W - R) / 2
      : L + (n * (W - L - R)) / (evidence.length - 1);
  const y = (v: number) => T + (1 - Math.min(100, v) / 100) * (H - T - B);
  const path = evidence
    .map((e, n) => `${n ? 'L' : 'M'}${x(n).toFixed(1)},${y(e.pct).toFixed(1)}`)
    .join(' ');
  return (
    <div ref={observe}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        role="img"
        aria-label="Evidence over time"
        className="block"
      >
        {[0, cutoffs.approaching, cutoffs.proficient, 100].map((v) => (
          <g key={v}>
            <line
              x1={L}
              x2={W - R}
              y1={y(v)}
              y2={y(v)}
              stroke="#e2e8f0"
              strokeDasharray={
                v === cutoffs.approaching || v === cutoffs.proficient
                  ? '3 3'
                  : undefined
              }
            />
            <text
              x={L - 6}
              y={y(v) + 4}
              textAnchor="end"
              fontSize={11}
              fill="#64748b"
            >
              {v}
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke="#2d3f89" strokeWidth={2.5} />
        {evidence.map((e, n) => (
          <g key={`${e.sessionId}-${n}`}>
            <circle
              cx={x(n)}
              cy={y(e.pct)}
              r={4.5}
              fill={LEVEL[levelOf(e.pct, cutoffs)].hex}
              stroke="#fff"
              strokeWidth={1.5}
            >
              <title>{`${e.title}: ${Math.round(e.pct)}%`}</title>
            </circle>
            <text
              x={x(n)}
              y={H - 6}
              textAnchor={
                evidence.length < 2
                  ? 'middle'
                  : n === 0
                    ? 'start'
                    : n === evidence.length - 1
                      ? 'end'
                      : 'middle'
              }
              fontSize={11}
              fill="#64748b"
            >
              {formatDueDate(e.at)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
};

const TargetRow: React.FC<{
  target: TargetView;
  data: StudentGradesData;
  open: boolean;
  onToggle: () => void;
}> = ({ target, data, open, onToggle }) => {
  const style = LEVEL[target.level];
  const n = target.evidence.length;
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-5 py-4 text-left transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue-primary sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto]"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm text-slate-900">
            {target.code && <b className="mr-1">{target.code}</b>}
            {target.label ?? 'Learning target'}
          </span>
          <span className="text-xs text-slate-500">
            {n} {n === 1 ? 'piece' : 'pieces'} of evidence
          </span>
        </span>
        <span className="col-span-2 row-start-2 flex flex-wrap gap-1 sm:col-span-1 sm:row-start-auto">
          {target.evidence.map((e, i) => (
            <span
              key={`${e.sessionId}-${i}`}
              title={`${e.title}: ${Math.round(e.pct)}%`}
              className={`grid h-7 w-9 place-items-center rounded text-xs font-semibold tabular-nums ${LEVEL[levelOf(e.pct, data.cutoffs)].cell}`}
            >
              {Math.round(e.pct)}
            </span>
          ))}
        </span>
        <span className="col-start-2 row-start-1 text-right sm:col-start-auto sm:row-start-auto">
          <span className="block text-lg font-bold tabular-nums text-slate-900">
            {Math.round(target.pct)}%
          </span>
          <span className={`text-xs font-semibold ${style.text}`}>
            {data.levelNames[target.level]}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`hidden h-4 w-4 text-slate-400 transition-transform sm:block ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="border-t border-slate-100 px-5 py-4">
          <EvidenceChart evidence={target.evidence} cutoffs={data.cutoffs} />
          <table className="mt-2 w-full text-sm">
            <tbody>
              {target.evidence.map((e, i) => (
                <tr
                  key={`${e.sessionId}-${i}`}
                  className="border-t border-slate-100"
                >
                  <td className="py-1.5 text-slate-800">{e.title}</td>
                  <td className="w-20 py-1.5 text-right text-slate-500">
                    {formatDueDate(e.at)}
                  </td>
                  <td
                    className={`w-16 py-1.5 text-right font-semibold tabular-nums ${LEVEL[levelOf(e.pct, data.cutoffs)].text}`}
                  >
                    {Math.round(e.pct)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </li>
  );
};

export const StudentTargetsView: React.FC<{ data: StudentGradesData }> = ({
  data,
}) => {
  const targets = useMemo(() => studentTargets(data), [data]);
  const [openId, setOpenId] = useState<string | null>(
    targets[0]?.targetId ?? null
  );
  const counts: [number, number, number] = [0, 0, 0];
  for (const t of targets) counts[t.level]++;
  if (targets.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-slate-500">
        <b className="mb-1 block text-[15px] text-slate-900">
          No learning targets yet
        </b>
        They show up once your teacher shares scored work tagged to them.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2 px-1">
        <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
          {([0, 1, 2] as const).map((lvl) =>
            counts[lvl] ? (
              <span
                key={lvl}
                className={LEVEL[lvl].bar}
                style={{ flex: counts[lvl] }}
              />
            ) : null
          )}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-700">
          {([0, 1, 2] as const).map((lvl) => (
            <span key={lvl}>
              <b className={`tabular-nums ${LEVEL[lvl].text}`}>{counts[lvl]}</b>{' '}
              {data.levelNames[lvl]}
            </span>
          ))}
        </div>
      </section>
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        {targets.map((t) => (
          <TargetRow
            key={t.targetId}
            target={t}
            data={data}
            open={openId === t.targetId}
            onToggle={() =>
              setOpenId((id) => (id === t.targetId ? null : t.targetId))
            }
          />
        ))}
      </ul>
    </div>
  );
};
