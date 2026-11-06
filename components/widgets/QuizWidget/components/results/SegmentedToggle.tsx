import React from 'react';

/** A small row of mutually exclusive buttons, e.g. Score / Last name. */
export function SegmentedToggle<T extends string>({
  label,
  value,
  options,
  onChange,
  anchor,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (value: T) => void;
  anchor?: (value: T) => Record<string, string>;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex overflow-hidden rounded-md border border-brand-gray-lighter"
    >
      {options.map(([v, text], i) => {
        const on = v === value;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            aria-pressed={on}
            {...anchor?.(v)}
            className={`font-sans font-semibold transition-colors ${i > 0 ? 'border-l border-brand-gray-lighter' : ''} ${
              on
                ? 'bg-brand-blue-lighter text-brand-blue-dark'
                : 'bg-white text-brand-gray-primary hover:text-brand-gray-dark'
            }`}
            style={{
              fontSize: 'min(11px, 3.5cqmin)',
              padding: 'min(3px, 0.8cqmin) min(8px, 2cqmin)',
            }}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}
