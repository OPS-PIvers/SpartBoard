import React, { useId, useState } from 'react';
import {
  gradebookDocId,
  isCompletionOnly,
  isPublishedFor,
} from '@/utils/gradebook/gradebookCore';
import {
  isFillable,
  useGradebookMarkWrites,
} from '@/hooks/gradebook/useGradebookMarkWrites';
import { useMarkHistory } from '@/hooks/gradebook/useMarkHistory';
import { GradebookPopoverShell } from './GradebookPopoverShell';
import {
  ConfirmRow,
  DoneRow,
  FlagChecklist,
  PopButton,
  SectionLabel,
} from './popoverParts';
import {
  describeHistory,
  fmtDate,
  fmtDateTime,
  fmtPct,
  fmtPoints,
} from './popoverFormat';
import type {
  GradebookCellData,
  GradebookColumnRef,
  GradebookPopoverContext,
} from './types';

const DAY_MS = 86_400_000;

export interface GradebookCellPopoverProps {
  anchor: HTMLElement;
  ctx: GradebookPopoverContext;
  column: GradebookColumnRef;
  cell: GradebookCellData;
  /** Every student's cell in this column, for fill down. */
  columnCells: GradebookCellData[];
  /** Digits typed on the cell before it opened (D23 inline override). */
  prefill?: string;
  onClose: () => void;
  /** Opens this student's quiz grader; hidden when absent. */
  onOpenGrader?: (sessionId: string, studentUid: string) => void;
}

/** D21 cell popover: override, flags, comment, fill down, per-student publish, attempts, history. */
export const GradebookCellPopover: React.FC<GradebookCellPopoverProps> = ({
  anchor,
  ctx,
  column,
  cell,
  columnCells,
  prefill,
  onClose,
  onOpenGrader,
}) => {
  const ids = useId();
  const writes = useGradebookMarkWrites(ctx.rosterId);
  const { row, mark, final, student } = cell;
  const completion = isCompletionOnly(column.kind);
  const notAssigned = final.status === 'not-assigned';
  const max = final.max ?? column.config?.maxPointsOverride ?? row?.max ?? null;

  const [score, setScore] = useState<string>(
    prefill ?? (final.status === 'scored' ? fmtPoints(final.points) : '')
  );
  const [commentText, setCommentText] = useState(mark?.comment?.text ?? '');
  const [commentShared, setCommentShared] = useState(
    mark?.comment?.shared ?? false
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fill, setFill] = useState<
    | { stage: 'confirm'; points: number }
    | { stage: 'done'; batchId: string; count: number }
    | null
  >(null);
  const [showHistory, setShowHistory] = useState(false);
  const history = useMarkHistory(
    showHistory ? gradebookDocId(column.sessionId, student.uid) : null
  );

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

  const parsedScore = score.trim() === '' ? null : Number(score);
  const scoreValid =
    parsedScore !== null &&
    Number.isFinite(parsedScore) &&
    parsedScore >= 0 &&
    (max === null || parsedScore <= max * 2);
  const unchangedScore =
    mark?.override != null && parsedScore === mark.override.points;

  const statusParts: string[] = [];
  if (notAssigned) {
    statusParts.push('Not assigned');
  } else if (row?.submittedAt != null) {
    statusParts.push(`Submitted ${fmtDate(row.submittedAt)}`);
    const due = row.dueAt ?? column.dueAt;
    if (due !== null && row.submittedAt > due) {
      const days = Math.ceil((row.submittedAt - due) / DAY_MS);
      statusParts.push(`${days} ${days === 1 ? 'day' : 'days'} late`);
    }
  } else {
    const due = row?.dueAt ?? column.dueAt;
    statusParts.push(
      due !== null && due > ctx.now ? `Due ${fmtDate(due)}` : 'No submission'
    );
  }
  const published = row ? isPublishedFor(row, mark) : null;
  if (!completion && !notAssigned && published !== null) {
    statusParts.push(published ? 'Published' : 'Not published');
  }

  const fillCount = columnCells.filter(isFillable).length;
  const flagDefs = ctx.settings.flags.filter((f) => f.visibility !== 'off');
  const attempts = row?.attempts ?? [];
  const policy = column.config?.attemptPolicy ?? 'latest';

  return (
    <GradebookPopoverShell
      anchor={anchor}
      onClose={onClose}
      ariaLabel={`${student.name}, ${column.title}`}
    >
      <div>
        <h3 className="text-base font-semibold text-slate-900">
          {student.name}
        </h3>
        <p className="text-xs text-slate-600">
          {column.title} · {statusParts.join(' · ')}
        </p>
      </div>

      {notAssigned ? null : completion ? (
        <p className="text-sm text-slate-700">
          {final.status === 'complete' ? 'Submitted' : 'No submission yet'}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <SectionLabel htmlFor={`${ids}-score`}>Score</SectionLabel>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!scoreValid || unchangedScore) return;
              void run(() => writes.setOverride(column, cell, parsedScore));
            }}
          >
            <input
              id={`${ids}-score`}
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              autoFocus={prefill !== undefined}
              value={score}
              onChange={(e) => setScore(e.target.value)}
              className="h-9 w-24 rounded-lg border border-slate-300 px-2 text-sm tabular-nums focus:border-brand-blue-primary focus:outline-none focus:ring-2 focus:ring-brand-blue-lighter"
            />
            <span className="text-slate-600">
              / {max === null ? '?' : fmtPoints(max)}
            </span>
            <PopButton
              type="submit"
              tone="primary"
              disabled={busy || !scoreValid || unchangedScore}
            >
              Save
            </PopButton>
            {mark?.override && (
              <PopButton
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await writes.setOverride(column, cell, null);
                    setScore(fmtPoints(final.rawPoints));
                  })
                }
              >
                Revert
              </PopButton>
            )}
          </form>
          {mark?.override && (
            <p className="text-xs text-slate-600">
              Calculated{' '}
              <s>
                {final.rawPoints === null
                  ? 'none'
                  : `${fmtPoints(final.rawPoints)}${max ? ` (${fmtPct((final.rawPoints / max) * 100)})` : ''}`}
              </s>
            </p>
          )}
          {final.status === 'awaiting' && (
            <p className="text-xs font-medium text-amber-800">Awaiting grade</p>
          )}
          {final.source === 'flag' && (
            <p className="text-xs text-slate-600">
              Set by the{' '}
              {ctx.settings.flags.find((f) => f.id === final.flagId)?.name ??
                'flag'}{' '}
              flag
            </p>
          )}
          {column.kind === 'quiz' &&
            onOpenGrader &&
            row?.submittedAt != null && (
              <PopButton
                tone="quiet"
                className="self-start"
                onClick={() => onOpenGrader(column.sessionId, student.uid)}
              >
                Grade answers
              </PopButton>
            )}
        </div>
      )}

      {!notAssigned && flagDefs.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel>Flags</SectionLabel>
          <FlagChecklist
            flags={flagDefs}
            active={final.flags}
            disabled={busy}
            onToggle={(flagId) =>
              void run(() => writes.toggleFlag(column, cell, flagId))
            }
          />
        </div>
      )}

      {!notAssigned && (
        <div className="flex flex-col gap-2">
          <SectionLabel htmlFor={`${ids}-comment`}>Comment</SectionLabel>
          <textarea
            id={`${ids}-comment`}
            rows={2}
            maxLength={5000}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            className="resize-y rounded-lg border border-slate-300 p-2 text-sm focus:border-brand-blue-primary focus:outline-none focus:ring-2 focus:ring-brand-blue-lighter"
          />
          <div className="flex items-center gap-2">
            <label className="flex min-h-9 items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={commentShared}
                onChange={(e) => setCommentShared(e.target.checked)}
                className="h-4 w-4 accent-brand-blue-primary"
              />
              Share with student
            </label>
            <PopButton
              className="ml-auto"
              disabled={
                busy ||
                (commentText.trim() === (mark?.comment?.text ?? '') &&
                  commentShared === (mark?.comment?.shared ?? false))
              }
              onClick={() =>
                void run(() =>
                  writes.setComment(column, cell, commentText, commentShared)
                )
              }
            >
              Save comment
            </PopButton>
          </div>
        </div>
      )}

      {!notAssigned && !completion && (
        <div className="flex flex-col gap-2">
          {fill?.stage === 'confirm' ? (
            <ConfirmRow
              message={`Fill ${fillCount} empty ${fillCount === 1 ? 'cell' : 'cells'} with ${fmtPoints(fill.points)}?`}
              confirmLabel={`Fill ${fillCount}`}
              busy={busy}
              disabled={fillCount === 0}
              onCancel={() => setFill(null)}
              onConfirm={() =>
                void run(async () => {
                  const res = await writes.fillEmpty(
                    column,
                    columnCells,
                    fill.points
                  );
                  setFill({ stage: 'done', ...res });
                })
              }
            />
          ) : fill?.stage === 'done' ? (
            <DoneRow
              message={`Filled ${fill.count} ${fill.count === 1 ? 'cell' : 'cells'}`}
              busy={busy}
              onUndo={() =>
                void run(async () => {
                  await writes.undoBatch(fill.batchId);
                  setFill(null);
                })
              }
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              <PopButton
                disabled={busy || !scoreValid || fillCount === 0}
                title="Fills cells with no work, score or excusing flag"
                onClick={() =>
                  parsedScore !== null &&
                  setFill({ stage: 'confirm', points: parsedScore })
                }
              >
                Fill down
              </PopButton>
              {published !== null && (
                <PopButton
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      writes.setPublish(
                        column,
                        cell,
                        published ? 'unpublished' : 'published'
                      )
                    )
                  }
                >
                  {published ? 'Unpublish for student' : 'Publish for student'}
                </PopButton>
              )}
            </div>
          )}
        </div>
      )}

      {attempts.length > 1 && (
        <div className="flex flex-col gap-1">
          <SectionLabel>
            Attempts ·{' '}
            {policy === 'latest'
              ? 'Latest'
              : policy === 'highest'
                ? 'Highest'
                : 'Average'}{' '}
            counts
          </SectionLabel>
          <ol className="flex flex-col gap-0.5 text-sm text-slate-700">
            {attempts.map((a, i) => (
              <li
                key={`${a.at}-${i}`}
                className="flex justify-between gap-2 tabular-nums"
              >
                <span>
                  {i + 1}. {fmtDate(a.at)}
                </span>
                <span>
                  {a.state === 'awaiting-grade'
                    ? 'Awaiting grade'
                    : a.points === null || a.max === null
                      ? 'None'
                      : `${fmtPoints(a.points)} / ${fmtPoints(a.max)}`}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <PopButton
          tone="quiet"
          className="self-start"
          aria-expanded={showHistory}
          onClick={() => setShowHistory((v) => !v)}
        >
          History
        </PopButton>
        {showHistory &&
          (history.loading ? (
            <p className="text-xs text-slate-500">Loading…</p>
          ) : history.entries.length === 0 ? (
            <p className="text-xs text-slate-500">No changes yet</p>
          ) : (
            <ol className="flex flex-col gap-1 text-xs text-slate-700">
              {history.entries.map((e) => (
                <li key={e.id}>
                  <span className="text-slate-500">{fmtDateTime(e.at)}</span>{' '}
                  {describeHistory(e, ctx.settings.flags)}
                </li>
              ))}
            </ol>
          ))}
      </div>

      {error && (
        <p role="alert" className="text-sm text-brand-red-primary">
          {error}
        </p>
      )}
    </GradebookPopoverShell>
  );
};
