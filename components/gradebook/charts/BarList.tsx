import React from 'react';
import type { ProficiencyScale } from '@/utils/gradebook/gradebookCore';
import { bandFor } from './bands';

export interface BarListRow {
  id: string;
  label: React.ReactNode;
  /** 0-100 unless `max` says otherwise; null draws an empty track. */
  value: number | null;
  /** Right-hand text; defaults to the rounded percent. */
  text?: React.ReactNode;
  /** A second, lighter bar (Compare classes). */
  compare?: number | null;
  /** Middle column, e.g. the assignments a student is missing. */
  detail?: React.ReactNode;
  /** Plain-text label for the row's tooltip and accessible name. */
  title?: string;
}

interface BarListProps {
  rows: BarListRow[];
  /** Colour each bar by its band and name the band in the tooltip; omit for neutral bars. */
  scale?: ProficiencyScale;
  max?: number;
  compareLabel?: string;
  onSelect?: (id: string) => void;
  empty?: string;
  /** Label column width; the mockup uses 34% for cards and more for Explore. */
  labelWidth?: string;
}

const pctText = (v: number | null) => (v === null ? '–' : `${Math.round(v)}%`);

export const BarList: React.FC<BarListProps> = ({
  rows,
  scale,
  max = 100,
  compareLabel,
  onSelect,
  empty = 'No data.',
  labelWidth = 'minmax(90px,34%)',
}) => {
  if (rows.length === 0) {
    return <div className="text-xs text-slate-500">{empty}</div>;
  }
  const hasDetail = rows.some((r) => r.detail !== undefined);
  const cols = hasDetail ? `${labelWidth} 1fr auto` : `${labelWidth} 1fr 52px`;
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => {
        const band = scale ? bandFor(r.value, scale) : null;
        const width =
          r.value === null ? 0 : Math.min(100, (r.value / max) * 100);
        const cmpWidth =
          r.compare === undefined || r.compare === null
            ? null
            : Math.min(100, (r.compare / max) * 100);
        const tip = [
          r.title,
          band ? band.name : null,
          cmpWidth !== null && compareLabel
            ? `${compareLabel} ${pctText(r.compare ?? null)}`
            : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <div
            key={r.id}
            className="grid gap-2.5 items-center text-[13px] text-slate-700"
            style={{ gridTemplateColumns: cols }}
            title={tip || undefined}
          >
            <span className="truncate min-w-0">
              {onSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect(r.id)}
                  className="max-w-full truncate text-left hover:text-brand-blue-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/30 rounded"
                >
                  {r.label}
                </button>
              ) : (
                r.label
              )}
            </span>
            {hasDetail ? (
              <span className="text-xs text-slate-500 truncate min-w-0">
                {r.detail}
              </span>
            ) : (
              <span className="relative h-2 rounded-full bg-slate-100 overflow-hidden">
                <span
                  className={`absolute left-0 rounded-full ${band ? band.bar : 'bg-brand-blue-primary'} ${cmpWidth !== null ? 'top-0 bottom-1/2' : 'inset-y-0'}`}
                  style={{ width: `${width}%` }}
                />
                {cmpWidth !== null && (
                  <span
                    className="absolute left-0 top-1/2 bottom-0 rounded-full bg-brand-blue-primary/35"
                    style={{ width: `${cmpWidth}%` }}
                  />
                )}
              </span>
            )}
            <span className="text-right font-bold text-slate-800">
              {r.text ?? pctText(r.value)}
              {band && <span className="sr-only"> {band.name}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
};
