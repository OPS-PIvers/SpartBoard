import React, { useEffect, useRef } from 'react';
import { Loader2, Lock } from 'lucide-react';
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
}) => {
  const wrapperRef = useRef<HTMLLIElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const locked = isApprovedLock(step, state);
  const disabled = !canEdit || (locked && !asTeacher) || busy;
  const label = locked ? 'Approved' : STEP_STATE_LABELS[state];

  return (
    <li
      ref={wrapperRef}
      className="sm:min-w-30 sm:flex-1 sm:shrink-0 sm:basis-30"
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
  const listRef = useRef<HTMLOListElement>(null);
  const currentIndex = steps.findIndex(
    (step) => stepStateOf(group, step.id) !== 'done'
  );

  // Bring the first unfinished step into view once the strip overflows.
  useEffect(() => {
    const list = listRef.current;
    const item = list?.children[currentIndex] as HTMLElement | undefined;
    if (!list || !item || list.scrollWidth <= list.clientWidth) return;
    const listRect = list.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    list.scrollLeft +=
      itemRect.left - listRect.left - (listRect.width - itemRect.width) / 2;
  }, [currentIndex, steps.length]);

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
        <ol
          ref={listRef}
          aria-label="Your steps"
          className="custom-scrollbar mt-3 flex flex-col gap-2 sm:flex-row sm:overflow-x-auto sm:pb-1.5"
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
            />
          ))}
        </ol>
      )}
    </div>
  );
};
