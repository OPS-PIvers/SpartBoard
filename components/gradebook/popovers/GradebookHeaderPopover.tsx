import React, { useId, useState } from 'react';
import {
  isCompletionOnly,
  type AttemptPolicy,
} from '@/utils/gradebook/gradebookCore';
import {
  isFillable,
  isMissingCandidate,
  useGradebookMarkWrites,
} from '@/hooks/gradebook/useGradebookMarkWrites';
import { useGradebookColumnWrites } from '@/hooks/gradebook/useGradebookColumnWrites';
import { GradebookPopoverShell } from './GradebookPopoverShell';
import { ConfirmRow, DoneRow, PopButton, SectionLabel } from './popoverParts';
import { KIND_LABELS, fmtDate, fmtPct, fmtPoints } from './popoverFormat';
import type {
  GradebookCellData,
  GradebookColumnRef,
  GradebookPopoverContext,
} from './types';

type BulkKind = 'fill' | 'missing' | 'excuse';

export interface GradebookHeaderPopoverProps {
  anchor: HTMLElement;
  ctx: GradebookPopoverContext;
  column: GradebookColumnRef;
  columnCells: GradebookCellData[];
  onClose: () => void;
  onOpenResults?: (column: GradebookColumnRef) => void;
  onAnalyze?: (column: GradebookColumnRef) => void;
  onSortByColumn?: (column: GradebookColumnRef) => void;
  /** Whole-class publish through the kind's own publish flow (D22). */
  onPublishColumn?: (
    column: GradebookColumnRef,
    action: 'publish' | 'unpublish'
  ) => void;
}

const selectClass =
  'h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm focus:border-brand-blue-primary focus:outline-none focus:ring-2 focus:ring-brand-blue-lighter';

/** D22 column header popover: open, analyze, publish, grading setup and whole-column actions. */
export const GradebookHeaderPopover: React.FC<GradebookHeaderPopoverProps> = ({
  anchor,
  ctx,
  column,
  columnCells,
  onClose,
  onOpenResults,
  onAnalyze,
  onSortByColumn,
  onPublishColumn,
}) => {
  const ids = useId();
  const markWrites = useGradebookMarkWrites(ctx.rosterId);
  const { saveColumn, setHidden } = useGradebookColumnWrites();
  const completion = isCompletionOnly(column.kind);
  const config = column.config;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bulk, setBulk] = useState<
    | { stage: 'confirm'; kind: BulkKind }
    | { stage: 'done'; message: string; batchId: string }
    | null
  >(null);
  const [fillValue, setFillValue] = useState('0');
  const [maxDraft, setMaxDraft] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch {
      setError('Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const assigned = columnCells.filter((c) => c.final.status !== 'not-assigned');
  const submitted = assigned.filter((c) => c.row?.submittedAt != null).length;
  const counted = assigned.filter(
    (c) => c.final.counts && c.final.pct !== null
  );
  const average =
    counted.length > 0
      ? counted.reduce((s, c) => s + (c.final.pct as number), 0) /
        counted.length
      : null;
  const published = assigned.some((c) => c.row?.published);
  const rawMax = columnCells.find((c) => c.row?.max != null)?.row?.max ?? null;
  const shownMax = config?.maxPointsOverride ?? rawMax;

  const fillable = columnCells.filter(isFillable);
  const missing = columnCells.filter(isMissingCandidate);
  const excusable = assigned.filter(
    (c) => !(c.mark?.flags ?? []).includes('excused')
  );
  const hasMissingFlag = ctx.settings.flags.some(
    (f) => f.id === 'missing' && f.visibility !== 'off'
  );
  const hasExcusedFlag = ctx.settings.flags.some(
    (f) => f.id === 'excused' && f.visibility !== 'off'
  );
  const hidden = (config?.hiddenInRosterIds ?? []).includes(ctx.rosterId);
  const fillPoints = fillValue.trim() === '' ? NaN : Number(fillValue);
  const fillValid = Number.isFinite(fillPoints) && fillPoints >= 0;

  const sub: string[] = [KIND_LABELS[column.kind]];
  if (column.dueAt !== null) sub.push(`Due ${fmtDate(column.dueAt)}`);
  sub.push(`${submitted}/${assigned.length} submitted`);
  if (!completion && average !== null) sub.push(`Average ${fmtPct(average)}`);

  const confirmBulk = (kind: BulkKind) =>
    void run(async () => {
      const res =
        kind === 'fill'
          ? await markWrites.fillEmpty(column, columnCells, fillPoints)
          : kind === 'missing'
            ? await markWrites.flagAll(
                column,
                missing,
                'missing',
                'Mark missing'
              )
            : await markWrites.flagAll(
                column,
                excusable,
                'excused',
                'Excuse column'
              );
      const noun = res.count === 1 ? 'student' : 'students';
      const message =
        kind === 'fill'
          ? `Filled ${res.count} ${res.count === 1 ? 'cell' : 'cells'}`
          : kind === 'missing'
            ? `Marked ${res.count} ${noun} Missing`
            : `Excused ${res.count} ${noun}`;
      setBulk({ stage: 'done', message, batchId: res.batchId });
    });

  const bulkMessage = (
    kind: BulkKind
  ): { text: string; cta: string; n: number } => {
    if (kind === 'fill') {
      const n = fillable.length;
      return {
        text: `Fill ${n} empty ${n === 1 ? 'cell' : 'cells'} with ${fmtPoints(fillPoints)}?`,
        cta: `Fill ${n}`,
        n,
      };
    }
    if (kind === 'missing') {
      const n = missing.length;
      return {
        text: `Mark ${n} ${n === 1 ? 'student' : 'students'} with no submission Missing?`,
        cta: `Mark ${n}`,
        n,
      };
    }
    const n = excusable.length;
    return {
      text: `Excuse all ${n} students from ${column.title}?`,
      cta: `Excuse ${n}`,
      n,
    };
  };

  const saveMax = () => {
    if (maxDraft === null) return;
    const trimmed = maxDraft.trim();
    const next = trimmed === '' ? null : Number(trimmed);
    setMaxDraft(null);
    if (next !== null && (!Number.isFinite(next) || next <= 0)) return;
    const value = next === rawMax ? null : next;
    if (value === (config?.maxPointsOverride ?? null)) return;
    void run(() => saveColumn(column, { maxPointsOverride: value }));
  };

  return (
    <GradebookPopoverShell
      anchor={anchor}
      onClose={onClose}
      ariaLabel={column.title}
    >
      <div>
        <h3 className="text-base font-semibold text-slate-900">
          {column.title}
        </h3>
        <p className="text-xs text-slate-600">{sub.join(' · ')}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {onOpenResults && (
          <PopButton onClick={() => onOpenResults(column)}>
            {completion ? 'Open submissions' : 'Open results'}
          </PopButton>
        )}
        {!completion && onAnalyze && (
          <PopButton onClick={() => onAnalyze(column)}>Analyze</PopButton>
        )}
        {!completion && onPublishColumn && (
          <PopButton
            tone={published ? 'default' : 'primary'}
            onClick={() =>
              onPublishColumn(column, published ? 'unpublish' : 'publish')
            }
          >
            {published ? 'Unpublish scores' : 'Publish scores'}
          </PopButton>
        )}
        {onSortByColumn && (
          <PopButton tone="quiet" onClick={() => onSortByColumn(column)}>
            Sort by this column
          </PopButton>
        )}
      </div>

      {!completion && (
        <div className="flex flex-col gap-2">
          <SectionLabel>Grading setup</SectionLabel>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            {ctx.settings.categoriesEnabled &&
              ctx.settings.categories.length > 0 && (
                <label className="col-span-2 flex items-center justify-between gap-2 text-sm text-slate-700">
                  Category
                  <select
                    className={selectClass}
                    value={config?.category ?? ctx.settings.categories[0].id}
                    disabled={busy}
                    onChange={(e) =>
                      void run(() =>
                        saveColumn(column, { category: e.target.value })
                      )
                    }
                  >
                    {ctx.settings.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            <label
              htmlFor={`${ids}-max`}
              className="flex items-center gap-2 text-sm text-slate-700"
            >
              Out of
              <input
                id={`${ids}-max`}
                type="number"
                min={1}
                step="any"
                value={
                  maxDraft ?? (shownMax === null ? '' : fmtPoints(shownMax))
                }
                onChange={(e) => setMaxDraft(e.target.value)}
                onBlur={saveMax}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveMax();
                }}
                className="h-9 w-20 rounded-lg border border-slate-300 px-2 text-sm tabular-nums focus:border-brand-blue-primary focus:outline-none focus:ring-2 focus:ring-brand-blue-lighter"
              />
            </label>
            <label className="flex items-center justify-end gap-2 text-sm text-slate-700">
              Attempts
              <select
                className={selectClass}
                value={config?.attemptPolicy ?? 'latest'}
                disabled={busy}
                onChange={(e) =>
                  void run(() =>
                    saveColumn(column, {
                      attemptPolicy: e.target.value as AttemptPolicy,
                    })
                  )
                }
              >
                <option value="latest">Latest</option>
                <option value="highest">Highest</option>
                <option value="average">Average</option>
              </select>
            </label>
            <label className="col-span-2 flex min-h-9 items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand-blue-primary"
                checked={config?.countsTowardOverall ?? true}
                disabled={busy}
                onChange={(e) =>
                  void run(() =>
                    saveColumn(column, {
                      countsTowardOverall: e.target.checked,
                    })
                  )
                }
              />
              Counts toward overall
            </label>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <SectionLabel>Whole column</SectionLabel>
        {bulk?.stage === 'confirm' ? (
          (() => {
            const m = bulkMessage(bulk.kind);
            return (
              <ConfirmRow
                message={m.text}
                confirmLabel={m.cta}
                busy={busy}
                disabled={m.n === 0 || (bulk.kind === 'fill' && !fillValid)}
                onCancel={() => setBulk(null)}
                onConfirm={() => confirmBulk(bulk.kind)}
              />
            );
          })()
        ) : bulk?.stage === 'done' ? (
          <DoneRow
            message={bulk.message}
            busy={busy}
            onUndo={() =>
              void run(async () => {
                await markWrites.undoBatch(bulk.batchId);
                setBulk(null);
              })
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            {!completion && (
              <div className="flex items-center gap-2">
                <label
                  htmlFor={`${ids}-fill`}
                  className="text-sm text-slate-700"
                >
                  Fill empty cells with
                </label>
                <input
                  id={`${ids}-fill`}
                  type="number"
                  min={0}
                  step="any"
                  value={fillValue}
                  onChange={(e) => setFillValue(e.target.value)}
                  className="h-9 w-20 rounded-lg border border-slate-300 px-2 text-sm tabular-nums focus:border-brand-blue-primary focus:outline-none focus:ring-2 focus:ring-brand-blue-lighter"
                />
                <PopButton
                  disabled={busy || fillable.length === 0 || !fillValid}
                  onClick={() => setBulk({ stage: 'confirm', kind: 'fill' })}
                >
                  Fill
                </PopButton>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {hasMissingFlag && (
                <PopButton
                  disabled={busy || missing.length === 0}
                  onClick={() => setBulk({ stage: 'confirm', kind: 'missing' })}
                >
                  Mark {missing.length} Missing
                </PopButton>
              )}
              {hasExcusedFlag && !completion && (
                <PopButton
                  disabled={busy || excusable.length === 0}
                  onClick={() => setBulk({ stage: 'confirm', kind: 'excuse' })}
                >
                  Excuse column
                </PopButton>
              )}
              <PopButton
                disabled={busy}
                onClick={() =>
                  void run(() => setHidden(column, ctx.rosterId, !hidden))
                }
              >
                {hidden ? 'Show column' : 'Hide column'}
              </PopButton>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-brand-red-primary">
          {error}
        </p>
      )}
    </GradebookPopoverShell>
  );
};
