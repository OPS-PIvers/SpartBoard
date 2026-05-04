/**
 * Structured row editors for Matching and Ordering quiz answer keys.
 *
 * Replaces the legacy single-text-input that asked teachers to type
 * `term:def|term:def` or `item|item|item` strings. Both editors serialize
 * back to the same wire format so old quizzes continue to grade and new
 * quizzes stay on the same Drive schema.
 */

import React from 'react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useResetOnChange } from '@/hooks/useResetOnChange';

// ─── Helpers ────────────────────────────────────────────────────────────────

interface PairRow {
  id: string;
  term: string;
  definition: string;
}

interface OrderRow {
  id: string;
  text: string;
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `row-${Math.random().toString(36).slice(2)}`;

/**
 * Strip wire-format delimiters from a teacher-typed field. The
 * `correctAnswer` schema is `term:def|term:def`, so any literal `|` or
 * (in a term) `:` would split a single field into two and corrupt grading.
 * Replaced silently with the closest unicode lookalike on each keystroke.
 */
const sanitizeTerm = (value: string): string =>
  value.replace(/\|/g, '｜').replace(/:/g, '：');
const sanitizeDefinition = (value: string): string =>
  value.replace(/\|/g, '｜');
const sanitizeOrderingItem = (value: string): string =>
  value.replace(/\|/g, '｜');

/**
 * Parse a matching `correctAnswer` string (`term1:def1|term2:def2`) into
 * editable rows. Empty / malformed input falls back to two blank rows so
 * the editor always has something to render.
 */
function parsePairs(correctAnswer: string): PairRow[] {
  if (!correctAnswer.trim()) {
    return [
      { id: newId(), term: '', definition: '' },
      { id: newId(), term: '', definition: '' },
    ];
  }
  const rows = correctAnswer.split('|').map((p) => {
    const sep = p.indexOf(':');
    if (sep < 0) return { id: newId(), term: p, definition: '' };
    return {
      id: newId(),
      term: p.slice(0, sep),
      definition: p.slice(sep + 1),
    };
  });
  while (rows.length < 2) rows.push({ id: newId(), term: '', definition: '' });
  return rows;
}

function serializePairs(rows: PairRow[]): string {
  return rows
    .filter((r) => r.term.trim() || r.definition.trim())
    .map((r) => `${r.term}:${r.definition}`)
    .join('|');
}

function parseOrderItems(correctAnswer: string): OrderRow[] {
  if (!correctAnswer.trim()) {
    return [
      { id: newId(), text: '' },
      { id: newId(), text: '' },
      { id: newId(), text: '' },
    ];
  }
  const rows = correctAnswer.split('|').map((text) => ({ id: newId(), text }));
  while (rows.length < 2) rows.push({ id: newId(), text: '' });
  return rows;
}

function serializeOrderItems(rows: OrderRow[]): string {
  return rows
    .filter((r) => r.text.trim())
    .map((r) => r.text)
    .join('|');
}

// ─── Sortable row primitive ─────────────────────────────────────────────────

interface SortableRowProps {
  id: string;
  children: (handle: {
    listeners: ReturnType<typeof useSortable>['listeners'];
    attributes: ReturnType<typeof useSortable>['attributes'];
  }) => React.ReactNode;
}

/** Skip dnd-kit's reorder animation when the user has requested reduced motion. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return reduced;
}

const SortableRow: React.FC<SortableRowProps> = ({ id, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const reducedMotion = usePrefersReducedMotion();
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: reducedMotion ? undefined : transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ listeners, attributes })}
    </div>
  );
};

// ─── Matching editor ────────────────────────────────────────────────────────

export interface MatchingAnswerEditorProps {
  correctAnswer: string;
  matchingDistractors: string[];
  onChange: (next: {
    correctAnswer: string;
    matchingDistractors: string[];
  }) => void;
}

export const MatchingAnswerEditor: React.FC<MatchingAnswerEditorProps> = ({
  correctAnswer,
  matchingDistractors,
  onChange,
}) => {
  // Local row state owns ids/blank rows; the canonical wire form lives in
  // the parent's `correctAnswer`. We re-parse only when the parent value
  // changes from the outside (e.g., AI-generated questions, quiz reload).
  const [rows, setRows] = React.useState<PairRow[]>(() =>
    parsePairs(correctAnswer)
  );
  const [distractors, setDistractors] = React.useState<string[]>(() =>
    matchingDistractors.length > 0 ? [...matchingDistractors] : []
  );
  useResetOnChange(correctAnswer, (next) => {
    if (serializePairs(rows) !== next) {
      setRows(parsePairs(next));
    }
  });
  useResetOnChange(matchingDistractors, (next) => {
    if (
      distractors.length !== next.length ||
      distractors.some((d, i) => d !== next[i])
    ) {
      setDistractors([...next]);
    }
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const emit = (nextRows: PairRow[], nextDistractors: string[]) => {
    onChange({
      correctAnswer: serializePairs(nextRows),
      matchingDistractors: nextDistractors.filter((d) => d.trim().length > 0),
    });
  };

  const updateRow = (id: string, patch: Partial<Omit<PairRow, 'id'>>) => {
    const next = rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
    setRows(next);
    emit(next, distractors);
  };

  const addRow = () => {
    const next = [...rows, { id: newId(), term: '', definition: '' }];
    setRows(next);
    emit(next, distractors);
  };

  const removeRow = (id: string) => {
    if (rows.length <= 2) return;
    const next = rows.filter((r) => r.id !== id);
    setRows(next);
    emit(next, distractors);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r.id === active.id);
    const newIndex = rows.findIndex((r) => r.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(rows, oldIndex, newIndex);
    setRows(next);
    emit(next, distractors);
  };

  const updateDistractor = (index: number, value: string) => {
    const next = [...distractors];
    next[index] = value;
    setDistractors(next);
    emit(rows, next);
  };

  const addDistractor = () => {
    const next = [...distractors, ''];
    setDistractors(next);
    // Don't emit yet — empty distractor would be filtered out anyway.
  };

  const removeDistractor = (index: number) => {
    const next = distractors.filter((_, i) => i !== index);
    setDistractors(next);
    emit(rows, next);
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block font-bold text-emerald-700 mb-1 text-xs">
          Matching Pairs
        </label>
        <div className="grid grid-cols-[24px_1fr_1fr_32px] gap-2 items-center mb-1 px-1">
          <span></span>
          <span className="text-xxs font-black uppercase tracking-wider text-brand-blue-primary/60">
            Term
          </span>
          <span className="text-xxs font-black uppercase tracking-wider text-brand-blue-primary/60">
            Match
          </span>
          <span></span>
        </div>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={rows.map((r) => r.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-1.5">
              {rows.map((row) => (
                <SortableRow key={row.id} id={row.id}>
                  {({ listeners, attributes }) => (
                    <div className="grid grid-cols-[24px_1fr_1fr_32px] gap-2 items-center">
                      <button
                        type="button"
                        className="flex items-center justify-center text-brand-blue-primary/30 hover:text-brand-blue-primary cursor-grab active:cursor-grabbing touch-none"
                        aria-label="Drag to reorder"
                        {...listeners}
                        {...attributes}
                      >
                        <GripVertical className="w-4 h-4" />
                      </button>
                      <input
                        type="text"
                        value={row.term}
                        onChange={(e) =>
                          updateRow(row.id, {
                            term: sanitizeTerm(e.target.value),
                          })
                        }
                        placeholder="Term"
                        className="px-3 py-2 bg-white border-2 border-emerald-500/20 rounded-xl text-emerald-800 font-bold focus:outline-none focus:border-emerald-500 shadow-sm text-sm"
                      />
                      <input
                        type="text"
                        value={row.definition}
                        onChange={(e) =>
                          updateRow(row.id, {
                            definition: sanitizeDefinition(e.target.value),
                          })
                        }
                        placeholder="Match"
                        className="px-3 py-2 bg-white border-2 border-emerald-500/20 rounded-xl text-emerald-800 font-bold focus:outline-none focus:border-emerald-500 shadow-sm text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        disabled={rows.length <= 2}
                        className="flex items-center justify-center p-1.5 text-brand-red-primary hover:bg-brand-red-lighter rounded-lg transition-colors disabled:opacity-20 disabled:hover:bg-transparent"
                        aria-label="Remove pair"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </SortableRow>
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <button
          type="button"
          onClick={addRow}
          className="mt-2 flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Pair
        </button>
      </div>

      <details className="bg-white/50 border border-brand-blue-primary/10 rounded-xl px-3 py-2">
        <summary className="cursor-pointer font-bold text-brand-blue-dark text-xs">
          Extra distractor definitions{' '}
          <span className="font-normal text-brand-blue-primary/60">
            (optional — increase difficulty)
          </span>
        </summary>
        <div className="mt-2 space-y-1.5">
          {distractors.length === 0 && (
            <p className="text-xxs text-brand-blue-primary/50 italic">
              Add unmatched options that appear in the student&apos;s word bank
              but don&apos;t match any term.
            </p>
          )}
          {distractors.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={d}
                onChange={(e) =>
                  updateDistractor(i, sanitizeDefinition(e.target.value))
                }
                placeholder={`Distractor ${i + 1}`}
                className="flex-1 px-3 py-1.5 bg-white border border-brand-red-primary/20 rounded-xl text-brand-blue-dark font-medium focus:outline-none focus:border-brand-red-primary shadow-sm text-sm"
              />
              <button
                type="button"
                onClick={() => removeDistractor(i)}
                className="p-1.5 text-brand-red-primary hover:bg-brand-red-lighter rounded-lg transition-colors"
                aria-label={`Remove distractor ${i + 1}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addDistractor}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-brand-blue-dark hover:bg-brand-blue-lighter rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Distractor
          </button>
        </div>
      </details>
    </div>
  );
};

// ─── Ordering editor ────────────────────────────────────────────────────────

export interface OrderingAnswerEditorProps {
  correctAnswer: string;
  onChange: (correctAnswer: string) => void;
}

export const OrderingAnswerEditor: React.FC<OrderingAnswerEditorProps> = ({
  correctAnswer,
  onChange,
}) => {
  const [rows, setRows] = React.useState<OrderRow[]>(() =>
    parseOrderItems(correctAnswer)
  );
  useResetOnChange(correctAnswer, (next) => {
    if (serializeOrderItems(rows) !== next) {
      setRows(parseOrderItems(next));
    }
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const emit = (next: OrderRow[]) => onChange(serializeOrderItems(next));

  const updateRow = (id: string, text: string) => {
    const next = rows.map((r) => (r.id === id ? { ...r, text } : r));
    setRows(next);
    emit(next);
  };

  const addRow = () => {
    const next = [...rows, { id: newId(), text: '' }];
    setRows(next);
    emit(next);
  };

  const removeRow = (id: string) => {
    if (rows.length <= 2) return;
    const next = rows.filter((r) => r.id !== id);
    setRows(next);
    emit(next);
  };

  const swap = (index: number, dir: 'up' | 'down') => {
    const target = dir === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= rows.length) return;
    const next = arrayMove(rows, index, target);
    setRows(next);
    emit(next);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r.id === active.id);
    const newIndex = rows.findIndex((r) => r.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(rows, oldIndex, newIndex);
    setRows(next);
    emit(next);
  };

  return (
    <div>
      <label className="block font-bold text-emerald-700 mb-1 text-xs">
        Items in Correct Order
      </label>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={rows.map((r) => r.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1.5">
            {rows.map((row, i) => (
              <SortableRow key={row.id} id={row.id}>
                {({ listeners, attributes }) => (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="flex items-center justify-center text-brand-blue-primary/30 hover:text-brand-blue-primary cursor-grab active:cursor-grabbing touch-none"
                      aria-label="Drag to reorder"
                      {...listeners}
                      {...attributes}
                    >
                      <GripVertical className="w-4 h-4" />
                    </button>
                    <span className="font-black text-emerald-700 w-6 text-center text-sm shrink-0">
                      {i + 1}.
                    </span>
                    <input
                      type="text"
                      value={row.text}
                      onChange={(e) =>
                        updateRow(row.id, sanitizeOrderingItem(e.target.value))
                      }
                      placeholder={`Item ${i + 1}`}
                      className="flex-1 px-3 py-2 bg-white border-2 border-emerald-500/20 rounded-xl text-emerald-800 font-bold focus:outline-none focus:border-emerald-500 shadow-sm text-sm"
                    />
                    <div className="flex items-center">
                      <button
                        type="button"
                        onClick={() => swap(i, 'up')}
                        disabled={i === 0}
                        className="p-1 text-brand-blue-primary hover:bg-brand-blue-lighter rounded transition-colors disabled:opacity-20"
                        aria-label="Move up"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => swap(i, 'down')}
                        disabled={i === rows.length - 1}
                        className="p-1 text-brand-blue-primary hover:bg-brand-blue-lighter rounded transition-colors disabled:opacity-20"
                        aria-label="Move down"
                      >
                        ▼
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      disabled={rows.length <= 2}
                      className="flex items-center justify-center p-1.5 text-brand-red-primary hover:bg-brand-red-lighter rounded-lg transition-colors disabled:opacity-20 disabled:hover:bg-transparent"
                      aria-label="Remove item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </SortableRow>
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <button
        type="button"
        onClick={addRow}
        className="mt-2 flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Row
      </button>
    </div>
  );
};
