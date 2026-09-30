import React, { useId, useState } from 'react';
import { ArrowDownToLine, ChevronDown } from 'lucide-react';
import {
  gradebookDocId,
  isCompletionOnly,
  isPublishedFor,
} from '@/utils/gradebook/gradebookCore';
import {
  emptyCellsBelow,
  useGradebookMarkWrites,
} from '@/hooks/gradebook/useGradebookMarkWrites';
import { useMarkHistory } from '@/hooks/gradebook/useMarkHistory';
import { logError } from '@/utils/logError';
import { GradebookPopoverShell } from './GradebookPopoverShell';
import { FlagChip, FlagMenuList, LinkBtn, Toggle } from './popoverParts';
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
  GradebookNotify,
  GradebookPopoverContext,
} from './types';

const DAY_MS = 86_400_000;

export interface GradebookCellPopoverProps {
  anchor: HTMLElement;
  ctx: GradebookPopoverContext;
  column: GradebookColumnRef;
  cell: GradebookCellData;
  /** This column's cells in the grid's current row order (fill down uses the ones below). */
  columnCells: GradebookCellData[];
  /** Digits typed on the cell before it opened (D23 inline override). */
  prefill?: string;
  /** 'enter' means the score was committed with Enter, so the grid moves down a row. */
  onClose: (reason?: 'enter') => void;
  onNotify?: GradebookNotify;
  /** Opens this student's quiz grader; hidden when absent. */
  onOpenGrader?: (sessionId: string, studentUid: string) => void;
}

/** D21 cell popover. Score and comment save when it closes; flags and publish save at once. */
export const GradebookCellPopover: React.FC<GradebookCellPopoverProps> = ({
  anchor,
  ctx,
  column,
  cell,
  columnCells,
  prefill,
  onClose,
  onNotify,
  onOpenGrader,
}) => {
  const ids = useId();
  const writes = useGradebookMarkWrites(ctx.rosterId);
  const { row, mark, final, student } = cell;
  const completion = isCompletionOnly(column.kind);
  const notAssigned = final.status === 'not-assigned';
  const max = final.max ?? column.config?.maxPointsOverride ?? row?.max ?? null;
  const initialScore = final.status === 'scored' ? fmtPoints(final.points) : '';

  const [score, setScore] = useState(prefill ?? initialScore);
  const [commentText, setCommentText] = useState(mark?.comment?.text ?? '');
  const [shared, setShared] = useState(mark?.comment?.shared ?? false);
  const [flagAnchor, setFlagAnchor] = useState<HTMLElement | null>(null);
  const flagMenuOpen = flagAnchor !== null;
  const [showHistory, setShowHistory] = useState(false);
  const history = useMarkHistory(
    showHistory ? gradebookDocId(column.sessionId, student.uid) : null
  );

  const fail = (err: unknown) => {
    logError('gradebook cell write', err);
    onNotify?.('Could not save. Try again.');
  };

  const parsed = score.trim() === '' ? null : Number(score);
  const scoreValid =
    parsed !== null &&
    Number.isFinite(parsed) &&
    parsed >= 0 &&
    (max === null || parsed <= max * 2);

  /** Saves a changed score and comment; returns false when the score is invalid. */
  const commit = (): boolean => {
    if (notAssigned) return true;
    const scoreChanged =
      !completion && score.trim() !== initialScore && score.trim() !== '';
    if (scoreChanged && !scoreValid) {
      onNotify?.(
        `Score not saved. Enter 0 to ${max === null ? 'the total' : fmtPoints(max * 2)}.`
      );
      return false;
    }
    const text = commentText.trim();
    const old = mark?.comment;
    const commentChanged =
      text !== (old?.text ?? '') ||
      (text !== '' && shared !== (old?.shared ?? false));
    if ((scoreChanged && parsed !== null) || commentChanged) {
      writes
        .saveEdits(column, cell, {
          points: scoreChanged && parsed !== null ? parsed : undefined,
          comment: commentChanged ? { text, shared } : undefined,
        })
        .catch(fail);
    }
    return true;
  };

  const close = () => {
    commit();
    onClose();
  };

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
  const showUnpublished = !completion && !notAssigned && published === false;

  const flagDefs = ctx.settings.flags.filter((f) => f.visibility !== 'off');
  const activeDefs = final.flags
    .map((a) => ({ a, def: flagDefs.find((f) => f.id === a.id) }))
    .filter(
      (
        x
      ): x is {
        a: (typeof final.flags)[number];
        def: (typeof flagDefs)[number];
      } => x.def !== undefined
    );
  const below = emptyCellsBelow(columnCells, student.uid);
  const attempts = row?.attempts ?? [];
  const policy = column.config?.attemptPolicy ?? 'latest';

  const meta: React.ReactNode[] = [];
  if (mark?.override) {
    meta.push(
      <span key="calc">
        Calculated{' '}
        <s className="text-slate-400">
          {final.rawPoints === null || !max
            ? 'none'
            : fmtPct((final.rawPoints / max) * 100)}
        </s>{' '}
        <LinkBtn
          onClick={() => {
            setScore(fmtPoints(final.rawPoints));
            writes.setOverride(column, cell, null).catch(fail);
          }}
        >
          Revert
        </LinkBtn>
      </span>
    );
  }
  if (attempts.length > 1) {
    const pcts = attempts
      .map((a) =>
        a.points !== null && a.max ? fmtPct((a.points / a.max) * 100) : 'none'
      )
      .join(', ');
    const using =
      policy === 'latest'
        ? 'latest'
        : policy === 'highest'
          ? 'highest'
          : 'average';
    meta.push(
      <span key="att">
        {attempts.length} attempts ({pcts}), using {using}
      </span>
    );
  }

  const flagButton = (
    <button
      type="button"
      aria-haspopup="menu"
      aria-expanded={flagMenuOpen}
      onClick={(e) => {
        const target = e.currentTarget;
        setFlagAnchor((a) => (a ? null : target));
      }}
      className="inline-flex h-10 min-w-0 max-w-[170px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white pl-2.5 pr-2 text-left text-[13px] font-medium text-slate-800 aria-expanded:border-brand-blue-primary aria-expanded:ring-[3px] aria-expanded:ring-brand-blue-primary/30 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-blue-primary/30"
    >
      {activeDefs.length > 0 ? (
        <>
          <FlagChip flag={activeDefs[0].def} auto={activeDefs[0].a.auto} />
          <span className="truncate">
            {activeDefs[0].def.name}
            {activeDefs.length > 1 ? ` +${activeDefs.length - 1}` : ''}
          </span>
        </>
      ) : (
        <span className="text-slate-400">Flag</span>
      )}
      <ChevronDown
        size={16}
        aria-hidden
        className={`ml-auto flex-none text-slate-400 transition-transform ${flagMenuOpen ? 'rotate-180' : ''}`}
      />
    </button>
  );

  return (
    <GradebookPopoverShell
      anchor={anchor}
      onClose={close}
      ariaLabel={`${student.name}, ${column.title}`}
    >
      <div className="min-w-0">
        <h3 className="text-[15px] font-bold leading-tight text-slate-900">
          {student.name}
        </h3>
        <p className="mt-0.5 text-xs leading-normal text-slate-500">
          {column.title} · {statusParts.join(' · ')}
          {showUnpublished && (
            <>
              {' · '}
              <span className="font-semibold text-amber-700">
                Not published
              </span>
            </>
          )}
          {final.status === 'awaiting' && onOpenGrader && (
            <>
              {' · '}
              <LinkBtn
                warn
                onClick={() => onOpenGrader(column.sessionId, student.uid)}
              >
                Needs grading
              </LinkBtn>
            </>
          )}
        </p>
      </div>

      {!notAssigned && (
        <>
          <div className="flex items-center gap-2">
            {completion ? (
              <span className="text-xs text-slate-600">
                {final.status === 'complete'
                  ? 'Submitted · completion only'
                  : 'Not submitted'}
              </span>
            ) : (
              <>
                <div className="flex h-10 items-center rounded-lg border border-slate-300 bg-white pr-1 focus-within:border-brand-blue-primary focus-within:ring-[3px] focus-within:ring-brand-blue-primary/30">
                  <input
                    id={`${ids}-score`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    aria-label="Score"
                    autoFocus={prefill !== undefined}
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (commit()) onClose('enter');
                      }
                    }}
                    className="h-[38px] w-[72px] border-0 bg-transparent pl-3 pr-1 text-base font-semibold tabular-nums text-slate-900 [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    disabled={below.length === 0 || !scoreValid}
                    aria-label="Fill empty cells below"
                    title={
                      below.length
                        ? `Use this score for the ${below.length} empty ${below.length === 1 ? 'cell' : 'cells'} below`
                        : 'No empty cells below'
                    }
                    onClick={() => {
                      if (parsed === null) return;
                      writes
                        .fillDown(column, cell, below, parsed)
                        .then((res) =>
                          onNotify?.(
                            `Filled ${res.count} ${res.count === 1 ? 'cell' : 'cells'} below with ${fmtPoints(parsed)}${max === null ? '' : `/${fmtPoints(max)}`}`,
                            () => void writes.undoBatch(res.batchId)
                          )
                        )
                        .catch(fail);
                      setScore(fmtPoints(parsed));
                    }}
                    className="grid h-[30px] w-[30px] place-items-center rounded-md text-slate-400 hover:enabled:bg-brand-blue-lighter hover:enabled:text-brand-blue-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-blue-primary disabled:opacity-40"
                  >
                    <ArrowDownToLine size={16} aria-hidden />
                  </button>
                </div>
                <span className="text-[15px] font-medium text-slate-500">
                  / {max === null ? '?' : fmtPoints(max)}
                </span>
              </>
            )}
            <span className="flex-1" />
            {flagDefs.length > 0 && flagButton}
          </div>

          {meta.length > 0 && (
            <p className="-mt-1 text-xs text-slate-500">
              {meta.map((m, i) => (
                <React.Fragment key={i}>
                  {i > 0 && ' · '}
                  {m}
                </React.Fragment>
              ))}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor={`${ids}-comment`}
                className="text-xs font-semibold uppercase tracking-wide text-slate-700"
              >
                Comment
              </label>
              <Toggle small checked={shared} onChange={setShared}>
                Share with student
              </Toggle>
            </div>
            <textarea
              id={`${ids}-comment`}
              rows={2}
              maxLength={5000}
              placeholder="Add a comment"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              className="resize-y rounded-lg border border-slate-300 px-2.5 py-2 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-brand-blue-primary focus:outline-none focus:ring-[3px] focus:ring-brand-blue-primary/30"
            />
          </div>
        </>
      )}

      <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
        <LinkBtn
          aria-expanded={showHistory}
          onClick={() => setShowHistory((v) => !v)}
        >
          History
          {showHistory && history.entries.length > 0
            ? ` (${history.entries.length})`
            : ''}
        </LinkBtn>
        <span className="flex-1" />
        {!completion && !notAssigned && published !== null && (
          <LinkBtn
            onClick={() => {
              const next = published ? 'unpublished' : 'published';
              writes
                .setPublish(column, cell, next)
                .then((batchId) =>
                  onNotify?.(
                    `${published ? 'Unpublished' : 'Published'} for ${student.firstName}`,
                    () => void writes.undoBatch(batchId)
                  )
                )
                .catch(fail);
            }}
          >
            {published ? 'Unpublish' : 'Publish'} for {student.firstName}
          </LinkBtn>
        )}
      </div>
      {showHistory &&
        (history.loading ? null : history.entries.length === 0 ? (
          <p className="-mt-1 text-xs text-slate-500">No changes yet</p>
        ) : (
          <ol className="-mt-1 flex list-decimal flex-col gap-1 pl-[18px] text-xs text-slate-600">
            {history.entries.map((e) => (
              <li key={e.id}>
                {fmtDateTime(e.at)} · {describeHistory(e, ctx.settings.flags)}
              </li>
            ))}
          </ol>
        ))}

      {flagAnchor && (
        <GradebookPopoverShell
          submenu
          anchor={flagAnchor}
          onClose={() => setFlagAnchor(null)}
          ariaLabel="Flags"
        >
          <FlagMenuList
            flags={flagDefs}
            active={final.flags}
            onToggle={(flagId) =>
              writes.toggleFlag(column, cell, flagId).catch(fail)
            }
          />
        </GradebookPopoverShell>
      )}
    </GradebookPopoverShell>
  );
};
