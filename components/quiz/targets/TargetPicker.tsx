import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import type { LearningTarget, QuestionTargetTag } from '@/types';
import { Z_INDEX } from '@/config/zIndex';
import { isEscapeFromWidgetInput } from '@/utils/domHelpers';
import { useAuth } from '@/context/useAuth';
import { useStandardsCatalog } from '@/hooks/useStandardsCatalog';
import { useLearningTargetSources } from '@/hooks/useLearningTargets';
import { useSubjects } from '@/hooks/useSubjects';
import { ALL_GRADES } from '@/utils/gradeMatch';
import {
  effectiveGrades as targetGrades,
  effectiveSubject as targetSubject,
  tagFromTarget,
} from '@/utils/learningTargets';
import {
  buildStandardsTree,
  filterStandardsTree,
  treeSubjectIds,
} from '@/utils/standardsTree';
import { StandardsTree } from './StandardsTree';
import { TargetChips } from './TargetChips';

const ALL_SUBJECTS = 'all';

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
  /** Preselect a single grade instead of the profile's grades. */
  defaultGrade?: string;
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
  const { effectiveGrades: profileGrades, subjectsTaught } = useAuth();
  const { benchmarks, loading: standardsLoading } = useStandardsCatalog();
  const { sources } = useLearningTargetSources();
  const { byId: subjectById } = useSubjects();

  const [query, setQuery] = useState('');
  // Profile-seeded filters; changes last for this open only.
  const [grades, setGrades] = useState<string[]>(() =>
    defaultGrade ? [defaultGrade] : profileGrades
  );
  const [subjectChoice, setSubjectChoice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Map<string, QuestionTargetTag>>(
    () => new Map(initial.map((t) => [t.id, t]))
  );

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

  const tree = useMemo(() => buildStandardsTree(benchmarks), [benchmarks]);
  const catalogSubjects = useMemo(() => treeSubjectIds(tree), [tree]);
  const catalogById = useMemo(
    () => new Map(benchmarks.map((b) => [b.id, b])),
    [benchmarks]
  );
  // Open on the teacher's only catalog subject; otherwise show every content area.
  const defaultSubject = useMemo(() => {
    const taught = subjectsTaught.filter((s) => catalogSubjects.includes(s));
    return taught.length === 1 ? taught[0] : ALL_SUBJECTS;
  }, [subjectsTaught, catalogSubjects]);
  const subject = subjectChoice ?? defaultSubject;
  const subjectLabel = (id: string) => subjectById.get(id)?.label ?? id;

  const q = query.trim().toLowerCase();
  const filteredTree = useMemo(
    () =>
      filterStandardsTree(tree, {
        subject: subject === ALL_SUBJECTS ? null : subject,
        grades,
        query: q,
      }),
    [tree, subject, grades, q]
  );

  const targetVisible = (target: LearningTarget): boolean => {
    if (target.archived || !targetMatches(target, q)) return false;
    const g = targetGrades(target, catalogById);
    if (grades.length > 0 && g && !g.some((x) => grades.includes(x))) {
      return false;
    }
    const s = targetSubject(target, catalogById);
    return subject === ALL_SUBJECTS || s === null || s === subject;
  };

  if (!open) return null;

  const toggle = (tag: QuestionTargetTag) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(tag.id)) next.delete(tag.id);
      else next.set(tag.id, tag);
      return next;
    });
  };

  const toggleGrade = (grade: string) =>
    setGrades((cur) =>
      cur.includes(grade) ? cur.filter((g) => g !== grade) : [...cur, grade]
    );

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

  const chip = (label: string, active: boolean, onClick: () => void) => (
    <button
      key={label}
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-w-[1.9rem] rounded-md border px-1.5 py-0.5 text-xs font-bold transition-colors ${
        active
          ? 'border-brand-blue-primary bg-brand-blue-primary text-white'
          : 'border-slate-200 bg-white text-slate-600 hover:border-brand-blue-light'
      }`}
    >
      {label}
    </button>
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
            {catalogSubjects.length > 0 && (
              <select
                value={subject}
                onChange={(e) => setSubjectChoice(e.target.value)}
                aria-label="Content area"
                className="text-sm rounded-lg border border-slate-300 px-2 py-1.5 bg-white"
              >
                <option value={ALL_SUBJECTS}>All content areas</option>
                {catalogSubjects.map((id) => (
                  <option key={id} value={id}>
                    {subjectLabel(id)}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div
            role="group"
            aria-label="Grades"
            className="flex flex-wrap items-center gap-1"
          >
            {chip('All grades', grades.length === 0, () => setGrades([]))}
            {ALL_GRADES.map((g) =>
              chip(g, grades.includes(g), () => toggleGrade(g))
            )}
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
                    .filter(targetVisible)
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
                    .filter(targetVisible)
                    .map((t) => row(tagFromTarget(t, 'personal')));
                  return rows.length ? rows : empty('No matching targets.');
                })()
              )
            )}
          {section(
            'Standards',
            standardsLoading ? (
              empty('Loading standards…')
            ) : benchmarks.length === 0 ? (
              empty('No standards seeded yet. Ask an admin to seed them.')
            ) : filteredTree.subjects.length === 0 ? (
              empty('No matching standards. Try more grades or "All grades".')
            ) : (
              <StandardsTree
                tree={filteredTree}
                searching={q.length > 0}
                showSubjects={subject === ALL_SUBJECTS}
                subjectLabel={subjectLabel}
                isSelected={(id) => selected.has(id)}
                onToggle={toggle}
              />
            )
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
