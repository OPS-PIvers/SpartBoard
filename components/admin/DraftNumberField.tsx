import React, { useState } from 'react';

type Props = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> & {
  value: number;
  onCommit: (n: number) => void;
  normalize?: (n: number) => number;
};

/** Number field that keeps a half-typed entry like "-" or "" instead of snapping it to 0. */
export const DraftNumberField: React.FC<Props> = ({
  value,
  onCommit,
  normalize,
  onBlur,
  ...rest
}) => {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    // no-tour-anchor: callers pass their anchor through rest props
    <input
      {...rest}
      type="number"
      value={draft ?? String(value)}
      onChange={(e) => {
        const n = parseFloat(e.target.value);
        const stored = Number.isFinite(n) ? normalize?.(n) : undefined;
        // Show the stored value when normalizing changed what was typed.
        setDraft(stored !== undefined && stored !== n ? null : e.target.value);
        if (Number.isFinite(n) && n !== value) onCommit(n);
      }}
      onBlur={(e) => {
        setDraft(null);
        onBlur?.(e);
      }}
    />
  );
};
