import React from 'react';

export interface StepSliderStep<V extends string> {
  value: V;
  label: string;
}

interface StepSliderProps<V extends string> {
  steps: ReadonlyArray<StepSliderStep<V>>;
  /** Undefined parks the thumb on `unsetIndex`; `unsetLabel` is announced instead of that stop. */
  value: V | undefined;
  onChange: (value: V) => void;
  unsetIndex?: number;
  unsetLabel?: string;
  labelId?: string;
  describedBy?: string;
  disabled?: boolean;
}

// Discrete slider over named stops; the live widget is the preview.
export const StepSlider = <V extends string>({
  steps,
  value,
  onChange,
  unsetIndex = 0,
  unsetLabel,
  labelId,
  describedBy,
  disabled = false,
}: StepSliderProps<V>) => {
  const found = steps.findIndex((s) => s.value === value);
  const isUnset = found === -1;
  const index = isUnset ? unsetIndex : found;
  const current = isUnset && unsetLabel ? unsetLabel : steps[index].label;

  return (
    <div className="flex flex-col gap-1.5">
      <input
        type="range"
        min={0}
        max={steps.length - 1}
        step={1}
        value={index}
        disabled={disabled}
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        aria-valuetext={current}
        onChange={(e) => onChange(steps[e.target.valueAsNumber].value)}
        className="h-1.5 w-full cursor-pointer accent-brand-blue-primary disabled:opacity-50"
      />
      <div
        aria-hidden="true"
        className="flex justify-between text-xxs text-slate-600"
      >
        {steps.map((s, i) => (
          <span
            key={s.value}
            className={
              i === index && !isUnset ? 'font-bold text-slate-700' : ''
            }
          >
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
};
