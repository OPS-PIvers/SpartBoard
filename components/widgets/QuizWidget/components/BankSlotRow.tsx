import React, { useEffect, useState } from 'react';
import { GripVertical, Shuffle, Trash2 } from 'lucide-react';
import type { QuizBankSlot } from '@/types';
import {
  describeBankSlot,
  eligibleBankQuestions,
  type BankContent,
} from '@/utils/questionBanks';
import { findSlotSource, slotEligibleFromSource } from './bankSlotHelpers';
import { labelClass, inputClass } from './quizEditorFieldStyles';
import { BankTargetFilter } from './BankTargetFilter';
import type { QuizEditorBankApi } from './QuizEditorModal';

interface BankSlotRowProps {
  slot: QuizBankSlot;
  eligibleCount: number | null;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  dragHandleAttributes: React.HTMLAttributes<HTMLElement>;
  dragHandleListeners: Record<string, (event: Event) => void> | undefined;
}

const bankSlotRowPropsEqual = (
  prev: BankSlotRowProps,
  next: BankSlotRowProps
): boolean =>
  prev.slot === next.slot &&
  prev.eligibleCount === next.eligibleCount &&
  prev.isSelected === next.isSelected &&
  prev.onSelect === next.onSelect &&
  prev.onRemove === next.onRemove;

export const BankSlotRow = React.memo(function BankSlotRow({
  slot,
  eligibleCount,
  isSelected,
  onSelect,
  onRemove,
  dragHandleAttributes,
  dragHandleListeners,
}: BankSlotRowProps) {
  return (
    <div
      onClick={() => onSelect(slot.id)}
      className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg border bg-white cursor-pointer transition-all ${
        isSelected
          ? 'border-brand-blue-primary ring-2 ring-brand-blue-primary/15'
          : 'border-dashed border-slate-300 hover:border-slate-400'
      }`}
    >
      <button
        type="button"
        {...dragHandleAttributes}
        onPointerDown={
          dragHandleListeners?.onPointerDown as
            | React.PointerEventHandler<HTMLButtonElement>
            | undefined
        }
        onClick={(e) => e.stopPropagation()}
        aria-label="Drag to reorder"
        className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing touch-none p-0.5"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <span className="w-[13px] shrink-0" aria-hidden />
      <span className="text-slate-400 font-mono font-bold text-xs w-5 shrink-0 text-center">
        ×{slot.count ?? 0}
      </span>
      <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-xxs font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700">
        <Shuffle className="w-2.5 h-2.5" aria-hidden />
        Bank
      </span>
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-sm text-slate-700 truncate">
          {slot.bankTitle}
        </span>
        <span className="text-xxs text-slate-500 truncate">
          {describeBankSlot(slot, eligibleCount)}
        </span>
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(slot.id);
        }}
        aria-label="Remove bank slot"
        className="text-slate-300 hover:text-red-500 hover:bg-red-50 rounded p-1 transition-colors opacity-0 group-hover:opacity-100"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}, bankSlotRowPropsEqual);

// ─── Detail pane body for a selected slot ────────────────────────────────────

interface BankSlotDetailProps {
  slot: QuizBankSlot;
  bankApi?: QuizEditorBankApi;
  onUpdate: (id: string, patch: Partial<QuizBankSlot>) => void;
  onRemove: (id: string) => void;
}

type LoadState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; content: BankContent }
  | { status: 'error'; message: string };

export const BankSlotDetail: React.FC<BankSlotDetailProps> = ({
  slot,
  bankApi,
  onUpdate,
  onRemove,
}) => {
  const source = findSlotSource(bankApi?.sources, slot);
  const sourceKey = source?.key ?? null;
  const [load, setLoad] = useState<LoadState>({ status: 'idle' });

  // Bank content comes from Drive / Firestore: fetched once per source key.
  useEffect(() => {
    if (!bankApi || !source) return;
    let cancelled = false;
    setLoad({ status: 'loading' });
    bankApi
      .loadBankContent(source)
      .then((content) => {
        if (!cancelled) setLoad({ status: 'ready', content });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setLoad({
            status: 'error',
            message:
              err instanceof Error ? err.message : 'Could not load this bank.',
          });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);

  const content = load.status === 'ready' ? load.content : null;
  const eligible = content
    ? eligibleBankQuestions(content, slot.targetFilter).length
    : slotEligibleFromSource(source, slot);
  const count = slot.count ?? 0;
  const overdrawn = eligible != null && count > eligible;

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="text-xs uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1.5">
          <Shuffle className="w-3.5 h-3.5 text-indigo-500" aria-hidden />
          Random draw from a question bank
        </div>
        <h4 className="text-base font-bold text-slate-900 truncate mt-0.5">
          {slot.bankTitle}
        </h4>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 space-y-4">
        {!source && (
          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 font-semibold">
            This bank is no longer available. Remove the slot or re-add it from
            a bank you can still open.
          </div>
        )}
        {load.status === 'error' && (
          <div className="p-2.5 bg-brand-red-lighter/40 border border-brand-red-primary/20 rounded-lg text-xs text-brand-red-dark font-bold">
            {load.message}
          </div>
        )}

        <div>
          <label className={labelClass}>Bank</label>
          <input
            type="text"
            value={slot.bankTitle}
            readOnly
            aria-label="Bank title"
            className={`${inputClass} bg-slate-100 text-slate-600`}
          />
          {source?.kind === 'plc' && (
            <p className="mt-1 text-xs text-slate-600">
              Shared by {source.sharedByName ?? 'a PLC teammate'}
              {source.plcName ? ` · ${source.plcName}` : ''}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="bank-slot-count">
              Questions per attempt
            </label>
            <input
              id="bank-slot-count"
              type="number"
              min={1}
              max={eligible ?? undefined}
              value={count}
              onChange={(e) =>
                onUpdate(slot.id, {
                  count: Math.max(0, parseInt(e.target.value, 10) || 0),
                })
              }
              className={inputClass}
            />
            <p
              className={`mt-1 text-xs ${overdrawn || count < 1 ? 'text-brand-red-dark font-semibold' : 'text-slate-600'}`}
            >
              {load.status === 'loading'
                ? 'Counting eligible questions…'
                : eligible != null
                  ? `Draws ${count} of ${eligible} eligible`
                  : `Draws ${count}`}
            </p>
          </div>
          <div>
            <label className={labelClass} htmlFor="bank-slot-points">
              Points each
            </label>
            <input
              id="bank-slot-points"
              type="number"
              min={1}
              max={100}
              value={slot.points ?? 1}
              onChange={(e) =>
                onUpdate(slot.id, {
                  points: Math.min(
                    100,
                    Math.max(1, parseInt(e.target.value, 10) || 1)
                  ),
                })
              }
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Target filter</label>
          {content ? (
            <BankTargetFilter
              bank={content}
              value={slot.targetFilter ?? []}
              onChange={(next) =>
                onUpdate(slot.id, {
                  targetFilter: next.length > 0 ? next : undefined,
                })
              }
            />
          ) : (
            <p className="text-xs text-slate-500">
              {load.status === 'loading'
                ? 'Loading bank…'
                : slot.targetFilter?.length
                  ? `${slot.targetFilter.length} target${slot.targetFilter.length === 1 ? '' : 's'} selected.`
                  : 'Draws from every question in the bank.'}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => onRemove(slot.id)}
          className="flex items-center gap-1.5 px-3 py-2 border border-rose-200 rounded-lg text-xs font-bold text-rose-700 hover:bg-rose-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Remove slot
        </button>
      </div>
    </div>
  );
};
