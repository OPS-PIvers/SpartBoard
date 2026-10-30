import React, { useEffect, useRef } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { useViewAsOutward } from '@/hooks/useViewAsOutward';
import type { TourAnchorAttrs } from '@/config/tourAnchors';

interface AIGeneratorOverlayProps {
  open: boolean;
  onClose: () => void;
  /** Modal title — e.g. "Magic Quiz Generator". */
  title: string;
  /** Short description shown under the title. */
  description?: string;
  /** Optional element rendered to the right of the description (e.g. an "Import from Notes" link). */
  headerExtras?: React.ReactNode;
  /** The body content — prompt textarea, slider, file attachment, etc. */
  children: React.ReactNode;
  /** Optional error message rendered above the generate button. */
  error?: string | null;
  generating: boolean;
  /** Disables the generate button when false. */
  canGenerate: boolean;
  onGenerate: () => void;
  /** Generate button label. Defaults to "Generate". */
  generateLabel?: string;
  closeAnchor?: TourAnchorAttrs;
  generateAnchor?: TourAnchorAttrs;
}

/**
 * Shared editor-scoped AI generator overlay used by Quiz, Video Activity, and
 * Mini App editors. Renders a centered card on top of the workspace with a
 * consistent header / description / error / generate button. The body
 * (textarea, slider, attachment, etc.) is provided by each consumer as
 * children so the visual language stays unified without forcing a single
 * input shape.
 *
 * Designed to render inside `EditorWorkspace.overlay` or `EditorModalShell`
 * children — uses `absolute inset-0` for positioning and assumes a relative
 * parent.
 *
 * Note: Guided Learning has a structurally different generator (multi-image
 * upload + per-image captions + clamp warnings) and uses its own component.
 */
export const AIGeneratorOverlay: React.FC<AIGeneratorOverlayProps> = ({
  open,
  onClose,
  title,
  description,
  headerExtras,
  children,
  error,
  generating,
  canGenerate,
  onGenerate,
  generateLabel = 'Generate',
  closeAnchor,
  generateAnchor,
}) => {
  const outward = useViewAsOutward();
  // Store onClose in a ref so the effect below never needs it as a
  // dependency (same pattern as Modal.tsx) — callers pass an inline arrow,
  // so listing it would re-subscribe the listener on every keystroke while
  // the panel is open.
  const onCloseRef = useRef(onClose);
  // eslint-disable-next-line react-hooks/refs -- intentional render-body ref sync to avoid stale-closure without re-subscribing the effect (CLAUDE.md pattern)
  onCloseRef.current = onClose;

  // Escape must be caught at the document level, not via a div-level
  // onKeyDown: nothing here moves focus into the overlay (some consumers,
  // e.g. Video Activity's "Draft with AI" panel, have no focusable field at
  // all), so a JSX onKeyDown can silently never fire. Without this, Escape
  // bubbles straight to the ancestor Modal's window-level Escape handler,
  // which closes/discards the whole editor instead of just this panel
  // (same bug class as #2266/#2289/#2314).
  useEffect(() => {
    if (!open) return undefined;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onCloseRef.current();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open]);

  if (!open) return null;
  return (
    // `role="dialog"` advertises the overlay as a dialog landmark for
    // assistive tech, but we deliberately do NOT set `aria-modal="true"`:
    // the overlay is a workspace-scoped panel rendered with `inset-0`
    // inside the editor, not a true modal portal'd to `<body>`, and we
    // don't enforce a focus trap. Lying about modal semantics would tell
    // screen readers focus is trapped here when in fact tab order still
    // walks the editor controls outside the overlay. The parent
    // EditorModalShell handles the page-level focus boundary.
    <div
      role="dialog"
      aria-label={title}
      className="absolute inset-0 z-20 bg-white/95 backdrop-blur-xs flex items-center justify-center p-6 animate-in fade-in duration-200"
    >
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="font-black text-lg text-slate-800">{title}</h4>
            {description && (
              <p className="text-xs text-slate-500 mt-0.5">{description}</p>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {headerExtras}
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
              aria-label="Close generator"
              {...closeAnchor}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        {children}
        {error && (
          <div
            role="alert"
            className="p-3 bg-brand-red-lighter/40 border border-brand-red-primary/20 rounded-xl flex items-start gap-2 text-sm text-brand-red-dark font-bold"
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="whitespace-pre-wrap">{error}</span>
          </div>
        )}
        <div className="flex justify-center">
          <button
            onClick={() => outward.run('Generate with AI', onGenerate)}
            disabled={generating || !canGenerate || outward.locked}
            title={outward.lockedTitle}
            {...generateAnchor}
            className="flex items-center gap-1.5 px-5 py-2 bg-brand-blue-primary hover:bg-brand-blue-dark text-white text-sm font-bold rounded-xl transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Generating...
              </>
            ) : (
              generateLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
