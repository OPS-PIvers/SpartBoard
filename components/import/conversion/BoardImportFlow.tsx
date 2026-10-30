import React, { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { tourAttr } from '@/config/tourAnchors';
import type { ConversionInput } from '@/utils/import/aiConversion';
import {
  planBoardFromImport,
  type BoardPlan,
} from '@/utils/import/boardConversion';
import { BoardImportReview } from './BoardImportReview';

interface BoardImportFlowProps {
  input: ConversionInput;
  onClose: () => void;
  /** Runs once the new board is made. */
  onCreated?: () => void;
}

/** Plans a board from an imported page with AI, then shows the board review (D11). */
export const BoardImportFlow: React.FC<BoardImportFlowProps> = ({
  input,
  onClose,
  onCreated,
}) => {
  const { canAccessWidget } = useAuth();
  const { addToast } = useDashboard();
  const [plan, setPlan] = useState<BoardPlan | null>(null);

  // StrictMode re-runs the effect; the AI call still runs once, and a closed flow ignores its result.
  const started = useRef(false);
  const alive = useRef(false);
  const startPlan = useEffectEvent((isCancelled: () => boolean): void => {
    if (started.current) return;
    started.current = true;
    planBoardFromImport(input, {
      screen: { w: window.innerWidth, h: window.innerHeight },
      canUseWidget: canAccessWidget,
    }).then(
      (next) => {
        if (!isCancelled()) setPlan(next);
      },
      (err: unknown) => {
        if (isCancelled()) return;
        addToast(
          err instanceof Error && err.message
            ? err.message
            : 'The AI could not convert this. Try again.',
          'error'
        );
        onClose();
      }
    );
  });
  // The AI call is the external system; the flow remounts per Import, so it runs once per pick.
  useEffect(() => {
    alive.current = true;
    startPlan(() => !alive.current);
    return () => {
      alive.current = false;
    };
  }, []);

  if (plan)
    return (
      <BoardImportReview plan={plan} onClose={onClose} onCreated={onCreated} />
    );
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="New board"
      maxWidth="max-w-sm"
      footer={
        <div className="flex justify-center px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            {...tourAttr('import-review.board-cancel')}
            className="px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
          >
            Cancel
          </button>
        </div>
      }
    >
      <p
        role="status"
        className="flex items-center justify-center gap-2 py-6 text-sm font-medium text-slate-600"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Planning board…
      </p>
    </Modal>
  );
};
