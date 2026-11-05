/**
 * Structured row editors for Matching and Ordering quiz answer keys.
 *
 * Replaces the legacy single-text-input that asked teachers to type
 * `term:def|term:def` or `item|item|item` strings. Both editors serialize
 * back to the same wire format so old quizzes continue to grade and new
 * quizzes stay on the same Drive schema.
 */

import React from 'react';
import { AlertCircle, GripVertical, Plus, Trash2 } from 'lucide-react';
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
import {
  tourFieldAttr,
  tourTypeAttr,
  type TourAnchorAttrs,
} from '@/config/tourAnchors';
import { useResetOnChange } from '@/hooks/useResetOnChange';
import { normalizeAnswer } from '@/hooks/useQuizSession';
import type { QuizAnswerImage } from '@/types';
import { answerImagesFromRows, imageForLabel } from '@/utils/quizAnswerImages';
import { AnswerImageControl } from './AnswerImageControl';
import {
  useAnswerImagePicker,
  type UploadAnswerImage,
} from './useAnswerImagePicker';

// ─── Helpers ────────────────────────────────────────────────────────────────

interface PairRow {
  id: string;
  term: string;
  definition: string;
  termImage?: string;
  definitionImage?: string;
}

interface DistractorRow {
  id: string;
  text: string;
  image?: string;
}

interface OrderRow {
  id: string;
  text: string;
  /** Image URL; '' or absent = none. */
  image?: string;
}

/** Shown in an answer's box when it has a picture but no text, which would not save. */
const NEEDS_TEXT = 'Add text for this image';

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
function parsePairs(
  correctAnswer: string,
  answerImages?: readonly QuizAnswerImage[],
  termImages?: readonly QuizAnswerImage[]
): PairRow[] {
  if (!correctAnswer.trim()) {
    return [
      { id: newId(), term: '', definition: '' },
      { id: newId(), term: '', definition: '' },
    ];
  }
  const rows = correctAnswer.split('|').map((p) => {
    const sep = p.indexOf(':');
    const term = sep < 0 ? p : p.slice(0, sep);
    const definition = sep < 0 ? '' : p.slice(sep + 1);
    return {
      id: newId(),
      term,
      definition,
      termImage: imageForLabel(termImages, term),
      definitionImage: imageForLabel(answerImages, definition),
    };
  });
  while (rows.length < 2) rows.push({ id: newId(), term: '', definition: '' });
  return rows;
}

const toDistractorRows = (
  distractors: readonly string[],
  answerImages?: readonly QuizAnswerImage[]
): DistractorRow[] =>
  distractors.map((text) => ({
    id: newId(),
    text,
    image: imageForLabel(answerImages, text),
  }));

function serializePairs(rows: PairRow[]): string {
  return rows
    .filter((r) => r.term.trim() || r.definition.trim())
    .map((r) => `${r.term}:${r.definition}`)
    .join('|');
}

// Guards against gradeAnswer's Map keying on term text (equivalent normalization for the term portion): a duplicate term silently overwrites the first row, so flag it here at entry time.
function findDuplicateTermRowIds(rows: PairRow[]): Set<string> {
  const seen = new Map<string, string[]>();
  for (const row of rows) {
    // Derive the key exactly as gradeAnswer does: normalize the whole `term:definition` pair, then slice at the first ':' WITHOUT re-trimming, so a trailing space in the term doesn't false-positive against the grader.
    const normalizedPair = normalizeAnswer(`${row.term}:${row.definition}`);
    const colonIdx = normalizedPair.indexOf(':');
    const key =
      colonIdx === -1 ? normalizedPair : normalizedPair.slice(0, colonIdx);
    // Blank term + a definition still serializes (`:def`) and collides on the grader's '' key; skip only fully-empty rows.
    if (!key && !row.definition.trim()) continue;
    const ids = seen.get(key);
    if (ids) ids.push(row.id);
    else seen.set(key, [row.id]);
  }
  const duplicateIds = new Set<string>();
  for (const ids of seen.values()) {
    if (ids.length > 1) ids.forEach((id) => duplicateIds.add(id));
  }
  return duplicateIds;
}

function parseOrderItems(
  correctAnswer: string,
  images: readonly string[] = []
): OrderRow[] {
  if (!correctAnswer.trim()) {
    return [
      { id: newId(), text: '' },
      { id: newId(), text: '' },
      { id: newId(), text: '' },
    ];
  }
  const rows: OrderRow[] = correctAnswer
    .split('|')
    .map((text, i) => ({ id: newId(), text, image: images[i] ?? '' }));
  while (rows.length < 2) rows.push({ id: newId(), text: '' });
  return rows;
}

function serializeOrderItems(rows: OrderRow[]): string {
  return rows
    .filter((r) => r.text.trim())
    .map((r) => r.text)
    .join('|');
}

/** Images aligned with the serialized items, or undefined when none is set. */
function serializeOrderImages(rows: OrderRow[]): string[] | undefined {
  const images = rows.filter((r) => r.text.trim()).map((r) => r.image ?? '');
  return images.some(Boolean) ? images : undefined;
}

const sameImages = (
  a: readonly string[] | undefined,
  b: readonly string[] | undefined
): boolean =>
  (a ?? []).length === (b ?? []).length &&
  (a ?? []).every((v, i) => v === (b ?? [])[i]);

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
  /** Pictures on matches and extras; keep the reference stable. */
  answerImages?: QuizAnswerImage[];
  /** Pictures on terms; keep the reference stable. */
  termImages?: QuizAnswerImage[];
  onChange: (next: {
    correctAnswer: string;
    matchingDistractors: string[];
    answerImages: QuizAnswerImage[] | undefined;
    matchingTermImages: QuizAnswerImage[] | undefined;
  }) => void;
  /** Uploads one picture and resolves to its URL; absent hides the picture buttons. */
  onUploadImage?: UploadAnswerImage;
}

/** The saved fields for the editor's rows. */
function matchingFields(rows: PairRow[], distractors: DistractorRow[]) {
  return {
    correctAnswer: serializePairs(rows),
    matchingDistractors: distractors
      .map((d) => d.text)
      .filter((d) => d.trim().length > 0),
    answerImages: answerImagesFromRows([
      ...rows.map((r) => ({ text: r.definition, image: r.definitionImage })),
      ...distractors,
    ]),
    matchingTermImages: answerImagesFromRows(
      rows.map((r) => ({ text: r.term, image: r.termImage }))
    ),
  };
}

/**
 * Memo comparator: distractors are compared by value (the parent may hand
 * back a fresh array of identical strings) so typing in the question prompt
 * — which replaces the question object but not the answer key — skips a
 * full re-render of every pair/distractor row. Requires a referentially
 * stable `onChange` from the parent for the memo to hold.
 */
const matchingPropsEqual = (
  prev: MatchingAnswerEditorProps,
  next: MatchingAnswerEditorProps
): boolean =>
  prev.correctAnswer === next.correctAnswer &&
  prev.onChange === next.onChange &&
  prev.answerImages === next.answerImages &&
  prev.termImages === next.termImages &&
  prev.onUploadImage === next.onUploadImage &&
  (prev.matchingDistractors === next.matchingDistractors ||
    (prev.matchingDistractors.length === next.matchingDistractors.length &&
      prev.matchingDistractors.every(
        (d, i) => d === next.matchingDistractors[i]
      )));

export const MatchingAnswerEditor = React.memo(function MatchingAnswerEditor({
  correctAnswer,
  matchingDistractors,
  answerImages,
  termImages,
  onChange,
  onUploadImage,
}: MatchingAnswerEditorProps) {
  // Unique per instance so multiple editors in one DOM don't collide on the warning id.
  const warningId = React.useId();
  // Local row state owns ids/blank rows; the canonical wire form lives in
  // the parent's `correctAnswer`. We re-parse only when the parent value
  // changes from the outside (e.g., AI-generated questions, quiz reload).
  const [rows, setRows] = React.useState<PairRow[]>(() =>
    parsePairs(correctAnswer, answerImages, termImages)
  );
  const [distractors, setDistractors] = React.useState<DistractorRow[]>(() =>
    toDistractorRows(matchingDistractors, answerImages)
  );
  const wireKey = (fields: ReturnType<typeof matchingFields>) =>
    JSON.stringify([
      fields.correctAnswer,
      fields.matchingDistractors,
      fields.answerImages ?? [],
      fields.matchingTermImages ?? [],
    ]);
  const propsKey = wireKey({
    correctAnswer,
    matchingDistractors,
    answerImages,
    matchingTermImages: termImages,
  });
  useResetOnChange(propsKey, () => {
    if (wireKey(matchingFields(rows, distractors)) !== propsKey) {
      setRows(parsePairs(correctAnswer, answerImages, termImages));
      setDistractors(toDistractorRows(matchingDistractors, answerImages));
    }
  });
  // Latest rows for an upload that resolves after later edits.
  const latest = React.useRef({ rows, distractors });
  React.useLayoutEffect(() => {
    latest.current = { rows, distractors };
  }, [rows, distractors]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const duplicateTermRowIds = React.useMemo(
    () => findDuplicateTermRowIds(rows),
    [rows]
  );

  const emit = (nextRows: PairRow[], nextDistractors: DistractorRow[]) => {
    onChange(matchingFields(nextRows, nextDistractors));
  };

  // Keys read `<row id>:term`, `<row id>:match` or `<row id>:extra`.
  const setImage = (key: string, image: string) => {
    const sep = key.lastIndexOf(':');
    const id = key.slice(0, sep);
    const part = key.slice(sep + 1);
    const current = latest.current;
    const nextRows = current.rows.map((r) =>
      r.id !== id
        ? r
        : part === 'term'
          ? { ...r, termImage: image }
          : part === 'match'
            ? { ...r, definitionImage: image }
            : r
    );
    const nextDistractors = current.distractors.map((d) =>
      d.id === id && part === 'extra' ? { ...d, image } : d
    );
    latest.current = { rows: nextRows, distractors: nextDistractors };
    setRows(nextRows);
    setDistractors(nextDistractors);
    emit(nextRows, nextDistractors);
  };
  const images = useAnswerImagePicker(onUploadImage, setImage);
  const imageControl = (
    key: string,
    image: string | undefined,
    name: string,
    addAttrs: TourAnchorAttrs,
    removeAttrs: TourAnchorAttrs
  ) =>
    onUploadImage ? (
      <AnswerImageControl
        image={image}
        uploading={images.uploadingKey === key}
        disabled={images.uploadingKey !== null}
        onPick={() => images.pick(key)}
        onRemove={() => setImage(key, '')}
        name={name}
        addAttrs={addAttrs}
        removeAttrs={removeAttrs}
      />
    ) : null;

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
    const next = distractors.map((d, i) =>
      i === index ? { ...d, text: value } : d
    );
    setDistractors(next);
    emit(rows, next);
  };

  const addDistractor = () => {
    const next = [...distractors, { id: newId(), text: '' }];
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
      {images.fileInput}
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
              {rows.map((row, i) => {
                const isDuplicateTerm = duplicateTermRowIds.has(row.id);
                return (
                  <SortableRow key={row.id} id={row.id}>
                    {({ listeners, attributes }) => (
                      <div className="grid grid-cols-[24px_1fr_1fr_32px] gap-2 items-center">
                        <button
                          type="button"
                          className="flex items-center justify-center text-brand-blue-primary/30 hover:text-brand-blue-primary cursor-grab active:cursor-grabbing touch-none"
                          aria-label="Drag to reorder"
                          {...tourFieldAttr(
                            'quiz-editor.match-drag',
                            'quiz',
                            String(i + 1)
                          )}
                          {...listeners}
                          {...attributes}
                        >
                          <GripVertical className="w-4 h-4" />
                        </button>
                        <div className="flex items-center gap-1 min-w-0">
                          <input
                            type="text"
                            value={row.term}
                            onPaste={images.pasteInto(`${row.id}:term`)}
                            onChange={(e) =>
                              updateRow(row.id, {
                                term: sanitizeTerm(e.target.value),
                              })
                            }
                            placeholder={
                              row.termImage && !row.term.trim()
                                ? NEEDS_TEXT
                                : 'Term'
                            }
                            {...tourFieldAttr(
                              'quiz-editor.match-term',
                              'quiz',
                              String(i + 1)
                            )}
                            aria-invalid={isDuplicateTerm}
                            aria-describedby={
                              isDuplicateTerm ? warningId : undefined
                            }
                            className={`min-w-0 flex-1 px-3 py-2 bg-white border-2 rounded-xl text-emerald-800 font-bold focus:outline-hidden shadow-xs text-sm ${
                              isDuplicateTerm
                                ? 'border-brand-red-primary focus:border-brand-red-primary'
                                : 'border-emerald-500/20 focus:border-emerald-500'
                            }`}
                          />
                          {imageControl(
                            `${row.id}:term`,
                            row.termImage,
                            `term ${i + 1}`,
                            tourFieldAttr(
                              'quiz-editor.match-term-image',
                              'quiz',
                              String(i + 1)
                            ),
                            tourFieldAttr(
                              'quiz-editor.match-term-image-remove',
                              'quiz',
                              String(i + 1)
                            )
                          )}
                        </div>
                        <div className="flex items-center gap-1 min-w-0">
                          <input
                            type="text"
                            value={row.definition}
                            onPaste={images.pasteInto(`${row.id}:match`)}
                            onChange={(e) =>
                              updateRow(row.id, {
                                definition: sanitizeDefinition(e.target.value),
                              })
                            }
                            placeholder={
                              row.definitionImage && !row.definition.trim()
                                ? NEEDS_TEXT
                                : 'Match'
                            }
                            {...tourFieldAttr(
                              'quiz-editor.match-definition',
                              'quiz',
                              String(i + 1)
                            )}
                            className="min-w-0 flex-1 px-3 py-2 bg-white border-2 border-emerald-500/20 rounded-xl text-emerald-800 font-bold focus:outline-hidden focus:border-emerald-500 shadow-xs text-sm"
                          />
                          {imageControl(
                            `${row.id}:match`,
                            row.definitionImage,
                            `match ${i + 1}`,
                            tourFieldAttr(
                              'quiz-editor.match-definition-image',
                              'quiz',
                              String(i + 1)
                            ),
                            tourFieldAttr(
                              'quiz-editor.match-definition-image-remove',
                              'quiz',
                              String(i + 1)
                            )
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeRow(row.id)}
                          disabled={rows.length <= 2}
                          className="flex items-center justify-center p-1.5 text-brand-red-primary hover:bg-brand-red-lighter rounded-lg transition-colors disabled:opacity-20 disabled:hover:bg-transparent"
                          aria-label="Remove pair"
                          {...tourFieldAttr(
                            'quiz-editor.match-remove',
                            'quiz',
                            String(i + 1)
                          )}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </SortableRow>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
        <button
          type="button"
          onClick={addRow}
          {...tourTypeAttr('quiz-editor.match-add', 'quiz')}
          className="mt-2 flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Pair
        </button>
        {duplicateTermRowIds.size > 0 && (
          <div
            id={warningId}
            role="alert"
            className="mt-2 p-2.5 bg-brand-red-lighter/40 border border-brand-red-primary/20 rounded-lg flex items-center gap-2 text-xs text-brand-red-dark font-bold"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            Duplicate terms found. Give each row a unique term.
          </div>
        )}
      </div>

      <details className="bg-white/50 border border-brand-blue-primary/10 rounded-xl px-3 py-2">
        <summary className="cursor-pointer font-bold text-brand-blue-dark text-xs">
          Extra definitions{' '}
          <span className="font-normal text-brand-blue-primary/60">
            (optional)
          </span>
        </summary>
        <div className="mt-2 space-y-1.5">
          {distractors.map((d, i) => (
            <div key={d.id} className="flex items-center gap-2">
              <input
                type="text"
                value={d.text}
                onPaste={images.pasteInto(`${d.id}:extra`)}
                onChange={(e) =>
                  updateDistractor(i, sanitizeDefinition(e.target.value))
                }
                placeholder={
                  d.image && !d.text.trim() ? NEEDS_TEXT : `Distractor ${i + 1}`
                }
                {...tourFieldAttr(
                  'quiz-editor.match-distractor',
                  'quiz',
                  String(i + 1)
                )}
                className="flex-1 px-3 py-1.5 bg-white border border-brand-red-primary/20 rounded-xl text-brand-blue-dark font-medium focus:outline-hidden focus:border-brand-red-primary shadow-xs text-sm"
              />
              {imageControl(
                `${d.id}:extra`,
                d.image,
                `distractor ${i + 1}`,
                tourFieldAttr(
                  'quiz-editor.match-distractor-image',
                  'quiz',
                  String(i + 1)
                ),
                tourFieldAttr(
                  'quiz-editor.match-distractor-image-remove',
                  'quiz',
                  String(i + 1)
                )
              )}
              <button
                type="button"
                onClick={() => removeDistractor(i)}
                className="p-1.5 text-brand-red-primary hover:bg-brand-red-lighter rounded-lg transition-colors"
                aria-label={`Remove distractor ${i + 1}`}
                {...tourFieldAttr(
                  'quiz-editor.match-distractor-remove',
                  'quiz',
                  String(i + 1)
                )}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addDistractor}
            {...tourTypeAttr('quiz-editor.match-distractor-add', 'quiz')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-brand-blue-dark hover:bg-brand-blue-lighter rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Distractor
          </button>
        </div>
      </details>
    </div>
  );
}, matchingPropsEqual);

// ─── Ordering editor ────────────────────────────────────────────────────────

export interface OrderingAnswerEditorProps {
  correctAnswer: string;
  /** Index-aligned with the items in `correctAnswer`; keep the reference stable. */
  orderingImages?: string[];
  onChange: (
    correctAnswer: string,
    orderingImages: string[] | undefined
  ) => void;
  /** Uploads one image and resolves to its URL; absent hides the image buttons. */
  onUploadImage?: UploadAnswerImage;
}

const NO_IMAGES: string[] = [];

// Plain React.memo: props are strings, a stable array and parent-stable
// callbacks, so shallow comparison already skips re-renders on prompt keystrokes.
export const OrderingAnswerEditor = React.memo(function OrderingAnswerEditor({
  correctAnswer,
  orderingImages = NO_IMAGES,
  onChange,
  onUploadImage,
}: OrderingAnswerEditorProps) {
  const [rows, setRows] = React.useState<OrderRow[]>(() =>
    parseOrderItems(correctAnswer, orderingImages)
  );
  const resetKey = `${correctAnswer}\u0000${orderingImages.join('\u0001')}`;
  useResetOnChange(resetKey, () => {
    const nextImages = orderingImages.some(Boolean)
      ? orderingImages
      : undefined;
    if (
      serializeOrderItems(rows) !== correctAnswer ||
      !sameImages(serializeOrderImages(rows), nextImages)
    ) {
      setRows(parseOrderItems(correctAnswer, orderingImages));
    }
  });
  // Latest rows for the async upload callback, which resolves after later edits.
  const rowsRef = React.useRef(rows);
  React.useLayoutEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const emit = (next: OrderRow[]) =>
    onChange(serializeOrderItems(next), serializeOrderImages(next));

  const setRowImage = (id: string, image: string) => {
    if (!rowsRef.current.some((r) => r.id === id)) return;
    const next = rowsRef.current.map((r) =>
      r.id === id ? { ...r, image } : r
    );
    rowsRef.current = next;
    setRows(next);
    emit(next);
  };

  const images = useAnswerImagePicker(onUploadImage, setRowImage);

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
                      {...tourFieldAttr(
                        'quiz-editor.order-drag',
                        'quiz',
                        String(i + 1)
                      )}
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
                      onPaste={images.pasteInto(row.id)}
                      onChange={(e) =>
                        updateRow(row.id, sanitizeOrderingItem(e.target.value))
                      }
                      placeholder={
                        row.image && !row.text.trim()
                          ? NEEDS_TEXT
                          : `Item ${i + 1}`
                      }
                      {...tourFieldAttr(
                        'quiz-editor.order-item',
                        'quiz',
                        String(i + 1)
                      )}
                      className="flex-1 px-3 py-2 bg-white border-2 border-emerald-500/20 rounded-xl text-emerald-800 font-bold focus:outline-hidden focus:border-emerald-500 shadow-xs text-sm"
                    />
                    {onUploadImage && (
                      <AnswerImageControl
                        image={row.image}
                        uploading={images.uploadingKey === row.id}
                        disabled={images.uploadingKey !== null}
                        onPick={() => images.pick(row.id)}
                        onRemove={() => setRowImage(row.id, '')}
                        name={`item ${i + 1}`}
                        addAttrs={tourFieldAttr(
                          'quiz-editor.order-image',
                          'quiz',
                          String(i + 1)
                        )}
                        removeAttrs={tourFieldAttr(
                          'quiz-editor.order-image-remove',
                          'quiz',
                          String(i + 1)
                        )}
                      />
                    )}
                    <div className="flex items-center">
                      <button
                        type="button"
                        onClick={() => swap(i, 'up')}
                        disabled={i === 0}
                        className="p-1 text-brand-blue-primary hover:bg-brand-blue-lighter rounded-sm transition-colors disabled:opacity-20"
                        aria-label="Move up"
                        {...tourFieldAttr(
                          'quiz-editor.order-up',
                          'quiz',
                          String(i + 1)
                        )}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => swap(i, 'down')}
                        disabled={i === rows.length - 1}
                        className="p-1 text-brand-blue-primary hover:bg-brand-blue-lighter rounded-sm transition-colors disabled:opacity-20"
                        aria-label="Move down"
                        {...tourFieldAttr(
                          'quiz-editor.order-down',
                          'quiz',
                          String(i + 1)
                        )}
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
                      {...tourFieldAttr(
                        'quiz-editor.order-remove',
                        'quiz',
                        String(i + 1)
                      )}
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
        {...tourTypeAttr('quiz-editor.order-add', 'quiz')}
        className="mt-2 flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Row
      </button>
      {images.fileInput}
    </div>
  );
});
