import React from 'react';
import { X } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import type { Rubric } from '@/types';

/** D21 — the rubric is student-visible on demand from day one, not withheld until scoring. */
export const ProjectRubricSheet: React.FC<{
  rubric: Rubric;
  maxPoints: number;
  onClose: () => void;
}> = ({ rubric, maxPoints, onClose }) => (
  <Modal
    isOpen
    onClose={onClose}
    ariaLabel={`How this is scored: ${rubric.title}`}
    placement="sheet"
    zIndex="z-dialog"
    maxWidth="max-w-2xl"
    className="max-h-[85vh]!"
    contentClassName="space-y-4 px-5 py-4"
    customHeader={
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
    }
  >
    {rubric.description && (
      <p className="text-sm text-slate-600">{rubric.description}</p>
    )}
    {rubric.criteria.map((criterion) => (
      <section key={criterion.id} className="space-y-2">
        <h3 className="text-sm font-bold text-slate-900">{criterion.name}</h3>
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
  </Modal>
);
