import React, { useMemo, useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import type {
  PrintTreeNode,
  PrintTreeSection,
} from '@/utils/quizResultsPrintTree';

export interface PrintTreeStudent {
  key: string;
  /** "Last, First", or the on-screen label while names are hidden. */
  name: string;
  /** "Not started" / "In progress", absent once submitted. */
  detail?: string;
}

export interface PrintStudentTreeProps {
  nodes: readonly PrintTreeNode[];
  students: ReadonlyMap<string, PrintTreeStudent>;
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  /** Fills its column instead of scrolling after about eight rows. */
  fill?: boolean;
}

const Box: React.FC<{ checked: boolean }> = ({ checked }) => (
  <span
    aria-hidden
    className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
      checked
        ? 'border-brand-blue-primary bg-brand-blue-primary text-white'
        : 'border-slate-300 bg-white'
    }`}
  >
    {checked && <Check className="h-3 w-3" strokeWidth={3} />}
  </span>
);

const countText = (picked: number, total: number) =>
  picked === 0 || picked === total ? String(total) : `${picked} of ${total}`;

/** Course > section > student checklist; a Course or section row picks all its students. */
export const PrintStudentTree: React.FC<PrintStudentTreeProps> = ({
  nodes,
  students,
  selected,
  onChange,
  fill = false,
}) => {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const allKeys = useMemo(
    () =>
      nodes.flatMap((n) =>
        n.kind === 'course' ? n.sections.flatMap((s) => s.keys) : n.section.keys
      ),
    [nodes]
  );
  const picked = allKeys.filter((k) => selected.has(k)).length;
  // One section opens on its own so a single class is one click from its students.
  const onlyOne = nodes.length === 1 && nodes[0].kind === 'section';

  const setKeys = (keys: readonly string[], on: boolean) => {
    const next = new Set(selected);
    for (const k of keys) {
      if (on) next.add(k);
      else next.delete(k);
    }
    onChange(next);
  };
  const toggleOpen = (id: string, isOpen: boolean) =>
    setOpen((prev) => ({ ...prev, [id]: !isOpen }));

  // Row numbers for tour anchors, counted over the whole tree so they don't shift as rows open.
  const { groupRowOf, studentRowOf } = useMemo(() => {
    const groups = new Map<string, number>();
    const rows = new Map<string, number>();
    const addSection = (sec: PrintTreeSection) => {
      groups.set(sec.id, groups.size + 1);
      for (const k of sec.keys) rows.set(k, rows.size + 1);
    };
    for (const n of nodes) {
      if (n.kind === 'section') addSection(n.section);
      else {
        groups.set(n.id, groups.size + 1);
        n.sections.forEach(addSection);
      }
    }
    return { groupRowOf: groups, studentRowOf: rows };
  }, [nodes]);

  const chevron = (
    id: string,
    name: string,
    isOpen: boolean,
    anchor: ReturnType<typeof tourFieldAttr>
  ) => (
    <button
      type="button"
      onClick={() => toggleOpen(id, isOpen)}
      aria-expanded={isOpen}
      aria-label={`${isOpen ? 'Hide' : 'Show'} ${name}`}
      {...anchor}
      className="touch-target-expand shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-brand-blue-primary"
    >
      <ChevronRight
        className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-90' : ''}`}
        aria-hidden
      />
    </button>
  );

  const groupRow = (
    label: string,
    keys: readonly string[],
    indent: string,
    strong: boolean,
    anchor: ReturnType<typeof tourFieldAttr>,
    toggle: React.ReactNode
  ) => {
    const n = keys.filter((k) => selected.has(k)).length;
    const all = n === keys.length && keys.length > 0;
    return (
      <div className={`flex items-center gap-1 py-1 pr-1.5 ${indent}`}>
        <button
          type="button"
          role="checkbox"
          aria-checked={all}
          aria-label={label}
          onClick={() => setKeys(keys, !all)}
          {...anchor}
          className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1.5 py-1 text-left text-sm [-webkit-tap-highlight-color:transparent] hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40 ${
            strong ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'
          }`}
        >
          <Box checked={all} />
          <span className="min-w-0 flex-1 wrap-anywhere">{label}</span>
          <span className="shrink-0 text-xs font-normal text-slate-500">
            {countText(n, keys.length)}
          </span>
        </button>
        {toggle}
      </div>
    );
  };

  const studentRows = (section: PrintTreeSection, indent: string) =>
    section.keys.map((key) => {
      const s = students.get(key);
      const on = selected.has(key);
      return (
        <button
          key={key}
          type="button"
          role="checkbox"
          aria-checked={on}
          aria-label={s?.name ?? key}
          onClick={() => setKeys([key], !on)}
          {...tourFieldAttr(
            'quiz-print.results-student-select',
            'quiz',
            `row-${studentRowOf.get(key) ?? 0}`
          )}
          className={`flex w-full items-center gap-2.5 py-1.5 pr-3 text-left text-sm text-slate-800 [-webkit-tap-highlight-color:transparent] hover:bg-slate-50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue-primary/40 ${indent}`}
        >
          <Box checked={on} />
          <span className="min-w-0 flex-1 wrap-anywhere">{s?.name}</span>
          {s?.detail && (
            <span className="shrink-0 text-xs text-slate-500">{s.detail}</span>
          )}
        </button>
      );
    });

  const sectionBlock = (section: PrintTreeSection, nested: boolean) => {
    const isOpen = open[section.id] ?? onlyOne;
    const groupKey = `row-${groupRowOf.get(section.id) ?? 0}`;
    return (
      <div key={section.id}>
        {groupRow(
          section.name,
          section.keys,
          nested ? 'pl-7' : 'pl-1.5',
          !nested,
          tourFieldAttr('quiz-print.results-section', 'quiz', groupKey),
          chevron(
            section.id,
            section.name,
            isOpen,
            tourFieldAttr('quiz-print.results-section-expand', 'quiz', groupKey)
          )
        )}
        {isOpen && (
          <div role="group" aria-label={section.name}>
            {studentRows(section, nested ? 'pl-[3.75rem]' : 'pl-9')}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={fill ? 'flex min-h-0 flex-1 flex-col' : ''}>
      <div className="flex items-center gap-3">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Students
        </span>
        <span className="text-xs text-slate-500">
          {picked} of {allKeys.length}
        </span>
        <span className="ml-auto flex gap-3">
          <button
            type="button"
            onClick={() => setKeys(allKeys, true)}
            disabled={picked === allKeys.length}
            {...tourTypeAttr('quiz-print.results-select-all', 'quiz')}
            className="text-xs font-semibold text-brand-blue-primary hover:underline disabled:text-slate-400 disabled:no-underline"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={() => setKeys(allKeys, false)}
            disabled={picked === 0}
            {...tourTypeAttr('quiz-print.results-clear', 'quiz')}
            className="text-xs font-semibold text-brand-blue-primary hover:underline disabled:text-slate-400 disabled:no-underline"
          >
            Clear
          </button>
        </span>
      </div>
      <div
        className={`mt-2 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 scroll-inset ${
          fill ? 'min-h-0 flex-1' : 'max-h-80'
        }`}
      >
        {nodes.map((node) => {
          if (node.kind === 'section') return sectionBlock(node.section, false);
          const keys = node.sections.flatMap((s) => s.keys);
          const isOpen = open[node.id] ?? false;
          const groupKey = `row-${groupRowOf.get(node.id) ?? 0}`;
          return (
            <div key={node.id}>
              {groupRow(
                node.name,
                keys,
                'pl-1.5',
                true,
                tourFieldAttr('quiz-print.results-course', 'quiz', groupKey),
                chevron(
                  node.id,
                  node.name,
                  isOpen,
                  tourFieldAttr(
                    'quiz-print.results-course-expand',
                    'quiz',
                    groupKey
                  )
                )
              )}
              {isOpen && (
                <div role="group" aria-label={node.name}>
                  {node.sections.map((s) => sectionBlock(s, true))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
