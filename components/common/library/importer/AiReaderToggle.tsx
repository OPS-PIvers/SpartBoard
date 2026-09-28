import React, { useId, useState } from 'react';

interface AiReaderToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** Opt-in to the AI reader; turning it on asks the teacher to confirm the cost. */
export const AiReaderToggle: React.FC<AiReaderToggleProps> = ({
  checked,
  onChange,
  disabled,
}) => {
  const [confirming, setConfirming] = useState(false);
  const titleId = useId();

  const confirm = (on: boolean) => {
    setConfirming(false);
    if (on) onChange(true);
  };

  return (
    <div className="relative">
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => {
            if (e.target.checked) setConfirming(true);
            else onChange(false);
          }}
          disabled={disabled}
          className="h-4 w-4 accent-brand-blue-primary"
        />
        Convert with AI
      </label>
      {confirming && (
        <div
          role="dialog"
          aria-labelledby={titleId}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              confirm(false);
            }
          }}
          className="absolute bottom-full left-0 z-20 mb-2 w-72 space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
        >
          <h4 id={titleId} className="text-sm font-bold text-slate-800">
            Convert with AI?
          </h4>
          <p className="text-xs text-slate-600">
            AI handles tables, pictures and messy layouts better. Each
            conversion costs the district money and counts toward your daily AI
            limit.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => confirm(false)}
              className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              autoFocus
              onClick={() => confirm(true)}
              className="rounded-lg bg-brand-blue-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-blue-dark"
            >
              Use AI
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
