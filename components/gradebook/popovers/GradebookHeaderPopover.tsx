import React, { useId, useState } from 'react';
import { ArrowUpDown, EyeOff, Pencil, Trash2 } from 'lucide-react';
import {
  isCompletionOnly,
  type AttemptPolicy,
} from '@/utils/gradebook/gradebookCore';
import {
  isFillable,
  useGradebookMarkWrites,
} from '@/hooks/gradebook/useGradebookMarkWrites';
import { useGradebookColumnWrites } from '@/hooks/gradebook/useGradebookColumnWrites';
import { logError } from '@/utils/logError';
import { GradebookPopoverShell } from './GradebookPopoverShell';
import { Btn, IconBtn, INPUT_CLASS, Select, Toggle } from './popoverParts';
import { KIND_LABELS, fmtDate, fmtPct, fmtPoints } from './popoverFormat';
import type {
  GradebookCellData,
  GradebookColumnRef,
  GradebookNotify,
  GradebookPopoverContext,
} from './types';

export interface GradebookHeaderPopoverProps {
  anchor: HTMLElement;
  ctx: GradebookPopoverContext;
  column: GradebookColumnRef;
  columnCells: GradebookCellData[];
  onClose: () => void;
  onNotify?: GradebookNotify;
  onOpenResults?: (column: GradebookColumnRef) => void;
  onAnalyze?: (column: GradebookColumnRef) => void;
  /** Whole-class publish through the kind's own publish flow (D22). */
  onPublishColumn?: (
    column: GradebookColumnRef,
    action: 'publish' | 'unpublish'
  ) => void;
  onSortByColumn?: (column: GradebookColumnRef) => void;
  /** True while the grid is sorted by this column. */
  sortedByColumn?: boolean;
  onEditAssignment?: (column: GradebookColumnRef) => void;
  onDeleteAssignment?: (column: GradebookColumnRef) => void;
  /** The Standards picker (D29), mounted by the tagging slice. */
  standardsControl?: React.ReactNode;
}

const LABEL = 'text-[13px] font-medium text-slate-600';

/** D22 column header popover: tools, open/analyze/publish, grading setup and Mark all. */
export const GradebookHeaderPopover: React.FC<GradebookHeaderPopoverProps> = ({
  anchor,
  ctx,
  column,
  columnCells,
  onClose,
  onNotify,
  onOpenResults,
  onAnalyze,
  onPublishColumn,
  onSortByColumn,
  sortedByColumn,
  onEditAssignment,
  onDeleteAssignment,
  standardsControl,
}) => {
  const ids = useId();
  const markWrites = useGradebookMarkWrites(ctx.rosterId);
  const { saveColumn, setHidden } = useGradebookColumnWrites();
  const completion = isCompletionOnly(column.kind);
  const config = column.config;

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [maxDraft, setMaxDraft] = useState<string | null>(null);
  const liveFlags = ctx.settings.flags.filter((f) => f.visibility !== 'off');
  const markOptions: { value: string; label: string }[] = [
    ...(completion ? [] : [{ value: 'zero', label: '0 points' }]),
    ...liveFlags.map((f) => ({ value: f.id, label: f.name })),
  ];
  const [markValue, setMarkValue] = useState(
    markOptions.find((o) => o.value === 'missing')?.value ??
      markOptions[0]?.value ??
      ''
  );

  const fail = (err: unknown) => {
    logError('gradebook column write', err);
    onNotify?.('Could not save. Try again.');
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
  const empties = columnCells.filter(isFillable);

  const sub: string[] = [KIND_LABELS[column.kind]];
  if (column.dueAt !== null) sub.push(`due ${fmtDate(column.dueAt)}`);
  sub.push(`${submitted}/${assigned.length} submitted`);
  if (!completion && average !== null) sub.push(`avg ${fmtPct(average)}`);

  const saveMax = () => {
    if (maxDraft === null) return;
    const trimmed = maxDraft.trim();
    setMaxDraft(null);
    const next = trimmed === '' ? null : Number(trimmed);
    if (next !== null && (!Number.isFinite(next) || next <= 0)) return;
    const value = next === rawMax ? null : next;
    if (value === (config?.maxPointsOverride ?? null)) return;
    saveColumn(column, { maxPointsOverride: value }).catch(fail);
  };

  const applyMarkAll = () => {
    const opt = markOptions.find((o) => o.value === markValue);
    if (!opt) return;
    markWrites
      .markAll(column, columnCells, markValue)
      .then((res) =>
        onNotify?.(
          `Marked ${res.count} empty ${res.count === 1 ? 'cell' : 'cells'} ${opt.label} on ${column.title}`,
          () => void markWrites.undoBatch(res.batchId)
        )
      )
      .catch(fail);
  };

  return (
    <GradebookPopoverShell
      anchor={anchor}
      onClose={onClose}
      ariaLabel={column.title}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold leading-tight text-slate-900">
            {column.title}
          </h3>
          <p className="mt-0.5 text-xs leading-normal text-slate-500">
            {sub.join(' · ')}
            {!completion && !published && (
              <>
                {' · '}
                <span className="font-semibold text-amber-700">
                  Not published
                </span>
              </>
            )}
          </p>
        </div>
        <div className="-mr-1.5 -mt-1 flex gap-0.5">
          {onSortByColumn && (
            <IconBtn
              aria-label="Sort by this column"
              title="Sort by this column"
              aria-pressed={!!sortedByColumn}
              onClick={() => onSortByColumn(column)}
            >
              <ArrowUpDown size={16} aria-hidden />
            </IconBtn>
          )}
          {onEditAssignment && (
            <IconBtn
              aria-label="Edit assignment"
              title="Edit assignment"
              onClick={() => onEditAssignment(column)}
            >
              <Pencil size={16} aria-hidden />
            </IconBtn>
          )}
          <IconBtn
            aria-label="Hide column"
            title="Hide column"
            onClick={() => {
              setHidden(column, ctx.rosterId, true)
                .then(() =>
                  onNotify?.('Column hidden', () =>
                    setHidden(column, ctx.rosterId, false).catch(fail)
                  )
                )
                .catch(fail);
              onClose();
            }}
          >
            <EyeOff size={16} aria-hidden />
          </IconBtn>
          {onDeleteAssignment && (
            <IconBtn
              danger
              aria-label="Delete assignment"
              title="Delete assignment"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={16} aria-hidden />
            </IconBtn>
          )}
        </div>
      </div>

      {confirmDelete && onDeleteAssignment && (
        <div className="flex flex-col gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-900">
          <span>
            Delete <b>{column.title}</b>? Student work and scores are removed
            for everyone.
          </span>
          <div className="flex gap-2">
            <Btn
              tone="danger"
              size="sm"
              onClick={() => {
                onDeleteAssignment(column);
                onClose();
              }}
            >
              Delete
            </Btn>
            <Btn size="sm" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Btn>
          </div>
        </div>
      )}

      <div className="grid auto-cols-fr grid-flow-col gap-2">
        {onOpenResults && (
          <Btn className="px-2" onClick={() => onOpenResults(column)}>
            {completion ? 'Submissions' : 'Results'}
          </Btn>
        )}
        {!completion && onAnalyze && (
          <Btn className="px-2" onClick={() => onAnalyze(column)}>
            Analyze
          </Btn>
        )}
        {!completion && onPublishColumn && (
          <Btn
            className="px-2"
            tone={published ? 'default' : 'primary'}
            onClick={() =>
              onPublishColumn(column, published ? 'unpublish' : 'publish')
            }
          >
            {published ? 'Unpublish' : 'Publish'}
          </Btn>
        )}
      </div>

      {!completion && (
        <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5">
          {ctx.settings.categoriesEnabled &&
            ctx.settings.categories.length > 0 && (
              <>
                <label htmlFor={`${ids}-cat`} className={LABEL}>
                  Category
                </label>
                <Select
                  id={`${ids}-cat`}
                  value={config?.category ?? ctx.settings.categories[0].id}
                  onChange={(e) =>
                    saveColumn(column, { category: e.target.value }).catch(fail)
                  }
                >
                  {ctx.settings.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </>
            )}
          <label htmlFor={`${ids}-max`} className={LABEL}>
            Total points
          </label>
          <input
            id={`${ids}-max`}
            type="number"
            min={1}
            step="any"
            className={`${INPUT_CLASS} tabular-nums`}
            value={maxDraft ?? (shownMax === null ? '' : fmtPoints(shownMax))}
            onChange={(e) => setMaxDraft(e.target.value)}
            onBlur={saveMax}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveMax();
            }}
          />
          <label
            htmlFor={`${ids}-policy`}
            className={LABEL}
            title="Which score counts when a student retakes it"
          >
            Retakes
          </label>
          <Select
            id={`${ids}-policy`}
            value={config?.attemptPolicy ?? 'latest'}
            onChange={(e) =>
              saveColumn(column, {
                attemptPolicy: e.target.value as AttemptPolicy,
              }).catch(fail)
            }
          >
            <option value="latest">Use latest</option>
            <option value="highest">Use highest</option>
            <option value="average">Average them</option>
          </Select>
          {standardsControl && (
            <>
              <span className={LABEL}>Standards</span>
              {standardsControl}
            </>
          )}
          <span />
          <Toggle
            checked={config?.countsTowardOverall ?? true}
            onChange={(checked) =>
              saveColumn(column, { countsTowardOverall: checked }).catch(fail)
            }
          >
            Counts toward overall
          </Toggle>
        </div>
      )}

      {markOptions.length > 0 && (
        <div className="flex flex-col gap-2.5 border-t border-slate-100 pt-3.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">
            Mark all
          </span>
          <div className="flex items-center gap-2">
            <label
              htmlFor={`${ids}-mark`}
              className={`${LABEL} w-24 flex-none whitespace-nowrap`}
            >
              Empty cells
            </label>
            <Select
              id={`${ids}-mark`}
              className="flex-1"
              value={markValue}
              onChange={(e) => setMarkValue(e.target.value)}
            >
              {markOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <Btn
              size="sm"
              className="h-9"
              disabled={empties.length === 0}
              onClick={applyMarkAll}
            >
              Apply{empties.length ? ` to ${empties.length}` : ''}
            </Btn>
          </div>
        </div>
      )}
    </GradebookPopoverShell>
  );
};
