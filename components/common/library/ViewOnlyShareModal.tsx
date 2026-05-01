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
 */

import React, { useCallback, useState } from 'react';
import {
  Loader2,
  Link2,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  X,
} from 'lucide-react';

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

  const handleCopy = useCallback(async () => {
    if (!createdLink) return;
    try {
      await navigator.clipboard.writeText(createdLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can reject in non-secure contexts or when permission
      // is denied. Swallow — the link is still visible to manually copy.
    }
  }, [createdLink]);

  return (
    <div className="absolute inset-0 z-overlay bg-brand-blue-dark/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div
          className={`p-4 flex items-center justify-between ${createdLink ? 'bg-emerald-600' : 'bg-brand-blue-primary'}`}
        >
          <div className="flex items-center gap-2 text-white">
            {createdLink ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <Link2 className="w-5 h-5" />
            )}
            <span className="font-black uppercase tracking-tight">
              {createdLink ? 'Share Link Ready' : 'Share'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
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
                  onClick={() => void handleCopy()}
                  className="w-full flex items-center justify-center gap-2 bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold rounded-xl transition-all active:scale-95 shadow-sm py-3 text-sm"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy Link
                    </>
                  )}
                </button>
                <a
                  href={createdLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors py-3 text-sm"
                >
                  <ExternalLink className="w-4 h-4" />
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
                <p
                  className="text-brand-blue-primary/60 font-black uppercase tracking-widest mt-1"
                  style={{ fontSize: 'clamp(10px, 3cqmin, 12px)' }}
                >
                  Create Share Link
                </p>
              </div>
              <p className="text-slate-600 text-sm text-center">
                Anyone with the link can view this. No submissions are collected
                — view counts appear in the Shared archive.
              </p>
              {error && (
                <p className="text-sm text-brand-red-primary text-center font-medium">
                  {error}
                </p>
              )}
              <button
                onClick={onConfirm}
                disabled={isCreating}
                className="w-full flex items-center justify-center gap-2 bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold rounded-xl transition-all active:scale-95 shadow-sm py-3 text-sm disabled:opacity-60"
              >
                {isCreating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Link2 className="w-4 h-4" />
                )}
                {isCreating ? 'Creating…' : 'Create Share Link'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
