import React, { useRef } from 'react';
import { Loader2, Lock } from 'lucide-react';
import type { ProjectGroup, ProjectStep, ProjectStepState } from '@/types';
import {
  STEP_STATE_LABELS,
  completedStepCount,
  defaultGroupColor,
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
}) => {
  const wrapperRef = useRef<HTMLLIElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const locked = isApprovedLock(step, state);
  const disabled = !canEdit || locked || busy;
  const label = locked ? 'Approved' : STEP_STATE_LABELS[state];

  return (
    <li ref={wrapperRef} className="relative min-w-[8.5rem] flex-1 basis-36">
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
        className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary disabled:cursor-default disabled:hover:border-slate-200"
      >
        <span
          aria-hidden
          className={`flex h-10 w-full items-center justify-center ${STATE_STYLES[state].tone}`}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <StateMark state={state} size="1.125rem" />
          )}
        </span>
        <span className="flex flex-1 flex-col gap-0.5 px-2.5 py-2">
          <span className="line-clamp-2 text-sm font-semibold text-slate-800">
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
}) => {
  const color = group.color ?? defaultGroupColor(group.order);
  return (
    <div className="flex gap-3">
      <span
        aria-hidden
        data-testid="own-group-edge"
        className={`w-1.5 shrink-0 rounded-full ${color}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="max-w-full truncate text-base font-bold text-slate-900">
            {group.name}
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
          <ol aria-label="Your steps" className="mt-3 flex flex-wrap gap-2">
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
              />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
};
