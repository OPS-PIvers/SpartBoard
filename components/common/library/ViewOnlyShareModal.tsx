/**
 * ViewOnlyShareModal — minimal modal for view-only assignment-mode "Share"
 * flows.
 *
 * Used by widgets when the org-wide assignment mode for that widget is set
 * to `'view-only'`. Drops everything that's pure friction in the view-only
 * case (assignment name input, class picker, mode picker, PLC, settings)
 * and offers a single confirmation. After creation, swaps to a link-display
 * UI with Copy / Open buttons.
 *
 * The auto-generated share name still gets persisted on the underlying
 * session/assignment doc — callers compute it before opening this modal.
 * Teachers who want to rename can do so from the Shared archive's overflow
 * menu (already wired for Mini App; Quiz/VA/GL inherit the assignment-doc
 * `assignmentName` field through the same pattern).
 *
 * Mini App keeps its own custom modal (which doubles as the URL display);
 * this primitive serves the three widgets that route through the shared
 * AssignModal in submissions mode.
 *
 * Built on the shared `Modal` primitive — same dialog-role, focus-trap
 * support (via portal to body), Escape-to-close, body scroll lock, and
 * backdrop-click-to-close that AssignModal uses. Callers conditionally
 * render this component (target → mount, no target → unmount); when
 * mounted the modal is always open, so we pass `isOpen={true}`.
 */

import React, { useCallback, useEffect, useId, useState } from 'react';
import {
  Loader2,
  Link2,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';
import { Modal } from '../Modal';

export interface ViewOnlyShareModalProps {
  /** The thing being shared (quiz title, set title, activity title). */
  itemTitle: string;
  /** True while the create-session network round trip is in flight. */
  isCreating: boolean;
  /** Final student-facing URL once the session is minted. Null pre-creation. */
  createdLink: string | null;
  /** Inline error message to surface in the body. Null when no error. */
  error: string | null;
  /** Click handler for the confirm button. Should mint the session. */
  onConfirm: () => void;
  /** Close the modal — also resets the parent's createdLink state. */
  onClose: () => void;
}

export const ViewOnlyShareModal: React.FC<ViewOnlyShareModalProps> = ({
  itemTitle,
  isCreating,
  createdLink,
  error,
  onConfirm,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const headerLabelId = useId();

  // Reset the "Copied!" affordance back to "Copy Link" 2s after a successful
  // copy. Owning the timer in an effect (rather than a bare setTimeout from
  // inside handleCopy) means React cleans it up if the modal unmounts before
  // the 2s elapses — no setState-on-unmounted-component warning, no leaked
  // pending timer.
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);

  const handleCopy = useCallback(async () => {
    if (!createdLink) return;
    try {
      await navigator.clipboard.writeText(createdLink);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      // Clipboard API can reject in non-secure contexts or when permission
      // is denied. Surface a hint so teachers know to copy the link manually
      // from the visible URL block above the button rather than thinking
      // the copy succeeded silently.
      setCopyFailed(true);
    }
  }, [createdLink]);

  // Custom coloured header (emerald post-creation, brand-blue pre-creation)
  // — passed to Modal as `customHeader` so the body's rounded-2xl shell
  // wraps it cleanly. Modal still owns the close affordance via Escape and
  // backdrop click; the X button below mirrors the original visual.
  const header = (
    <div
      className={`flex items-center justify-between p-4 rounded-t-2xl text-white ${
        createdLink ? 'bg-emerald-600' : 'bg-brand-blue-primary'
      }`}
    >
      <div className="flex items-center gap-2">
        {createdLink ? (
          <CheckCircle2 aria-hidden="true" className="w-5 h-5" />
        ) : (
          <Link2 aria-hidden="true" className="w-5 h-5" />
        )}
        <h3
          id={headerLabelId}
          className="font-black uppercase tracking-tight text-base"
        >
          {createdLink ? 'Share Link Ready' : 'Share'}
        </h3>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="text-white/60 hover:text-white transition-colors"
        aria-label="Close"
      >
        {/* X glyph rendered as a small inline SVG so we don't widen the
            lucide-react import for a single icon used only in the header. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      maxWidth="max-w-sm"
      customHeader={header}
      ariaLabelledby={headerLabelId}
      contentClassName="p-5 space-y-4"
      // overflow-hidden so the coloured header's corners get clipped by the
      // shell's rounded-2xl. Modal's default shell has bg-white + rounded
      // but no overflow clip.
      className="overflow-hidden"
    >
      {createdLink ? (
        /* Post-creation: show link with Copy / Open. */
        <>
          <div className="text-center">
            <p className="font-bold text-brand-blue-dark text-base truncate px-2">
              {itemTitle}
            </p>
          </div>
          <p className="text-slate-600 text-sm text-center">
            Send this link to students. Anyone with the link can view — no
            submissions are collected.
          </p>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 break-all text-xs text-slate-700 font-mono">
            {createdLink}
          </div>
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="w-full flex items-center justify-center gap-2 bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold rounded-xl transition-all active:scale-95 shadow-sm py-3 text-sm"
            >
              {copied ? (
                <>
                  <Check aria-hidden="true" className="w-4 h-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy aria-hidden="true" className="w-4 h-4" />
                  Copy Link
                </>
              )}
            </button>
            {copyFailed && (
              <p
                role="status"
                className="text-xs text-brand-red-primary text-center -mt-1"
              >
                Couldn&apos;t copy automatically — please select and copy the
                link above.
              </p>
            )}
            <a
              href={createdLink}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors py-3 text-sm"
            >
              <ExternalLink aria-hidden="true" className="w-4 h-4" />
              Open in New Tab
            </a>
          </div>
        </>
      ) : (
        /* Pre-creation: zero form fields, single confirm button. */
        <>
          <div className="text-center">
            <p className="font-bold text-brand-blue-dark text-base truncate px-2">
              {itemTitle}
            </p>
            <p className="text-brand-blue-primary/60 font-black uppercase tracking-widest mt-1 text-xs">
              Create Share Link
            </p>
          </div>
          <p className="text-slate-600 text-sm text-center">
            Anyone with the link can view this. No submissions are collected —
            view counts appear in the Shared archive.
          </p>
          {error && (
            <p className="text-sm text-brand-red-primary text-center font-medium">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={onConfirm}
            disabled={isCreating}
            className="w-full flex items-center justify-center gap-2 bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold rounded-xl transition-all active:scale-95 shadow-sm py-3 text-sm disabled:opacity-60"
          >
            {isCreating ? (
              <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" />
            ) : (
              <Link2 aria-hidden="true" className="w-4 h-4" />
            )}
            {isCreating ? 'Creating…' : 'Create Share Link'}
          </button>
        </>
      )}
    </Modal>
  );
};
