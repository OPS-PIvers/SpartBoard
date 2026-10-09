import React, { useState } from 'react';
import { AlertTriangle, Loader2, Plus, X } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { functions } from '@/config/firebase';
import {
  createToolColumnCategories,
  type RecommendedCategory,
  type ToolColumnCategoriesData,
  type ToolColumnKind,
  type ToolColumnSectionInfo,
} from '@/utils/schoologyToolColumns';

interface ToolColumnPushDialogProps {
  data: ToolColumnCategoriesData;
  sessionId: string;
  kind: ToolColumnKind;
  title: string;
  /** How many students with no submission the push marks Missing. */
  missingCount: number;
  onCancel: () => void;
  onConfirm: (categories: Record<string, string>) => void;
}

type DraftRow = { key: number; title: string; weight: number };

interface EmptyCourseState {
  rows: DraftRow[];
  declined: boolean;
  creating: boolean;
  error: string | null;
}

const sectionName = (s: ToolColumnSectionInfo): string =>
  s.title ?? 'Schoology course';

let rowKey = 0;
const toRows = (cats: RecommendedCategory[]): DraftRow[] =>
  cats.map((c) => ({ key: ++rowKey, title: c.title, weight: c.weight }));

/** D9/D13 first-push confirmation: one category menu per section, and an offer to create categories. */
export const ToolColumnPushDialog: React.FC<ToolColumnPushDialogProps> = ({
  data,
  sessionId,
  kind,
  title,
  missingCount,
  onCancel,
  onConfirm,
}) => {
  const [sections, setSections] = useState(data.sections);
  const [picks, setPicks] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const s of data.sections) {
      if (s.needsCategory && s.defaultCategoryId) {
        init[s.contextId] = s.defaultCategoryId;
      }
    }
    return init;
  });
  const [empty, setEmpty] = useState<Record<string, EmptyCourseState>>(() => {
    const init: Record<string, EmptyCourseState> = {};
    for (const s of data.sections) {
      if (s.needsCategory && s.categories?.length === 0) {
        init[s.contextId] = {
          rows: toRows(data.recommended),
          declined: false,
          creating: false,
          error: null,
        };
      }
    }
    return init;
  });
  const [weightingOff, setWeightingOff] = useState<Set<string>>(new Set());

  const newColumns = sections.filter((s) => !s.hasColumn).length;
  const needsPick = (s: ToolColumnSectionInfo) =>
    s.needsCategory && !!s.categories && s.categories.length > 0;
  const undecided = sections.some((s) => {
    const e = empty[s.contextId];
    if (e && !e.declined) return true;
    return needsPick(s) && !picks[s.contextId];
  });

  const patchEmpty = (ctx: string, patch: Partial<EmptyCourseState>) =>
    setEmpty((prev) => ({ ...prev, [ctx]: { ...prev[ctx], ...patch } }));

  const handleCreate = async (s: ToolColumnSectionInfo) => {
    const state = empty[s.contextId];
    patchEmpty(s.contextId, { creating: true, error: null });
    try {
      const res = await createToolColumnCategories(functions, {
        sessionId,
        kind,
        contextId: s.contextId,
        categories: state.rows.map((r) => ({
          title: r.title.trim(),
          weight: r.weight,
        })),
      });
      setSections((prev) =>
        prev.map((x) =>
          x.contextId === s.contextId ? { ...x, categories: res.categories } : x
        )
      );
      setEmpty((prev) => {
        const next = { ...prev };
        delete next[s.contextId];
        return next;
      });
      if (res.weightingOff) {
        setWeightingOff((prev) => new Set(prev).add(s.contextId));
      }
    } catch (err) {
      patchEmpty(s.contextId, {
        creating: false,
        error:
          err instanceof Error && err.message
            ? err.message
            : 'Schoology didn’t create the categories.',
      });
    }
  };

  const footer = (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="text-sm font-bold text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg transition-colors"
      >
        Cancel
      </button>
      <button
        type="button"
        disabled={undecided}
        onClick={() => onConfirm(picks)}
        className="text-sm font-bold text-white bg-brand-blue-primary hover:bg-brand-blue-dark px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Push
      </button>
    </div>
  );

  return (
    <Modal
      isOpen
      onClose={onCancel}
      title="Push to Schoology"
      footer={footer}
      maxWidth="max-w-lg"
    >
      <div className="space-y-4 text-sm text-slate-700">
        {newColumns > 0 && (
          <p>
            This adds a “{title}” column to {newColumns} Schoology section
            {newColumns === 1 ? '' : 's'} in the current grading period.
          </p>
        )}
        {sections
          .filter((s) => s.needsCategory || weightingOff.has(s.contextId))
          .map((s) => {
            const e = empty[s.contextId];
            const total = e ? e.rows.reduce((t, r) => t + r.weight, 0) : 0;
            const rowsValid =
              !!e &&
              e.rows.length > 0 &&
              e.rows.every((r) => r.title.trim().length > 0) &&
              total === 100;
            return (
              <div
                key={s.contextId}
                className="rounded-lg border border-slate-200 p-3 space-y-2"
              >
                <p className="font-semibold text-slate-800">{sectionName(s)}</p>
                {s.categories && s.categories.length > 0 && (
                  <select
                    aria-label={`Category for ${sectionName(s)}`}
                    value={picks[s.contextId] ?? ''}
                    onChange={(ev) =>
                      setPicks((p) => ({
                        ...p,
                        [s.contextId]: ev.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
                  >
                    <option value="">Choose a category…</option>
                    {s.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                        {c.weight > 0 ? ` (${c.weight}%)` : ''}
                      </option>
                    ))}
                  </select>
                )}
                {weightingOff.has(s.contextId) && (
                  <p className="flex items-start gap-1.5 text-xs text-amber-700">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    Turn on weighted categories in Schoology Grade Setup for
                    these percentages to count.
                  </p>
                )}
                {e && e.declined && (
                  <p className="text-xs text-slate-500">
                    Skipped. Add a grading category in Schoology, then push
                    again.{' '}
                    <button
                      type="button"
                      className="font-bold text-brand-blue-primary"
                      onClick={() =>
                        patchEmpty(s.contextId, { declined: false })
                      }
                    >
                      Undo
                    </button>
                  </p>
                )}
                {e && !e.declined && (
                  <div className="space-y-2">
                    <p>
                      This Schoology course has no grading categories. Create
                      these?
                    </p>
                    {e.rows.map((r, i) => (
                      <div key={r.key} className="flex items-center gap-2">
                        <input
                          aria-label={`Category ${i + 1} name`}
                          value={r.title}
                          maxLength={60}
                          onChange={(ev) =>
                            patchEmpty(s.contextId, {
                              rows: e.rows.map((x) =>
                                x.key === r.key
                                  ? { ...x, title: ev.target.value }
                                  : x
                              ),
                            })
                          }
                          className="flex-1 min-w-0 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
                        />
                        <input
                          aria-label={`Category ${i + 1} weight`}
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={r.weight}
                          onChange={(ev) =>
                            patchEmpty(s.contextId, {
                              rows: e.rows.map((x) =>
                                x.key === r.key
                                  ? {
                                      ...x,
                                      weight: Math.max(
                                        0,
                                        Math.min(
                                          100,
                                          Math.round(
                                            Number(ev.target.value) || 0
                                          )
                                        )
                                      ),
                                    }
                                  : x
                              ),
                            })
                          }
                          className="w-20 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
                        />
                        <span className="text-slate-500" aria-hidden>
                          %
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove ${r.title || `category ${i + 1}`}`}
                          onClick={() =>
                            patchEmpty(s.contextId, {
                              rows: e.rows.filter((x) => x.key !== r.key),
                            })
                          }
                          className="p-1 text-slate-400 hover:text-slate-600"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() =>
                          patchEmpty(s.contextId, {
                            rows: [
                              ...e.rows,
                              { key: ++rowKey, title: '', weight: 0 },
                            ],
                          })
                        }
                        disabled={e.rows.length >= 10}
                        className="inline-flex items-center gap-1 text-xs font-bold text-brand-blue-primary disabled:opacity-50"
                      >
                        <Plus size={13} /> Add category
                      </button>
                      <span
                        className={`text-xs font-bold ${total === 100 ? 'text-slate-500' : 'text-amber-700'}`}
                      >
                        Total {total}%
                      </span>
                    </div>
                    {e.error && (
                      <p className="text-xs text-brand-red-primary">
                        {e.error}
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!rowsValid || e.creating}
                        onClick={() => void handleCreate(s)}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-brand-blue-primary hover:bg-brand-blue-dark px-3 py-1.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {e.creating && (
                          <Loader2 size={12} className="animate-spin" />
                        )}
                        Create categories
                      </button>
                      <button
                        type="button"
                        disabled={e.creating}
                        onClick={() =>
                          patchEmpty(s.contextId, { declined: true })
                        }
                        className="text-xs font-bold text-slate-500 hover:text-slate-700 px-2 py-1.5"
                      >
                        Skip this course
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        {missingCount > 0 && (
          <p>
            {missingCount} student{missingCount === 1 ? '' : 's'} with no
            submission will be marked Missing.
          </p>
        )}
      </div>
    </Modal>
  );
};
