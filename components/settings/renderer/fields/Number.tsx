import React, { useState } from 'react';
import type { FieldProps } from '../FieldProps';
import type { NumberField as NumberFieldSchema } from '@/components/settings/schema/types';

export const NumberField: React.FC<FieldProps<NumberFieldSchema<string>>> = ({
  field,
  value,
  onChange,
  id,
  describedBy,
  disabled,
}) => {
  const committed = typeof value === 'number' ? String(value) : '';
  // Local draft so the field can be cleared and retyped; an empty/invalid draft snaps back on blur.
  const [draft, setDraft] = useState(committed);
  const [prevCommitted, setPrevCommitted] = useState(committed);
  const [focused, setFocused] = useState(false);
  if (prevCommitted !== committed) {
    setPrevCommitted(committed);
    // While typing, the clamped commit must not overwrite a partial entry.
    if (!focused) setDraft(committed);
  }

  return (
    <input
      id={id}
      type="number"
      value={draft}
      min={field.min}
      max={field.max}
      step={field.step}
      disabled={disabled}
      aria-describedby={describedBy}
      onChange={(e) => {
        setDraft(e.target.value);
        const parsed = e.target.valueAsNumber;
        if (e.target.value === '' || Number.isNaN(parsed)) return;
        let clamped = parsed;
        if (field.min !== undefined) clamped = Math.max(field.min, clamped);
        if (field.max !== undefined) clamped = Math.min(field.max, clamped);
        onChange(clamped);
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        setDraft(committed);
      }}
      className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
    />
  );
};
