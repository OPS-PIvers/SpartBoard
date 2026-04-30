/**
 * PeriodSelector — popout checkbox list for selecting class periods on
 * an assignment.
 *
 * Extracted from `QuizPeriodSelector`. The Quiz version derived locked
 * periods internally from a `responses` array; the shared primitive
 * takes `lockedPeriodNames` directly so callers can compute that from
 * whatever their widget's response shape is (Quiz → QuizResponse[],
 * Video Activity → VideoActivityResponse[], etc.). Everything else
 * ports over unchanged.
 */

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { X, Check } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
import type { PeriodSelectorProps } from './types';

export const PeriodSelector: React.FC<PeriodSelectorProps> = ({
  rosters,
  selectedPeriodNames,
  lockedPeriodNames = [],
  onSave,
  onClose,
}) => {
  const [selected, setSelected] = useState<string[]>(selectedPeriodNames);
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useClickOutside(ref, onClose);

  // Dismiss on Escape so the popover behaves like a real dialog.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const lockedSet = new Set(lockedPeriodNames);

  const handleToggle = (name: string) => {
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  // Save is disabled when nothing is selected: a zero-period selection
  // would silently filter the consuming view to empty without giving the
  // user any signal as to why.
  const canSave = selected.length > 0;
  const handleSave = useCallback(() => {
    if (!canSave) return;
    onSave(selected);
    onClose();
  }, [canSave, selected, onSave, onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className="absolute z-50 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150"
      style={{
        width: 'min(240px, 60cqmin)',
        right: 0,
        top: '100%',
        marginTop: 4,
      }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
        <span
          id={titleId}
          className="text-xs font-bold text-slate-500 uppercase tracking-widest"
        >
          Class Periods
        </span>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600"
          aria-label="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="p-2 space-y-0.5 max-h-48 overflow-y-auto">
        {rosters.map((r) => {
          const checked = selected.includes(r.name);
          const locked = lockedSet.has(r.name);
          return (
            <label
              key={r.id}
              className={`flex items-center gap-2 rounded px-2 py-1.5 transition-colors ${
                locked
                  ? 'cursor-not-allowed opacity-70'
                  : 'cursor-pointer hover:bg-slate-50'
              }`}
              title={
                locked
                  ? 'Students have already joined from this class'
                  : undefined
              }
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={locked && checked}
                onChange={() => handleToggle(r.name)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
              />
              <span className="text-sm text-slate-800 flex-1">{r.name}</span>
              {locked && (
                <span className="text-xxs text-amber-600 font-medium">
                  Locked
                </span>
              )}
            </label>
          );
        })}
        {rosters.length === 0 && (
          <p className="text-xs text-slate-400 italic px-2 py-2">
            No rosters available. Add rosters in the Class widget.
          </p>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2">
        {!canSave ? (
          <span className="text-xxs text-rose-500 font-medium">
            Select at least one period
          </span>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="text-xs font-medium text-slate-500 hover:text-slate-700 px-2 py-1 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="flex items-center gap-1 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check className="w-3 h-3" />
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
