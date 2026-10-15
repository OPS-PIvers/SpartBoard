import React, { useState } from 'react';
import type { TourAnchorAttrs } from '@/config/tourAnchors';
import { ConfirmDialog } from '@/components/widgets/InstructionalRoutines/ConfirmDialog';
import { AI_READER_CONFIRM } from './aiReaderConfirm';

interface AiRetryLinkProps {
  onRetry: () => void;
  disabled?: boolean;
  anchor?: TourAnchorAttrs;
  className?: string;
}

/** Redoes a plain read with AI once the teacher confirms it counts toward their limit. */
export const AiRetryLink: React.FC<AiRetryLinkProps> = ({
  onRetry,
  disabled,
  anchor,
  className = 'font-semibold',
}) => {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <button
        type="button"
        {...anchor}
        onClick={() => setConfirming(true)}
        disabled={disabled}
        className={`${className} text-brand-blue-primary underline-offset-2 hover:underline disabled:opacity-50`}
      >
        Not what you expected? Try again with AI
      </button>
      {confirming && (
        <ConfirmDialog
          {...AI_READER_CONFIRM}
          onConfirm={() => {
            setConfirming(false);
            onRetry();
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
};
