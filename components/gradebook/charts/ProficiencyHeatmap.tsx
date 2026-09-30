import React from 'react';
import type { ProficiencyScale } from '@/utils/gradebook/gradebookCore';
import { bandFor } from './bands';

export interface HeatmapColumn {
  id: string;
  label: string;
  title?: string;
}

export interface HeatmapRow {
  id: string;
  label: React.ReactNode;
  cells: (number | null)[];
}

interface ProficiencyHeatmapProps {
  scale: ProficiencyScale;
  columns: HeatmapColumn[];
  rows: HeatmapRow[];
  /** Adds a "% {top level}" row. */
  footer?: boolean;
  onSelectRow?: (id: string) => void;
  onSelectColumn?: (id: string) => void;
  /** Wraps each cell's number, e.g. in Private. */
  wrapValue?: (node: React.ReactNode) => React.ReactNode;
  empty?: string;
}

const identity = (n: React.ReactNode) => n;

export const ProficiencyHeatmap: React.FC<ProficiencyHeatmapProps> = ({
  scale,
  columns,
  rows,
  footer = false,
  onSelectRow,
  onSelectColumn,
  wrapValue = identity,
  empty = 'No tagged evidence yet.',
}) => {
  if (columns.length === 0 || rows.length === 0) {
    return <div className="text-xs text-slate-500">{empty}</div>;
  }
  const top = scale.levelNames[0];
  return (
    <div className="overflow-x-auto">
      <div
        role="table"
        className="grid gap-1"
        style={{
          gridTemplateColumns: `minmax(140px,200px) repeat(${columns.length}, minmax(56px, 84px))`,
          minWidth: 140 + columns.length * 60,
        }}
      >
        <span role="columnheader" />
        {columns.map((c) => (
          <span
            key={c.id}
            role="columnheader"
            title={c.title ?? c.label}
            className="flex items-center text-xs text-slate-700 overflow-hidden"
          >
            {onSelectColumn ? (
              <button
                type="button"
                onClick={() => onSelectColumn(c.id)}
                className="font-bold truncate hover:text-brand-blue-primary hover:underline"
              >
                {c.label}
              </button>
            ) : (
              <b className="truncate">{c.label}</b>
            )}
          </span>
        ))}
        {rows.map((r) => (
          <React.Fragment key={r.id}>
            <span
              role="rowheader"
              className="flex items-center text-xs text-slate-700 overflow-hidden whitespace-nowrap"
            >
              {onSelectRow ? (
                <button
                  type="button"
                  onClick={() => onSelectRow(r.id)}
                  className="truncate text-left hover:text-brand-blue-primary hover:underline"
                >
                  {r.label}
                </button>
              ) : (
                <span className="truncate">{r.label}</span>
              )}
            </span>
            {r.cells.map((v, i) => {
              const band = bandFor(v, scale);
              return (
                <span
                  key={columns[i]?.id ?? i}
                  role="cell"
                  title={
                    band
                      ? `${columns[i]?.label ?? ''} ${band.name} (${Math.round(v as number)}%)`
                      : 'No evidence'
                  }
                  className={`h-7 rounded-md grid place-items-center text-[11px] font-bold ${band ? band.cell : 'bg-slate-100 text-slate-400'}`}
                >
                  {wrapValue(v === null ? '–' : Math.round(v))}
                  {band && <span className="sr-only"> {band.name}</span>}
                </span>
              );
            })}
          </React.Fragment>
        ))}
        {footer && (
          <>
            <span className="flex items-center text-xs text-slate-500">
              % {top.toLowerCase()}
            </span>
            {columns.map((c, i) => {
              const vals = rows
                .map((r) => r.cells[i])
                .filter((x): x is number => x !== null);
              const share = vals.length
                ? Math.round(
                    (vals.filter((x) => x >= scale.proficient).length /
                      vals.length) *
                      100
                  )
                : null;
              return (
                <span
                  key={c.id}
                  className="flex items-center justify-center text-xs text-slate-700"
                >
                  {share === null ? '–' : `${share}%`}
                </span>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};
