// Editor panel for whether an app sends results, its questions and the answer key (MINI_APP_RESULTS.md D4, D5, D12).
import React from 'react';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { Toggle } from '@/components/common/Toggle';
import type { MiniAppQuestionType } from '@/types';
import {
  QUESTION_TYPE_LABELS,
  blankQuestion,
  type MiniAppQuestionDraft,
} from '@/utils/miniAppEditorDraft';

const FIELD =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40';
const SMALL_LABEL = 'block text-xs font-medium text-slate-500 mb-1';

const ANSWER_PLACEHOLDER: Partial<Record<MiniAppQuestionType, string>> = {
  mc: 'The right choice',
  multi: 'Each right choice, separated by commas',
  short: 'Each accepted answer, separated by commas',
  order: 'The items in order, separated by commas',
};

const AnswerField: React.FC<{
  row: MiniAppQuestionDraft;
  onChange: (patch: Partial<MiniAppQuestionDraft>) => void;
}> = ({ row, onChange }) => {
  const label =
    row.type === 'short'
      ? 'Accepted answers'
      : row.type === 'multi' || row.type === 'order'
        ? 'Correct answers'
        : 'Correct answer';
  if (row.type === 'other') return null;
  if (row.type === 'tf')
    return (
      <label className="block">
        <span className={SMALL_LABEL}>{label}</span>
        <select
          value={row.answer}
          onChange={(e) => onChange({ answer: e.target.value })}
          className={FIELD}
        >
          <option value="">Not set</option>
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      </label>
    );
  if (row.type === 'numeric')
    return (
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className={SMALL_LABEL}>{label}</span>
          <input
            type="number"
            value={row.answer}
            onChange={(e) => onChange({ answer: e.target.value })}
            className={FIELD}
          />
        </label>
        <label className="block">
          <span className={SMALL_LABEL}>Allow off by</span>
          <input
            type="number"
            min={0}
            value={row.tolerance}
            onChange={(e) => onChange({ tolerance: e.target.value })}
            placeholder="0"
            className={FIELD}
          />
        </label>
      </div>
    );
  return (
    <label className="block">
      <span className={SMALL_LABEL}>{label}</span>
      <input
        value={row.answer}
        onChange={(e) => onChange({ answer: e.target.value })}
        placeholder={ANSWER_PLACEHOLDER[row.type]}
        className={FIELD}
      />
    </label>
  );
};

export const MiniAppKeyPanel: React.FC<{
  collectsResults: boolean;
  onCollectsResultsChange: (on: boolean) => void;
  rows: MiniAppQuestionDraft[];
  onRowsChange: (rows: MiniAppQuestionDraft[]) => void;
  problems: string[];
}> = ({
  collectsResults,
  onCollectsResultsChange,
  rows,
  onRowsChange,
  problems,
}) => {
  const update = (i: number, patch: Partial<MiniAppQuestionDraft>) =>
    onRowsChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <section className="flex flex-col min-h-0" aria-label="Results">
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <span className="text-sm font-semibold text-slate-800">
          Students send results
        </span>
        <Toggle
          checked={collectsResults}
          onChange={onCollectsResultsChange}
          size="sm"
          showLabels={false}
          label="Students send results"
        />
      </div>

      {collectsResults && (
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pb-4">
          {problems.length > 0 && (
            <ul className="py-3 border-b border-slate-200 space-y-1">
              {problems.map((p) => (
                <li
                  key={p}
                  className="flex items-start gap-1.5 text-xs text-amber-800"
                >
                  <AlertTriangle
                    aria-hidden
                    className="w-3.5 h-3.5 mt-px shrink-0"
                  />
                  {p}
                </li>
              ))}
            </ul>
          )}

          <ol>
            {rows.map((row, i) => (
              <li key={i} className="py-3 border-b border-slate-200 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-brand-blue-primary w-6 shrink-0">
                    Q{i + 1}
                  </span>
                  <input
                    value={row.prompt}
                    onChange={(e) => update(i, { prompt: e.target.value })}
                    placeholder="Question"
                    aria-label={`Question ${i + 1}`}
                    className={FIELD}
                  />
                  <button
                    type="button"
                    onClick={() => onRowsChange(rows.filter((_, j) => j !== i))}
                    aria-label={`Remove question ${i + 1}`}
                    className="p-1.5 rounded-md text-slate-400 hover:text-brand-red-primary hover:bg-slate-100 shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-[1fr_5rem_4rem] gap-2 pl-8">
                  <label className="block">
                    <span className={SMALL_LABEL}>Type</span>
                    <select
                      value={row.type}
                      onChange={(e) =>
                        update(i, {
                          type: e.target.value as MiniAppQuestionType,
                          answer: '',
                          tolerance: '',
                        })
                      }
                      className={FIELD}
                    >
                      {Object.entries(QUESTION_TYPE_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={SMALL_LABEL}>ID</span>
                    <input
                      value={row.id}
                      onChange={(e) => update(i, { id: e.target.value })}
                      className={`${FIELD} font-mono`}
                      title="The ID the app sends with this answer"
                    />
                  </label>
                  <label className="block">
                    <span className={SMALL_LABEL}>Points</span>
                    <input
                      type="number"
                      min={0}
                      value={row.points}
                      onChange={(e) => update(i, { points: e.target.value })}
                      placeholder="1"
                      className={FIELD}
                    />
                  </label>
                </div>
                <div className="pl-8">
                  <AnswerField row={row} onChange={(p) => update(i, p)} />
                </div>
              </li>
            ))}
          </ol>

          <button
            type="button"
            onClick={() => onRowsChange([...rows, blankQuestion(rows)])}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue-primary hover:text-brand-blue-dark"
          >
            <Plus className="w-4 h-4" />
            Add question
          </button>
        </div>
      )}
    </section>
  );
};
