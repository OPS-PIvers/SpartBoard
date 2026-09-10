import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import type { LearningTarget, QuestionTargetTag } from '@/types';
import { Z_INDEX } from '@/config/zIndex';
import { isEscapeFromWidgetInput } from '@/utils/domHelpers';
import {
  filterBenchmarks,
  useStandardsCatalog,
} from '@/hooks/useStandardsCatalog';
import { useLearningTargetSources } from '@/hooks/useLearningTargets';
import { tagFromBenchmark, tagFromTarget } from '@/utils/learningTargets';
import { TargetChips } from './TargetChips';

const GRADES = [
  'K',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
];
const MAX_STANDARD_ROWS = 60;

export interface TargetPickerProps {
  open: boolean;
  /** Tags already on the question(s); pre-checked. */
  initial: QuestionTargetTag[];
  /** `add` merges into existing tags; `replace` overwrites (bulk only). */
  onApply: (tags: QuestionTargetTag[], mode: 'add' | 'replace') => void;
  onClose: () => void;
  title?: string;
  /** Offer a Replace action alongside Add (bulk tagging). */
  allowReplace?: boolean;
  /** Preselect the grade filter, e.g. from the teacher's grade. */
  defaultGrade?: string;
}

function gradeMatches(benchmarkGrade: string, grade: string): boolean {
  if (benchmarkGrade === grade) return true;
  const band = benchmarkGrade.match(/^(\d+)-(\d+)$/);
  if (!band) return false;
  const n = Number(grade);
  return n >= Number(band[1]) && n <= Number(band[2]);
}

function targetMatches(target: LearningTarget, query: string): boolean {
  if (!query) return true;
  const hay = `${target.code ?? ''} ${target.label}`.toLowerCase();
  return hay.includes(query);
}

export const TargetPicker: React.FC<TargetPickerProps> = ({
  open,
  initial,
  onApply,
  onClose,
  title = 'Learning targets',
  allowReplace = false,
  defaultGrade = '',
}) => {
  const [query, setQuery] = useState('');
  const [grade, setGrade] = useState(defaultGrade);
  const [selected, setSelected] = useState<Map<string, QuestionTargetTag>>(
    () => new Map(initial.map((t) => [t.id, t]))
  );
  const { benchmarks, loading: standardsLoading } = useStandardsCatalog();
  const { sources } = useLearningTargetSources();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isEscapeFromWidgetInput(event)) return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  const q = query.trim().toLowerCase();
  const standardRows = useMemo(() => {
    const byQuery = filterBenchmarks(benchmarks, { query: q });
    const byGrade = grade
      ? byQuery.filter((b) => gradeMatches(b.grade, grade))
      : byQuery;
    return byGrade.slice(0, MAX_STANDARD_ROWS);
  }, [benchmarks, q, grade]);

  if (!open) return null;

  const toggle = (tag: QuestionTargetTag) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(tag.id)) next.delete(tag.id);
      else next.set(tag.id, tag);
      return next;
    });
  };

  const selectedList = [...selected.values()];

  const row = (tag: QuestionTargetTag, secondary?: string) => (
    <label
      key={tag.id}
      className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-slate-100 cursor-pointer"
    >
      <input
        type="checkbox"
        className="mt-1 accent-brand-blue-primary"
        checked={selected.has(tag.id)}
        onChange={() => toggle(tag)}
      />
      <span className="min-w-0 flex-1 text-sm text-slate-800">
        {tag.code && (
          <span className="font-mono font-semibold text-slate-600 mr-1.5">
            {tag.code}
          </span>
        )}
        <span className="line-clamp-2">{tag.label}</span>
        {secondary && (
          <span className="block text-xs text-slate-500 truncate">
            {secondary}
          </span>
        )}
      </span>
    </label>
  );

  const section = (heading: string, body: React.ReactNode, key?: string) => (
    <section key={key ?? heading} className="mb-3">
      <h5 className="px-2 mb-1 text-xxs font-bold uppercase tracking-wider text-slate-500">
        {heading}
      </h5>
      {body}
    </section>
  );

  const empty = (text: string) => (
    <p className="px-2 py-1 text-xs text-slate-500">{text}</p>
  );

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/40 p-4"
      style={{ zIndex: Z_INDEX.modalNestedContent }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-label={title}
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl bg-white shadow-2xl border border-slate-200"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h4 className="text-sm font-bold text-slate-900">{title}</h4>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded text-slate-500 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-slate-200 space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                autoFocus
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by code or text"
                className="w-full pl-8 pr-2 py-1.5 text-sm rounded-lg border border-slate-300 focus:border-brand-blue-primary focus:outline-none"
              />
            </div>
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              aria-label="Grade"
              className="text-sm rounded-lg border border-slate-300 px-2 py-1.5 bg-white"
            >
              <option value="">All grades</option>
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {g === 'K' ? 'K' : `Grade ${g}`}
                </option>
              ))}
            </select>
          </div>
          {selectedList.length > 0 && (
            <TargetChips
              targets={selectedList}
              onRemove={(id) =>
                setSelected((prev) => {
                  const next = new Map(prev);
                  next.delete(id);
                  return next;
                })
              }
            />
          )}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 py-2">
          {sources
            .filter((s) => s.kind === 'plc')
            .map((s) =>
              section(
                `${s.name} targets`,
                (() => {
                  const rows = (s.list?.targets ?? [])
                    .filter((t) => !t.archived && targetMatches(t, q))
                    .map((t) => row(tagFromTarget(t, 'plc', s.ownerId)));
                  return rows.length ? rows : empty('No matching targets.');
                })(),
                `plc-${s.ownerId ?? s.name}`
              )
            )}
          {sources
            .filter((s) => s.kind === 'personal')
            .map((s) =>
              section(
                'My targets',
                (() => {
                  const rows = (s.list?.targets ?? [])
                    .filter((t) => !t.archived && targetMatches(t, q))
                    .map((t) => row(tagFromTarget(t, 'personal')));
                  return rows.length ? rows : empty('No matching targets.');
                })()
              )
            )}
          {section(
            'Standards',
            standardsLoading
              ? empty('Loading standards…')
              : benchmarks.length === 0
                ? empty('No standards seeded yet. Ask an admin to seed them.')
                : standardRows.length === 0
                  ? empty('No matching standards.')
                  : standardRows.map((b) =>
                      row(tagFromBenchmark(b), `${b.strand} · ${b.standard}`)
                    )
          )}
          {!standardsLoading && standardRows.length === MAX_STANDARD_ROWS && (
            <p className="px-2 pb-2 text-xs text-slate-500">
              Showing the first {MAX_STANDARD_ROWS}. Narrow by grade or search.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm font-semibold rounded-lg text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
          {allowReplace && (
            <button
              type="button"
              onClick={() => onApply(selectedList, 'replace')}
              className="px-3 py-1.5 text-sm font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100"
            >
              Replace tags
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              onApply(selectedList, allowReplace ? 'add' : 'replace')
            }
            className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-brand-blue-primary text-white hover:bg-brand-blue-dark"
          >
            {allowReplace ? 'Add tags' : 'Apply'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
