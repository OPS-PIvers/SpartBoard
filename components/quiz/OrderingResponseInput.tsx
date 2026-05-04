/**
 * Student-facing ordering question input. Numbered drop zones (1, 2, 3, …)
 * stack vertically; below them a word bank holds unplaced items in a
 * per-attempt unique shuffle. Students drag (or tap-to-place) items into
 * the slots, rearrange between zones, or send items back to the bank.
 *
 * Builds the legacy pipe-joined wire format on every change so the
 * teacher's `gradeAnswer()` continues to work.
 */

import React from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  rectIntersection,
  useDroppable,
  useDraggable,
  type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { RotateCcw } from 'lucide-react';
import type { QuizPublicQuestion } from '@/types';

interface OrderingResponseInputProps {
  question: QuizPublicQuestion;
  savedAnswer: string | null;
  onChange: (answer: string) => void;
  disabled?: boolean;
}

const BANK_ID = '__bank__';

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const DraggableChip: React.FC<{
  id: string;
  label: string;
  selected: boolean;
  disabled?: boolean;
  onTap: () => void;
  ariaLabel?: string;
}> = ({ id, label, selected, disabled, onTap, ariaLabel }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id, disabled });
  const style: React.CSSProperties = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : {};
  return (
    <button
      type="button"
      ref={setNodeRef}
      onClick={(e) => {
        e.preventDefault();
        if (!disabled) onTap();
      }}
      style={style}
      className={`min-h-[44px] px-3 py-2 rounded-xl text-sm font-bold border-2 select-none touch-none transition-colors ${
        isDragging
          ? 'opacity-40'
          : selected
            ? 'bg-violet-500 border-violet-400 text-white shadow-lg ring-2 ring-violet-300'
            : 'bg-slate-700 border-slate-600 text-white hover:bg-slate-600 hover:border-violet-500/60'
      } ${disabled ? 'cursor-default opacity-60' : 'cursor-grab active:cursor-grabbing'}`}
      {...listeners}
      {...attributes}
      aria-pressed={selected}
      aria-label={ariaLabel ?? label}
      title={label}
    >
      {label}
    </button>
  );
};

const Slot: React.FC<{
  id: string;
  index: number;
  filledLabel: string | null;
  selectedHere: boolean;
  onTapEmpty: () => void;
  onChipTap: () => void;
  onMove: (dir: 'up' | 'down') => void;
  upDisabled: boolean;
  downDisabled: boolean;
  disabled?: boolean;
}> = ({
  id,
  index,
  filledLabel,
  selectedHere,
  onTapEmpty,
  onChipTap,
  onMove,
  upDisabled,
  downDisabled,
  disabled,
}) => {
  const { isOver, setNodeRef } = useDroppable({ id, disabled });
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({
    id: `slot-${index}`,
    disabled: (disabled ?? false) || filledLabel === null,
  });
  const dragStyle: React.CSSProperties = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : {};
  const slotPosition = `position ${index + 1}`;
  return (
    <div ref={setNodeRef} className="flex items-center gap-2">
      <span className="text-violet-400 font-black text-sm w-6 shrink-0 text-center">
        {index + 1}.
      </span>
      {filledLabel ? (
        <button
          type="button"
          ref={setDragRef}
          onClick={(e) => {
            e.preventDefault();
            if (!disabled) onChipTap();
          }}
          style={dragStyle}
          title={filledLabel}
          className={`flex-1 min-h-[44px] px-3 py-2 rounded-xl text-sm font-bold border-2 transition-colors text-left select-none touch-none ${
            isDragging
              ? 'opacity-40'
              : selectedHere
                ? 'bg-violet-500 border-violet-400 text-white shadow-lg ring-2 ring-violet-300'
                : 'bg-slate-700 border-slate-600 text-white hover:bg-slate-600 hover:border-violet-500/60'
          } ${disabled ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
          {...listeners}
          {...attributes}
          aria-label={`${filledLabel}, ${slotPosition}`}
          aria-pressed={selectedHere}
        >
          {filledLabel}
        </button>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            if (!disabled) onTapEmpty();
          }}
          aria-label={`Empty drop zone, ${slotPosition}`}
          className={`flex-1 min-h-[44px] px-3 py-2 rounded-xl text-sm font-bold border-2 border-dashed transition-colors text-left ${
            isOver
              ? 'border-violet-400 bg-violet-500/20 text-white'
              : 'border-slate-600 bg-slate-800/40 text-slate-500'
          } ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
        >
          Drop here
        </button>
      )}
      <div className="flex flex-col">
        <button
          type="button"
          onClick={() => onMove('up')}
          disabled={(disabled ?? false) || upDisabled || !filledLabel}
          className="min-w-[32px] min-h-[22px] p-1 text-slate-400 hover:text-white disabled:opacity-20 transition-colors"
          aria-label={`Move ${slotPosition} up`}
        >
          ▲
        </button>
        <button
          type="button"
          onClick={() => onMove('down')}
          disabled={(disabled ?? false) || downDisabled || !filledLabel}
          className="min-w-[32px] min-h-[22px] p-1 text-slate-400 hover:text-white disabled:opacity-20 transition-colors"
          aria-label={`Move ${slotPosition} down`}
        >
          ▼
        </button>
      </div>
    </div>
  );
};

export const OrderingResponseInput: React.FC<OrderingResponseInputProps> = ({
  question,
  savedAnswer,
  onChange,
  disabled,
}) => {
  const items = React.useMemo<string[]>(
    () => question.orderingItems ?? [],
    [question.orderingItems]
  );

  // Slot state: each slot holds either an item index (into `items`) or null.
  // Bank holds the rest, in shuffled order. Per-attempt re-shuffle on
  // remount via `key={question.id}` in QuizStudentApp.
  const [initialSlots, initialBank] = React.useMemo(() => {
    const slots: (number | null)[] = items.map(() => null);
    const used = new Set<number>();
    if (savedAnswer) {
      const parts = savedAnswer.split('|');
      for (let i = 0; i < parts.length && i < items.length; i++) {
        const idx = items.findIndex(
          (item, j) => item === parts[i] && !used.has(j)
        );
        if (idx >= 0) {
          slots[i] = idx;
          used.add(idx);
        }
      }
    }
    const bank: number[] = [];
    for (let i = 0; i < items.length; i++) {
      if (!used.has(i)) bank.push(i);
    }
    return [slots, shuffle(bank)];
  }, [items, savedAnswer]);

  const [slots, setSlots] = React.useState<(number | null)[]>(initialSlots);
  const [bankItems, setBankItems] = React.useState<number[]>(initialBank);
  const [selectedSource, setSelectedSource] = React.useState<
    | { kind: 'bank'; itemIndex: number }
    | { kind: 'slot'; slotIndex: number; itemIndex: number }
    | null
  >(null);

  const [prevQuestionId, setPrevQuestionId] = React.useState(question.id);
  if (question.id !== prevQuestionId) {
    setPrevQuestionId(question.id);
    setSlots(initialSlots);
    setBankItems(initialBank);
    setSelectedSource(null);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const emit = React.useCallback(
    (next: (number | null)[]) => {
      const answer = next
        .map((idx) => (idx !== null && idx !== undefined ? items[idx] : ''))
        .join('|');
      onChange(answer);
    },
    [items, onChange]
  );

  // ─── Mutation helpers ─────────────────────────────────────────────────────
  /** Place an item into a slot. Source = bank or another slot. */
  // Compute next state outside the setState updater (React purity) so
  // emit/onChange isn't invoked twice in StrictMode.
  const placeInSlot = (
    itemIndex: number,
    targetSlot: number,
    source: 'bank' | { fromSlot: number }
  ) => {
    const next = [...slots];
    const displaced = next[targetSlot];
    next[targetSlot] = itemIndex;
    if (source !== 'bank') {
      next[source.fromSlot] = null;
    }
    let nextBank = bankItems;
    if (source === 'bank') {
      nextBank = nextBank.filter((i) => i !== itemIndex);
    }
    if (displaced !== null && displaced !== undefined) {
      nextBank = [...nextBank, displaced];
    }
    setSlots(next);
    setBankItems(nextBank);
    setSelectedSource(null);
    emit(next);
  };

  const returnToBank = (slotIndex: number) => {
    const idx = slots[slotIndex];
    if (idx === null || idx === undefined) return;
    const next = [...slots];
    next[slotIndex] = null;
    setSlots(next);
    setBankItems([...bankItems, idx]);
    setSelectedSource(null);
    emit(next);
  };

  const swapSlots = (slotIndex: number, dir: 'up' | 'down') => {
    const target = dir === 'up' ? slotIndex - 1 : slotIndex + 1;
    if (target < 0 || target >= slots.length) return;
    const next = [...slots];
    [next[slotIndex], next[target]] = [next[target], next[slotIndex]];
    setSlots(next);
    setSelectedSource(null);
    emit(next);
  };

  const reset = () => {
    const blank = items.map(() => null);
    setSlots(blank);
    setBankItems(shuffle(items.map((_, i) => i)));
    setSelectedSource(null);
    emit(blank);
  };

  // ─── Drag handlers ────────────────────────────────────────────────────────
  const handleDragEnd = (e: DragEndEvent) => {
    if (disabled) return;
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId.startsWith('bank-')) {
      const itemIndex = Number(activeId.slice('bank-'.length));
      if (overId.startsWith('slot-')) {
        const target = Number(overId.slice('slot-'.length));
        // Only allow drop on an empty target — slots that are full route
        // through their chip handle and are handled by the slot-drag branch.
        // If the target is full, swap the items: bank in, displaced to bank.
        placeInSlot(itemIndex, target, 'bank');
      }
    } else if (activeId.startsWith('slot-')) {
      const fromSlot = Number(activeId.slice('slot-'.length));
      const itemIndex = slots[fromSlot];
      if (itemIndex === null || itemIndex === undefined) return;
      if (overId === BANK_ID) {
        returnToBank(fromSlot);
      } else if (overId.startsWith('slot-')) {
        const targetSlot = Number(overId.slice('slot-'.length));
        if (targetSlot === fromSlot) return;
        placeInSlot(itemIndex, targetSlot, { fromSlot });
      }
    }
  };

  // ─── Tap-to-place handlers ────────────────────────────────────────────────
  const handleBankChipTap = (itemIndex: number) => {
    if (disabled) return;
    if (
      selectedSource?.kind === 'bank' &&
      selectedSource.itemIndex === itemIndex
    ) {
      setSelectedSource(null);
      return;
    }
    setSelectedSource({ kind: 'bank', itemIndex });
  };

  const handleEmptySlotTap = (slotIndex: number) => {
    if (disabled || !selectedSource) return;
    if (selectedSource.kind === 'bank') {
      placeInSlot(selectedSource.itemIndex, slotIndex, 'bank');
    } else {
      if (selectedSource.slotIndex === slotIndex) return;
      placeInSlot(selectedSource.itemIndex, slotIndex, {
        fromSlot: selectedSource.slotIndex,
      });
    }
  };

  const handleSlotChipTap = (slotIndex: number) => {
    if (disabled) return;
    const itemIndex = slots[slotIndex];
    if (itemIndex === null || itemIndex === undefined) return;
    if (
      selectedSource?.kind === 'slot' &&
      selectedSource.slotIndex === slotIndex
    ) {
      // Tap a selected slot chip again → return to bank.
      returnToBank(slotIndex);
      return;
    }
    setSelectedSource({ kind: 'slot', slotIndex, itemIndex });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rectIntersection}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          {slots.map((slot, i) => {
            const label =
              slot !== null && slot !== undefined ? items[slot] : null;
            const selectedHere =
              selectedSource?.kind === 'slot' && selectedSource.slotIndex === i;
            return (
              <Slot
                key={i}
                id={`slot-${i}`}
                index={i}
                filledLabel={label}
                selectedHere={selectedHere}
                onTapEmpty={() => handleEmptySlotTap(i)}
                onChipTap={() => handleSlotChipTap(i)}
                onMove={(dir) => swapSlots(i, dir)}
                upDisabled={i === 0}
                downDisabled={i === slots.length - 1}
                disabled={disabled}
              />
            );
          })}
        </div>

        <BankDropZone>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wider text-slate-400 font-bold">
              Word Bank
            </span>
            <button
              type="button"
              onClick={reset}
              disabled={disabled}
              className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-30"
              aria-label="Reset all placements"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          </div>
          <div className="flex flex-wrap gap-2 min-h-[48px]">
            {bankItems.length === 0 && (
              <span className="text-xs text-slate-500 italic px-2 py-1">
                All items placed.
              </span>
            )}
            {bankItems.map((itemIndex) => {
              const selected =
                selectedSource?.kind === 'bank' &&
                selectedSource.itemIndex === itemIndex;
              return (
                <DraggableChip
                  key={itemIndex}
                  id={`bank-${itemIndex}`}
                  label={items[itemIndex]}
                  selected={selected}
                  disabled={disabled}
                  onTap={() => handleBankChipTap(itemIndex)}
                  ariaLabel={`${items[itemIndex]}, in word bank`}
                />
              );
            })}
          </div>
        </BankDropZone>
      </div>
    </DndContext>
  );
};

const BankDropZone: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { isOver, setNodeRef } = useDroppable({ id: BANK_ID });
  return (
    <div
      ref={setNodeRef}
      className={`p-3 rounded-2xl border-2 border-dashed transition-colors ${
        isOver
          ? 'border-violet-400 bg-violet-500/10'
          : 'border-slate-700 bg-slate-900/40'
      }`}
    >
      {children}
    </div>
  );
};
