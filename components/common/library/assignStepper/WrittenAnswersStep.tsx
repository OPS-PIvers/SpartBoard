// Quiz assign: written questions answered on the device or on a printed sheet that is scanned back in.
import React from 'react';
import { tourFieldAttr } from '@/config/tourAnchors';
import { StepRow, StepNumberField, StepSegmented } from './QuizStepRows';
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
      <StepSegmented
        label="Students write answers"
        options={OPTIONS}
        value={value.where}
        onSelect={(where) => onChange({ ...value, where })}
        anchor={(where) =>
          tourFieldAttr('assign-rule.written-where', 'assign', where)
        }
      />
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
