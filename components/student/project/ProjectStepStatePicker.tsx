import React, { useEffect, useRef } from 'react';
import type { ProjectStep, ProjectStepState } from '@/types';
import {
  STEP_STATE_LABELS,
  studentStateOptions,
} from '@/components/widgets/Projects/projectSteps';
import { STATE_STYLES } from '@/components/widgets/Projects/stepVisuals';
import { StateMark } from '@/components/widgets/Projects/StateMark';

interface ProjectStepStatePickerProps {
  step: ProjectStep;
  current: ProjectStepState;
  /** The cell's wrapper, so a tap on the trigger does not count as outside. */
  anchorRef: React.RefObject<HTMLElement | null>;
  onPick: (state: ProjectStepState) => void;
  onClose: (restoreFocus: boolean) => void;
}

/** D47 — one tap to a specific state, like the teacher board's status popover. */
export const ProjectStepStatePicker: React.FC<ProjectStepStatePickerProps> = ({
  step,
  current,
  anchorRef,
  onPick,
  onClose,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current
      ?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')
      ?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose(true);
      }
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && anchorRef.current?.contains(target)) return;
      onClose(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [anchorRef, onClose]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`Set ${step.title}`}
      className="absolute left-0 top-full z-20 mt-1.5 w-full min-w-[12rem] rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
    >
      <div role="group" aria-label="Status" className="flex flex-col gap-1">
        {studentStateOptions(step).map((state) => {
          const selected = state === current;
          return (
            <button
              key={state}
              type="button"
              aria-pressed={selected}
              onClick={() => onPick(state)}
              className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary ${
                selected
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span
                aria-hidden
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${STATE_STYLES[state].tone}`}
              >
                <StateMark state={state} size="0.875rem" />
              </span>
              {STEP_STATE_LABELS[state]}
            </button>
          );
        })}
      </div>
      {step.requiresApproval && (
        <p className="px-2 pb-1 pt-1.5 text-xs text-slate-500">
          Your teacher marks this one done.
        </p>
      )}
    </div>
  );
};
