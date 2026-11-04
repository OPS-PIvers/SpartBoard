import React, { useState } from 'react';
import { Check, Loader2, Search } from 'lucide-react';
import { functions } from '@/config/firebase';
import type { ClassRoster } from '@/types';
import {
  findSchoologySections,
  linkFoundSchoologySections,
  replacedNote,
  type FoundSectionRow,
  type FoundSectionStatus,
} from '@/utils/ltiCourseLinks';
import { syncRosterMirrors } from '@/utils/ltiRosterMirrors';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';

interface SchoologyFindCoursesProps {
  /** Every roster; ClassLink ones are looked up. */
  rosters: ClassRoster[];
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
  updateRoster: (id: string, updates: Partial<ClassRoster>) => Promise<void>;
  onReplaced?: (contextIds: string[]) => void;
}

const STATUS_TEXT: Record<Exclude<FoundSectionStatus, 'ready'>, string> = {
  linked: 'Linked',
  none: 'No Schoology course',
  taken: 'Linked by another teacher',
  'not-teacher': 'You aren’t a teacher of this course',
  error: 'Couldn’t check',
};

const errorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

/** Find each class's Schoology section by its ClassLink id and link the picks (SCHOOLOGY_AUTO_LINK.md D3). */
export const SchoologyFindCourses: React.FC<SchoologyFindCoursesProps> = ({
  rosters,
  addToast,
  updateRoster,
  onReplaced,
}) => {
  const [rows, setRows] = useState<FoundSectionRow[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [finding, setFinding] = useState(false);
  const [linking, setLinking] = useState(false);

  const nameOf = (id: string): string =>
    rosters.find((r) => r.id === id)?.name ?? 'Class';

  const handleFind = async () => {
    setFinding(true);
    try {
      const found = await findSchoologySections(functions);
      const sorted = [...found].sort((a, b) =>
        nameOf(a.rosterId).localeCompare(nameOf(b.rosterId))
      );
      setRows(sorted);
      setChecked(
        new Set(
          sorted.filter((r) => r.status === 'ready').map((r) => r.rosterId)
        )
      );
      if (sorted.length === 0) {
        addToast('None of your ClassLink classes were found.', 'info');
      }
    } catch (err) {
      addToast(
        errorMessage(err, 'Couldn’t look up your Schoology courses.'),
        'error'
      );
    } finally {
      setFinding(false);
    }
  };

  const handleLinkSelected = async () => {
    const ids = [...checked];
    if (ids.length === 0) return;
    setLinking(true);
    try {
      const results = await linkFoundSchoologySections(functions, ids);
      const linked = results.filter(
        (r) => r.status === 'linked' && !!r.contextId
      );
      for (const r of linked) {
        try {
          await syncRosterMirrors(
            rosters,
            r.rosterId,
            r.contextId as string,
            r.replacedIds,
            updateRoster
          );
        } catch {
          // The server link landed; the roster mirror resyncs later.
        }
      }
      const replacedIds = linked.flatMap((r) => r.replacedIds ?? []);
      if (replacedIds.length > 0) onReplaced?.(replacedIds);
      const byId = new Map(results.map((r) => [r.rosterId, r]));
      setRows((prev) =>
        prev ? prev.map((r) => byId.get(r.rosterId) ?? r) : prev
      );
      setChecked(new Set());
      const failed = results.length - linked.length;
      if (linked.length > 0) {
        addToast(
          `Linked ${linked.length} class${linked.length === 1 ? '' : 'es'}.${replacedNote(linked.flatMap((r) => r.replaced ?? []))}${failed > 0 ? ` ${failed} couldn’t be linked.` : ''}`,
          failed > 0 ? 'info' : 'success'
        );
      } else {
        addToast('None of those classes could be linked.', 'error');
      }
    } catch (err) {
      addToast(errorMessage(err, 'Failed to link the courses.'), 'error');
    } finally {
      setLinking(false);
    }
  };

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="rounded-lg border border-slate-200 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-slate-600">
          Find your Schoology courses
        </p>
        <button
          type="button"
          onClick={() => void handleFind()}
          disabled={finding || linking}
          {...tourAttr('schoology-link.find')}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-blue-primary border border-brand-blue-primary/30 hover:border-brand-blue-primary px-3 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          {finding ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Search size={14} />
          )}
          {rows ? 'Check again' : 'Find my Schoology courses'}
        </button>
      </div>
      {rows && rows.length > 0 && (
        <>
          <ul className="space-y-1.5">
            {rows.map((row, i) => {
              const ready = row.status === 'ready';
              const inputId = `schoology-found-${row.rosterId}`;
              return (
                <li key={row.rosterId} className="flex items-start gap-2">
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={ready && checked.has(row.rosterId)}
                    disabled={!ready || linking}
                    onChange={() => toggle(row.rosterId)}
                    {...tourFieldAttr(
                      'schoology-link.found-row',
                      'schoology-link',
                      `found-${i + 1}`
                    )}
                    className="mt-1 h-4 w-4 shrink-0 accent-brand-blue-primary disabled:opacity-40"
                  />
                  <label htmlFor={inputId} className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-800 truncate">
                      {nameOf(row.rosterId)}
                    </span>
                    {row.contextTitle && (
                      <span className="block text-xs text-slate-500 truncate">
                        {row.contextTitle}
                        {row.periodTitle ? ` · ${row.periodTitle}` : ''}
                      </span>
                    )}
                    {ready && row.replacesTitle && (
                      <span className="block text-xs text-amber-700 truncate">
                        Replaces “{row.replacesTitle}”
                      </span>
                    )}
                  </label>
                  {!ready && (
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-bold shrink-0 ${
                        row.status === 'linked'
                          ? 'text-emerald-600'
                          : 'text-slate-500'
                      }`}
                    >
                      {row.status === 'linked' && <Check size={14} />}
                      {STATUS_TEXT[row.status]}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void handleLinkSelected()}
              disabled={checked.size === 0 || linking}
              {...tourAttr('schoology-link.link-selected')}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-brand-blue-primary hover:bg-brand-blue-dark px-3 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {linking && <Loader2 size={14} className="animate-spin" />}
              Link selected ({checked.size})
            </button>
          </div>
        </>
      )}
    </div>
  );
};
