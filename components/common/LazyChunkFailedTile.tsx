import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { Sparty } from '@/components/sparty/Sparty';
import { useShowSparty } from '@/components/sparty/useShowSparty';

const RETRY_BUTTON_CLASS =
  'rounded-md bg-slate-700/80 font-medium text-white transition hover:bg-slate-600';
const RETRY_BUTTON_STYLE: React.CSSProperties = {
  fontSize: 'min(12px, 4cqmin)',
  padding: 'min(6px, 1.5cqmin) min(12px, 3cqmin)',
};

export const LazyChunkFailedTile: React.FC<{ onRetry: () => void }> = ({
  onRetry,
}) => {
  const showSparty = useShowSparty();
  return (
    <ScaledEmptyState
      icon={AlertTriangle}
      title="Widget failed to load"
      iconClassName="text-amber-400"
      iconSize={showSparty ? 'min(64px, 20cqmin)' : undefined}
      art={
        showSparty ? (
          <Sparty pose="oops" decorative className="h-full w-full" />
        ) : undefined
      }
      action={
        <button
          type="button"
          onClick={onRetry}
          className={RETRY_BUTTON_CLASS}
          style={RETRY_BUTTON_STYLE}
        >
          Retry
        </button>
      }
    />
  );
};
