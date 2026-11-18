// Gear menu on the rubric grading panel: the teacher's saved grading preferences.
import React, { useEffect, useRef, useState } from 'react';
import { Settings } from 'lucide-react';
import type { RubricLevelOrder } from '@/types';
import { useClickOutside } from '@/hooks/useClickOutside';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { tourTypeAttr } from '@/config/tourAnchors';

interface RubricGradingSettingsProps {
  order: RubricLevelOrder;
  onOrderChange: (order: RubricLevelOrder) => void;
  autoAdvance: boolean;
  onAutoAdvanceChange: (on: boolean) => void;
  openNext: boolean;
  onOpenNextChange: (on: boolean) => void;
}

const SwitchRow: React.FC<{
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  anchor: ReturnType<typeof tourTypeAttr>;
}> = ({ label, checked, onChange, anchor }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    {...anchor}
    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-blue-primary"
  >
    {label}
    <span
      aria-hidden
      className={`relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-brand-blue-primary' : 'bg-slate-300'
      }`}
    >
      <span
        className={`absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4.5' : 'translate-x-0.5'
        }`}
      />
    </span>
  </button>
);

export const RubricGradingSettings: React.FC<RubricGradingSettingsProps> = ({
  order,
  onOrderChange,
  autoAdvance,
  onAutoAdvanceChange,
  openNext,
  onOpenNextChange,
}) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useClickOutside(wrapRef, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        {...tourTypeAttr('quiz-grading.rubric-settings', 'quiz')}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Rubric settings"
        title="Rubric settings"
        className={`touch-target-expand flex h-8 w-7 items-center justify-center rounded-md transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-brand-blue-primary ${
          open ? 'bg-slate-100 text-slate-700' : 'text-slate-500'
        }`}
      >
        <Settings className="h-4 w-4" aria-hidden />
      </button>
      {open && (
        <div
          role="group"
          aria-label="Rubric settings"
          className="absolute right-0 top-full z-popover mt-1 w-64 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        >
          <SwitchRow
            label="Jump to next criterion"
            checked={autoAdvance}
            onChange={onAutoAdvanceChange}
            anchor={tourTypeAttr('quiz-grading.rubric-auto-advance', 'quiz')}
          />
          {autoAdvance && (
            <SwitchRow
              label="Open next criterion"
              checked={openNext}
              onChange={onOpenNextChange}
              anchor={tourTypeAttr('quiz-grading.rubric-open-next', 'quiz')}
            />
          )}
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="whitespace-nowrap text-sm font-semibold text-slate-800">
              Level order
            </span>
            <SegmentedControl<RubricLevelOrder>
              role="radiogroup"
              ariaLabel="Level order"
              value={order}
              onChange={onOrderChange}
              anchor={tourTypeAttr('quiz-grading.rubric-order', 'quiz')}
              options={[
                { value: 'high-first', label: 'Highest' },
                { value: 'low-first', label: 'Lowest' },
              ]}
            />
          </div>
        </div>
      )}
    </div>
  );
};
