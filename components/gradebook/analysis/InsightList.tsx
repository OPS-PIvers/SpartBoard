import React from 'react';
import { Private } from '@/components/gradebook/Private';
import { tourFieldAttr } from '@/config/tourAnchors';
import type { GradebookInsight } from '@/utils/gradebook/gradebookInsights';

const TONE_DOT: Record<GradebookInsight['tone'], string> = {
  bad: 'bg-brand-red-primary',
  warn: 'bg-amber-600',
  info: 'bg-brand-blue-primary',
};

/** D31 Needs attention list; each row opens the view that explains it. */
export const InsightList: React.FC<{
  insights: GradebookInsight[];
  onSelect: (insight: GradebookInsight) => void;
}> = ({ insights, onSelect }) => {
  if (insights.length === 0) {
    return (
      <div className="text-xs text-slate-500">Nothing needs attention.</div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {insights.map((i) => (
        <button
          key={i.id}
          type="button"
          {...tourFieldAttr('gradebook.analysis.insight', 'gradebook', i.id)}
          onClick={() => onSelect(i)}
          className="flex w-full items-start gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5 text-left text-[13px] text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/30"
        >
          <span
            aria-hidden
            className={`mt-1.5 h-2 w-2 flex-none rounded-full ${TONE_DOT[i.tone]}`}
          />
          <span>{i.sensitive ? <Private>{i.text}</Private> : i.text}</span>
        </button>
      ))}
    </div>
  );
};
