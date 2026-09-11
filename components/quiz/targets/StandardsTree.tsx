import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { QuestionTargetTag } from '@/types';
import { tagFromBenchmark, tagFromStandard } from '@/utils/learningTargets';
import type {
  FilteredTree,
  StandardNode,
  StrandNode,
} from '@/utils/standardsTree';

interface StandardsTreeProps {
  tree: FilteredTree;
  /** True while a search is active: matched standards open automatically. */
  searching: boolean;
  /** Render subject headings (when more than one subject is shown). */
  showSubjects: boolean;
  subjectLabel: (id: string) => string;
  isSelected: (id: string) => boolean;
  onToggle: (tag: QuestionTargetTag) => void;
}

const CHECKBOX = 'mt-1 accent-brand-blue-primary';

/** Content area → strand → standard → benchmark. Strands navigate; standards and benchmarks select. */
export const StandardsTree: React.FC<StandardsTreeProps> = ({
  tree,
  searching,
  showSubjects,
  subjectLabel,
  isSelected,
  onToggle,
}) => {
  // Manual toggles win; otherwise strands are open and standards follow the search.
  const [manual, setManual] = useState<Map<string, boolean>>(() => new Map());
  const flip = (key: string, fallback: boolean) =>
    setManual((prev) => {
      const next = new Map(prev);
      next.set(key, !(prev.get(key) ?? fallback));
      return next;
    });
  const strandOpen = (strand: StrandNode) => manual.get(strand.key) ?? true;
  const standardOpen = (standard: StandardNode) =>
    manual.get(standard.key) ??
    (searching && tree.matchedStandards.has(standard.key));

  const renderStandard = (standard: StandardNode) => {
    const tag = tagFromStandard(standard.benchmarks[0]);
    const open = standardOpen(standard);
    const panelId = `std-${standard.key.replace(/[^a-z0-9]+/gi, '-')}`;
    return (
      <li key={standard.key}>
        <div className="flex items-start gap-1 rounded hover:bg-slate-100">
          <button
            type="button"
            onClick={() => flip(standard.key, open)}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${standard.code}`}
            className="mt-1.5 p-0.5 rounded text-slate-500 hover:text-slate-800"
          >
            <ChevronRight
              className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
              aria-hidden="true"
            />
          </button>
          <label className="flex flex-1 items-start gap-2 py-1.5 pr-2 cursor-pointer">
            <input
              type="checkbox"
              className={CHECKBOX}
              checked={isSelected(tag.id)}
              onChange={() => onToggle(tag)}
            />
            <span className="min-w-0 flex-1 text-sm text-slate-800">
              <span className="font-mono font-semibold text-slate-600 mr-1.5">
                {standard.code}
              </span>
              <span className="font-semibold">{tag.label}</span>
              <span className="ml-1.5 text-xs text-slate-500">
                {standard.benchmarks.length}
              </span>
            </span>
          </label>
        </div>
        {open && (
          <ul id={panelId} className="ml-7 border-l border-slate-200 pl-1">
            {standard.benchmarks.map((b) => {
              const benchTag = tagFromBenchmark(b);
              return (
                <li key={b.id}>
                  <label className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-slate-100 cursor-pointer">
                    <input
                      type="checkbox"
                      className={CHECKBOX}
                      checked={isSelected(b.id)}
                      onChange={() => onToggle(benchTag)}
                    />
                    <span className="min-w-0 flex-1 text-sm text-slate-800">
                      <span className="font-mono font-semibold text-slate-600 mr-1.5">
                        {b.code}
                      </span>
                      <span className="line-clamp-2">{b.text}</span>
                    </span>
                    <span className="shrink-0 mt-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-xxs font-bold text-slate-600">
                      {b.grade}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </li>
    );
  };

  const renderStrand = (strand: StrandNode) => {
    const open = strandOpen(strand);
    const panelId = `strand-${strand.key.replace(/[^a-z0-9]+/gi, '-')}`;
    return (
      <li key={strand.key}>
        <button
          type="button"
          onClick={() => flip(strand.key, open)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center gap-1.5 px-2 py-1.5 rounded text-left text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-100"
        >
          <ChevronRight
            className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
            aria-hidden="true"
          />
          <span className="flex-1">{strand.name}</span>
          <span className="text-xxs font-semibold text-slate-500 normal-case tracking-normal">
            {strand.standards.length}
          </span>
        </button>
        {open && (
          <ul id={panelId} className="ml-2">
            {strand.standards.map(renderStandard)}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-2">
      {tree.subjects.map((subject) => (
        <div key={subject.subject}>
          {showSubjects && (
            <h6 className="px-2 py-1 text-xs font-bold text-slate-800">
              {subjectLabel(subject.subject)}
            </h6>
          )}
          <ul>{subject.strands.map(renderStrand)}</ul>
        </div>
      ))}
    </div>
  );
};
