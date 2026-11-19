// Accordion assign dialog: optional top switch, one open step, Assign always in the footer (docs/plans/shipped/ASSIGN_STEPPER.md D1).
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Loader2, Rocket } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { useViewAsOutward, VIEW_AS_WRITES } from '@/hooks/useViewAsOutward';
import { tourAttr, type TourAnchorAttrs } from '@/config/tourAnchors';
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
  /** Renders the steps and footer in place, without the dialog or its Cancel. */
  inline?: boolean;
  /** A text button left of Assign that leaves the stepper for another flow, e.g. Assign on paper. */
  altAction?: {
    label: string;
    icon?: React.ElementType;
    onClick: () => void;
    anchor?: TourAnchorAttrs;
  };
  /** Inline only: a Cancel button left of submit. */
  onCancel?: () => void;
  cancelAnchor?: TourAnchorAttrs;
  submitAnchor?: TourAnchorAttrs;
  /** Inline only: pins Cancel and submit to the bottom of the scrolling parent. */
  stickyFooter?: boolean;
  /** False when submit only saves a local draft, so View as neither locks nor confirms it. */
  viewAsGuard?: boolean;
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
  inline = false,
  altAction,
  onCancel,
  cancelAnchor,
  submitAnchor = tourAttr('assign-stepper.submit'),
  viewAsGuard = true,
  stickyFooter = false,
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

  const enabledAtOrBefore = (index: number) => {
    for (let i = Math.min(index, steps.length - 1); i >= 0; i--)
      if (!steps[i].disabled) return i;
    return 0;
  };
  // A step that turns disabled while open hands the open slot back to the step before it.
  const current = enabledAtOrBefore(openIndex);
  if (current !== openIndex && steps[openIndex]?.disabled)
    setOpenIndex(current);
  const continueTo = steps.map((_, index) => {
    for (let i = index + 1; i < steps.length; i++)
      if (!steps[i].disabled) return i;
    return undefined;
  });

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

  const blocked = disabled || submitting || (viewAsGuard && outward.locked);

  const handleSubmit = useCallback(async () => {
    if (blocked) return;
    if (
      viewAsGuard &&
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
  }, [blocked, viewAsGuard, outward, submitLabel, onSubmit]);

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
        {...tourAttr('assign-stepper.cancel')}
        type="button"
        onClick={onClose}
        disabled={submitting}
        className="text-sm font-bold text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Cancel
      </button>
    </div>
  );

  const submitButton = (
    <button
      {...submitAnchor}
      type="button"
      onClick={() => void handleSubmit()}
      disabled={blocked}
      title={
        (viewAsGuard ? outward.lockedTitle : undefined) ??
        (disabled ? disabledReason : undefined)
      }
      className="inline-flex items-center gap-1.5 px-5 py-2 bg-brand-blue-primary hover:bg-brand-blue-dark text-white text-sm font-bold rounded-xl transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {submitting ? (
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
      ) : (
        <SubmitIcon className="w-4 h-4" aria-hidden="true" />
      )}
      {submitLabel}
    </button>
  );

  const AltIcon = altAction?.icon;
  const footer = (
    <div className="flex items-center justify-end gap-2 px-6 py-3">
      {altAction && (
        <button
          {...altAction.anchor}
          type="button"
          onClick={altAction.onClick}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold text-brand-blue-primary transition-colors hover:bg-brand-blue-lighter disabled:cursor-not-allowed disabled:opacity-50"
        >
          {AltIcon && <AltIcon className="h-4 w-4" aria-hidden="true" />}
          {altAction.label}
        </button>
      )}
      {submitButton}
    </div>
  );

  const stepList = (
    <div className="space-y-1.5">
      {steps.map((step, i) => (
        <AssignStep
          key={step.id}
          id={step.id}
          ref={(el) => {
            stepRefs.current[i] = el;
          }}
          number={i + 1}
          title={step.title}
          value={step.value}
          open={i === current}
          disabled={step.disabled}
          onOpen={() => openStep(i)}
          onContinue={
            continueTo[i] === undefined
              ? undefined
              : () => openStep(continueTo[i] as number)
          }
          anchor={step.anchor}
          continueAnchor={step.continueAnchor}
        >
          {step.body}
        </AssignStep>
      ))}
    </div>
  );

  if (inline) {
    return (
      <div aria-label={title} role="group">
        {topSwitch && <div className="mb-4">{topSwitch}</div>}
        {stepList}
        <div
          className={`flex items-center pt-3 ${onCancel ? 'justify-between' : 'justify-end'} ${stickyFooter ? 'sticky bottom-0 bg-white pb-1' : ''}`}
        >
          {onCancel && (
            <button
              {...cancelAnchor}
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="px-4 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          )}
          {submitButton}
        </div>
      </div>
    );
  }

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
      {stepList}
    </Modal>
  );
};
