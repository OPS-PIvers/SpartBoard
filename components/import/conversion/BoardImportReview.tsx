import React, { useEffect, useId, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { useDashboard } from '@/context/useDashboard';
import { useViewAsOutward } from '@/hooks/useViewAsOutward';
import { tourAttr } from '@/config/tourAnchors';
import { TOOLS } from '@/config/tools';
import {
  AI_CONVERSION_REVIEW_NOTE,
  AI_CONVERSION_TRUNCATED_NOTE,
} from '@/utils/import/aiConversion';
import type { BoardPlan } from '@/utils/import/boardConversion';

const toolLabel = (type: string): string =>
  TOOLS.find((tool) => tool.type === type)?.label ?? type;

interface BoardImportReviewProps {
  plan: BoardPlan;
  onClose: () => void;
}

/** Review step for a Board Conversion: a sketch of where each widget lands, then a new board. */
export const BoardImportReview: React.FC<BoardImportReviewProps> = ({
  plan,
  onClose,
}) => {
  const { createNewDashboard, addWidgets, activeDashboard, addToast } =
    useDashboard();
  const outward = useViewAsOutward();
  const nameId = useId();
  const [name, setName] = useState(plan.title);
  const [creating, setCreating] = useState(false);
  const [pendingBoardId, setPendingBoardId] = useState<string | null>(null);
  const placedRef = useRef(false);

  // addWidgets targets the active board, so wait for the new board to become active.
  const activeId = activeDashboard?.id;
  useEffect(() => {
    if (!pendingBoardId || activeId !== pendingBoardId || placedRef.current)
      return;
    placedRef.current = true;
    addWidgets(plan.widgets);
    onClose();
  }, [pendingBoardId, activeId, addWidgets, plan.widgets, onClose]);

  const handleCreate = async () => {
    if (!name.trim() || outward.locked) return;
    if (outward.active && !(await outward.confirm('Create a board'))) return;
    setCreating(true);
    const id = await createNewDashboard(name.trim());
    if (id) {
      setPendingBoardId(id);
    } else {
      setCreating(false);
      addToast('The board could not be created. Try again.', 'error');
    }
  };

  const footer = (
    <div className="flex items-center justify-center gap-2 px-6 py-3">
      <button
        type="button"
        onClick={onClose}
        disabled={creating}
        {...tourAttr('import-review.board-cancel')}
        className="px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={() => void handleCreate()}
        disabled={creating || !name.trim() || outward.locked}
        title={outward.lockedTitle}
        {...tourAttr('import-review.board-create')}
        className="inline-flex items-center gap-1.5 px-5 py-2 bg-brand-blue-primary hover:bg-brand-blue-dark text-white text-sm font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {creating && <Loader2 className="w-4 h-4 animate-spin" />}
        Create board
      </button>
    </div>
  );

  return (
    <Modal
      isOpen
      onClose={creating ? () => undefined : onClose}
      title="New board"
      maxWidth="max-w-2xl"
      footer={footer}
    >
      <div className="space-y-4 pb-1">
        <div>
          <label
            htmlFor={nameId}
            className="mb-1 block text-sm font-bold text-slate-700"
          >
            Board name
          </label>
          <input
            id={nameId}
            {...tourAttr('import-review.board-name')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
          />
        </div>
        <div
          role="list"
          aria-label="Widgets on the new board"
          className="relative aspect-video w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
        >
          {plan.widgets.map((widget, index) => {
            const p = widget.placement;
            if (!p) return null;
            return (
              <div
                key={`${widget.type}-${index}`}
                role="listitem"
                className="absolute flex items-center justify-center rounded-lg border border-slate-300 bg-white p-1 text-center text-xs font-bold text-slate-700"
                style={{
                  left: `${p.xProp * 100}%`,
                  top: `${p.yProp * 100}%`,
                  width: `${p.wProp * 100}%`,
                  height: `${p.hProp * 100}%`,
                }}
              >
                <span className="line-clamp-2">{toolLabel(widget.type)}</span>
              </div>
            );
          })}
        </div>
        <p className="text-xs font-medium text-slate-500">
          {AI_CONVERSION_REVIEW_NOTE}
          {plan.truncated && ` ${AI_CONVERSION_TRUNCATED_NOTE}`}
        </p>
      </div>
    </Modal>
  );
};
