import React, { useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Lock } from 'lucide-react';
import type { ProjectGroup, ProjectStep, ProjectStepState } from '@/types';
import {
  STEP_STATE_LABELS,
  completedStepCount,
  resolveGroupColor,
  stepStateOf,
} from '@/components/widgets/Projects/projectSteps';
import { STATE_STYLES } from '@/components/widgets/Projects/stepVisuals';
import { StateMark } from '@/components/widgets/Projects/StateMark';
import { ProjectStepStatePicker } from './ProjectStepStatePicker';

const MIN_CELL = 120;
const GAP = 8;
const ARROW = 32;
const ROW_GAP = 6;
const LIST_PAD = 4;

interface StripLayout {
  cellWidth: number;
  perPage: number;
  overflow: boolean;
}

/** Whole cells only: every visible step gets an equal share and none is cut off. */
const layoutFor = (width: number, count: number): StripLayout => {
  if (count * MIN_CELL + (count - 1) * GAP + LIST_PAD <= width) {
    return {
      cellWidth: (width - LIST_PAD - (count - 1) * GAP) / count,
      perPage: count,
      overflow: false,
    };
  }
  const avail = width - 2 * (ARROW + ROW_GAP) - LIST_PAD;
  const perPage = Math.max(1, Math.floor((avail + GAP) / (MIN_CELL + GAP)));
  return {
    cellWidth: (avail - (perPage - 1) * GAP) / perPage,
    perPage,
    overflow: true,
  };
};

/** D41 — the rules lock an approved step, so a student cannot move it out of done. */
const isApprovedLock = (step: ProjectStep, state: ProjectStepState): boolean =>
  step.requiresApproval === true && state === 'done';

interface StepCellProps {
  step: ProjectStep;
  index: number;
  state: ProjectStepState;
  canEdit: boolean;
  busy: boolean;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onPick: (state: ProjectStepState) => void;
  asTeacher: boolean;
  sized: boolean;
}

const StepCell: React.FC<StepCellProps> = ({
  step,
  index,
  state,
  canEdit,
  busy,
  open,
  onToggle,
  onClose,
  onPick,
  asTeacher,
  sized,
}) => {
  const wrapperRef = useRef<HTMLLIElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const locked = isApprovedLock(step, state);
  const disabled = !canEdit || (locked && !asTeacher) || busy;
  const label = locked ? 'Approved' : STEP_STATE_LABELS[state];

  return (
    <li
      ref={wrapperRef}
      className={
        sized
          ? 'sm:w-(--step-w) sm:shrink-0 sm:snap-start'
          : 'sm:min-w-30 sm:flex-1 sm:basis-30'
      }
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Step ${index + 1}, ${step.title}: ${label}${
          locked ? ', locked' : ''
        }`}
        title={step.description}
        className="flex h-full w-full overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition sm:flex-col hover:border-slate-300 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary disabled:cursor-default disabled:hover:border-slate-200"
      >
        <span
          aria-hidden
          className={`flex w-10 shrink-0 items-center justify-center sm:h-10 sm:w-full ${STATE_STYLES[state].tone}`}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <StateMark state={state} size="1.125rem" />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 px-2.5 py-2">
          <span className="line-clamp-3 text-sm font-semibold text-slate-800">
            {step.title}
          </span>
          <span className="flex items-center gap-1 text-xs font-medium text-slate-500">
            {locked && <Lock aria-hidden className="h-3 w-3" />}
            {label}
          </span>
        </span>
      </button>
      {open && (
        <ProjectStepStatePicker
          step={step}
          current={state}
          anchorRef={wrapperRef}
          onPick={onPick}
          asTeacher={asTeacher}
          onClose={(restoreFocus) => {
            onClose();
            if (restoreFocus) triggerRef.current?.focus();
          }}
        />
      )}
    </li>
  );
};

interface ProjectOwnGroupStepsProps {
  group: ProjectGroup;
  steps: ProjectStep[];
  canEdit: boolean;
  busyStepId: string | null;
  openStepId: string | null;
  onOpenStep: (stepId: string | null) => void;
  onPick: (step: ProjectStep, state: ProjectStepState) => void;
  /** The teacher's view of this group: approval steps stay editable. */
  asTeacher?: boolean;
}

/** D47 — the student's own group as a colored row of step cells in the board's colors. */
export const ProjectOwnGroupSteps: React.FC<ProjectOwnGroupStepsProps> = ({
  group,
  steps,
  canEdit,
  busyStepId,
  openStepId,
  onOpenStep,
  onPick,
  asTeacher = false,
}) => {
  const color = resolveGroupColor(group.color, group.order);
  const rowRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const placedRef = useRef(false);
  const [layout, setLayout] = useState<StripLayout | null>(null);
  const [edges, setEdges] = useState({ prev: false, next: false });
  const currentIndex = steps.findIndex(
    (step) => stepStateOf(group, step.id) !== 'done'
  );
  const count = steps.length;

  const readEdges = () => {
    const list = listRef.current;
    if (!list) return;
    const max = list.scrollWidth - list.clientWidth;
    setEdges({ prev: list.scrollLeft > 1, next: list.scrollLeft < max - 1 });
  };

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row || count === 0 || typeof ResizeObserver === 'undefined') return;
    const measure = () => setLayout(layoutFor(row.clientWidth, count));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [count]);

  // Placed on the first measure only, so a resize or a live update never moves the strip.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !layout) return;
    if (!placedRef.current) {
      placedRef.current = true;
      if (layout.overflow && currentIndex > 0)
        list.scrollLeft = (currentIndex - 1) * (layout.cellWidth + GAP);
    }
    readEdges();
  }, [layout, currentIndex]);

  const page = (direction: 1 | -1) => {
    if (!layout) return;
    listRef.current?.scrollBy({
      left: direction * layout.perPage * (layout.cellWidth + GAP),
      behavior: 'smooth',
    });
  };

  const arrowClass =
    'touch-target-expand hidden w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent sm:flex';

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2
          data-testid="own-group-name"
          className="relative max-w-full truncate rounded-md px-2 py-0.5 text-base font-bold text-slate-900"
        >
          <span
            aria-hidden
            className={`absolute inset-0 rounded-md opacity-20 ${color}`}
          />
          <span className="relative">{group.name}</span>
        </h2>
        <p className="text-sm text-slate-500">
          {completedStepCount(group, steps)} of {steps.length} steps done
        </p>
      </div>
      {steps.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          Your teacher has not added the steps yet.
        </p>
      ) : (
        <div ref={rowRef} className="mt-3 sm:flex sm:items-stretch sm:gap-1.5">
          {layout?.overflow && (
            // no-tour-anchor: scrolls the step row, nothing a tour would point at
            <button
              type="button"
              aria-label="Previous steps"
              disabled={!edges.prev}
              onClick={() => page(-1)}
              className={arrowClass}
            >
              <ChevronLeft aria-hidden className="h-5 w-5" />
            </button>
          )}
          <ol
            ref={listRef}
            aria-label="Your steps"
            onScroll={readEdges}
            style={
              layout
                ? ({
                    '--step-w': `${layout.cellWidth}px`,
                  } as React.CSSProperties)
                : undefined
            }
            className="no-scrollbar flex min-w-0 flex-1 flex-col gap-2 sm:snap-x sm:snap-mandatory sm:flex-row sm:overflow-x-auto sm:p-0.5 sm:scroll-px-0.5"
          >
            {steps.map((step, index) => (
              <StepCell
                key={step.id}
                step={step}
                index={index}
                state={stepStateOf(group, step.id)}
                canEdit={canEdit}
                busy={busyStepId === step.id}
                open={openStepId === step.id}
                onToggle={() =>
                  onOpenStep(openStepId === step.id ? null : step.id)
                }
                onClose={() => onOpenStep(null)}
                onPick={(state) => onPick(step, state)}
                asTeacher={asTeacher}
                sized={layout !== null}
              />
            ))}
          </ol>
          {layout?.overflow && (
            // no-tour-anchor: scrolls the step row, nothing a tour would point at
            <button
              type="button"
              aria-label="Next steps"
              disabled={!edges.next}
              onClick={() => page(1)}
              className={arrowClass}
            >
              <ChevronRight aria-hidden className="h-5 w-5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
