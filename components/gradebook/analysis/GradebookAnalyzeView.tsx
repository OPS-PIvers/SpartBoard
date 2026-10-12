import React from 'react';
import { Loader2 } from 'lucide-react';
import { Private } from '@/components/gradebook/Private';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import { BarList, ScoreHistogram } from '@/components/gradebook/charts';
import type { ProficiencyScale } from '@/utils/gradebook/gradebookCore';
import {
  formatPct,
  mean,
  median,
  targetName,
  type ColumnSummary,
} from '@/utils/gradebook/gradebookAnalysis';
import type { ItemAnalysisRow } from '@/hooks/gradebook/useItemAnalysis';
import { AnalysisCard, Kpi } from './AnalysisCard';

export interface GradebookAnalyzeViewProps {
  title: string;
  kindLabel: string;
  summary: ColumnSummary;
  scale: ProficiencyScale;
  /** null while loading; 'none' when the activity has no question data. */
  items: ItemAnalysisRow[] | null | 'none';
  onOpenStudent: (uid: string) => void;
  onClose: () => void;
}

export const GradebookAnalyzeView: React.FC<GradebookAnalyzeViewProps> = ({
  title,
  kindLabel,
  summary,
  scale,
  items,
  onOpenStudent,
  onClose,
}) => {
  const vals = summary.values;
  return (
    <div className="flex max-h-[92vh] w-full flex-col gap-4 overflow-auto rounded-2xl bg-slate-50 px-6 pb-6 shadow-xl">
      <header className="sticky top-0 z-10 -mx-6 flex items-center gap-2.5 border-b border-slate-100 bg-white px-6 py-[18px]">
        <h2 className="m-0 truncate text-lg font-bold text-slate-900">
          {title}
        </h2>
        <span className="inline-flex whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200">
          {kindLabel}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          {...tourAttr('gradebook.analyze.close')}
          onClick={onClose}
          className="inline-flex h-[34px] items-center rounded-lg border border-slate-300 bg-white px-3.5 text-[13px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Close
        </button>
      </header>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-4">
        <Kpi
          value={`${summary.submitted}/${summary.assigned.length}`}
          label="Submitted"
        />
        <Kpi
          value={<Private>{formatPct(mean(vals))}</Private>}
          label="Average"
        />
        <Kpi
          value={<Private>{formatPct(median(vals))}</Private>}
          label="Median"
        />
        <Kpi
          value={
            <Private>
              {vals.length
                ? `${Math.round(Math.min(...vals))}–${Math.round(Math.max(...vals))}`
                : '–'}
            </Private>
          }
          label="Range"
        />
      </div>
      <div className="grid grid-cols-12 gap-4">
        <AnalysisCard title="Score distribution">
          <ScoreHistogram
            values={vals}
            scale={scale}
            ariaLabel={`Distribution of scores on ${title}`}
          />
        </AnalysisCard>
        <AnalysisCard title="Item analysis">
          {items === null ? (
            <Loader2
              className="h-5 w-5 animate-spin text-slate-400"
              aria-label="Loading"
            />
          ) : (
            <BarList
              rows={
                items === 'none'
                  ? []
                  : items.map((x) => ({
                      id: x.id,
                      label: x.label,
                      title: x.title,
                      value: x.pct,
                    }))
              }
              scale={scale}
              empty="No question data for this activity."
            />
          )}
        </AnalysisCard>
        <AnalysisCard title="By learning target">
          <BarList
            rows={summary.targets.map(({ target, pct }) => ({
              id: target.id,
              label: target.code,
              title: targetName(target),
              value: pct,
              text: <Private>{formatPct(pct)}</Private>,
            }))}
            empty="Not tagged to any targets."
          />
        </AnalysisCard>
        <AnalysisCard title="Not submitted">
          {summary.notSubmitted.length === 0 ? (
            <div className="text-xs text-slate-500">Everyone submitted.</div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {summary.notSubmitted.map((s) => (
                <button
                  key={s.uid}
                  type="button"
                  {...tourFieldAttr(
                    'gradebook.analyze.student',
                    'gradebook',
                    s.uid
                  )}
                  onClick={() => onOpenStudent(s.uid)}
                  className="self-start text-left text-xs text-slate-700 hover:text-brand-blue-primary hover:underline"
                >
                  <Private>{s.name}</Private>
                </button>
              ))}
            </div>
          )}
        </AnalysisCard>
      </div>
    </div>
  );
};
