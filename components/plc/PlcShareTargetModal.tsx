/**
 * PlcShareTargetModal — picker shown to a teacher who clicks "Share with
 * PLC" on a quiz from their library. Lets them choose which of their PLCs
 * to share with. If they only belong to one PLC, the form preselects it
 * and the user just confirms.
 *
 * The actual share write (creating the synced group + the PLC subcoll
 * doc) is done by the caller via the `onConfirm(plcId)` callback — this
 * component is a pure picker.
 */

import React, { useState } from 'react';
import { Loader2, Users2, X } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { Plc } from '@/types';

interface PlcShareTargetModalProps {
  /** PLCs the user is a current member of. Caller filters; modal renders as-is. */
  plcs: Plc[];
  /** Title of the quiz being shared, displayed under the modal header. */
  quizTitle: string;
  onConfirm: (plcId: string) => void | Promise<void>;
  onClose: () => void;
}

export const PlcShareTargetModal: React.FC<PlcShareTargetModalProps> = ({
  plcs,
  quizTitle,
  onConfirm,
  onClose,
}) => {
  const initialSelected = plcs.length === 1 ? plcs[0].id : '';
  const [selectedId, setSelectedId] = useState<string>(initialSelected);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !!selectedId && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Share failed.');
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={submitting ? () => undefined : onClose}
      ariaLabel="Pick a PLC to share with"
      maxWidth="max-w-md"
      contentClassName=""
      customHeader={
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary flex items-center justify-center">
              <Users2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Share with PLC
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[20rem]">
                {quizTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      }
    >
      <div className="px-5 pb-5 pt-4 space-y-4">
        <p className="text-xs text-slate-600">
          Pick which PLC should receive this quiz. Teammates can sync or copy it
          into their own libraries.
        </p>

        <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar -mx-1 px-1">
          {plcs.map((plc) => (
            <label
              key={plc.id}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${
                selectedId === plc.id
                  ? 'border-brand-blue-primary bg-brand-blue-lighter/30'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="plc-share-target"
                value={plc.id}
                checked={selectedId === plc.id}
                onChange={() => setSelectedId(plc.id)}
                className="h-4 w-4 accent-brand-blue-primary"
                disabled={submitting}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-slate-800 truncate">
                  {plc.name}
                </div>
                <div className="text-xxs text-slate-500">
                  {plc.memberUids.length}{' '}
                  {plc.memberUids.length === 1 ? 'member' : 'members'}
                </div>
              </div>
            </label>
          ))}
        </div>

        {error && (
          <div className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="px-4 py-2 text-xs font-bold text-white bg-brand-blue-primary hover:bg-brand-blue-dark disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Share
          </button>
        </div>
      </div>
    </Modal>
  );
};
