// Full rubric as a table, opened from the grader's rubric panel; picks are highlighted and the rubric can be edited in place.
import React, { useState } from 'react';
import { ArrowLeftRight, Check, Pencil, X } from 'lucide-react';
import type {
  Rubric,
  RubricCriterion,
  RubricLevel,
  RubricLevelOrder,
  WrittenAnswerRubricScore,
} from '@/types';
import { Modal } from '@/components/common/Modal';
import { FullscreenToggleButton } from '@/components/common/FullscreenToggleButton';
import { tourFieldAttr, tourTypeAttr } from '@/config/tourAnchors';
import { RubricGuideExamples } from '@/components/quiz/RubricGuideExamples';
import {
  criterionMaxPoints,
  orderRubricLevels,
  rubricMaxPoints,
} from '@/utils/rubricPoints';

interface RubricTableModalProps {
  rubric: Rubric;
  order: RubricLevelOrder;
  onOrderChange: () => void;
  scores: Map<string, WrittenAnswerRubricScore>;
  onClose: () => void;
  /** Saves an edited rubric; the Edit button shows only when this is given. */
  onSave?: (rubric: Rubric) => Promise<void>;
}

const pts = (n: number) => `${n} pt${n === 1 ? '' : 's'}`;

/** Column labels when every criterion uses the same level names in the same order. */
const sharedLabels = (rows: RubricLevel[][]): string[] | null => {
  const first = rows[0]?.map((l) => l.label.trim());
  if (!first?.length) return null;
  return rows.every(
    (r) =>
      r.length === first.length &&
      r.every((l, i) => l.label.trim() === first[i])
  )
    ? first
    : null;
};

/** Criteria whose levels share a points value; levels must differ to be told apart. */
const duplicatePointCriteria = (rubric: Rubric): Set<string> =>
  new Set(
    rubric.criteria
      .filter(
        (c) => new Set(c.levels.map((l) => l.points)).size !== c.levels.length
      )
      .map((c) => c.id)
  );

const fieldBase =
  'w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-900 placeholder:text-slate-400 focus:border-brand-blue-primary focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary/30';

const autoGrow = (el: HTMLTextAreaElement | null) => {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
};

export const RubricTableModal: React.FC<RubricTableModalProps> = ({
  rubric,
  order,
  onOrderChange,
  scores,
  onClose,
  onSave,
}) => {
  const [draft, setDraft] = useState<Rubric | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const editing = draft !== null;
  const shown = draft ?? rubric;

  const rows = shown.criteria.map((c) => orderRubricLevels(c.levels, order));
  const columns = rows.reduce((n, r) => Math.max(n, r.length), 0);
  // Column headers come from the saved rubric so typing a label doesn't split the table.
  const headers = sharedLabels(
    rubric.criteria.map((c) => orderRubricLevels(c.levels, order))
  );
  const scored = rubric.criteria.filter((c) => scores.has(c.id));
  const earned = scored.reduce(
    (sum, c) => sum + (scores.get(c.id)?.points ?? 0),
    0
  );
  const dupes = editing ? duplicatePointCriteria(shown) : new Set<string>();

  const patchCriterion = (id: string, patch: Partial<RubricCriterion>) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            criteria: d.criteria.map((c) =>
              c.id === id ? { ...c, ...patch } : c
            ),
          }
        : d
    );
  const patchLevel = (
    criterionId: string,
    levelId: string,
    patch: Partial<RubricLevel>
  ) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            criteria: d.criteria.map((c) =>
              c.id === criterionId
                ? {
                    ...c,
                    levels: c.levels.map((l) =>
                      l.id === levelId ? { ...l, ...patch } : l
                    ),
                  }
                : c
            ),
          }
        : d
    );
  // A shared column header renames that level in every criterion.
  const renameColumn = (index: number, label: string) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            criteria: d.criteria.map((c) => {
              const target = orderRubricLevels(c.levels, order)[index];
              return target
                ? {
                    ...c,
                    levels: c.levels.map((l) =>
                      l.id === target.id ? { ...l, label } : l
                    ),
                  }
                : c;
            }),
          }
        : d
    );

  const draftHeaders =
    editing && headers
      ? headers.map(
          (_, i) =>
            orderRubricLevels(shown.criteria[0].levels, order)[i]?.label ?? ''
        )
      : headers;

  const save = async () => {
    if (!draft || !onSave) return;
    setSaving(true);
    setError(null);
    try {
      const clean: Rubric = {
        ...draft,
        title: draft.title.trim() || rubric.title,
        updatedAt: Date.now(),
        criteria: draft.criteria.map((c) => ({
          ...c,
          name: c.name.trim() || 'Untitled criterion',
          ...(c.description?.trim()
            ? { description: c.description.trim() }
            : { description: undefined }),
          levels: c.levels.map((l) => ({
            ...l,
            label: l.label.trim() || 'Untitled level',
            ...(l.description?.trim()
              ? { description: l.description.trim() }
              : { description: undefined }),
          })),
        })),
      };
      await onSave(JSON.parse(JSON.stringify(clean)) as Rubric);
      setDraft(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'The rubric could not be saved.'
      );
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <div className="flex shrink-0 items-start gap-3 px-6 pb-4 pt-6">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {editing ? (
            <input
              value={shown.title}
              onChange={(e) =>
                setDraft((d) => (d ? { ...d, title: e.target.value } : d))
              }
              aria-label="Rubric title"
              {...tourFieldAttr(
                'quiz-grading.rubric-table-field',
                'quiz',
                'title'
              )}
              className={`${fieldBase} max-w-xl text-lg font-bold`}
            />
          ) : (
            <h3 className="break-words text-lg font-bold text-slate-900">
              {rubric.title}
            </h3>
          )}
          {onSave && !editing && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setDraft(JSON.parse(JSON.stringify(rubric)) as Rubric);
              }}
              {...tourTypeAttr('quiz-grading.rubric-table-edit', 'quiz')}
              className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold text-brand-blue-primary transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-blue-primary"
            >
              <Pencil className="h-4 w-4" aria-hidden />
              Edit
            </button>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {shown.criteria.length} criteria · {pts(rubricMaxPoints(shown))}
          {scored.length > 0 && !editing && (
            <span className="font-semibold text-brand-blue-primary">
              {' '}
              · This student {earned} / {rubricMaxPoints(rubric)}
            </span>
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={onOrderChange}
        {...tourTypeAttr('quiz-grading.rubric-table-order', 'quiz')}
        aria-label={`Level order: ${order === 'high-first' ? 'Highest' : 'Lowest'} first. Switch to ${order === 'high-first' ? 'lowest' : 'highest'} first`}
        className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-semibold text-brand-blue-primary transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-blue-primary"
      >
        <ArrowLeftRight className="h-4 w-4" aria-hidden />
        {order === 'high-first' ? 'Highest first' : 'Lowest first'}
      </button>
      <FullscreenToggleButton
        fullscreen={fullscreen}
        onToggle={() => setFullscreen(!fullscreen)}
      />
      <button
        type="button"
        onClick={onClose}
        {...tourTypeAttr('quiz-grading.rubric-table-x', 'quiz')}
        aria-label="Close"
        className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100"
      >
        <X size={20} />
      </button>
    </div>
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      customHeader={header}
      maxWidth="max-w-6xl"
      zIndex="z-modal-deep"
      fullscreen={fullscreen}
      onFullscreenChange={setFullscreen}
      ariaLabel={rubric.title}
      footer={
        <div className="flex flex-col items-center gap-2">
          {error && (
            <p className="text-sm font-semibold text-brand-red-dark">{error}</p>
          )}
          {editing ? (
            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setDraft(null);
                  setError(null);
                }}
                disabled={saving}
                {...tourTypeAttr('quiz-grading.rubric-table-cancel', 'quiz')}
                className="rounded-lg border border-slate-300 bg-white px-6 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || dupes.size > 0}
                {...tourTypeAttr('quiz-grading.rubric-table-save', 'quiz')}
                className="rounded-lg bg-brand-blue-primary px-8 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-blue-dark disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onClose}
              {...tourTypeAttr('quiz-grading.rubric-table-close', 'quiz')}
              className="rounded-lg bg-brand-blue-primary px-8 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-blue-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-primary"
            >
              Close
            </button>
          )}
        </div>
      }
    >
      {editing ? (
        <textarea
          ref={autoGrow}
          rows={1}
          value={shown.description ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            setDraft((d) => (d ? { ...d, description: v } : d));
            autoGrow(e.target);
          }}
          placeholder="Rubric description"
          aria-label="Rubric description"
          {...tourFieldAttr(
            'quiz-grading.rubric-table-field',
            'quiz',
            'description'
          )}
          className={`${fieldBase} mb-4 max-w-3xl resize-none text-sm`}
        />
      ) : (
        rubric.description && (
          <p className="mb-4 max-w-3xl text-sm leading-relaxed text-slate-600">
            {rubric.description}
          </p>
        )
      )}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[44rem] table-fixed border-collapse text-left">
          <colgroup>
            <col className="w-60" />
            {Array.from({ length: columns }, (_, i) => (
              <col key={i} />
            ))}
          </colgroup>
          {draftHeaders && (
            <thead>
              <tr className="bg-slate-50">
                <th
                  scope="col"
                  className="sticky left-0 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500"
                >
                  Criteria
                </th>
                {draftHeaders.map((label, i) => (
                  <th
                    key={i}
                    scope="col"
                    className="border-l border-slate-200 px-4 py-3 text-sm font-bold text-slate-800"
                  >
                    {editing ? (
                      <input
                        value={label}
                        onChange={(e) => renameColumn(i, e.target.value)}
                        aria-label={`Level ${i + 1} name`}
                        {...tourFieldAttr(
                          'quiz-grading.rubric-table-field',
                          'quiz',
                          `column-${i + 1}`
                        )}
                        className={`${fieldBase} text-sm font-bold`}
                      />
                    ) : (
                      label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {shown.criteria.map((criterion, ri) => {
              const picked = editing ? undefined : scores.get(criterion.id);
              const levels = rows[ri];
              const max = criterionMaxPoints(criterion);
              const hasDupes = dupes.has(criterion.id);
              return (
                <tr
                  key={criterion.id}
                  className={`align-top ${draftHeaders || ri > 0 ? 'border-t border-slate-200' : ''}`}
                >
                  <th
                    scope="row"
                    className="sticky left-0 bg-slate-50 px-4 py-4 font-normal"
                  >
                    {editing ? (
                      <>
                        <textarea
                          ref={autoGrow}
                          rows={1}
                          value={criterion.name}
                          onChange={(e) => {
                            patchCriterion(criterion.id, {
                              name: e.target.value,
                            });
                            autoGrow(e.target);
                          }}
                          aria-label={`Criterion ${ri + 1} name`}
                          {...tourFieldAttr(
                            'quiz-grading.rubric-table-field',
                            'quiz',
                            `${ri + 1}-name`
                          )}
                          className={`${fieldBase} resize-none text-sm font-bold`}
                        />
                        <textarea
                          ref={autoGrow}
                          rows={2}
                          value={criterion.description ?? ''}
                          onChange={(e) => {
                            patchCriterion(criterion.id, {
                              description: e.target.value,
                            });
                            autoGrow(e.target);
                          }}
                          placeholder="Description"
                          aria-label={`Criterion ${ri + 1} description`}
                          {...tourFieldAttr(
                            'quiz-grading.rubric-table-field',
                            'quiz',
                            `${ri + 1}-description`
                          )}
                          className={`${fieldBase} mt-2 resize-none text-xs leading-relaxed`}
                        />
                      </>
                    ) : (
                      <>
                        <span className="block break-words text-sm font-bold leading-snug text-slate-900">
                          {criterion.name}
                        </span>
                        {criterion.description && (
                          <span className="mt-1.5 block whitespace-pre-line text-xs leading-relaxed text-slate-500">
                            {criterion.description}
                          </span>
                        )}
                        {criterion.guide && (
                          <RubricGuideExamples
                            examples={criterion.guide.examples ?? []}
                          />
                        )}
                      </>
                    )}
                    <span
                      className={`mt-3 block text-xs font-semibold tabular-nums ${
                        hasDupes
                          ? 'text-brand-red-dark'
                          : picked
                            ? 'text-brand-blue-primary'
                            : 'text-slate-500'
                      }`}
                    >
                      {hasDupes
                        ? 'Each level needs different points'
                        : picked
                          ? `${picked.points} of ${pts(max)}`
                          : pts(max)}
                    </span>
                  </th>
                  {Array.from({ length: columns }, (_, i) => {
                    const level = levels[i];
                    if (!level)
                      return (
                        <td
                          key={i}
                          className="border-l border-slate-200 bg-slate-50/50"
                        />
                      );
                    const isPicked = picked?.levelId === level.id;
                    if (editing) {
                      return (
                        <td
                          key={level.id}
                          className="border-l border-slate-200 bg-white px-3 py-3"
                        >
                          {!draftHeaders && (
                            <input
                              value={level.label}
                              onChange={(e) =>
                                patchLevel(criterion.id, level.id, {
                                  label: e.target.value,
                                })
                              }
                              aria-label={`Criterion ${ri + 1} level ${i + 1} name`}
                              {...tourFieldAttr(
                                'quiz-grading.rubric-table-field',
                                'quiz',
                                `${ri + 1}-${i + 1}-label`
                              )}
                              className={`${fieldBase} mb-2 text-sm font-bold`}
                            />
                          )}
                          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={level.points}
                              onChange={(e) => {
                                const n = Number(e.target.value);
                                if (Number.isFinite(n) && n >= 0)
                                  patchLevel(criterion.id, level.id, {
                                    points: n,
                                  });
                              }}
                              aria-label={`Criterion ${ri + 1} level ${i + 1} points`}
                              aria-invalid={hasDupes || undefined}
                              {...tourFieldAttr(
                                'quiz-grading.rubric-table-field',
                                'quiz',
                                `${ri + 1}-${i + 1}-points`
                              )}
                              className={`${fieldBase} w-16 text-right text-sm font-bold tabular-nums aria-[invalid]:border-brand-red-primary`}
                            />
                            pts
                          </label>
                          <textarea
                            ref={autoGrow}
                            rows={3}
                            value={level.description ?? ''}
                            onChange={(e) => {
                              patchLevel(criterion.id, level.id, {
                                description: e.target.value,
                              });
                              autoGrow(e.target);
                            }}
                            placeholder="Description"
                            aria-label={`Criterion ${ri + 1} level ${i + 1} description`}
                            {...tourFieldAttr(
                              'quiz-grading.rubric-table-field',
                              'quiz',
                              `${ri + 1}-${i + 1}-description`
                            )}
                            className={`${fieldBase} mt-2 resize-none text-[13px] leading-relaxed`}
                          />
                        </td>
                      );
                    }
                    return (
                      <td
                        key={level.id}
                        aria-current={isPicked || undefined}
                        className={`border-l px-4 py-4 ${
                          isPicked
                            ? 'border-brand-blue-primary bg-brand-blue-primary text-white'
                            : 'border-slate-200 bg-white text-slate-900'
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          {draftHeaders ? (
                            <span
                              className={`text-sm font-bold tabular-nums ${isPicked ? 'text-white' : 'text-slate-700'}`}
                            >
                              {pts(level.points)}
                            </span>
                          ) : (
                            <span className="break-words text-sm font-bold">
                              {level.label}
                            </span>
                          )}
                          {isPicked ? (
                            <Check
                              className="h-4 w-4 shrink-0"
                              aria-label="Selected"
                            />
                          ) : (
                            !draftHeaders && (
                              <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-500">
                                {pts(level.points)}
                              </span>
                            )
                          )}
                        </span>
                        {level.description && (
                          <span
                            className={`mt-2 block whitespace-pre-line text-[13px] leading-relaxed ${
                              isPicked ? 'text-white' : 'text-slate-600'
                            }`}
                          >
                            {level.description}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
};
