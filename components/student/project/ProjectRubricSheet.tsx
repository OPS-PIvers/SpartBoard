import React from 'react';
import { X } from 'lucide-react';
import type { Rubric } from '@/types';

/** D21 — the rubric is student-visible on demand from day one, not withheld until scoring. */
export const ProjectRubricSheet: React.FC<{
  rubric: Rubric;
  maxPoints: number;
  onClose: () => void;
}> = ({ rubric, maxPoints, onClose }) => (
  <div
    className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-6"
    role="dialog"
    aria-modal="true"
    aria-label={`How this is scored: ${rubric.title}`}
  >
    <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold text-slate-900">
            {rubric.title}
          </h2>
          <p className="text-sm text-slate-500">{maxPoints} points in total</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the rubric"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50"
        >
          <X className="h-4 w-4" strokeWidth={2.25} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {rubric.description && (
          <p className="text-sm text-slate-600">{rubric.description}</p>
        )}
        {rubric.criteria.map((criterion) => (
          <section key={criterion.id} className="space-y-2">
            <h3 className="text-sm font-bold text-slate-900">
              {criterion.name}
            </h3>
            {criterion.description && (
              <p className="text-xs text-slate-500">{criterion.description}</p>
            )}
            <ul className="space-y-1.5">
              {/* Storage order is low → high; a reader wants the top first. */}
              {[...criterion.levels]
                .sort((a, b) => b.points - a.points)
                .map((level) => (
                  <li
                    key={level.id}
                    className="rounded-xl border border-slate-200 px-3 py-2"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-semibold text-slate-800">
                        {level.label}
                      </span>
                      <span className="shrink-0 text-xs font-bold text-slate-500">
                        {level.points} pt{level.points === 1 ? '' : 's'}
                      </span>
                    </div>
                    {level.description && (
                      <p className="mt-1 text-xs text-slate-600">
                        {level.description}
                      </p>
                    )}
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  </div>
);
