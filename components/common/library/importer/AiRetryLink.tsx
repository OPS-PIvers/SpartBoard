import React from 'react';
import type { TourAnchorAttrs } from '@/config/tourAnchors';
import { useDialog } from '@/context/useDialog';
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
  const { showConfirm } = useDialog();
  const confirmRetry = async () => {
    const { message, ...options } = AI_READER_CONFIRM;
    if (await showConfirm(message, options)) onRetry();
  };

  return (
    <>
      <button
        type="button"
        {...anchor}
        onClick={() => void confirmRetry()}
        disabled={disabled}
        className={`${className} text-brand-blue-primary underline-offset-2 hover:underline disabled:opacity-50`}
      >
        Not what you expected? Try again with AI
      </button>
    </>
  );
};
