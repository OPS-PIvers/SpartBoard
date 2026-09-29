import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import type { LearningTarget, QuestionTargetTag } from '@/types';
import { Z_INDEX } from '@/config/zIndex';
import { isEscapeFromWidgetInput } from '@/utils/domHelpers';
import { useAuth } from '@/context/useAuth';
import { useStandardsCatalog } from '@/hooks/useStandardsCatalog';
import {
  useLearningTargetSources,
  type LearningTargetSource,
} from '@/hooks/useLearningTargets';
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
const ALL_GRADES_CHOICE = 'all';
const MY_GRADES_CHOICE = 'mine';
const STANDARDS_SOURCE = 'standards';
const SOURCE_STORAGE_KEY = 'spart.targetPicker.source';

const sourceKey = (s: LearningTargetSource): string =>
  s.kind === 'plc' ? `plc:${s.ownerId ?? s.name}` : 'personal';

const readLastSource = (): string => {
  try {
    return localStorage.getItem(SOURCE_STORAGE_KEY) ?? STANDARDS_SOURCE;
  } catch {
    return STANDARDS_SOURCE;
  }
};

const writeLastSource = (key: string) => {
  try {
    localStorage.setItem(SOURCE_STORAGE_KEY, key);
  } catch {
    // Storage blocked; the picker just opens on Standards next time.
  }
};

// "Grades 9-12" for a contiguous run, otherwise "Grades 6, 8".
const gradesLabel = (grades: string[]): string => {
  const idx = grades
    .map((g) => ALL_GRADES.indexOf(g))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
  const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  const names = idx.map((i) => ALL_GRADES[i]);
  return contiguous && names.length > 1
    ? `Grades ${names[0]}-${names[names.length - 1]}`
    : `Grades ${names.join(', ')}`;
};

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
  /** Standards only, benchmarks only (for linking standards to a learning target). */
  benchmarksOnly?: boolean;
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
  benchmarksOnly = false,
}) => {
  const { effectiveGrades: profileGrades, subjectsTaught } = useAuth();
  const { benchmarks, loading: standardsLoading } = useStandardsCatalog();
  const { sources } = useLearningTargetSources();
  const { byId: subjectById } = useSubjects();

  const [query, setQuery] = useState('');
  // Profile-seeded filters; changes last for this open only.
  const [gradeChoice, setGradeChoice] = useState<string>(() => {
    if (defaultGrade) return defaultGrade;
    if (profileGrades.length > 1) return MY_GRADES_CHOICE;
    return profileGrades[0] ?? ALL_GRADES_CHOICE;
  });
  const [sourceChoice, setSourceChoice] = useState<string>(() =>
    benchmarksOnly ? STANDARDS_SOURCE : readLastSource()
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
  const grades = useMemo(
    () =>
      gradeChoice === ALL_GRADES_CHOICE
        ? []
        : gradeChoice === MY_GRADES_CHOICE
          ? profileGrades
          : [gradeChoice],
    [gradeChoice, profileGrades]
  );
  const targetSources = benchmarksOnly ? [] : sources;
  // A remembered PLC the teacher has since left falls back to Standards.
  const activeTargetSource = targetSources.find(
    (s) => sourceKey(s) === sourceChoice
  );

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

  const selectedList = [...selected.values()];

  const row = (tag: QuestionTargetTag) => (
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
      <span className="min-w-0 flex-1 line-clamp-2 text-sm text-slate-800">
        {tag.code && (
          <span className="font-mono font-semibold text-slate-600 mr-1.5">
            {tag.code}
          </span>
        )}
        {tag.label}
      </span>
    </label>
  );

  const empty = (text: string) => (
    <p className="px-2 py-1 text-xs text-slate-500">{text}</p>
  );

  const SELECT_CLASS =
    'text-sm rounded-lg border border-slate-300 px-2 py-1.5 bg-white text-slate-700 focus:border-brand-blue-primary focus:outline-none';

  const targetRows = (source: LearningTargetSource) => {
    const rows = (source.list?.targets ?? [])
      .filter(targetVisible)
      .map((t) => row(tagFromTarget(t, source.kind, source.ownerId)));
    return rows.length ? rows : empty('No matching targets.');
  };

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
        className="w-full max-w-3xl h-[min(80vh,40rem)] flex flex-col rounded-xl bg-white shadow-2xl border border-slate-200"
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
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[10rem]">
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
            {targetSources.length > 0 && (
              <select
                value={activeTargetSource ? sourceChoice : STANDARDS_SOURCE}
                onChange={(e) => {
                  setSourceChoice(e.target.value);
                  writeLastSource(e.target.value);
                }}
                aria-label="Source"
                className={`${SELECT_CLASS} max-w-[10rem]`}
              >
                <option value={STANDARDS_SOURCE}>Standards</option>
                {targetSources.map((s) => (
                  <option key={sourceKey(s)} value={sourceKey(s)}>
                    {s.kind === 'personal' ? 'My targets' : `${s.name} targets`}
                  </option>
                ))}
              </select>
            )}
            <select
              value={gradeChoice}
              onChange={(e) => setGradeChoice(e.target.value)}
              aria-label="Grade"
              className={SELECT_CLASS}
            >
              <option value={ALL_GRADES_CHOICE}>All grades</option>
              {profileGrades.length > 1 && (
                <option value={MY_GRADES_CHOICE}>
                  {gradesLabel(profileGrades)}
                </option>
              )}
              {ALL_GRADES.map((g) => (
                <option key={g} value={g}>
                  Grade {g}
                </option>
              ))}
            </select>
            {catalogSubjects.length > 0 && (
              <select
                value={subject}
                onChange={(e) => setSubjectChoice(e.target.value)}
                aria-label="Content area"
                className={SELECT_CLASS}
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

        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pt-2 pb-4">
          {activeTargetSource ? (
            targetRows(activeTargetSource)
          ) : standardsLoading ? (
            empty('Loading standards…')
          ) : benchmarks.length === 0 ? (
            empty('No standards seeded yet. Ask an admin to seed them.')
          ) : filteredTree.subjects.length === 0 ? (
            empty('No matching standards. Try another grade or "All grades".')
          ) : (
            <StandardsTree
              tree={filteredTree}
              searching={q.length > 0}
              showSubjects={subject === ALL_SUBJECTS}
              subjectLabel={subjectLabel}
              isSelected={(id) => selected.has(id)}
              onToggle={toggle}
              standardSelectable={!benchmarksOnly}
            />
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
