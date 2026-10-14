/** A section heading in the quiz editor's question list (QUIZ_EXAMVIEW_IMPORT.md E12). */

import React from 'react';
import { GripVertical, Heading, Trash2 } from 'lucide-react';
import type { QuizSection } from '@/types';
import { tourTypeAttr } from '@/config/tourAnchors';

interface SectionRowProps {
  section: QuizSection;
  /** Questions a student sees under this heading, bank draws counted. */
  questionCount: number;
  /** Offer the "After this section" Stop menu (quiz-import-versions, not on the last section). */
  canStop?: boolean;
  onUpdate: (id: string, patch: Partial<QuizSection>) => void;
  onRemove: (id: string) => void;
  dragHandleAttributes: React.HTMLAttributes<HTMLElement>;
  dragHandleListeners: Record<string, (event: Event) => void> | undefined;
}

export const SectionRow: React.FC<SectionRowProps> = ({
  section,
  questionCount,
  canStop = false,
  onUpdate,
  onRemove,
  dragHandleAttributes,
  dragHandleListeners,
}) => {
  const count = section.chooseCount;
  // A count at or above the total means "all", so the choices stop one short.
  const choices = Array.from(
    { length: Math.max(0, questionCount - 1) },
    (_, i) => i + 1
  );
  return (
    <div className="group flex items-start gap-2 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-2">
      <button
        type="button"
        {...dragHandleAttributes}
        onPointerDown={
          dragHandleListeners?.onPointerDown as
            React.PointerEventHandler<HTMLButtonElement> | undefined
        }
        aria-label="Drag to reorder"
        {...tourTypeAttr('quiz-editor.section-drag', 'quiz')}
        className="mt-1 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing touch-none p-0.5"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <Heading
        className="mt-1.5 h-3.5 w-3.5 shrink-0 text-slate-500"
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <input
          type="text"
          value={section.title}
          onChange={(e) => onUpdate(section.id, { title: e.target.value })}
          aria-label="Section title"
          placeholder="Section title"
          {...tourTypeAttr('quiz-editor.section-title', 'quiz')}
          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm font-bold text-slate-800 focus:border-brand-blue-primary focus:outline-none"
        />
        <textarea
          value={section.directions ?? ''}
          onChange={(e) =>
            onUpdate(section.id, {
              directions: e.target.value ? e.target.value : undefined,
            })
          }
          aria-label="Section directions"
          placeholder="Directions (optional)"
          {...tourTypeAttr('quiz-editor.section-directions', 'quiz')}
          rows={2}
          className="w-full resize-y rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-brand-blue-primary focus:outline-none"
        />
        <label className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
          Students answer
          <select
            value={count && count < questionCount ? String(count) : 'all'}
            onChange={(e) =>
              onUpdate(section.id, {
                chooseCount:
                  e.target.value === 'all' ? undefined : Number(e.target.value),
              })
            }
            disabled={questionCount < 2}
            {...tourTypeAttr('quiz-editor.section-choose-count', 'quiz')}
            className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-700 focus:border-brand-blue-primary focus:outline-none disabled:opacity-60"
          >
            <option value="all">all</option>
            {choices.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          {`of these ${questionCount} ${questionCount === 1 ? 'question' : 'questions'}`}
        </label>
        {canStop && (
          <label className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
            After this section
            <select
              value={section.stopAfter === true ? 'wait' : 'go'}
              onChange={(e) =>
                onUpdate(section.id, {
                  stopAfter: e.target.value === 'wait' ? true : undefined,
                })
              }
              {...tourTypeAttr('quiz-editor.section-stop', 'quiz')}
              className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-700 focus:border-brand-blue-primary focus:outline-none"
            >
              <option value="go">Go on</option>
              <option value="wait">Wait for teacher</option>
            </select>
          </label>
        )}
      </div>
      <button
        type="button"
        onClick={() => onRemove(section.id)}
        aria-label="Remove section"
        title="Remove section"
        {...tourTypeAttr('quiz-editor.section-remove', 'quiz')}
        className="text-slate-300 hover:text-red-500 hover:bg-red-50 rounded p-1 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
