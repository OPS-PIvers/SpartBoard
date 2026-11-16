import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { scrollMovesAnchor } from '@/utils/domHelpers';
import type { ProjectStep, ProjectStepState } from '@/types';
import {
  STEP_STATE_LABELS,
  STEP_STATE_ORDER,
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
  /** The teacher may set any state, approval steps included. */
  asTeacher?: boolean;
}

/** D47 — one tap to a specific state, like the teacher board's status popover. */
export const ProjectStepStatePicker: React.FC<ProjectStepStatePickerProps> = ({
  step,
  current,
  anchorRef,
  onPick,
  onClose,
  asTeacher = false,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  // Portalled with fixed position so the scrolling step strip cannot clip it.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = Math.max(rect.width, 192);
    const height = panelRef.current?.offsetHeight ?? 200;
    const below = rect.bottom + 6;
    const preferred =
      below + height > window.innerHeight && rect.top - height - 6 > 0
        ? rect.top - height - 6
        : below;
    const top = Math.max(
      8,
      Math.min(preferred, window.innerHeight - height - 8)
    );
    const left = Math.min(
      Math.max(8, rect.left),
      window.innerWidth - width - 8
    );
    setPos({ top, left, width });
  }, [anchorRef]);

  useEffect(() => {
    panelRef.current
      ?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')
      ?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose(true);
        return;
      }
      const buttons = Array.from(
        panelRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []
      );
      const index = buttons.indexOf(
        document.activeElement as HTMLButtonElement
      );
      if (index === -1) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        buttons[(index + step + buttons.length) % buttons.length]?.focus();
        return;
      }
      // Portalled to <body>: tabbing off either end returns to the step instead of leaving the page.
      const atEnd = event.shiftKey ? index === 0 : index === buttons.length - 1;
      if (event.key === 'Tab' && atEnd) {
        event.preventDefault();
        onClose(true);
      }
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && anchorRef.current?.contains(target)) return;
      if (target && panelRef.current?.contains(target)) return;
      onClose(false);
    };
    const onScroll = (event: Event) => {
      if (scrollMovesAnchor(event, anchorRef.current)) onClose(false);
    };
    const onResize = () => onClose(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [anchorRef, onClose]);

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`Set ${step.title}`}
      className="fixed z-popover rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
      style={{
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width: pos?.width ?? 192,
      }}
    >
      <div role="group" aria-label="Status" className="flex flex-col gap-1">
        {(asTeacher ? STEP_STATE_ORDER : studentStateOptions(step)).map(
          (state) => {
            const selected = state === current;
            return (
              <button
                key={state}
                type="button"
                aria-pressed={selected}
                onClick={() => onPick(state)}
                className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm font-semibold transition focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary ${
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
          }
        )}
      </div>
      {step.requiresApproval && !asTeacher && (
        <p className="px-2 pb-1 pt-1.5 text-xs text-slate-500">
          Your teacher marks this one done.
        </p>
      )}
    </div>,
    document.body
  );
};
