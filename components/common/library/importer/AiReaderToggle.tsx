import React, { useState } from 'react';
import { ConfirmDialog } from '@/components/widgets/InstructionalRoutines/ConfirmDialog';

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

  return (
    <>
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
        <ConfirmDialog
          title="Convert with AI?"
          message="AI handles tables, pictures and messy layouts better. Each conversion costs the district money and counts toward your daily AI limit."
          confirmLabel="Use AI"
          onConfirm={() => {
            setConfirming(false);
            onChange(true);
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
};
