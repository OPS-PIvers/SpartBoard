/**
 * ImportShareModePicker — modal shown to a teacher who pasted a shared-board
 * URL. Two render modes:
 *
 *  - **Confirmation mode** (host already chose the mode): when the share doc
 *    carries an `intendedMode`, we trust the host's choice and present a
 *    single confirmation card with one primary action button.
 *  - **Legacy picker mode** (no intendedMode on the doc, or Drive-backed
 *    share): three-option picker — Synced / View-Only / Copy.
 *
 * Drive-backed shares (legacy `drive-` prefix) only support "Make a copy"
 * because the underlying transport is a Drive export, not a live Firestore
 * doc. Drive-backed pending imports are forced to `intendedMode: 'copy'` at
 * the context layer, so they always render in confirmation mode here.
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

const MODE_COPY: Record<
  SharedBoardImportMode,
  {
    title: string;
    body: string;
    Icon: React.ComponentType<{ className?: string }>;
    primary: string;
  }
> = {
  synced: {
    title: 'Synced',
    body: "Both of you stay in sync — anything either teacher changes appears on the other's board in real time.",
    Icon: Cloud,
    primary: 'Import synced board',
  },
  'view-only': {
    title: 'View-Only',
    body: "The host's edits appear live on your board, but you can't change anything yourself. The board is removed when the host stops sharing or when you leave.",
    Icon: Eye,
    primary: 'Open view-only board',
  },
  copy: {
    title: 'Make a copy',
    body: 'Take a one-time snapshot. Edits by either of you stay private — your boards drift apart immediately.',
    Icon: Copy,
    primary: 'Import a copy',
  },
};

export const ImportShareModePicker: React.FC = () => {
  const { pendingShareImport, importSharedBoard, cancelPendingShareImport } =
    useDashboard();

  if (!pendingShareImport) return null;

  const { preview, driveBacked, intendedMode } = pendingShareImport;
  const boardName = preview?.name ?? 'Shared board';
  const hostName = preview?.linkedShareHostName;

  const handlePick = (mode: SharedBoardImportMode) => {
    void importSharedBoard(mode);
  };

  const liveDisabledReason = driveBacked
    ? 'Live sync needs the host to share again from an updated version. Older share links can only be copied.'
    : undefined;

  // Confirmation mode: host already picked the mode; show a single card +
  // primary action. Drive-backed shares are always forced to 'copy' upstream.
  if (intendedMode) {
    const copy = MODE_COPY[intendedMode];

    return (
      <Modal
        isOpen
        onClose={cancelPendingShareImport}
        ariaLabel="Import shared board"
        maxWidth="max-w-md"
        contentClassName=""
        customHeader={
          <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-slate-100">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-9 h-9 rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary flex items-center justify-center">
                <copy.Icon className="w-5 h-5" />
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
              className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        }
      >
        <div className="px-5 pb-5 pt-4 space-y-4">
          <div className="rounded-xl border border-brand-blue-primary bg-brand-blue-lighter/20 px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-lg bg-brand-blue-primary text-white flex items-center justify-center">
                <copy.Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-900 text-sm">
                  {copy.title}
                </h3>
                <p className="mt-1 text-xs text-slate-700 leading-relaxed">
                  {copy.body}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={cancelPendingShareImport}
              className="rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm px-4 py-2 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handlePick(intendedMode)}
              className="rounded-lg bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold text-sm px-4 py-2 transition-colors cursor-pointer"
            >
              {copy.primary}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // Legacy picker mode: 3-option chooser. Reached only by share docs that
  // pre-date the host-picks-mode change, since Drive-backed shares are
  // forced to 'copy' upstream.
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
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
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
