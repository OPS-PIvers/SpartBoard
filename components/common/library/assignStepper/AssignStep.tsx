// One accordion row of the assign stepper: numbered header, closed value, open body with Continue (D1, D14).
import React from 'react';
import { ArrowRight } from 'lucide-react';

export interface AssignStepProps {
  number: number;
  title: string;
  value: string;
  open: boolean;
  onOpen: () => void;
  /** Omitted on the last step, which has no Continue button. */
  onContinue?: () => void;
  children: React.ReactNode;
}

export const AssignStep = React.forwardRef<HTMLDivElement, AssignStepProps>(
  function AssignStep(
    { number, title, value, open, onOpen, onContinue, children },
    ref
  ) {
    const bodyId = React.useId();
    return (
      <div
        ref={ref}
        className={`rounded-xl border bg-white ${open ? 'border-brand-blue-primary/40 shadow-sm' : 'border-slate-200'}`}
      >
        <button
          type="button"
          onClick={onOpen}
          aria-expanded={open}
          aria-controls={open ? bodyId : undefined}
          className="flex w-full items-center gap-3 px-4 py-2.5 text-left"
        >
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${open ? 'border-2 border-brand-blue-primary bg-white text-brand-blue-primary' : 'bg-slate-100 text-slate-500'}`}
          >
            {number}
          </span>
          <span
            className={`text-sm font-bold ${open ? 'text-brand-blue-dark' : 'text-slate-700'}`}
          >
            {title}
          </span>
          {!open && (
            <span
              className="ml-auto min-w-0 truncate pl-4 text-xs text-slate-500"
              title={value}
            >
              {value}
            </span>
          )}
        </button>
        {open && (
          <div id={bodyId} className="space-y-4 px-4 pb-4 pl-[3.25rem]">
            {children}
            {onContinue && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onContinue}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-brand-blue-primary hover:bg-brand-blue-dark text-white text-sm font-bold rounded-xl transition-colors shadow-sm"
                >
                  Continue
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
);
