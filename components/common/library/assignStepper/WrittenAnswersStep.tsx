// Quiz assign: written questions answered on the device or on a printed sheet that is scanned back in.
import React from 'react';
import { tourFieldAttr } from '@/config/tourAnchors';
import { StepRow, StepNumberField } from './QuizStepRows';
import type {
  WrittenAnswersValue,
  WrittenAnswersWhere,
} from './WrittenAnswersStep.format';

const OPTIONS: { value: WrittenAnswersWhere; label: string }[] = [
  { value: 'device', label: 'On the device' },
  { value: 'paper', label: 'On paper' },
];

export const WrittenAnswersStep: React.FC<{
  value: WrittenAnswersValue;
  onChange: (next: WrittenAnswersValue) => void;
  count: number;
}> = ({ value, onChange, count }) => (
  <div className="space-y-1.5">
    <StepRow label="Students write answers">
      <div
        role="group"
        aria-label="Students write answers"
        className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white"
      >
        {OPTIONS.map((opt) => {
          const active = value.where === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange({ ...value, where: opt.value })}
              {...tourFieldAttr(
                'assign-rule.written-where',
                'assign',
                opt.value
              )}
              className={
                'px-3 py-1.5 text-xs font-bold transition ' +
                (active
                  ? 'bg-brand-blue-primary text-white'
                  : 'text-slate-600 hover:bg-slate-50')
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </StepRow>
    {value.where === 'paper' && (
      <StepRow
        label="Spare sheets"
        sub
        hint={`${count} written question${count === 1 ? '' : 's'} print on a sheet for each student. Multiple choice stays on the device.`}
      >
        <StepNumberField
          value={value.spares}
          min={0}
          max={20}
          onCommit={(spares) => onChange({ ...value, spares })}
          ariaLabel="Spare sheets"
          anchor={tourFieldAttr(
            'assign-rule.number',
            'assign',
            'written-spares'
          )}
        />
      </StepRow>
    )}
  </div>
);
