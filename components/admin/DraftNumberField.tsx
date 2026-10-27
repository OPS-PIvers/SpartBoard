import React, { useState } from 'react';

type Props = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> & {
  value: number;
  onCommit: (n: number) => void;
};

/** Number field that keeps a half-typed entry like "-" or "" instead of snapping it to 0. */
export const DraftNumberField: React.FC<Props> = ({
  value,
  onCommit,
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
        setDraft(e.target.value);
        const n = parseFloat(e.target.value);
        if (Number.isFinite(n) && n !== value) onCommit(n);
      }}
      onBlur={(e) => {
        setDraft(null);
        onBlur?.(e);
      }}
    />
  );
};
