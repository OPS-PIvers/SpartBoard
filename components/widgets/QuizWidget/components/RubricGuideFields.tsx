// Scoring-guide row fields and the Levels / Scoring guide switch, shared by the rubric builder and the rubric table.
import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { RubricCriterion } from '@/types';
import {
  GUIDE_MAX_POINTS,
  guideLevels,
  guideRowMax,
} from '@/utils/rubricGuide';

type AnchorAttrs = Record<string, string>;

export type GuideFieldAnchor = (
  field: 'guidelines' | 'example' | 'example-add' | 'example-remove' | 'points',
  key: string
) => AnchorAttrs;

const labelClass =
  'block text-slate-600 font-bold uppercase tracking-wider mb-1 text-xs';
const inputCore =
  'bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary/40 focus:border-brand-blue-primary px-3 py-2 text-sm';
const inputClass = `w-full ${inputCore}`;

const autoGrow = (el: HTMLTextAreaElement | null) => {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
};

export const GuideRowFields: React.FC<{
  criterion: RubricCriterion;
  index: number;
  onPatch: (patch: Partial<RubricCriterion>) => void;
  anchor: GuideFieldAnchor;
}> = ({ criterion: c, index, onPatch, anchor }) => {
  const examples = c.guide?.examples ?? [];
  const part = String(index + 1);
  const setExamples = (next: string[]) =>
    onPatch({ guide: { ...c.guide, examples: next } });
  return (
    <div className="space-y-2">
      <textarea
        rows={2}
        ref={autoGrow}
        value={c.description ?? ''}
        onChange={(e) => {
          onPatch({ description: e.target.value || undefined });
          autoGrow(e.target);
        }}
        placeholder="Scoring guidelines"
        aria-label={`Part ${part} scoring guidelines`}
        {...anchor('guidelines', part)}
        className={`${inputClass} resize-y overflow-hidden min-h-[60px]`}
      />
      <div className="space-y-1.5">
        <p className={labelClass}>Example responses</p>
        {examples.map((example, ei) => (
          <React.Fragment key={ei}>
            {ei > 0 && (
              <p className="text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">
                or
              </p>
            )}
            <div className="flex items-start gap-2">
              <textarea
                rows={1}
                ref={autoGrow}
                value={example}
                onChange={(e) => {
                  setExamples(
                    examples.map((x, xi) => (xi === ei ? e.target.value : x))
                  );
                  autoGrow(e.target);
                }}
                placeholder="A response that earns the point"
                aria-label={`Part ${part} example ${ei + 1}`}
                {...anchor('example', `${part}-${ei + 1}`)}
                className={`${inputClass} resize-y overflow-hidden min-h-[38px] italic`}
              />
              <button
                onClick={() =>
                  setExamples(examples.filter((_, xi) => xi !== ei))
                }
                aria-label={`Remove part ${part} example ${ei + 1}`}
                {...anchor('example-remove', `${part}-${ei + 1}`)}
                className="p-1 rounded-lg text-slate-500 hover:text-red-500 hover:bg-red-50 transition-colors focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary/40"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </React.Fragment>
        ))}
        <button
          onClick={() => setExamples([...examples, ''])}
          {...anchor('example-add', part)}
          className="flex items-center gap-1.5 text-xs font-bold text-brand-blue-primary hover:text-brand-blue-dark transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add example
        </button>
      </div>
      <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
        Points
        <input
          type="number"
          min={1}
          max={GUIDE_MAX_POINTS}
          value={guideRowMax(c)}
          onChange={(e) =>
            onPatch({
              levels: guideLevels(parseInt(e.target.value, 10) || 1, c.levels),
            })
          }
          aria-label={`Part ${part} points`}
          {...anchor('points', part)}
          className={`${inputCore} w-20`}
        />
      </label>
    </div>
  );
};

export const RubricTemplateSwitch: React.FC<{
  guide: boolean;
  onSwitch: (toGuide: boolean) => void;
  anchor: AnchorAttrs;
}> = ({ guide, onSwitch, anchor }) => (
  <div
    role="radiogroup"
    aria-label="Rubric type"
    {...anchor}
    className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5"
  >
    {[
      { value: false, label: 'Levels' },
      { value: true, label: 'Scoring guide' },
    ].map((opt) => (
      // no-tour-anchor: one option of the Levels / Scoring guide switch, rendered from a list
      <button
        key={opt.label}
        type="button"
        role="radio"
        aria-checked={guide === opt.value}
        onClick={() => onSwitch(opt.value)}
        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
          guide === opt.value
            ? 'bg-brand-blue-primary text-white'
            : 'text-slate-600 hover:bg-slate-100'
        }`}
      >
        {opt.label}
      </button>
    ))}
  </div>
);
