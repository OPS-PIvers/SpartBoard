import React, { useId } from 'react';

interface ToggleRowProps {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}

/** Shared checkbox row for the wall editor's grouped settings sections. */
export const ToggleRow: React.FC<ToggleRowProps> = ({
  label,
  hint,
  checked,
  disabled = false,
  onChange,
}) => {
  const hintId = useId();
  return (
    <label className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-700">
          {label}
        </span>
        {hint && (
          <span id={hintId} className="block text-xs text-slate-600">
            {hint}
          </span>
        )}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-describedby={hint ? hintId : undefined}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-brand-blue-primary"
      />
    </label>
  );
};
