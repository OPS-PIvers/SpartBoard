// Quiz assign: written questions answered on the device or on a printed sheet that is scanned back in.
import React from 'react';
import { tourFieldAttr } from '@/config/tourAnchors';
import type { PaperSheetStimulus } from '@/types';
import type { PaperWrittenBoxRow } from '@/utils/paperWrittenHybrid';
import {
  BoxImageSelect,
  BoxSizeSelect,
  BoxStyleSelect,
  WrittenBoxRow,
} from '@/components/widgets/QuizWidget/components/PaperWrittenBoxControls';
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
  /** The written questions with this step's picks applied. */
  rows?: readonly PaperWrittenBoxRow[];
  /** The quiz's images a custom image box can print. */
  images?: readonly PaperSheetStimulus[];
}> = ({ value, onChange, count, rows = [], images = [] }) => {
  const setStyle = (
    row: PaperWrittenBoxRow,
    style: PaperWrittenBoxRow['style']
  ) => {
    const image = style === 'image' ? (row.image ?? images[0]) : undefined;
    if (style === 'image' && !image) return;
    onChange({
      ...value,
      boxStyles: {
        ...value.boxStyles,
        [row.questionId]: image ? { style, image } : { style },
      },
    });
  };
  return (
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
      {value.where === 'paper' && rows.length > 0 && (
        <ul className="divide-y divide-slate-100 border-y border-slate-100">
          {rows.map((row) => (
            <WrittenBoxRow
              key={row.questionId}
              label={row.label}
              text={row.text || 'Untitled question'}
            >
              <BoxSizeSelect
                size={row.size}
                onChange={(size) =>
                  onChange({
                    ...value,
                    boxSizes: { ...value.boxSizes, [row.questionId]: size },
                  })
                }
                ariaLabel={`Question ${row.label} box size`}
                anchor={`assign-${row.label}`}
              />
              <BoxStyleSelect
                style={row.style}
                onChange={(style) => setStyle(row, style)}
                allowImage={images.length > 0 || row.style === 'image'}
                ariaLabel={`Question ${row.label} answer style`}
                anchor={`assign-${row.label}`}
              />
              {row.style === 'image' && (
                <BoxImageSelect
                  image={row.image}
                  quizImages={images}
                  onPick={(image) =>
                    onChange({
                      ...value,
                      boxStyles: {
                        ...value.boxStyles,
                        [row.questionId]: { style: 'image', image },
                      },
                    })
                  }
                  ariaLabel={`Question ${row.label} image`}
                  anchor={`assign-${row.label}`}
                />
              )}
            </WrittenBoxRow>
          ))}
        </ul>
      )}
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
};
