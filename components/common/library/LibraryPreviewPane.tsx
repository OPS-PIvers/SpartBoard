import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { LibraryPrimaryAction } from './types';

interface LibraryPreviewPaneProps {
  /** When false the pane is unmounted; when true it slides in. */
  isOpen: boolean;
  onClose: () => void;
  /** Title shown in the pane header. */
  title: string;
  /** Optional small subtitle line under the title. */
  subtitle?: React.ReactNode;
  /**
   * Primary CTA shown in the pane footer. Typically "Edit" or "Open" — a
   * shortcut that takes the user from preview into the editor.
   */
  primaryAction?: LibraryPrimaryAction;
  /** Additional secondary footer buttons (Duplicate, Share, etc.). */
  secondaryActions?: LibraryPrimaryAction[];
  /** The preview body (rendered question list, mini-app runner, etc.). */
  children: React.ReactNode;
  /**
   * Width of the pane in pixels at desktop sizes. Mobile (≤640px) ignores
   * this and renders full-width as a bottom-sheet-style overlay.
   */
  widthPx?: number;
}

/**
 * Right-side detail pane for library managers. Renders inside the manager's
 * tab content area as a sibling of the grid, not as a portal — that keeps
 * the pane scoped to the widget's container query so a small widget gets
 * a small pane and a fullscreen widget gets a large one.
 *
 * The pane animates in from the right via `animate-in slide-in-from-right`;
 * closing unmounts the pane immediately with no exit animation (React keeps
 * the slide-in classes ready for the next open). Esc closes; backdrop click
 * does NOT (this isn't a modal — the underlying grid stays interactive).
 *
 * Designed to coexist with a manager's grid: place this and the grid
 * inside a flex row; the pane is `shrink-0` and the grid is `flex-1`.
 *
 * Phase 4 of the PLC dashboard overhaul. Phase 5 wires it into the four
 * widget managers (QuizManager, VideoActivityManager, MiniAppManager,
 * GuidedLearningManager).
 */
export const LibraryPreviewPane: React.FC<LibraryPreviewPaneProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  primaryAction,
  secondaryActions,
  children,
  widthPx = 360,
}) => {
  // Esc-to-close. Scoped to the document via capture-phase so the pane
  // intercepts Esc *before* any ancestor document-level listener (e.g. the
  // PLC dashboard's fullscreen-tile collapser) sees it. `stopImmediate`
  // also blocks sibling document listeners on the same capture pass —
  // otherwise pressing Esc inside a preview opened from an expanded tile
  // would close BOTH in one keystroke. Without `useCapture` true, sibling
  // listeners (which don't bubble between each other) can't be blocked.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [isOpen, onClose]);

  // Restore focus to the previously-focused element on close so a teacher
  // who tabbed into the preview from a library card returns to that card.
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    // Defer focus until after the slide-in so screen reader announces the
    // pane title before the close button gets focus.
    const id = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);
    return () => {
      window.clearTimeout(id);
      previouslyFocusedRef.current?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <aside
      role="complementary"
      aria-label="Item preview"
      className="bg-white border-l border-slate-200 shadow-lg flex flex-col h-full shrink-0 motion-safe:animate-in motion-safe:slide-in-from-right-2 motion-safe:duration-200"
      style={{ width: `min(${widthPx}px, 90vw)` }}
    >
      <header className="flex items-start justify-between gap-3 px-4 py-3 border-b border-slate-100 shrink-0">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-slate-900 truncate">{title}</h3>
          {subtitle && (
            <p className="text-xxs text-slate-500 mt-0.5 truncate">
              {subtitle}
            </p>
          )}
        </div>
        {/* WCAG 2.5.5: 44×44 minimum touch target. `min-w/min-h` ensures the
            hit area meets the threshold even when the icon itself is small. */}
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] -m-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4">
        {children}
      </div>

      {(primaryAction ?? (secondaryActions && secondaryActions.length > 0)) && (
        <footer className="flex items-center gap-2 px-4 py-3 border-t border-slate-100 bg-slate-50 shrink-0">
          {secondaryActions?.map((action, i) => {
            const Icon = action.icon;
            return (
              <button
                key={`secondary-${i}`}
                type="button"
                onClick={action.onClick}
                disabled={action.disabled}
                title={action.disabled ? action.disabledReason : action.label}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-brand-blue-primary text-slate-700 hover:text-brand-blue-primary text-xs font-bold uppercase tracking-wider rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                {action.label}
              </button>
            );
          })}
          {primaryAction && (
            <button
              type="button"
              onClick={primaryAction.onClick}
              disabled={primaryAction.disabled}
              title={
                primaryAction.disabled
                  ? primaryAction.disabledReason
                  : primaryAction.label
              }
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue-primary hover:bg-brand-blue-dark text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {primaryAction.icon && (
                <primaryAction.icon className="w-3.5 h-3.5" />
              )}
              {primaryAction.label}
            </button>
          )}
        </footer>
      )}
    </aside>
  );
};
