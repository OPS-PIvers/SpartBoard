// Accordion assign dialog: optional top switch, one open step, Assign always in the footer (docs/plans/ASSIGN_STEPPER.md D1).
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Loader2, Rocket } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { useViewAsOutward, VIEW_AS_WRITES } from '@/hooks/useViewAsOutward';
import { AssignStep } from './AssignStep';
import type { AssignStepDef } from './assignSteps';

export interface AssignStepperProps {
  isOpen: boolean;
  onClose: () => void;
  /** The item being assigned, shown under the "Assign" eyebrow. */
  title: string;
  topSwitch?: React.ReactNode;
  steps: AssignStepDef[];
  submitLabel: string;
  /** Defaults to the rocket; Video live passes a play icon. */
  submitIcon?: React.ElementType;
  onSubmit: () => void | Promise<void>;
  submitting?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  /** Replaces the whole dialog content (its own header, scrolling body and footer), e.g. Modifications. */
  overlayView?: React.ReactNode;
  zIndex?: string;
}

export const AssignStepper: React.FC<AssignStepperProps> = ({
  isOpen,
  onClose,
  title,
  topSwitch,
  steps,
  submitLabel,
  submitIcon: SubmitIcon = Rocket,
  onSubmit,
  submitting: submittingProp = false,
  disabled = false,
  disabledReason,
  overlayView,
  zIndex,
}) => {
  const titleId = useId();
  const outward = useViewAsOutward();
  const [openIndex, setOpenIndex] = useState(0);
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (isOpen) setOpenIndex(0);
  }
  const [pending, setPending] = useState(false);
  const submitting = submittingProp || pending;
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollPending = useRef(false);

  const current = Math.min(openIndex, Math.max(steps.length - 1, 0));

  const openStep = (index: number) => {
    scrollPending.current = true;
    setOpenIndex(index);
  };

  // Scrolls the step a teacher just opened into view (D15).
  useEffect(() => {
    if (!scrollPending.current) return;
    scrollPending.current = false;
    stepRefs.current[current]?.scrollIntoView?.({
      block: 'start',
      behavior: 'smooth',
    });
  }, [current]);

  const blocked = disabled || submitting || outward.locked;

  const handleSubmit = useCallback(async () => {
    if (blocked) return;
    if (
      outward.active &&
      !(await outward.confirm(submitLabel, VIEW_AS_WRITES.assign))
    )
      return;
    setPending(true);
    try {
      await onSubmit();
    } finally {
      setPending(false);
    }
  }, [blocked, outward, submitLabel, onSubmit]);

  const close = submitting ? () => undefined : onClose;

  if (overlayView) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={close}
        customHeader={<></>}
        maxWidth="max-w-xl"
        className="bg-white rounded-2xl shadow-2xl overflow-hidden"
        contentClassName=""
        ariaLabel={title}
        zIndex={zIndex}
      >
        <div className="flex max-h-[90vh] flex-col">{overlayView}</div>
      </Modal>
    );
  }

  const header = (
    <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200 shrink-0">
      <div className="min-w-0">
        <p className="text-xxs font-bold text-brand-blue-primary/60 uppercase tracking-widest">
          Assign
        </p>
        <h3
          id={titleId}
          className="font-black text-lg text-slate-800 truncate"
          title={title}
        >
          {title}
        </h3>
      </div>
      <button
        type="button"
        onClick={onClose}
        disabled={submitting}
        className="text-sm font-bold text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Cancel
      </button>
    </div>
  );

  const footer = (
    <div className="flex items-center justify-end gap-2 px-6 py-3">
      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={blocked}
        title={outward.lockedTitle ?? (disabled ? disabledReason : undefined)}
        className="inline-flex items-center gap-1.5 px-5 py-2 bg-brand-blue-primary hover:bg-brand-blue-dark text-white text-sm font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        ) : (
          <SubmitIcon className="w-4 h-4" aria-hidden="true" />
        )}
        {submitLabel}
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      customHeader={header}
      footer={footer}
      footerClassName="shrink-0 border-t border-slate-200 bg-white"
      maxWidth="max-w-xl"
      className="bg-white rounded-2xl shadow-2xl overflow-hidden"
      contentClassName="px-6 py-5"
      ariaLabelledby={titleId}
      zIndex={zIndex}
    >
      {topSwitch && <div className="mb-4">{topSwitch}</div>}
      <div className="space-y-1.5">
        {steps.map((step, i) => (
          <AssignStep
            key={step.id}
            ref={(el) => {
              stepRefs.current[i] = el;
            }}
            number={i + 1}
            title={step.title}
            value={step.value}
            open={i === current}
            onOpen={() => openStep(i)}
            onContinue={
              i < steps.length - 1 ? () => openStep(i + 1) : undefined
            }
          >
            {step.body}
          </AssignStep>
        ))}
      </div>
    </Modal>
  );
};
