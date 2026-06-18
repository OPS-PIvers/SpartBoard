import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  ChevronRight,
  Layers,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { DrawableObject, DrawingPage } from '@/types';
import { getBoundingBox } from './hitTest';

interface PageStripProps {
  pages: DrawingPage[];
  currentPage: number;
  onSelectPage: (index: number) => void;
  onAddPage: () => void;
  onDeletePage: (index: number) => void;
  onRenamePage: (index: number, title: string) => void;
  /** Live objects for the active page (subcollection-sourced post-migration).
   *  Used to render an accurate thumbnail for the current page even when the
   *  denormalized `pages[currentPage].objects` array is empty. */
  activePageObjects?: DrawableObject[];
  /** True once this widget's `pages[].objects[]` has been moved to the
   *  Firestore subcollection. After migration, non-active pages have an empty
   *  denormalized `objects[]` array — the thumbnail uses this flag to render
   *  a "has content" placeholder instead of returning null. */
  subcollectionMigrated?: boolean;
}

/**
 * Fallback page title. Used in two places (toolbar chip + popover row) so
 * a single helper keeps the "Page N" convention consistent. `title` is
 * trimmed at write time, so an all-whitespace title here surfaces as empty
 * and falls through to the default.
 */
const pageLabel = (page: DrawingPage, index: number): string => {
  const trimmed = page.title?.trim() ?? '';
  // Empty string should fall through to the "Page N" default; `??` alone
  // wouldn't catch it, so we test explicitly. ('||' would work but reads
  // less intentionally here.)
  return trimmed === '' ? `Page ${index + 1}` : trimmed;
};

/**
 * Compact in-toolbar page control with editable per-page titles.
 *
 * Visual states:
 *  - 1 page  → `[+ Add page]  [Page 1]` (the title is click-to-edit).
 *  - ≥2 pages → `[◀]  [N / M]  [▶]  [Page N]` (title is the current page's,
 *               also click-to-edit; the counter still opens the popover).
 *
 * The popover (multi-page only) lists every page with a thumbnail, label,
 * and a pair of hover-revealed icons: edit (✎) and delete (🗑). Clicking
 * edit swaps the row's label for an inline input bound to the parent's
 * `onRenamePage` sink.
 *
 * Popover is portalled into document.body so the widget's `overflow-hidden`
 * shell can't clip it — same pattern as the export and tool-options
 * popovers elsewhere in the widget.
 */
export const PageStrip: React.FC<PageStripProps> = ({
  pages,
  currentPage,
  onSelectPage,
  onAddPage,
  onDeletePage,
  onRenamePage,
  activePageObjects,
  subcollectionMigrated = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ bottom: number; left: number } | null>(
    null
  );
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Per-row inline-edit state for the popover. We store the index of the row
  // currently in edit mode; -1 = nobody is editing. The current-page title
  // chip in the toolbar tracks its own edit state (`isTitleEditing` below)
  // because it lives outside the popover and survives the popover close.
  const [editingRowIndex, setEditingRowIndex] = useState<number>(-1);

  const close = useCallback(() => {
    setIsOpen(false);
    setAnchor(null);
    setEditingRowIndex(-1);
  }, []);

  const openAnchoredTo = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    setIsOpen(true);
    setAnchor({
      bottom: window.innerHeight - rect.top + 8,
      left: rect.left,
    });
  };

  // Re-measure on scroll/resize so the portalled popover follows the trigger
  // when the dashboard pans or the dock collapses.
  useEffect(() => {
    if (!isOpen) return undefined;
    const onScrollOrResize = () => {
      const el = triggerRef.current;
      if (!el) {
        close();
        return;
      }
      const rect = el.getBoundingClientRect();
      setAnchor({
        bottom: window.innerHeight - rect.top + 8,
        left: rect.left,
      });
    };
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [isOpen, close]);

  // Outside-click + Escape dismiss for the popover.
  useEffect(() => {
    if (!isOpen) return undefined;
    const onDocPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      const popup = document.getElementById('drawing-page-popover');
      if (popup?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, close]);

  // Shared button classes for the compact in-toolbar chips.
  const chipBase =
    'h-7 rounded-md flex items-center justify-center transition-colors text-slate-200 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-light focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900';

  const currentTitle = pageLabel(pages[currentPage], currentPage);

  // ----- Multi-page render path -----
  if (pages.length > 1) {
    const isFirst = currentPage === 0;
    const isLast = currentPage === pages.length - 1;
    return (
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button
          type="button"
          onClick={() => onSelectPage(currentPage - 1)}
          disabled={isFirst}
          title="Previous page"
          aria-label="Previous page"
          className={`${chipBase} w-7`}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          ref={triggerRef}
          type="button"
          onClick={(e) => {
            if (isOpen) {
              close();
            } else {
              openAnchoredTo(e.currentTarget);
            }
          }}
          title="Manage pages"
          aria-label="Manage pages"
          aria-expanded={isOpen}
          className={`${chipBase} px-2 font-mono text-xs tabular-nums gap-1`}
        >
          <Layers className="w-3.5 h-3.5 opacity-70" />
          <span>
            {currentPage + 1} / {pages.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onSelectPage(currentPage + 1)}
          disabled={isLast}
          title="Next page"
          aria-label="Next page"
          className={`${chipBase} w-7`}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <InlineTitle
          // Re-mount on page switch so the input cleanly resets to the new
          // page's title without a stale-edit edge case.
          key={`title-${pages[currentPage].id}`}
          value={currentTitle}
          onCommit={(next) => onRenamePage(currentPage, next)}
        />

        {isOpen &&
          anchor &&
          createPortal(
            <div
              id="drawing-page-popover"
              data-testid="drawing-page-popover"
              role="dialog"
              aria-label="Pages"
              className="fixed z-[2147483600] w-[280px] max-h-[60vh] flex flex-col rounded-xl bg-slate-900/95 backdrop-blur-md shadow-xl border border-white/10 overflow-hidden"
              style={{
                bottom: `${anchor.bottom}px`,
                left: `${anchor.left}px`,
              }}
            >
              <div className="px-3 py-2 text-xxs uppercase tracking-widest text-slate-400 border-b border-white/10">
                Pages
              </div>
              <ul className="flex-1 overflow-y-auto py-1">
                {pages.map((page, index) => {
                  const isActive = index === currentPage;
                  const isEditing = editingRowIndex === index;
                  return (
                    <li
                      key={page.id}
                      className={`group flex items-center gap-2 px-2 py-1.5 transition-colors ${
                        isActive
                          ? 'bg-brand-blue-primary/30'
                          : 'hover:bg-white/5'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (isEditing) return;
                          onSelectPage(index);
                          close();
                        }}
                        aria-label={`Page ${index + 1}`}
                        aria-current={isActive ? 'page' : undefined}
                        disabled={isEditing}
                        className="flex-1 flex items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-light rounded disabled:cursor-text"
                      >
                        <span
                          className={`w-12 h-9 shrink-0 rounded border border-white/10 bg-white/5 overflow-hidden relative ${
                            isActive ? 'ring-1 ring-brand-blue-light' : ''
                          }`}
                        >
                          <PageThumbnail
                            page={page}
                            // Hydrate the active page from the live
                            // subcollection slice so its thumbnail is accurate
                            // even when the denormalized cache is empty.
                            liveObjects={
                              isActive ? activePageObjects : undefined
                            }
                            subcollectionMigrated={subcollectionMigrated}
                          />
                        </span>
                        {isEditing ? (
                          <InlineTitle
                            // Keyed by row so the input remounts cleanly per
                            // edit session.
                            key={`row-${page.id}-edit`}
                            value={pageLabel(page, index)}
                            autoFocusOnMount
                            onCommit={(next) => {
                              onRenamePage(index, next);
                              setEditingRowIndex(-1);
                            }}
                            onCancel={() => setEditingRowIndex(-1)}
                          />
                        ) : (
                          <span
                            className={`font-mono text-xs tabular-nums truncate ${
                              isActive ? 'text-white' : 'text-slate-300'
                            }`}
                          >
                            {pageLabel(page, index)}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingRowIndex(isEditing ? -1 : index);
                        }}
                        title={`Rename page ${index + 1}`}
                        aria-label={`Rename page ${index + 1}`}
                        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-1 rounded text-slate-300 hover:bg-white/10 hover:text-white"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeletePage(index)}
                        disabled={pages.length <= 1}
                        title={`Delete page ${index + 1}`}
                        aria-label={`Page ${index + 1} actions`}
                        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-1 rounded text-red-300 hover:bg-red-500/20 hover:text-red-200 disabled:opacity-20 disabled:hover:bg-transparent"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                onClick={() => onAddPage()}
                aria-label="Add page"
                className="border-t border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/5 flex items-center gap-2 transition-colors focus-visible:outline-none focus-visible:bg-white/5"
              >
                <Plus className="w-4 h-4" />
                Add page
              </button>
            </div>,
            document.body
          )}
      </div>
    );
  }

  // ----- Single-page render path: [+ Add page] [Page 1 (editable)] -----
  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      <button
        type="button"
        onClick={onAddPage}
        title="Add page"
        aria-label="Add page"
        className={`${chipBase} px-2 gap-1 text-xs font-medium`}
      >
        <Plus className="w-4 h-4" />
        <span>Add page</span>
      </button>
      <InlineTitle
        key={`title-${pages[currentPage].id}`}
        value={currentTitle}
        onCommit={(next) => onRenamePage(currentPage, next)}
      />
    </div>
  );
};

/**
 * Click-to-edit page title chip. Displays as a text button by default;
 * clicking (or focusing + Enter) swaps in an inline `<input>` bound to the
 * current value. The input commits on Enter or blur, cancels on Escape.
 *
 * Why a self-contained component: the same control appears in two places
 * (toolbar chip + popover row when its row is in edit mode), and each needs
 * its own edit-mode lifecycle. Hoisting the state here keeps both call sites
 * trivial.
 */
const InlineTitle: React.FC<{
  value: string;
  onCommit: (next: string) => void;
  onCancel?: () => void;
  autoFocusOnMount?: boolean;
}> = ({ value, onCommit, onCancel, autoFocusOnMount = false }) => {
  const [isEditing, setIsEditing] = useState(autoFocusOnMount);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Guards against the stale-onBlur race: pressing Escape calls cancel(),
  // which calls setIsEditing(false). React batches the update, so the browser
  // fires a synchronous blur event on the still-mounted input before the new
  // state commits. The blur's commit() closure sees the pre-cancel draft.
  // Setting this ref synchronously in cancel() lets commit() short-circuit.
  const isCancellingRef = useRef(false);

  // Sync local draft when the parent's `value` changes while we're NOT
  // editing (external rename, page switch). Uses the "adjusting state while
  // rendering" React pattern — store the previous value, compare during
  // render, call the setter immediately if they differ. Avoids the
  // useEffect-with-setState anti-pattern that triggers a second render.
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    if (!isEditing) setDraft(value);
  }

  useEffect(() => {
    if (!isEditing) return;
    // Defer focus by one tick so the input is in the DOM before we focus.
    // selectionStart/End to the end gives the natural "click to edit, keep
    // typing where I left off" feel.
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(id);
  }, [isEditing]);

  const commit = () => {
    if (isCancellingRef.current) {
      isCancellingRef.current = false;
      return;
    }
    onCommit(draft);
    setIsEditing(false);
  };

  const cancel = () => {
    isCancellingRef.current = true;
    setDraft(value);
    setIsEditing(false);
    onCancel?.();
  };

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        title="Rename page"
        aria-label={`Rename "${value}"`}
        className="h-7 px-2 max-w-[140px] truncate rounded-md text-xs text-slate-200 font-medium hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-light focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
      >
        {value}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
        // Don't bubble — the widget wrapper listens for Backspace/Delete
        // (selection nudges) and arrow keys (object nudges); without
        // stopPropagation a user editing the title would trigger those.
        e.stopPropagation();
      }}
      aria-label="Page title"
      className="h-7 px-2 max-w-[160px] rounded-md text-xs bg-slate-800 text-white ring-1 ring-brand-blue-light focus:outline-none focus:ring-2"
    />
  );
};

/**
 * Minimal bbox-only thumbnail. Each object's bounding box renders as a thin
 * outlined rect, projected from the implicit canvas size (largest extent of
 * any object) into the chip's dimensions. Deliberately a sketch — full
 * per-page renders cost too much to draw N pages on every keystroke.
 *
 * Post-migration caveat: once the widget's pages have moved to the Firestore
 * subcollection, only the currently-loaded page knows its real `objects[]`
 * (via the `liveObjects` prop). For non-active pages we fall back to a
 * neutral "has content" placeholder — the alternative would be N extra
 * Firestore reads per popover open, which isn't justified for a sketch.
 */
const PageThumbnail: React.FC<{
  page: DrawingPage;
  liveObjects?: DrawableObject[];
  subcollectionMigrated?: boolean;
}> = ({ page, liveObjects, subcollectionMigrated = false }) => {
  const objects = liveObjects ?? page.objects ?? [];
  if (objects.length > 0) {
    const bboxes = objects.map((obj) => getBoundingBox(obj));
    const maxX = bboxes.reduce((m, b) => Math.max(m, b.x + b.w), 0);
    const maxY = bboxes.reduce((m, b) => Math.max(m, b.y + b.h), 0);
    const W = Math.max(maxX, 1);
    const H = Math.max(maxY, 1);
    return (
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 w-full h-full"
        aria-hidden="true"
      >
        {bboxes.map((b, i) => (
          <rect
            key={i}
            x={b.x}
            y={b.y}
            width={Math.max(b.w, 1)}
            height={Math.max(b.h, 1)}
            fill="none"
            stroke="rgba(226, 232, 240, 0.6)"
            strokeWidth={Math.max(W, H) * 0.012}
          />
        ))}
      </svg>
    );
  }
  // Post-migration non-active page: render a neutral filled rect so the chip
  // doesn't look empty when the page may in fact have content we haven't
  // loaded. Pre-migration empty pages fall through to null (no placeholder).
  if (subcollectionMigrated) {
    return (
      <span
        className="absolute inset-1 rounded-sm bg-white/10"
        aria-hidden="true"
      />
    );
  }
  return null;
};
