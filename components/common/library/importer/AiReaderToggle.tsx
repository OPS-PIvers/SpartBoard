import React from 'react';

interface AiReaderToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** Lets a teacher with AI access read a test document the plain way instead. */
export const AiReaderToggle: React.FC<AiReaderToggleProps> = ({
  checked,
  onChange,
  disabled,
}) => (
  <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      disabled={disabled}
      className="h-4 w-4 accent-brand-blue-primary"
    />
    Read with AI
  </label>
);
