/**
 * ShareLinkCreatorModal — host-side share link creator. Replaces the old
 * "click Share → instant clipboard copy" path. The host:
 *
 *   1. Picks a mode (Synced / View-Only / Copy).
 *   2. Clicks "Create link" — we write a /shared_boards/{shareId} doc with
 *      `intendedMode` set so the receiving teacher honors the choice.
 *   3. Sees the resulting URL with a copy-to-clipboard button.
 *
 * The recipient flow consumes `intendedMode` from the share doc and shows a
 * confirmation dialog instead of the legacy 3-option picker.
 */

import React, { useState } from 'react';
import { Cloud, Copy, Eye, Check, ExternalLink, X } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import type { Dashboard } from '@/types';
import type { SharedBoardImportMode } from '@/context/DashboardContextValue';

interface ShareLinkCreatorModalProps {
  dashboard: Dashboard | null;
  isOpen: boolean;
  onClose: () => void;
}

interface ModeOptionProps {
  mode: SharedBoardImportMode;
  selected: boolean;
  title: string;
  body: string;
  Icon: React.ComponentType<{ className?: string }>;
  onPick: (mode: SharedBoardImportMode) => void;
}

const ModeOption: React.FC<ModeOptionProps> = ({
  mode,
  selected,
  title,
  body,
  Icon,
  onPick,
}) => {
  return (
    <button
      type="button"
      onClick={() => onPick(mode)}
      className={`w-full text-left rounded-xl border bg-white px-4 py-4 transition-all focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40 cursor-pointer ${
        selected
          ? 'border-brand-blue-primary shadow-md ring-1 ring-brand-blue-lighter'
          : 'border-slate-200 hover:border-brand-blue-primary hover:shadow-sm'
      }`}
      aria-pressed={selected}
    >
      <div className="flex items-start gap-3">
        <div
          className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
            selected
              ? 'bg-brand-blue-primary text-white'
              : 'bg-brand-blue-lighter/40 text-brand-blue-primary'
          }`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-slate-900 text-sm">{title}</h3>
          <p className="mt-1 text-xs text-slate-600 leading-relaxed">{body}</p>
        </div>
        {selected && (
          <div className="shrink-0 self-center text-brand-blue-primary">
            <Check className="w-5 h-5" />
          </div>
        )}
      </div>
    </button>
  );
};

export const ShareLinkCreatorModal: React.FC<ShareLinkCreatorModalProps> = ({
  dashboard,
  isOpen,
  onClose,
}) => {
  const { shareDashboard, addToast } = useDashboard();
  const { canAccessFeature } = useAuth();
  const [mode, setMode] = useState<SharedBoardImportMode>('synced');
  const [creating, setCreating] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Reset modal state every time it opens for a new dashboard.
  React.useEffect(() => {
    if (isOpen) {
      setMode('synced');
      setCreating(false);
      setCreatedUrl(null);
      setCopied(false);
    }
  }, [isOpen, dashboard?.id]);

  if (!isOpen || !dashboard) return null;

  const canShare = canAccessFeature('dashboard-sharing');

  const handleCreate = async () => {
    if (!canShare || creating) return;
    setCreating(true);
    try {
      const shareId = await shareDashboard(dashboard, mode);
      const url = `${window.location.origin}/share/${shareId}`;
      setCreatedUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      } catch {
        // Clipboard may fail under restrictive focus rules — user can still
        // hit the manual Copy button in the success panel.
      }
    } catch (err) {
      console.error('Share failed:', err);
      addToast('Failed to create share link', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!createdUrl) return;
    try {
      await navigator.clipboard.writeText(createdUrl);
      setCopied(true);
      addToast('Link copied', 'success');
    } catch {
      addToast(
        'Could not copy automatically — select the link to copy manually',
        'error'
      );
    }
  };

  const modeLabel =
    mode === 'synced' ? 'Synced' : mode === 'view-only' ? 'View-Only' : 'Copy';

  return (
    <Modal
      isOpen
      onClose={onClose}
      ariaLabel="Create share link"
      maxWidth="max-w-md"
      contentClassName=""
      customHeader={
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-lg bg-brand-blue-lighter/40 text-brand-blue-primary flex items-center justify-center">
              <ExternalLink className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {createdUrl ? 'Link ready' : 'Share board'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[20rem]">
                {dashboard.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      }
    >
      {createdUrl ? (
        <div className="px-5 pb-5 pt-4 space-y-4">
          <p className="text-xs text-slate-600">
            Anyone you send this link to will receive it as{' '}
            <span className="font-bold text-slate-800">{modeLabel}</span>.
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <input
              type="text"
              readOnly
              value={createdUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 bg-transparent text-xs text-slate-700 truncate focus:outline-none"
              aria-label="Share link URL"
            />
            <button
              type="button"
              onClick={() => void handleCopy()}
              className={`shrink-0 inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold transition-colors cursor-pointer ${
                copied
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-brand-blue-primary text-white hover:bg-brand-blue-dark'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </>
              )}
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm py-2 transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      ) : (
        <div className="px-5 pb-5 pt-4 space-y-3">
          <p className="text-xs text-slate-600">
            How should the people you share with receive this board?
          </p>
          <ModeOption
            mode="synced"
            selected={mode === 'synced'}
            title="Synced"
            body="Both of you stay in sync — anything either teacher changes appears on the other's board in real time."
            Icon={Cloud}
            onPick={setMode}
          />
          <ModeOption
            mode="view-only"
            selected={mode === 'view-only'}
            title="View-Only"
            body="They see your live edits but can't change anything. Their copy is removed when you stop sharing."
            Icon={Eye}
            onPick={setMode}
          />
          <ModeOption
            mode="copy"
            selected={mode === 'copy'}
            title="Make a copy"
            body="They get a one-time snapshot. Edits stay private — your boards drift apart immediately."
            Icon={Copy}
            onPick={setMode}
          />
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={!canShare || creating}
            className="w-full rounded-lg bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold text-sm py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {creating ? 'Creating link…' : 'Create link'}
          </button>
        </div>
      )}
    </Modal>
  );
};
