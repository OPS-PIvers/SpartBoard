import React from 'react';
import { Check, Minus } from 'lucide-react';
import {
  tourFieldAttr,
  tourTypeAttr,
  type TourAnchorAttrs,
} from '@/config/tourAnchors';
import type { AssignedBulkAction } from './assignedBulkContext';

const BOX = { width: 'min(20px, 5.5cqmin)', height: 'min(20px, 5.5cqmin)' };
const MARK = { width: 'min(14px, 4cqmin)', height: 'min(14px, 4cqmin)' };

/** The square checkbox used by Assigned rows and the select-all box. */
export const AssignedCheckbox: React.FC<{
  state: 'on' | 'off' | 'some';
  onToggle: () => void;
  label: string;
  anchor?: TourAnchorAttrs;
}> = ({ state, onToggle, label, anchor }) => (
  <button
    type="button"
    role="checkbox"
    aria-checked={state === 'some' ? 'mixed' : state === 'on'}
    aria-label={label}
    onClick={(e) => {
      e.stopPropagation();
      onToggle();
    }}
    {...anchor}
    className={`touch-target-expand relative flex shrink-0 items-center justify-center rounded-md border-2 transition-colors [-webkit-tap-highlight-color:transparent] ${
      state === 'off'
        ? 'border-slate-300 bg-white hover:border-brand-blue-primary/70'
        : 'border-brand-blue-primary bg-brand-blue-primary text-white'
    }`}
    style={BOX}
  >
    {state === 'on' && <Check style={MARK} strokeWidth={3} />}
    {state === 'some' && <Minus style={MARK} strokeWidth={3} />}
  </button>
);

/** The selection bar: select-all box, count, actions and Cancel. */
export const AssignedBulkBar: React.FC<{
  count: number;
  allState: 'on' | 'off' | 'some';
  onAll: () => void;
  actions: AssignedBulkAction[];
  busy: boolean;
  onRun: (action: AssignedBulkAction) => void;
  onCancel: () => void;
  tourWidgetType: string;
}> = ({
  count,
  allState,
  onAll,
  actions,
  busy,
  onRun,
  onCancel,
  tourWidgetType,
}) => (
  <div
    role="region"
    aria-label="Selected assignments"
    className="sticky z-10 flex flex-wrap items-center border-b border-slate-200 bg-white"
    // Sits over the scroller's own padding so no row shows past the bar.
    style={{
      top: 'calc(-1 * min(14px, 3cqmin))',
      gap: 'min(8px, 2cqmin)',
      padding: 'min(8px, 2cqmin) min(6px, 1.4cqmin)',
    }}
  >
    <AssignedCheckbox
      state={allState}
      onToggle={onAll}
      label={allState === 'on' ? 'Clear selection' : 'Select all'}
      anchor={tourTypeAttr('library-shell.assigned-select-all', tourWidgetType)}
    />
    <span
      className="font-bold text-brand-blue-dark tabular-nums"
      style={{ fontSize: 'min(13px, 3.8cqmin)' }}
      aria-live="polite"
    >
      {count} selected
    </span>
    <button
      type="button"
      onClick={onCancel}
      disabled={busy}
      {...tourTypeAttr('library-shell.assigned-select-cancel', tourWidgetType)}
      className="whitespace-nowrap rounded-lg font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
      style={{
        paddingInline: 'min(10px, 2.4cqmin)',
        paddingBlock: 'min(6px, 1.4cqmin)',
        fontSize: 'min(12px, 3.5cqmin)',
      }}
    >
      Cancel
    </button>
    <div
      className="ml-auto flex flex-wrap items-center"
      style={{ gap: 'min(6px, 1.4cqmin)' }}
    >
      {actions.map((a) => {
        const Icon = a.icon;
        return (
          <button
            key={a.id}
            type="button"
            disabled={busy || count === 0}
            onClick={() => onRun(a)}
            {...tourFieldAttr(
              'library-shell.assigned-bulk-action',
              tourWidgetType,
              a.id
            )}
            className={`inline-flex items-center whitespace-nowrap rounded-lg bg-white font-bold ring-1 ring-inset transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              a.destructive
                ? 'text-brand-red ring-brand-red/30 hover:bg-red-50'
                : 'text-brand-blue-dark ring-slate-300 hover:bg-slate-50'
            }`}
            style={{
              gap: 'min(6px, 1.4cqmin)',
              paddingInline: 'min(10px, 2.4cqmin)',
              paddingBlock: 'min(6px, 1.4cqmin)',
              fontSize: 'min(12px, 3.5cqmin)',
            }}
          >
            <Icon aria-hidden="true" style={MARK} />
            {a.label}
          </button>
        );
      })}
    </div>
  </div>
);
