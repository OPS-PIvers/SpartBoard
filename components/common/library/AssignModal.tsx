/**
 * AssignModal — shared chrome for widget "Assign" flows.
 *
 * Renders a modal with:
 *   - Header containing the item title being assigned.
 *   - Optional mode selector (radio-card layout) when `modes` is provided.
 *   - Optional assignment-name text input (when `onAssignmentNameChange`
 *     is provided).
 *   - `extraSlot` body region for widget-specific toggles/inputs.
 *   - `plcSlot` rendered below `extraSlot` for PLC / period selection.
 *   - Footer with Cancel + Assign buttons.
 *
 * The primitive is presentational — it owns no widget-specific state.
 * Widgets pass their options shape through the `options` generic; the
 * modal echoes them back on confirm via `onAssign`.
 *
 * `onAssign` is async — the confirm button stays disabled while the
 * returned promise is in-flight so callers don't need to manage a
 * spinner themselves.
 */

import React, { useCallback, useState } from 'react';
import { Loader2, Rocket } from 'lucide-react';
import { Modal } from '../Modal';
import type { AssignModalProps, AssignModeOption } from './types';

const MODAL_LABEL_ID = 'assign-modal-title';

export function AssignModal<TOptions>({
  isOpen,
  onClose,
  itemTitle,
  modes,
  selectedMode,
  onModeChange,
  options,
  extraSlot,
  plcSlot,
  assignmentName,
  onAssignmentNameChange,
  onAssign,
  confirmLabel = 'Assign',
  confirmDisabled = false,
  confirmDisabledReason,
}: AssignModalProps<TOptions>): React.ReactElement | null {
  const [submitting, setSubmitting] = useState(false);

  const handleAssign = useCallback(async () => {
    if (submitting || confirmDisabled) return;
    setSubmitting(true);
    try {
      await onAssign({
        mode: selectedMode,
        options,
        assignmentName,
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    submitting,
    confirmDisabled,
    onAssign,
    selectedMode,
    options,
    assignmentName,
  ]);

  const confirmButtonDisabled = confirmDisabled || submitting;

  const customHeader = (
    <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200 shrink-0">
      <div className="min-w-0">
        <p className="text-xxs font-bold text-brand-blue-primary/60 uppercase tracking-widest">
          Assign
        </p>
        <h3
          id={MODAL_LABEL_ID}
          className="font-black text-lg text-slate-800 truncate"
        >
          {itemTitle}
        </h3>
      </div>
      <button
        type="button"
        onClick={onClose}
        disabled={submitting}
        className="text-sm font-bold text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Close"
      >
        Cancel
      </button>
    </div>
  );

  const footer = (
    <div className="flex items-center justify-end gap-2 px-6 py-3">
      <button
        type="button"
        onClick={onClose}
        disabled={submitting}
        className="px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={() => void handleAssign()}
        disabled={confirmButtonDisabled}
        title={
          confirmDisabled && confirmDisabledReason
            ? confirmDisabledReason
            : undefined
        }
        className="inline-flex items-center gap-1.5 px-5 py-2 bg-brand-blue-primary hover:bg-brand-blue-dark text-white text-sm font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        ) : (
          <Rocket className="w-4 h-4" aria-hidden="true" />
        )}
        {confirmLabel}
      </button>
    </div>
  );

  const hasModes = Array.isArray(modes) && modes.length > 0;
  const hasName =
    typeof assignmentName === 'string' && !!onAssignmentNameChange;

  return (
    <Modal
      isOpen={isOpen}
      onClose={submitting ? () => undefined : onClose}
      customHeader={customHeader}
      footer={footer}
      footerClassName="shrink-0 border-t border-slate-200 bg-white"
      maxWidth="max-w-lg"
      className="bg-white rounded-2xl shadow-2xl"
      contentClassName="px-6 py-5 space-y-5"
      ariaLabelledby={MODAL_LABEL_ID}
    >
      {hasName && (
        <div>
          <label
            htmlFor="assign-modal-assignment-name"
            className="block text-xxs font-bold text-slate-400 uppercase tracking-widest mb-1"
          >
            Assignment Name
          </label>
          <input
            id="assign-modal-assignment-name"
            type="text"
            value={assignmentName ?? ''}
            onChange={(e) => onAssignmentNameChange?.(e.target.value)}
            placeholder="e.g. Period 2"
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
          />
          <p className="text-xxs text-slate-400 mt-1">
            Shown in the archive to distinguish assignments.
          </p>
        </div>
      )}

      {hasModes && (
        <div className="space-y-3">
          <p className="text-xxs font-bold text-brand-blue-primary/60 uppercase tracking-widest">
            Session Mode
          </p>
          <div className="grid gap-2">
            {modes.map((mode) => (
              <ModeCard
                key={mode.id}
                mode={mode}
                selected={mode.id === selectedMode}
                onSelect={() => onModeChange?.(mode.id)}
              />
            ))}
          </div>
        </div>
      )}

      {extraSlot !== undefined && extraSlot !== null && (
        <div className="space-y-3">{extraSlot}</div>
      )}

      {plcSlot !== undefined && plcSlot !== null && (
        <div className="space-y-3">{plcSlot}</div>
      )}
    </Modal>
  );
}

interface ModeCardProps {
  mode: AssignModeOption;
  selected: boolean;
  onSelect: () => void;
}

const ModeCard: React.FC<ModeCardProps> = ({ mode, selected, onSelect }) => {
  const Icon = mode.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={mode.disabled}
      aria-pressed={selected}
      className={`w-full text-left p-3 rounded-xl border-2 transition-all flex items-start gap-3 group ${
        selected
          ? 'border-brand-blue-primary bg-brand-blue-lighter/30'
          : 'border-slate-200 hover:border-brand-blue-primary hover:bg-brand-blue-lighter/20'
      } ${mode.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {Icon && (
        <div
          className={`p-2 rounded-lg transition-colors shrink-0 ${
            selected
              ? 'bg-brand-blue-primary text-white'
              : 'bg-slate-100 text-brand-blue-primary'
          }`}
        >
          <Icon size={18} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-black text-sm text-slate-800 leading-tight">
          {mode.label}
        </p>
        <p className="text-xs text-slate-500 mt-0.5 leading-snug">
          {mode.description}
        </p>
      </div>
    </button>
  );
};
