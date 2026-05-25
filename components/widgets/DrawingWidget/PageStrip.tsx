import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Plus,
  Trash2,
} from 'lucide-react';
import { DrawingPage } from '@/types';
import { getBoundingBox } from './hitTest';

interface PageStripProps {
  pages: DrawingPage[];
  currentPage: number;
  onSelectPage: (index: number) => void;
  onAddPage: () => void;
  onDeletePage: (index: number) => void;
  onMovePage: (index: number, direction: 'left' | 'right') => void;
}

/**
 * Per-widget page strip (Phase 2 PR 2.3). Renders the active drawing's pages
 * as small numbered chips with bbox-only thumbnails — full canvas thumbnails
 * are out of scope for this PR (Wave 7 will revisit when backgrounds land).
 *
 * Layout:
 *  - Horizontally scrollable strip; chips are fixed-width so adding more
 *    pages widens the strip rather than shrinking each chip past readability.
 *  - The active chip wears `ring-2 ring-indigo-500`.
 *  - Each chip exposes a hover-revealed kebab with Delete / Move Left /
 *    Move Right. Disabled states are visible (greyed out at the edges of
 *    the list).
 *  - A trailing `+` button adds a new blank page after the current one.
 *
 * Sizing uses container queries so the strip remains usable when the widget
 * is shrunk — chips, gaps and the kebab affordance all scale via `cqmin`.
 */
export const PageStrip: React.FC<PageStripProps> = ({
  pages,
  currentPage,
  onSelectPage,
  onAddPage,
  onDeletePage,
  onMovePage,
}) => {
  // A single open kebab at a time keeps the visual noise down. -1 = closed.
  const [openMenuIndex, setOpenMenuIndex] = useState<number>(-1);

  const closeMenu = () => setOpenMenuIndex(-1);

  return (
    <div
      role="group"
      aria-label="Drawing pages"
      className="relative flex items-center gap-1 overflow-x-auto overflow-y-hidden border-t border-white/20 bg-white/10 backdrop-blur-sm"
      style={{
        padding: 'min(6px, 1.5cqmin)',
        // Cap height so the strip doesn't dominate when the widget is short.
        minHeight: 'min(56px, 14cqmin)',
      }}
      onClick={closeMenu}
    >
      {pages.map((page, index) => {
        const isActive = index === currentPage;
        return (
          <div
            key={page.id}
            className="relative shrink-0 group"
            style={{
              width: 'min(72px, 18cqmin)',
              height: 'min(48px, 12cqmin)',
            }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeMenu();
                onSelectPage(index);
              }}
              aria-label={`Page ${index + 1}`}
              aria-current={isActive ? 'page' : undefined}
              title={`Page ${index + 1}`}
              className={`relative w-full h-full rounded-md bg-white/70 border border-slate-300 overflow-hidden transition-all flex items-end justify-start ${
                isActive ? 'ring-2 ring-indigo-500' : 'hover:bg-white/90'
              }`}
            >
              <PageThumbnail page={page} />
              <span
                className="absolute top-0 left-0 px-1 py-0.5 text-slate-700 font-medium bg-white/70 rounded-br"
                style={{ fontSize: 'min(10px, 3.5cqmin)' }}
              >
                {index + 1}
              </span>
            </button>
            {/* Kebab — visible on hover, or while its menu is open. */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenuIndex(openMenuIndex === index ? -1 : index);
              }}
              aria-label={`Page ${index + 1} actions`}
              aria-haspopup="menu"
              aria-expanded={openMenuIndex === index}
              className={`absolute top-0 right-0 rounded-bl bg-white/80 hover:bg-white text-slate-700 transition-opacity ${
                openMenuIndex === index
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
              }`}
              style={{ padding: 'min(2px, 0.5cqmin)' }}
            >
              <MoreVertical
                style={{
                  width: 'min(14px, 4cqmin)',
                  height: 'min(14px, 4cqmin)',
                }}
              />
            </button>
            {openMenuIndex === index && (
              <div
                role="menu"
                onClick={(e) => e.stopPropagation()}
                className="absolute z-10 top-full right-0 mt-1 bg-white rounded-md shadow-lg border border-slate-200 py-1 min-w-[140px]"
                style={{ fontSize: 'min(12px, 3.8cqmin)' }}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeMenu();
                    onMovePage(index, 'left');
                  }}
                  disabled={index === 0}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2 text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Move Left
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeMenu();
                    onMovePage(index, 'right');
                  }}
                  disabled={index === pages.length - 1}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2 text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                  Move Right
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeMenu();
                    onDeletePage(index);
                  }}
                  className="w-full px-3 py-1.5 text-left flex items-center gap-2 text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          closeMenu();
          onAddPage();
        }}
        aria-label="Add page"
        title="Add page"
        className="shrink-0 rounded-md border border-dashed border-slate-400 bg-white/40 hover:bg-white/70 flex items-center justify-center text-slate-600"
        style={{
          width: 'min(48px, 12cqmin)',
          height: 'min(48px, 12cqmin)',
        }}
      >
        <Plus
          style={{
            width: 'min(20px, 5cqmin)',
            height: 'min(20px, 5cqmin)',
          }}
        />
      </button>
    </div>
  );
};

/**
 * Minimal bbox-only thumbnail. Each object's bounding box renders as a thin
 * outlined rect, projected from the implicit canvas size (taken from the
 * largest extent of any object) into the chip's dimensions. This is
 * deliberately a sketch — full per-page renders cost too much to draw 30
 * pages on every keystroke, and the chip is small enough that crispness
 * doesn't add information.
 */
const PageThumbnail: React.FC<{ page: DrawingPage }> = ({ page }) => {
  if (page.objects.length === 0) return null;
  // Compute the union bbox so the thumbnail uses the chip's full width even
  // when content is concentrated in one corner.
  const bboxes = page.objects.map((obj) => getBoundingBox(obj));
  const maxX = bboxes.reduce((m, b) => Math.max(m, b.x + b.w), 0);
  const maxY = bboxes.reduce((m, b) => Math.max(m, b.y + b.h), 0);
  // Fall back to a sensible canvas-ish ratio if all objects sit at the origin.
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
          stroke="#475569"
          strokeWidth={Math.max(W, H) * 0.01}
        />
      ))}
    </svg>
  );
};
