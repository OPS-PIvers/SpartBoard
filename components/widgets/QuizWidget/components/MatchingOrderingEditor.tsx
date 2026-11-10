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
import type { QuizAnswerImage, QuizImageOnlyAnswer } from '@/types';
import {
  answerImagesFromRows,
  imageForLabel,
  imageOnlyAnswersFromRows,
  imageOnlyFor,
  newImageOnlyLabel,
} from '@/utils/quizAnswerImages';
import { PICTURE_ONLY_PLACEHOLDER } from './ChoiceOptionsEditor';
import {
  AnswerImageControl,
  PictureDescriptionInput,
} from './AnswerImageControl';
import {
  useAnswerImagePicker,
  type UploadAnswerImage,
} from './useAnswerImagePicker';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** `label` is the generated name a picture-only cell saves under; `alt` describes its picture. */
interface Cell {
  text: string;
  image?: string;
  label?: string;
  alt?: string;
}

interface PairRow {
  id: string;
  term: Cell;
  definition: Cell;
}

interface DistractorRow extends Cell {
  id: string;
}

interface OrderRow extends Cell {
  id: string;
}

const cellImageOnly = (c: Cell): boolean =>
  !c.text.trim() && !!c.image && !!c.label;

/** The text a cell saves under: its generated label when it is only a picture. */
const savedText = (c: Cell): string =>
  cellImageOnly(c) ? (c.label ?? '') : c.text;

const blankCell = (): Cell => ({ text: '' });

/** A cell read back from saved text, unpacking a picture-only label. */
function readCell(
  text: string,
  images: readonly QuizAnswerImage[] | undefined,
  imageOnly: readonly QuizImageOnlyAnswer[] | undefined
): Cell {
  const image = imageForLabel(images, text);
  const only = image ? imageOnlyFor(imageOnly, text) : undefined;
  return only
    ? { text: '', image, label: text, alt: only.alt ?? '' }
    : { text, image };
}

/** Gives every cell with a picture a label, unique across `cells`, so clearing its text never drops it. */
function labelCells<T extends Cell>(cells: T[], taken: string[]): T[] {
  if (cells.every((c) => !c.image || c.label)) return cells;
  return cells.map((c) => {
    if (!c.image || c.label) return c;
    const label = newImageOnlyLabel(taken);
    taken.push(label);
    return { ...c, label };
  });
}

const cellTaken = (cells: readonly Cell[]): string[] =>
  cells.flatMap((c) => [c.text, c.label ?? '']);

/** The screen reader description box under a picture-only cell. */
const CellDescription: React.FC<{
  cell: Cell;
  name: string;
  field: string;
  onChange: (alt: string) => void;
  className?: string;
}> = ({ cell, name, field, onChange, className }) =>
  cellImageOnly(cell) ? (
    <PictureDescriptionInput
      value={cell.alt ?? ''}
      onChange={onChange}
      name={name}
      attrs={tourFieldAttr(
        'quiz-editor.answer-image-description',
        'quiz',
        field
      )}
      className={className}
    />
  ) : null;

const cellPlaceholder = (cell: Cell, fallback: string): string =>
  cellImageOnly(cell) ? PICTURE_ONLY_PLACEHOLDER : fallback;

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
const blankPair = (): PairRow => ({
  id: newId(),
  term: blankCell(),
  definition: blankCell(),
});

function parsePairs(
  correctAnswer: string,
  answerImages?: readonly QuizAnswerImage[],
  termImages?: readonly QuizAnswerImage[],
  imageOnly?: readonly QuizImageOnlyAnswer[]
): PairRow[] {
  if (!correctAnswer.trim()) return [blankPair(), blankPair()];
  const rows: PairRow[] = correctAnswer.split('|').map((p) => {
    const sep = p.indexOf(':');
    const term = sep < 0 ? p : p.slice(0, sep);
    const definition = sep < 0 ? '' : p.slice(sep + 1);
    return {
      id: newId(),
      term: readCell(term, termImages, imageOnly),
      definition: readCell(definition, answerImages, imageOnly),
    };
  });
  while (rows.length < 2) rows.push(blankPair());
  return rows;
}

const toDistractorRows = (
  distractors: readonly string[],
  answerImages?: readonly QuizAnswerImage[],
  imageOnly?: readonly QuizImageOnlyAnswer[]
): DistractorRow[] =>
  distractors.map((text) => ({
    id: newId(),
    ...readCell(text, answerImages, imageOnly),
  }));

/** Labels every pictured cell across pairs and extras together, so no two labels collide. */
function labelMatching(
  rows: PairRow[],
  distractors: DistractorRow[]
): { rows: PairRow[]; distractors: DistractorRow[] } {
  const all = [...rows.flatMap((r) => [r.term, r.definition]), ...distractors];
  if (all.every((c) => !c.image || c.label)) return { rows, distractors };
  const taken = cellTaken(all);
  const terms = labelCells(
    rows.map((r) => r.term),
    taken
  );
  const defs = labelCells(
    rows.map((r) => r.definition),
    taken
  );
  return {
    rows: rows.map((r, i) => ({ ...r, term: terms[i], definition: defs[i] })),
    distractors: labelCells(distractors, taken),
  };
}

function serializePairs(rows: PairRow[]): string {
  return rows
    .map((r) => ({
      term: savedText(r.term),
      definition: savedText(r.definition),
    }))
    .filter((r) => r.term.trim() || r.definition.trim())
    .map((r) => `${r.term}:${r.definition}`)
    .join('|');
}

// Guards against gradeAnswer's Map keying on term text (equivalent normalization for the term portion): a duplicate term silently overwrites the first row, so flag it here at entry time.
function findDuplicateTermRowIds(rows: PairRow[]): Set<string> {
  const seen = new Map<string, string[]>();
  for (const row of rows) {
    const term = savedText(row.term);
    const definition = savedText(row.definition);
    // Derive the key exactly as gradeAnswer does: normalize the whole `term:definition` pair, then slice at the first ':' WITHOUT re-trimming, so a trailing space in the term doesn't false-positive against the grader.
    const normalizedPair = normalizeAnswer(`${term}:${definition}`);
    const colonIdx = normalizedPair.indexOf(':');
    const key =
      colonIdx === -1 ? normalizedPair : normalizedPair.slice(0, colonIdx);
    // Blank term + a definition still serializes (`:def`) and collides on the grader's '' key; skip only fully-empty rows.
    if (!key && !definition.trim()) continue;
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
  images: readonly string[] = [],
  imageOnly?: readonly QuizImageOnlyAnswer[]
): OrderRow[] {
  if (!correctAnswer.trim()) {
    return [
      { id: newId(), text: '' },
      { id: newId(), text: '' },
      { id: newId(), text: '' },
    ];
  }
  const rows: OrderRow[] = correctAnswer.split('|').map((text, i) => {
    const image = images[i] ?? '';
    const only = image ? imageOnlyFor(imageOnly, text) : undefined;
    return only
      ? { id: newId(), text: '', image, label: text, alt: only.alt ?? '' }
      : { id: newId(), text, image };
  });
  while (rows.length < 2) rows.push({ id: newId(), text: '' });
  return labelOrderRows(rows);
}

const labelOrderRows = (rows: OrderRow[]): OrderRow[] =>
  labelCells(rows, cellTaken(rows));

const keptOrderRows = (rows: OrderRow[]): OrderRow[] =>
  rows.filter((r) => savedText(r).trim());

function serializeOrderItems(rows: OrderRow[]): string {
  return keptOrderRows(rows).map(savedText).join('|');
}

/** Images aligned with the serialized items, or undefined when none is set. */
function serializeOrderImages(rows: OrderRow[]): string[] | undefined {
  const images = keptOrderRows(rows).map((r) => r.image ?? '');
  return images.some(Boolean) ? images : undefined;
}

const imageOnlyFromCells = (cells: readonly Cell[]) =>
  imageOnlyAnswersFromRows(
    cells.map((c) => ({
      text: savedText(c),
      imageOnly: cellImageOnly(c),
      alt: c.alt,
    }))
  );

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
  /** Answers that are only a picture; keep the reference stable. */
  imageOnlyAnswers?: QuizImageOnlyAnswer[];
  onChange: (next: {
    correctAnswer: string;
    matchingDistractors: string[];
    answerImages: QuizAnswerImage[] | undefined;
    matchingTermImages: QuizAnswerImage[] | undefined;
    imageOnlyAnswers: QuizImageOnlyAnswer[] | undefined;
  }) => void;
  /** Uploads one picture and resolves to its URL; absent leaves only removing a saved one. */
  onUploadImage?: UploadAnswerImage;
}

/** The saved fields for the editor's rows. */
function matchingFields(rows: PairRow[], distractors: DistractorRow[]) {
  const asSaved = (c: Cell) => ({ text: savedText(c), image: c.image });
  return {
    correctAnswer: serializePairs(rows),
    matchingDistractors: distractors
      .map(savedText)
      .filter((d) => d.trim().length > 0),
    answerImages: answerImagesFromRows([
      ...rows.map((r) => asSaved(r.definition)),
      ...distractors.map(asSaved),
    ]),
    matchingTermImages: answerImagesFromRows(rows.map((r) => asSaved(r.term))),
    imageOnlyAnswers: imageOnlyFromCells([
      ...rows.flatMap((r) => [r.term, r.definition]),
      ...distractors,
    ]),
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
  prev.imageOnlyAnswers === next.imageOnlyAnswers &&
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
  imageOnlyAnswers,
  onChange,
  onUploadImage,
}: MatchingAnswerEditorProps) {
  // Unique per instance so multiple editors in one DOM don't collide on the warning id.
  const warningId = React.useId();
  // Local row state owns ids/blank rows; the canonical wire form lives in
  // the parent's `correctAnswer`. We re-parse only when the parent value
  // changes from the outside (e.g., AI-generated questions, quiz reload).
  const readProps = () =>
    labelMatching(
      parsePairs(correctAnswer, answerImages, termImages, imageOnlyAnswers),
      toDistractorRows(matchingDistractors, answerImages, imageOnlyAnswers)
    );
  const [initial] = React.useState(readProps);
  const [rows, setRows] = React.useState<PairRow[]>(initial.rows);
  const [distractors, setDistractors] = React.useState<DistractorRow[]>(
    initial.distractors
  );
  const wireKey = (fields: ReturnType<typeof matchingFields>) =>
    JSON.stringify([
      fields.correctAnswer,
      fields.matchingDistractors,
      fields.answerImages ?? [],
      fields.matchingTermImages ?? [],
      fields.imageOnlyAnswers ?? [],
    ]);
  const propsKey = wireKey({
    correctAnswer,
    matchingDistractors,
    answerImages,
    matchingTermImages: termImages,
    imageOnlyAnswers,
  });
  useResetOnChange(propsKey, () => {
    if (wireKey(matchingFields(rows, distractors)) !== propsKey) {
      const next = readProps();
      setRows(next.rows);
      setDistractors(next.distractors);
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

  // Sets both lists, labelling any new picture, and saves unless `save` is false.
  const apply = (
    nextRows: PairRow[],
    nextDistractors: DistractorRow[],
    save = true
  ) => {
    const labelled = labelMatching(nextRows, nextDistractors);
    latest.current = labelled;
    setRows(labelled.rows);
    setDistractors(labelled.distractors);
    if (save) onChange(matchingFields(labelled.rows, labelled.distractors));
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
          ? { ...r, term: { ...r.term, image } }
          : part === 'match'
            ? { ...r, definition: { ...r.definition, image } }
            : r
    );
    const nextDistractors = current.distractors.map((d) =>
      d.id === id && part === 'extra' ? { ...d, image } : d
    );
    apply(nextRows, nextDistractors);
  };
  const images = useAnswerImagePicker(onUploadImage, setImage);
  const imageControl = (
    key: string,
    cell: Cell,
    name: string,
    addAttrs: TourAnchorAttrs,
    removeAttrs: TourAnchorAttrs
  ) =>
    onUploadImage || cell.image ? (
      <AnswerImageControl
        image={cell.image}
        uploading={images.uploadingKey === key}
        disabled={images.uploadingKey !== null}
        onPick={() => images.pick(key)}
        onRemove={() => setImage(key, '')}
        name={name}
        addAttrs={addAttrs}
        removeAttrs={removeAttrs}
      />
    ) : null;

  const updateCell = (
    id: string,
    side: 'term' | 'definition',
    patch: Partial<Cell>
  ) =>
    apply(
      rows.map((r) =>
        r.id === id ? { ...r, [side]: { ...r[side], ...patch } } : r
      ),
      distractors
    );

  const addRow = () => apply([...rows, blankPair()], distractors);

  const removeRow = (id: string) => {
    if (rows.length <= 2) return;
    apply(
      rows.filter((r) => r.id !== id),
      distractors
    );
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r.id === active.id);
    const newIndex = rows.findIndex((r) => r.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    apply(arrayMove(rows, oldIndex, newIndex), distractors);
  };

  const updateDistractor = (index: number, patch: Partial<Cell>) =>
    apply(
      rows,
      distractors.map((d, i) => (i === index ? { ...d, ...patch } : d))
    );

  // An empty extra saves nothing, so adding one waits for its text.
  const addDistractor = () =>
    apply(rows, [...distractors, { id: newId(), text: '' }], false);

  const removeDistractor = (index: number) =>
    apply(
      rows,
      distractors.filter((_, i) => i !== index)
    );

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
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-1 min-w-0">
                            <input
                              type="text"
                              value={row.term.text}
                              onPaste={images.pasteInto(`${row.id}:term`)}
                              onChange={(e) =>
                                updateCell(row.id, 'term', {
                                  text: sanitizeTerm(e.target.value),
                                })
                              }
                              placeholder={cellPlaceholder(row.term, 'Term')}
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
                              row.term,
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
                          <CellDescription
                            cell={row.term}
                            name={`term ${i + 1}`}
                            field={`term-${i + 1}`}
                            onChange={(alt) =>
                              updateCell(row.id, 'term', { alt })
                            }
                          />
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-1 min-w-0">
                            <input
                              type="text"
                              value={row.definition.text}
                              onPaste={images.pasteInto(`${row.id}:match`)}
                              onChange={(e) =>
                                updateCell(row.id, 'definition', {
                                  text: sanitizeDefinition(e.target.value),
                                })
                              }
                              placeholder={cellPlaceholder(
                                row.definition,
                                'Match'
                              )}
                              {...tourFieldAttr(
                                'quiz-editor.match-definition',
                                'quiz',
                                String(i + 1)
                              )}
                              className="min-w-0 flex-1 px-3 py-2 bg-white border-2 border-emerald-500/20 rounded-xl text-emerald-800 font-bold focus:outline-hidden focus:border-emerald-500 shadow-xs text-sm"
                            />
                            {imageControl(
                              `${row.id}:match`,
                              row.definition,
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
                          <CellDescription
                            cell={row.definition}
                            name={`match ${i + 1}`}
                            field={`match-${i + 1}`}
                            onChange={(alt) =>
                              updateCell(row.id, 'definition', { alt })
                            }
                          />
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
            <div key={d.id} className="space-y-1">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={d.text}
                  onPaste={images.pasteInto(`${d.id}:extra`)}
                  onChange={(e) =>
                    updateDistractor(i, {
                      text: sanitizeDefinition(e.target.value),
                    })
                  }
                  placeholder={cellPlaceholder(d, `Distractor ${i + 1}`)}
                  {...tourFieldAttr(
                    'quiz-editor.match-distractor',
                    'quiz',
                    String(i + 1)
                  )}
                  className="flex-1 px-3 py-1.5 bg-white border border-brand-red-primary/20 rounded-xl text-brand-blue-dark font-medium focus:outline-hidden focus:border-brand-red-primary shadow-xs text-sm"
                />
                {imageControl(
                  `${d.id}:extra`,
                  d,
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
              <CellDescription
                cell={d}
                name={`distractor ${i + 1}`}
                field={`extra-${i + 1}`}
                onChange={(alt) => updateDistractor(i, { alt })}
              />
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
  /** Items that are only a picture; keep the reference stable. */
  imageOnlyAnswers?: QuizImageOnlyAnswer[];
  onChange: (
    correctAnswer: string,
    orderingImages: string[] | undefined,
    imageOnlyAnswers: QuizImageOnlyAnswer[] | undefined
  ) => void;
  /** Uploads one image and resolves to its URL; absent leaves only removing a saved one. */
  onUploadImage?: UploadAnswerImage;
}

const NO_IMAGES: string[] = [];

// Plain React.memo: props are strings, a stable array and parent-stable
// callbacks, so shallow comparison already skips re-renders on prompt keystrokes.
export const OrderingAnswerEditor = React.memo(function OrderingAnswerEditor({
  correctAnswer,
  orderingImages = NO_IMAGES,
  imageOnlyAnswers,
  onChange,
  onUploadImage,
}: OrderingAnswerEditorProps) {
  const [rows, setRows] = React.useState<OrderRow[]>(() =>
    parseOrderItems(correctAnswer, orderingImages, imageOnlyAnswers)
  );
  const imageOnlyKey = JSON.stringify(imageOnlyAnswers ?? []);
  const resetKey = `${correctAnswer}\u0000${orderingImages.join('\u0001')}\u0000${imageOnlyKey}`;
  useResetOnChange(resetKey, () => {
    const nextImages = orderingImages.some(Boolean)
      ? orderingImages
      : undefined;
    if (
      serializeOrderItems(rows) !== correctAnswer ||
      !sameImages(serializeOrderImages(rows), nextImages) ||
      JSON.stringify(imageOnlyFromCells(rows) ?? []) !== imageOnlyKey
    ) {
      setRows(parseOrderItems(correctAnswer, orderingImages, imageOnlyAnswers));
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

  // Sets the rows, labelling any new picture, and saves them.
  const apply = (edited: OrderRow[]) => {
    const next = labelOrderRows(edited);
    rowsRef.current = next;
    setRows(next);
    onChange(
      serializeOrderItems(next),
      serializeOrderImages(next),
      imageOnlyFromCells(next)
    );
  };

  const setRowImage = (id: string, image: string) => {
    if (!rowsRef.current.some((r) => r.id === id)) return;
    apply(rowsRef.current.map((r) => (r.id === id ? { ...r, image } : r)));
  };

  const images = useAnswerImagePicker(onUploadImage, setRowImage);

  const updateRow = (id: string, patch: Partial<Cell>) =>
    apply(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const addRow = () => apply([...rows, { id: newId(), text: '' }]);

  const removeRow = (id: string) => {
    if (rows.length <= 2) return;
    apply(rows.filter((r) => r.id !== id));
  };

  const swap = (index: number, dir: 'up' | 'down') => {
    const target = dir === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= rows.length) return;
    apply(arrayMove(rows, index, target));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r.id === active.id);
    const newIndex = rows.findIndex((r) => r.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    apply(arrayMove(rows, oldIndex, newIndex));
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
                  <div className="space-y-1">
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
                          updateRow(row.id, {
                            text: sanitizeOrderingItem(e.target.value),
                          })
                        }
                        placeholder={cellPlaceholder(row, `Item ${i + 1}`)}
                        {...tourFieldAttr(
                          'quiz-editor.order-item',
                          'quiz',
                          String(i + 1)
                        )}
                        className="flex-1 px-3 py-2 bg-white border-2 border-emerald-500/20 rounded-xl text-emerald-800 font-bold focus:outline-hidden focus:border-emerald-500 shadow-xs text-sm"
                      />
                      {(onUploadImage ?? row.image) && (
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
                    <CellDescription
                      cell={row}
                      name={`item ${i + 1}`}
                      field={String(i + 1)}
                      onChange={(alt) => updateRow(row.id, { alt })}
                      className={'pl-14'}
                    />
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
