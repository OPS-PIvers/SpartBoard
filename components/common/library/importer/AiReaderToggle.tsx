import React, { useState } from 'react';
import type { TourAnchorAttrs } from '@/config/tourAnchors';
import { ConfirmDialog } from '@/components/widgets/InstructionalRoutines/ConfirmDialog';
import { AI_READER_CONFIRM } from './aiReaderConfirm';

interface AiReaderToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  anchor?: TourAnchorAttrs;
}

/** Opt-in to the AI reader; turning it on asks the teacher to confirm the cost. */
export const AiReaderToggle: React.FC<AiReaderToggleProps> = ({
  checked,
  onChange,
  disabled,
  anchor,
}) => {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
        <input
          {...anchor}
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
          {...AI_READER_CONFIRM}
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
