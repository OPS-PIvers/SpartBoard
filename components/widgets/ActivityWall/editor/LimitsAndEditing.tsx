import React, { useId } from 'react';
import { ToggleRow } from './ToggleRow';

interface LimitsAndEditingProps {
  maxPostsPerStudent: number;
  allowStudentEdit: boolean;
  allowStudentDelete: boolean;
  onChange: (patch: {
    maxPostsPerStudent?: number;
    allowStudentEdit?: boolean;
    allowStudentDelete?: boolean;
  }) => void;
}

const PRESETS = [
  { value: 0, label: 'Unlimited' },
  { value: 1, label: '1' },
  { value: 3, label: '3' },
  { value: 5, label: '5' },
];

/** Per-student post cap plus the student edit/delete toggles. */
export const LimitsAndEditing: React.FC<LimitsAndEditingProps> = ({
  maxPostsPerStudent,
  allowStudentEdit,
  allowStudentDelete,
  onChange,
}) => {
  const customId = useId();
  const isPreset = PRESETS.some((p) => p.value === maxPostsPerStudent);

  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="text-sm font-bold text-slate-700">
          Max posts per student
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {PRESETS.map((preset) => {
            const selected =
              maxPostsPerStudent === preset.value && preset.value >= 0;
            return (
              <button
                key={preset.value}
                type="button"
                aria-pressed={selected}
                onClick={() => onChange({ maxPostsPerStudent: preset.value })}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary ${
                  selected
                    ? 'border-brand-blue-primary bg-brand-blue-primary text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={!isPreset}
            onClick={() => onChange({ maxPostsPerStudent: 10 })}
            className={`rounded-xl border px-3 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary ${
              !isPreset
                ? 'border-brand-blue-primary bg-brand-blue-primary text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            Custom
          </button>
        </div>
        {!isPreset && (
          <div className="mt-2">
            <label
              className="mb-1 block text-sm font-semibold text-slate-700"
              htmlFor={customId}
            >
              Custom limit
            </label>
            <input
              id={customId}
              type="number"
              min={1}
              max={999}
              value={maxPostsPerStudent}
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value, 10);
                onChange({
                  maxPostsPerStudent: Number.isFinite(parsed)
                    ? Math.min(999, Math.max(1, parsed))
                    : 1,
                });
              }}
              className="w-32 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
            />
          </div>
        )}
      </fieldset>

      <ToggleRow
        label="Students may edit their posts"
        hint="Only while the wall is open."
        checked={allowStudentEdit}
        onChange={(next) => onChange({ allowStudentEdit: next })}
      />
      <ToggleRow
        label="Students may delete their posts"
        hint="Only while the wall is open."
        checked={allowStudentDelete}
        onChange={(next) => onChange({ allowStudentDelete: next })}
      />
    </div>
  );
};
