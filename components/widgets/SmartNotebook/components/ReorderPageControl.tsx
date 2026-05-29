import React from 'react';
import { ArrowLeftToLine, ArrowRightToLine } from 'lucide-react';

// Match the surrounding header tool buttons' tap target (min(8px, 2cqmin)
// padding around a min(16px, 4cqmin) icon) so this control is no harder to
// hit than the Add/Delete/Present buttons next to it. Disabled treatment
// uses opacity + grayscale so it still reads as inactive against the
// slate-100 grouping chip background; transition-all (not -colors) lets the
// opacity/filter actually animate when the busy flag toggles. Hoisted to
// module scope so it isn't re-allocated per render.
const BTN_CLASS =
  'flex items-center justify-center rounded-lg text-slate-700 hover:bg-white disabled:opacity-30 disabled:grayscale disabled:hover:bg-transparent transition-all';
const BTN_STYLE: React.CSSProperties = { padding: 'min(8px, 2cqmin)' };

/**
 * Header control that lets the teacher shift the current page earlier or
 * later in the notebook. Visually grouped with a "MOVE" label and bar-arrow
 * icons so it doesn't read as a navigation control — the previous design
 * used plain ArrowLeft/ArrowRight icons that were indistinguishable from
 * the footer's prev/next page chevrons, and teachers occasionally clicked
 * them expecting to navigate.
 *
 * `canMoveEarlier` / `canMoveLater` are required (no default) so a future
 * consumer can't silently wire up a permanently-disabled chip — the
 * disabled treatment is subtle against the chip background and missing
 * wiring would be hard to spot at a glance.
 */
export const ReorderPageControl: React.FC<{
  onMovePage: (dir: -1 | 1) => void;
  pageOpBusy: boolean;
  canMoveEarlier: boolean;
  canMoveLater: boolean;
  iconStyle: React.CSSProperties;
}> = ({ onMovePage, pageOpBusy, canMoveEarlier, canMoveLater, iconStyle }) => {
  // When neither direction is movable (e.g. one-page notebook, or a page
  // alone in its section), dim the whole chip including the "MOVE" label
  // and the border so it reads as a single inactive control rather than
  // a styled chip with mysteriously-faded icons.
  const allDisabled = !canMoveEarlier && !canMoveLater;
  return (
    <div
      role="group"
      aria-label="Reorder page"
      className={`flex items-center rounded-xl bg-slate-100 border border-slate-200 shadow-sm transition-opacity ${
        allDisabled ? 'opacity-50' : 'opacity-100'
      }`}
      style={{ padding: 'min(2px, 0.5cqmin)', gap: 'min(2px, 0.5cqmin)' }}
    >
      <button
        type="button"
        onClick={() => onMovePage(-1)}
        disabled={pageOpBusy || !canMoveEarlier}
        className={BTN_CLASS}
        style={BTN_STYLE}
        title="Move this page earlier in the notebook"
        aria-label="Move page earlier"
      >
        <ArrowLeftToLine style={iconStyle} />
      </button>
      <span
        aria-hidden
        className="font-black text-slate-500 uppercase tracking-widest select-none"
        style={{
          fontSize: 'min(9px, 2.2cqmin)',
          padding: '0 min(4px, 1cqmin)',
        }}
      >
        Move
      </span>
      <button
        type="button"
        onClick={() => onMovePage(1)}
        disabled={pageOpBusy || !canMoveLater}
        className={BTN_CLASS}
        style={BTN_STYLE}
        title="Move this page later in the notebook"
        aria-label="Move page later"
      >
        <ArrowRightToLine style={iconStyle} />
      </button>
    </div>
  );
};
