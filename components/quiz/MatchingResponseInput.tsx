/**
 * Student-facing matching question input. Shows terms with drop zones on the
 * left and a shuffled word bank below. Students drag definitions into zones
 * (or tap-to-place on touch devices), then submit through the parent's
 * SUBMIT button. Builds the legacy `term:def|term:def` wire format on
 * every change so grading on the teacher side is unchanged.
 *
 * The bank includes both real definitions and any `matchingDistractors`,
 * shuffled together so the teacher's distractors are indistinguishable from
 * real answers.
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
import { useResetOnChange } from '@/hooks/useResetOnChange';

interface MatchingResponseInputProps {
  question: QuizPublicQuestion;
  savedAnswer: string | null;
  onChange: (answer: string) => void;
  disabled?: boolean;
}

const BANK_ID = '__bank__';

/** Fisher-Yates shuffle (returns a new array). */
function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

interface DraggableChipProps {
  id: string;
  label: string;
  selected: boolean;
  disabled?: boolean;
  onTap: () => void;
  /** Explicit accessible label so screen readers announce the chip's
   *  relationship (e.g., "Paris, matched to France") instead of just the
   *  visible text, which loses pairing context when the chip is placed.
   */
  ariaLabel?: string;
}

const DraggableChip: React.FC<DraggableChipProps> = ({
  id,
  label,
  selected,
  disabled,
  onTap,
  ariaLabel,
}) => {
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

interface DropZoneProps {
  id: string;
  filledLabel: string | null;
  selectedChipId: string | null;
  onTap: () => void;
  onChipTap: () => void;
  disabled?: boolean;
  /** Term this zone belongs to — used to build the empty-state aria-label
   *  ("Drop zone for France") so screen readers can identify the target.
   */
  termLabel?: string;
}

const DropZone: React.FC<DropZoneProps> = ({
  id,
  filledLabel,
  selectedChipId,
  onTap,
  onChipTap,
  disabled,
  termLabel,
}) => {
  const { isOver, setNodeRef } = useDroppable({ id, disabled });
  const ariaLabel = filledLabel
    ? `${filledLabel}, matched to ${termLabel ?? ''}`.trim()
    : `Drop zone for ${termLabel ?? 'this term'}`;
  return (
    <button
      type="button"
      ref={setNodeRef}
      onClick={(e) => {
        e.preventDefault();
        if (disabled) return;
        if (filledLabel && !selectedChipId) {
          onChipTap();
        } else {
          onTap();
        }
      }}
      aria-label={ariaLabel}
      className={`flex-1 min-h-[44px] px-3 py-2 rounded-xl text-sm font-bold border-2 border-dashed transition-colors text-left ${
        isOver
          ? 'border-violet-400 bg-violet-500/20 text-white'
          : filledLabel
            ? 'border-violet-500/40 bg-violet-500/10 text-white border-solid'
            : 'border-slate-600 bg-slate-800/40 text-slate-500'
      } ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
    >
      {filledLabel ?? 'Drop here'}
    </button>
  );
};

export const MatchingResponseInput: React.FC<MatchingResponseInputProps> = ({
  question,
  savedAnswer,
  onChange,
  disabled,
}) => {
  const terms = React.useMemo<string[]>(
    () => question.matchingLeft ?? [],
    [question.matchingLeft]
  );
  const allOptions = React.useMemo<string[]>(
    () => question.matchingRight ?? [],
    [question.matchingRight]
  );

  // ─── Initial state ────────────────────────────────────────────────────────
  // Map term -> placed option index (into allOptions). null = empty zone.
  // Each option index appears in at most one zone OR in the bank — never
  // both at once. Bank order is shuffled per attempt (re-shuffles on
  // remount via QuizStudentApp's `key={question.id}`).
  const [placements, bankOrder] = React.useMemo(() => {
    const initialPlacements: Record<string, number | null> = {};
    terms.forEach((t) => {
      initialPlacements[t] = null;
    });

    if (savedAnswer) {
      // Hydrate placements from savedAnswer ("term:def|term:def"). Match
      // each pair's right side against allOptions to find the option index.
      // First-match wins (ties broken by lower index) so the same definition
      // string appearing in multiple terms still hydrates deterministically.
      const used = new Set<number>();
      for (const pair of savedAnswer.split('|')) {
        const sep = pair.indexOf(':');
        if (sep < 0) continue;
        const term = pair.slice(0, sep);
        const def = pair.slice(sep + 1);
        if (!(term in initialPlacements)) continue;
        const idx = allOptions.findIndex(
          (opt, i) => opt === def && !used.has(i)
        );
        if (idx >= 0) {
          initialPlacements[term] = idx;
          used.add(idx);
        }
      }
    }

    // Bank starts as every option index NOT placed in a zone, shuffled.
    const placedIndices = new Set(
      Object.values(initialPlacements).filter((v): v is number => v !== null)
    );
    const remaining: number[] = [];
    for (let i = 0; i < allOptions.length; i++) {
      if (!placedIndices.has(i)) remaining.push(i);
    }
    return [initialPlacements, shuffle(remaining)];
    // question.id forces a fresh shuffle when navigating to a new question
    // even if matchingLeft/matchingRight are referentially identical.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id, terms, allOptions, savedAnswer]);

  const [zonePlacements, setZonePlacements] = React.useState(placements);
  const [bankItems, setBankItems] = React.useState<number[]>(bankOrder);
  const [selectedSource, setSelectedSource] = React.useState<
    | { kind: 'bank'; optionIndex: number }
    | { kind: 'zone'; term: string; optionIndex: number }
    | null
  >(null);

  useResetOnChange(question.id, () => {
    setZonePlacements(placements);
    setBankItems(bankOrder);
    setSelectedSource(null);
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // ─── Emit serialized answer on placement changes ─────────────────────────
  const emit = React.useCallback(
    (zones: Record<string, number | null>) => {
      const answer = terms
        .map((t) => {
          const idx = zones[t];
          const def = idx !== null && idx !== undefined ? allOptions[idx] : '';
          return `${t}:${def}`;
        })
        .join('|');
      onChange(answer);
    },
    [terms, allOptions, onChange]
  );

  // ─── Move helpers ────────────────────────────────────────────────────────
  /**
   * Place an option (by index) into a zone. Source can be the bank or
   * another zone. Anything currently in the target zone is bounced back
   * to the bank — order preserved for the bank items already there, with
   * the bounced item appended at the end (most recently freed).
   *
   * Computes both `next` placements and `nextBank` from current state in
   * one synchronous pass, then issues the state setters and `emit()` —
   * never inside a setState updater (React purity contract; updaters get
   * invoked twice in StrictMode).
   */
  const placeInZone = (
    optionIndex: number,
    targetTerm: string,
    source: 'bank' | { fromTerm: string }
  ) => {
    const next = { ...zonePlacements };
    const displaced = next[targetTerm];
    next[targetTerm] = optionIndex;
    if (source !== 'bank') {
      next[source.fromTerm] = null;
    }
    let nextBank = bankItems;
    if (source === 'bank') {
      nextBank = nextBank.filter((i) => i !== optionIndex);
    }
    if (displaced !== null && displaced !== undefined) {
      nextBank = [...nextBank, displaced];
    }
    setZonePlacements(next);
    setBankItems(nextBank);
    setSelectedSource(null);
    emit(next);
  };

  /** Return a placed option from a zone back to the bank. */
  const returnToBank = (term: string) => {
    const idx = zonePlacements[term];
    if (idx === null || idx === undefined) return;
    const next = { ...zonePlacements, [term]: null };
    const nextBank = [...bankItems, idx];
    setZonePlacements(next);
    setBankItems(nextBank);
    setSelectedSource(null);
    emit(next);
  };

  const reset = () => {
    const blank: Record<string, number | null> = {};
    terms.forEach((t) => {
      blank[t] = null;
    });
    setZonePlacements(blank);
    setBankItems(shuffle(allOptions.map((_, i) => i)));
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

    // Active id encodes source: "bank-<idx>" or "zone-<term>"
    if (activeId.startsWith('bank-')) {
      const optionIndex = Number(activeId.slice('bank-'.length));
      if (overId.startsWith('zone-')) {
        const term = overId.slice('zone-'.length);
        placeInZone(optionIndex, term, 'bank');
      }
      // Drop on bank (or anywhere else) is a no-op.
    } else if (activeId.startsWith('zone-')) {
      const fromTerm = activeId.slice('zone-'.length);
      const optionIndex = zonePlacements[fromTerm];
      if (optionIndex === null || optionIndex === undefined) return;
      if (overId === BANK_ID) {
        returnToBank(fromTerm);
      } else if (overId.startsWith('zone-')) {
        const targetTerm = overId.slice('zone-'.length);
        if (targetTerm === fromTerm) return;
        placeInZone(optionIndex, targetTerm, { fromTerm });
      }
    }
  };

  // ─── Tap-to-place handlers ────────────────────────────────────────────────
  const handleBankChipTap = (optionIndex: number) => {
    if (disabled) return;
    if (
      selectedSource?.kind === 'bank' &&
      selectedSource.optionIndex === optionIndex
    ) {
      setSelectedSource(null);
      return;
    }
    setSelectedSource({ kind: 'bank', optionIndex });
  };

  const handleZoneTap = (term: string) => {
    if (disabled || !selectedSource) return;
    if (selectedSource.kind === 'bank') {
      placeInZone(selectedSource.optionIndex, term, 'bank');
    } else if (selectedSource.kind === 'zone') {
      if (selectedSource.term === term) return;
      placeInZone(selectedSource.optionIndex, term, {
        fromTerm: selectedSource.term,
      });
    }
  };

  const handleZoneChipTap = (term: string) => {
    if (disabled) return;
    const optionIndex = zonePlacements[term];
    if (optionIndex === null || optionIndex === undefined) return;
    // Toggle selection on the placed chip (long-press alternative would be
    // a drag back to the bank — supported via dnd-kit too).
    if (selectedSource?.kind === 'zone' && selectedSource.term === term) {
      // Already selected → tap again to send back to bank.
      returnToBank(term);
      return;
    }
    setSelectedSource({ kind: 'zone', term, optionIndex });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rectIntersection}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-4">
        {/* Term + zone rows */}
        <div className="space-y-2">
          {terms.map((term) => {
            const placedIdx = zonePlacements[term];
            const placedLabel =
              placedIdx !== null && placedIdx !== undefined
                ? allOptions[placedIdx]
                : null;
            const placedSelected =
              selectedSource?.kind === 'zone' && selectedSource.term === term;
            return (
              <div key={term} className="flex items-center gap-3">
                <span
                  className="text-sm text-slate-200 font-bold w-1/2 break-words"
                  title={term}
                >
                  {term}
                </span>
                {placedLabel ? (
                  <DraggableChip
                    id={`zone-${term}`}
                    label={placedLabel}
                    selected={placedSelected}
                    disabled={disabled}
                    onTap={() => handleZoneChipTap(term)}
                    ariaLabel={`${placedLabel}, matched to ${term}`}
                  />
                ) : (
                  <DropZone
                    id={`zone-${term}`}
                    filledLabel={null}
                    selectedChipId={null}
                    onTap={() => handleZoneTap(term)}
                    onChipTap={() => handleZoneChipTap(term)}
                    disabled={disabled}
                    termLabel={term}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Word bank */}
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
                All options placed.
              </span>
            )}
            {bankItems.map((optionIndex) => {
              const selected =
                selectedSource?.kind === 'bank' &&
                selectedSource.optionIndex === optionIndex;
              return (
                <DraggableChip
                  key={optionIndex}
                  id={`bank-${optionIndex}`}
                  label={allOptions[optionIndex]}
                  selected={selected}
                  disabled={disabled}
                  onTap={() => handleBankChipTap(optionIndex)}
                  ariaLabel={`${allOptions[optionIndex]}, in word bank`}
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
