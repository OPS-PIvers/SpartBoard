import React, { useId, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { tourAttr } from '@/config/tourAnchors';
import type { AssignedStatus } from '@/utils/assignedStatus';

type Who = 'everyone' | 'students';

export interface AssignedReopenDialogProps {
  title: string;
  status: AssignedStatus;
  /** Present where the kind can reopen for chosen students; it opens that picker. */
  onPickStudents?: () => void;
  /** Reopens one class for everyone; null is the whole single-line assignment. */
  onReopen: (classKey: string | null) => Promise<unknown> | void;
  onClose: () => void;
}

/** R7: Reopen for everyone in a class, or only chosen students. */
export const AssignedReopenDialog: React.FC<AssignedReopenDialogProps> = ({
  title,
  status,
  onPickStudents,
  onReopen,
  onClose,
}) => {
  const closed = status.classes.filter((c) => c.status === 'closed');
  const [classKey, setClassKey] = useState(closed[0]?.key ?? '');
  const [who, setWho] = useState<Who>('everyone');
  const [busy, setBusy] = useState(false);
  const selectId = useId();
  const options: { id: Who; label: string }[] = [
    { id: 'everyone', label: 'Everyone in the class' },
    ...(onPickStudents
      ? [{ id: 'students' as const, label: 'Only chosen students' }]
      : []),
  ];
  const pickClass = !status.singleLine && who === 'everyone';

  const confirm = async () => {
    if (who === 'students' && onPickStudents) {
      onClose();
      onPickStudents();
      return;
    }
    setBusy(true);
    try {
      await onReopen(status.singleLine ? null : classKey);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={busy ? () => undefined : onClose}
      title="Reopen"
      ariaLabel={`Reopen ${title}`}
      maxWidth="max-w-sm"
      contentClassName="px-5 pt-3 pb-1"
      footerClassName="px-5 pb-5 pt-3"
      captureEscape
      footer={
        <div className="flex justify-center gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            {...tourAttr('assigned-reopen.cancel')}
            className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={busy || (pickClass && !classKey)}
            {...tourAttr('assigned-reopen.confirm')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold text-white bg-brand-blue-primary hover:bg-brand-blue-dark disabled:opacity-60"
          >
            {busy && (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            )}
            Reopen
          </button>
        </div>
      }
    >
      <p className="text-sm font-semibold text-slate-800 [overflow-wrap:anywhere]">
        {title}
      </p>
      {pickClass && (
        <div className="mt-3 flex items-center gap-2">
          <label
            htmlFor={selectId}
            className="w-14 shrink-0 text-sm font-semibold text-slate-700"
          >
            Class
          </label>
          <span className="relative flex h-9 min-w-0 flex-1 items-center rounded-lg border border-slate-300 bg-white pl-2.5 pr-2 text-sm text-slate-800 focus-within:border-brand-blue-primary">
            <select
              id={selectId}
              value={classKey}
              onChange={(e) => setClassKey(e.target.value)}
              disabled={busy}
              {...tourAttr('assigned-reopen.class')}
              className="min-w-0 flex-1 appearance-none bg-transparent pr-5 focus:outline-hidden"
            >
              {closed.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label || 'All students'}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-slate-400" />
          </span>
        </div>
      )}
      <div
        role="radiogroup"
        aria-label="Who can reopen it"
        className="mt-3 space-y-2"
      >
        {options.map((opt) => {
          const on = who === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setWho(opt.id)}
              disabled={busy}
              {...tourAttr('assigned-reopen.who')}
              className={`w-full rounded-xl border px-4 py-2.5 text-left text-sm font-semibold transition-colors focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary/40 ${
                on
                  ? 'border-brand-blue-primary bg-brand-blue-lighter/30 text-slate-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </Modal>
  );
};
