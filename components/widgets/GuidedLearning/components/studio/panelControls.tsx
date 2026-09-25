import React, { useId } from 'react';
import { Check } from 'lucide-react';

export const fieldLabelClass = 'text-xs font-bold text-slate-600';
export const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 placeholder:text-slate-400 focus:border-brand-blue-primary focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40';
export const groupHeadingClass =
  'text-xxs font-bold uppercase tracking-wider text-slate-500';
export const hintClass = 'text-xs font-normal leading-snug text-slate-500';
export const quietButtonClass =
  'flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40 disabled:opacity-50';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  desc?: string;
}

interface ChoiceGroupProps<T extends string> {
  legend: string;
  value: T;
  options: readonly ChoiceOption<T>[];
  onChange: (next: T) => void;
  testId?: string;
  /** Also show the chosen option's description under the choices. */
  showSelectedDesc?: boolean;
}

/** A small set of pressable choices; each option's description is its tooltip. */
export function ChoiceGroup<T extends string>({
  legend,
  value,
  options,
  onChange,
  testId,
  showSelectedDesc,
}: ChoiceGroupProps<T>) {
  const current = showSelectedDesc
    ? options.find((o) => o.value === value)
    : undefined;
  return (
    <fieldset className="flex flex-col gap-1.5" data-testid={testId}>
      <legend className={`${fieldLabelClass} mb-1.5`}>{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const on = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={on}
              title={opt.desc}
              onClick={() => {
                if (!on) onChange(opt.value);
              }}
              className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40 ${
                on
                  ? 'border-brand-blue-primary bg-brand-blue-primary/10 text-brand-blue-primary'
                  : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
              }`}
            >
              {on && <Check className="h-3 w-3" aria-hidden="true" />}
              {opt.label}
            </button>
          );
        })}
      </div>
      {current?.desc && <p className={hintClass}>{current.desc}</p>}
    </fieldset>
  );
}

/** Label + control stacked, with an optional hint; the label is tied to the single child control by id. */
export const Field: React.FC<{
  label: React.ReactNode;
  hint?: string;
  children: React.ReactElement<{ id?: string; 'aria-describedby'?: string }>;
}> = ({ label, hint, children }) => {
  const autoId = useId();
  const id = children.props.id ?? autoId;
  const hintId = `${id}-hint`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={fieldLabelClass}>
        {label}
      </label>
      {React.cloneElement(children, {
        id,
        ...(hint ? { 'aria-describedby': hintId } : {}),
      })}
      {hint && (
        <p id={hintId} className={hintClass}>
          {hint}
        </p>
      )}
    </div>
  );
};
