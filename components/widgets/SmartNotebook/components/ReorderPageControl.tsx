import React from 'react';
import { ArrowLeftToLine, ArrowRightToLine } from 'lucide-react';

/**
 * Header control that lets the teacher shift the current page earlier or
 * later in the notebook. Visually grouped with a "MOVE" label and bar-arrow
 * icons so it doesn't read as a navigation control — the previous design
 * used plain ArrowLeft/ArrowRight icons that were indistinguishable from
 * the footer's prev/next page chevrons, and teachers occasionally clicked
 * them expecting to navigate.
 */
export const ReorderPageControl: React.FC<{
  onMovePage: (dir: -1 | 1) => void;
  pageOpBusy?: boolean;
  canMoveEarlier?: boolean;
  canMoveLater?: boolean;
  iconStyle: React.CSSProperties;
}> = ({
  onMovePage,
  pageOpBusy = false,
  canMoveEarlier = false,
  canMoveLater = false,
  iconStyle,
}) => {
  // Match the surrounding header tool buttons' tap target (min(8px, 2cqmin)
  // padding around a min(16px, 4cqmin) icon) so this control is no harder
  // to hit than the Add/Delete/Present buttons next to it. The disabled
  // treatment adds a grayscale + lower opacity than the standard 0.4 so it
  // still reads as disabled against the slate-100 grouping chip background.
  const btnClass =
    'flex items-center justify-center rounded-lg text-slate-700 hover:bg-white disabled:opacity-30 disabled:grayscale disabled:hover:bg-transparent transition-colors';
  const btnStyle: React.CSSProperties = { padding: 'min(8px, 2cqmin)' };
  return (
    <div
      role="group"
      aria-label="Reorder page"
      className="flex items-center rounded-xl bg-slate-100 border border-slate-200 shadow-sm"
      style={{ padding: 'min(2px, 0.5cqmin)', gap: 'min(2px, 0.5cqmin)' }}
    >
      <button
        type="button"
        onClick={() => onMovePage(-1)}
        disabled={pageOpBusy || !canMoveEarlier}
        className={btnClass}
        style={btnStyle}
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
        className={btnClass}
        style={btnStyle}
        title="Move this page later in the notebook"
        aria-label="Move page later"
      >
        <ArrowRightToLine style={iconStyle} />
      </button>
    </div>
  );
};
