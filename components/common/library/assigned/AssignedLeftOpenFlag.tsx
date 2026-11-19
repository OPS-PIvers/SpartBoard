import React from 'react';
import { tourFieldAttr } from '@/config/tourAnchors';

export interface AssignedLeftOpenFlagProps {
  title: string;
  /** Null on a single-line assignment (D15). */
  classLabel: string | null;
  onClose: () => void;
  onLeaveOpen: () => void;
  busy?: boolean;
  tourIndex: number;
  tourWidgetType: string;
}

const BTN =
  'whitespace-nowrap rounded-lg font-bold transition-colors active:scale-95 disabled:cursor-not-allowed disabled:opacity-50';
const BTN_STYLE: React.CSSProperties = {
  paddingInline: 'min(12px, 2.6cqmin)',
  paddingBlock: 'min(7px, 1.6cqmin)',
  fontSize: 'min(12px, 3.5cqmin)',
};

/** D11: a class still open after its period, pinned above Active with Close and Leave open. */
export const AssignedLeftOpenFlag: React.FC<AssignedLeftOpenFlagProps> = ({
  title,
  classLabel,
  onClose,
  onLeaveOpen,
  busy,
  tourIndex,
  tourWidgetType,
}) => (
  <div
    role="group"
    aria-label={classLabel ? `${title}, ${classLabel}` : title}
    aria-busy={busy ? true : undefined}
    className="flex flex-wrap items-center rounded-lg border border-amber-200 bg-amber-50 text-amber-900"
    style={{
      gap: 'min(8px, 1.8cqmin) min(12px, 2.6cqmin)',
      padding: 'min(8px, 1.8cqmin) min(10px, 2.2cqmin)',
      marginTop: 'min(6px, 1.4cqmin)',
    }}
  >
    <span
      className="min-w-0 flex-1 font-semibold [overflow-wrap:anywhere]"
      style={{
        fontSize: 'min(13px, 3.8cqmin)',
        flexBasis: 'min(220px, 50cqw)',
      }}
    >
      {classLabel
        ? `${title} is still open for ${classLabel}.`
        : `${title} is still open.`}
    </span>
    <div
      className="flex shrink-0 items-center"
      style={{ gap: 'min(6px, 1.4cqmin)' }}
    >
      <button
        type="button"
        disabled={busy}
        onClick={onClose}
        {...tourFieldAttr(
          'library-shell.assigned-left-open-close',
          tourWidgetType,
          `row-${tourIndex + 1}`
        )}
        className={`${BTN} bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50`}
        style={BTN_STYLE}
      >
        {classLabel ? `Close ${classLabel}` : 'Close'}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onLeaveOpen}
        {...tourFieldAttr(
          'library-shell.assigned-left-open-leave',
          tourWidgetType,
          `row-${tourIndex + 1}`
        )}
        className={`${BTN} text-amber-900 hover:bg-amber-100`}
        style={BTN_STYLE}
      >
        Leave open
      </button>
    </div>
  </div>
);
