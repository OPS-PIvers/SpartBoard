/**
 * ImportShareModePicker — modal shown to a teacher who pasted a shared-board
 * URL. Lets them choose how to import the share:
 *
 *  - Synced — bidirectional live link. Both teachers can edit, and edits
 *    propagate in real time.
 *  - View-Only — one-way live link. Host's edits appear; the importer
 *    cannot mutate the board.
 *  - Make a copy — frozen one-time snapshot, identical to legacy import.
 *
 * Drive-backed shares (legacy `drive-` prefix) only support "Make a copy"
 * because the underlying transport is a Drive export, not a live Firestore
 * doc. The other options are rendered disabled with an explanatory note in
 * that case.
 */

import React from 'react';
import { Cloud, Copy, Eye, X } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { useDashboard } from '@/context/useDashboard';
import type { SharedBoardImportMode } from '@/context/DashboardContextValue';

interface ModeOptionProps {
  mode: SharedBoardImportMode;
  title: string;
  body: string;
  Icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  disabledReason?: string;
  onPick: (mode: SharedBoardImportMode) => void;
}

const ModeOption: React.FC<ModeOptionProps> = ({
  mode,
  title,
  body,
  Icon,
  disabled,
  disabledReason,
  onPick,
}) => {
  return (
    <button
      type="button"
      onClick={() => !disabled && onPick(mode)}
      disabled={disabled}
      className={`w-full text-left rounded-xl border bg-white px-4 py-4 transition-all focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40 ${
        disabled
          ? 'border-slate-200 opacity-50 cursor-not-allowed'
          : 'border-slate-200 hover:border-brand-blue-primary hover:shadow-md cursor-pointer'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-10 h-10 rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary flex items-center justify-center">
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-slate-900 text-sm">{title}</h3>
          <p className="mt-1 text-xs text-slate-600 leading-relaxed">{body}</p>
          {disabled && disabledReason && (
            <p className="mt-2 text-[11px] italic text-slate-500">
              {disabledReason}
            </p>
          )}
        </div>
      </div>
    </button>
  );
};

export const ImportShareModePicker: React.FC = () => {
  const { pendingShareImport, importSharedBoard, cancelPendingShareImport } =
    useDashboard();

  if (!pendingShareImport) return null;

  const { preview, driveBacked } = pendingShareImport;
  const boardName = preview?.name ?? 'Shared board';
  const hostName = preview?.linkedShareHostName;

  const handlePick = (mode: SharedBoardImportMode) => {
    void importSharedBoard(mode);
  };

  const liveDisabledReason = driveBacked
    ? 'Live sync needs the host to share again from an updated version. Older share links can only be copied.'
    : undefined;

  return (
    <Modal
      isOpen
      onClose={cancelPendingShareImport}
      ariaLabel="Choose how to import this shared board"
      maxWidth="max-w-md"
      contentClassName=""
      customHeader={
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary flex items-center justify-center">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Import shared board
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[20rem]">
                {boardName}
                {hostName ? ` · from ${hostName}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={cancelPendingShareImport}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      }
    >
      <div className="px-5 pb-5 pt-4 space-y-3">
        <p className="text-xs text-slate-600">
          How should this board be imported?
        </p>
        <ModeOption
          mode="synced"
          title="Synced"
          body="Both of you stay in sync — anything either teacher changes appears on the other's board in real time."
          Icon={Cloud}
          disabled={driveBacked}
          disabledReason={liveDisabledReason}
          onPick={handlePick}
        />
        <ModeOption
          mode="view-only"
          title="View-Only"
          body="The host's edits appear live on your board, but you can't change anything yourself. Good for sharing a board you're presenting."
          Icon={Eye}
          disabled={driveBacked}
          disabledReason={liveDisabledReason}
          onPick={handlePick}
        />
        <ModeOption
          mode="copy"
          title="Make a copy"
          body="Take a one-time snapshot. Edits by either of you stay private — your boards drift apart immediately."
          Icon={Copy}
          onPick={handlePick}
        />
      </div>
    </Modal>
  );
};
