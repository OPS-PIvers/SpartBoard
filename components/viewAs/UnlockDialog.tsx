// View as unlock: audited reason and recent-activity warning (docs/plans/ADMIN_VIEW_AS.md D10, D11).
import React, { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Modal } from '@/components/common/Modal';

export const UNLOCK_REASON_MIN = 3;
export const UNLOCK_REASON_MAX = 500;

interface UnlockDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onUnlock: (reason: string) => Promise<void>;
  name: string;
  recentlyActive: boolean;
}

export const UnlockDialog: React.FC<UnlockDialogProps> = ({
  isOpen,
  onClose,
  onUnlock,
  name,
  recentlyActive,
}) => {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = reason.trim();
  const valid =
    trimmed.length >= UNLOCK_REASON_MIN && trimmed.length <= UNLOCK_REASON_MAX;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onUnlock(trimmed);
      setReason('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unlock failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={busy ? () => undefined : onClose}
      title={`Unlock edits for ${name}`}
      zIndex="z-modal-deep"
    >
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
        {recentlyActive && (
          <div
            role="alert"
            data-testid="view-as-unlock-activity"
            className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              Active in the last 10 min. Your edits and theirs can overwrite
              each other.
            </span>
          </div>
        )}
        <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
          Reason
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={UNLOCK_REASON_MAX}
            rows={3}
            autoFocus
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900 focus:border-slate-500 focus:outline-none"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!valid || busy}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Unlock
          </button>
        </div>
      </form>
    </Modal>
  );
};
