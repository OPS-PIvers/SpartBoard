/**
 * Student-facing rich-text editor for `short` and `essay` quiz questions.
 *
 * Phase 1 keeps the editor intentionally minimal — a `contenteditable`
 * surface plus a small formatting toolbar — so we don't pay the bundle
 * cost of TipTap/ProseMirror until annotations actually need them
 * (Phase 2). All HTML in and out of the editor passes through the shared
 * `sanitizeQuizResponse` util to keep things safe and consistent with the
 * teacher's grading view (which uses the same profile).
 *
 * The editor is intentionally uncontrolled internally: writing to
 * `innerHTML` on every keystroke would blow away the caret. Instead, the
 * caller-provided `value` is used to seed the DOM only when the question
 * identity (`questionKey`) changes — pause/resume rehydration uses the
 * key prop to force a fresh editor instance.
 */

import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Bold,
  GripHorizontal,
  Italic,
  List,
  ListOrdered,
  Sigma,
  Underline,
} from 'lucide-react';
import { sanitizeQuizResponse } from '@/utils/security';
import type { EditorDictation } from '@/utils/speechToText/types';
import { useDictation } from '@/hooks/useDictation';
import { DictateButton } from '@/components/common/dictate/DictateButton';
import { TidyUpButton } from '@/components/common/dictate/TidyUpButton';
import {
  TidyUpNotice,
  TidyUpPreview,
} from '@/components/common/dictate/TidyUpPreview';
import { useSpeechToTextSettings } from '@/hooks/useSpeechToTextSettings';
import {
  buildDictatedPassage,
  caretEndsPassage,
  latestDictatedRun,
  passageIntact,
  removePieces,
  replacePieces,
  type DictatedPassage,
} from '@/utils/speechToText/dictatedPassage';
import {
  callTidyDictation,
  isTidyUpOff,
  markTidyUpOff,
} from '@/utils/speechToText/paidCalls';
import { TIDY_MAX_CHARS } from '@/config/speechToText';
import { useTranslation } from 'react-i18next';
import { dispatchDictation } from '@/utils/inputSignals';
import {
  ensureTopLevelBlocks,
  needsBlockNormalization,
  normalizeEditorBlocks,
} from '@/utils/contentEditableBlocks';
import { toggleList } from '@/utils/contentEditableLists';
import { installDragSelectEnhancer } from '@/utils/contentEditableDragSelect';
import { countWords } from '@/utils/wordCount';
import { QUOTE_ATTR, buildQuoteNodes } from '@/utils/quizQuotes';
import { wordCounterLabel, wordLimitStatus } from '@/utils/wordLimit';
import { MATH_ATTR } from '@/utils/mathAnswer';
import {
  MATH_PLAIN_ATTR,
  drawMathChips,
  plainMathHtml,
} from '@/components/student/keyboards/mathChips';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';

const MathAnswerField = React.lazy(
  () => import('@/components/student/keyboards/MathAnswerField')
);

/** Equations are single chips the student re-opens to edit, never typed inside. */
function lockMathChips(root: HTMLElement): void {
  for (const el of Array.from(root.querySelectorAll(`span[${MATH_ATTR}]`))) {
    el.setAttribute('contenteditable', 'false');
  }
}

interface WrittenResponseEditorProps {
  /** Initial HTML content. Sanitized on render. */
  value: string;
  /** Called with sanitized HTML on every edit. */
  onChange: (html: string) => void;
  /** Optional placeholder displayed when the editor is empty. */
  placeholder?: string;
  /** Optional lower word bound shown in the counter. 0/undefined = none. */
  minWords?: number;
  /** Optional upper word bound shown in the counter. 0/undefined = none. */
  maxWords?: number;
  /** When set, the counter reads as a hard requirement rather than advice. */
  enforceWordLimit?: boolean;
  /** False turns off the browser's spelling and grammar underlines. */
  spellCheck?: boolean;
  /** Disable editing (e.g. when the quiz is paused or submitted). */
  disabled?: boolean;
  /**
   * When true, copy / cut / paste are blocked inside the editor (test
   * integrity). Paste is fully suppressed rather than stripped-to-plain-text,
   * and copy/cut from the editor are prevented. Default false.
   */
  blockClipboard?: boolean;
  /**
   * Stable identity for the current question. Changing this remounts the
   * inner editor so a fresh `value` is loaded — used for cross-question
   * navigation and pause/resume rehydration without manually managing the
   * caret/selection.
   */
  questionKey: string;
  /**
   * Render the editor on a LIGHT surface (async / self-paced quiz). Defaults
   * to the dark teacher-paced treatment so existing call sites are unchanged.
   */
  light?: boolean;
  /** Shows the Insert equation button (quiz math keyboard). */
  mathEnabled?: boolean;
  /** Writing (D8): decides each paste or drop; false blocks it. Absent keeps quiz behaviour. */
  allowInsert?: (
    text: string,
    via: 'paste' | 'drop' | 'drag-inside'
  ) => boolean;
  /** Writing (D8): the text of each copy or cut from the editor, so pasting it back counts as a move. */
  onCopyText?: (text: string) => void;
  /** Writing (D4): turns off the right-click menu, and with it the spelling suggestions. */
  blockContextMenu?: boolean;
  /** Starting height in px; the student can still drag it taller. */
  minHeightPx?: number;
  /** False keeps locked text at full contrast, for work shown read-only. */
  dimWhenDisabled?: boolean;
  /** Speech to text: shows Dictate and lets dictated text in even when paste is blocked. */
  dictation?: EditorDictation;
  ref?: React.Ref<WrittenResponseEditorHandle>;
}

export interface WrittenResponseEditorHandle {
  /** Inserts a passage quote at the student's last cursor spot, or at the end. */
  insertQuote: (quote: { stimulusId: string; text: string }) => void;
}

const BLOCK_SELECTOR = 'p, li, div, blockquote';
const ENGLISH_ONLY: readonly string[] = ['en'];
const DICTATION_UNDO_DEPTH = 20;

/** Where Tidy up stands for this box. */
type TidyState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'same' }
  | { kind: 'preview'; run: DictatedPassage[]; before: string; after: string }
  | { kind: 'done'; passage: DictatedPassage; original: string };

const TIDY_IDLE: TidyState = { kind: 'idle' };

const ESSAY_MIN_HEIGHT_PX = 352; // ~22rem — comfortable on a laptop
const MAX_HEIGHT_PX_CAP = 900; // hard cap so the editor can't push the page
const KEYBOARD_RESIZE_STEP_PX = 32;

const WrittenResponseEditorInner: React.FC<
  Omit<WrittenResponseEditorProps, 'questionKey'>
> = ({
  value,
  onChange,
  placeholder,
  minWords,
  maxWords,
  enforceWordLimit,
  spellCheck = true,
  disabled,
  blockClipboard,
  light = false,
  mathEnabled = false,
  allowInsert,
  onCopyText,
  blockContextMenu = false,
  minHeightPx,
  dimWhenDisabled = true,
  dictation,
  ref,
}) => {
  const { t } = useTranslation();
  const editorRef = useRef<HTMLDivElement | null>(null);
  // Open equation panel; `editing` when it changes the chip held in `editingChipRef`.
  const [mathDraft, setMathDraft] = useState<{
    editing: boolean;
    latex: string;
    plain: string;
  } | null>(null);
  const editingChipRef = useRef<HTMLElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [wordCount, setWordCount] = useState(() => countWords(value));
  const [isEmpty, setIsEmpty] = useState(() => !value.trim());

  // Student-controlled editor height. Starts at the per-question default;
  // they can drag the bottom-right grip to enlarge it (or use ↑/↓ when the
  // handle has keyboard focus). Resets on remount per question via the
  // `questionKey` wrapper.
  const minHeight = minHeightPx ?? ESSAY_MIN_HEIGHT_PX;
  // Set while a drag started inside the editor, so dropping it back is a move.
  const draggingInsideRef = useRef(false);
  const [heightPx, setHeightPx] = useState<number>(minHeight);
  // Cap at the smaller of 70vh and MAX_HEIGHT_PX_CAP so very tall windows
  // can't stretch the editor past a reasonable working size.
  const maxHeight = (): number => {
    if (typeof window === 'undefined') return MAX_HEIGHT_PX_CAP;
    return Math.min(MAX_HEIGHT_PX_CAP, Math.round(window.innerHeight * 0.7));
  };

  // Pointer-drag resize. `pointer-events: none` on body during drag would
  // be cleaner, but we only need to track the y delta and clamp.
  const dragStateRef = useRef<{ startY: number; startHeight: number } | null>(
    null
  );
  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    dragStateRef.current = {
      startY: e.clientY,
      startHeight: heightPx,
    };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const state = dragStateRef.current;
    if (!state) return;
    const delta = e.clientY - state.startY;
    const next = Math.max(
      minHeight,
      Math.min(maxHeight(), state.startHeight + delta)
    );
    setHeightPx(next);
  };
  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (dragStateRef.current) {
      try {
        (e.currentTarget as Element).releasePointerCapture(e.pointerId);
      } catch (err) {
        // `releasePointerCapture` throws `InvalidStateError` if the capture
        // was already released (e.g. by `pointercancel` firing before
        // `pointerup`). Anything else is unexpected — surface it instead
        // of swallowing the whole class of DOM errors silently.
        if (!(
          err instanceof DOMException && err.name === 'InvalidStateError'
        )) {
          console.warn(
            '[WrittenResponseEditor] unexpected releasePointerCapture error',
            err
          );
        }
      }
      dragStateRef.current = null;
    }
  };
  const handleHandleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHeightPx((h) => Math.min(maxHeight(), h + KEYBOARD_RESIZE_STEP_PX));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHeightPx((h) => Math.max(minHeight, h - KEYBOARD_RESIZE_STEP_PX));
    }
  };

  // If the student shrinks the browser window after dragging the editor
  // taller than the new max, the stored height stays stale until the next
  // interaction — leaving the editor visibly taller than 70vh allows.
  // Re-clamp on viewport resize so the cap stays honest. Floored at
  // `minHeight` because a viewport smaller than the editor's minimum is
  // a worse problem than ignoring this clamp.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => {
      setHeightPx((h) => Math.max(minHeight, Math.min(h, maxHeight())));
    };
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, [minHeight]);

  // Install the drag-select enhancer once the editor is mounted.
  // Chrome's default drag-selection inside contenteditable anchors to
  // the clicked text node and refuses to extend across block
  // boundaries — clicking the first character of paragraph 1 and
  // dragging through paragraph 3 only selects paragraph 1. The
  // enhancer overrides extension on every mousemove using
  // `caretPositionFromPoint` so the selection always reaches the
  // pointer's actual position.
  useEffect(() => {
    if (!editorRef.current) return undefined;
    return installDragSelectEnhancer(editorRef.current);
  }, []);

  // Seed innerHTML once on mount. Subsequent edits are driven by the
  // contenteditable element itself — re-writing innerHTML on every value
  // change would reset the caret on every keystroke.
  //
  // After seeding, normalize the block structure to uniform `<p>` blocks
  // so a resumed response with legacy mixed content (bare text + <br>
  // from earlier Phase 1 saves) renders with the same selection / list-
  // command behavior the live editor uses. No-op for already-uniform
  // content. `wrapTag: 'p'` because `sanitizeQuizResponse` allows `<p>`
  // but strips `<div>` — using `<div>` here would lose paragraph
  // structure on the next save.
  useEffect(() => {
    if (!editorRef.current) return;
    const initial = sanitizeQuizResponse(value);
    editorRef.current.innerHTML = initial;
    normalizeEditorBlocks(editorRef.current, { wrapTag: 'p' });
    lockMathChips(editorRef.current);
    void drawMathChips(editorRef.current);
    setWordCount(countWords(initial));
    setIsEmpty(!editorRef.current.textContent?.trim());
    // We intentionally don't depend on `value` — the `questionKey`-driven
    // remount in the parent handles "load a different student's response."
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Remember the caret so a quote picked from the passage lands where the student left off.
  useEffect(() => {
    const onSelectionChange = () => {
      const sel = document.getSelection();
      const el = editorRef.current;
      if (!sel || sel.rangeCount === 0 || !el) return;
      const range = sel.getRangeAt(0);
      if (el.contains(range.commonAncestorContainer)) {
        savedRangeRef.current = range.cloneRange();
      }
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () =>
      document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  const handleInput = () => {
    if (!editorRef.current) return;
    // Normalize the live editor structure before reading innerHTML.
    // Chrome leaves the FIRST line as a bare text node and only wraps
    // subsequent Enter-separated lines in `<div>` blocks — that mixed
    // shape (a) collapses drag-selection at the paragraph boundary,
    // (b) makes `insertUnorderedList` / `insertOrderedList` apply to
    // only the cursor's paragraph instead of the visible selection,
    // and (c) loses paragraph structure on save because
    // `sanitizeQuizResponse` strips `<div>`. The helper is a fast
    // no-op for already-uniform structures and only moves nodes
    // (never clones), so the user's caret survives per the DOM spec.
    if (needsBlockNormalization(editorRef.current, { wrapTag: 'p' })) {
      normalizeEditorBlocks(editorRef.current, { wrapTag: 'p' });
    }
    const raw = plainMathHtml(editorRef.current);
    const clean = sanitizeQuizResponse(raw);
    setWordCount(countWords(clean));
    setIsEmpty(!editorRef.current.textContent?.trim());
    onChange(clean);
  };

  // The student's last cursor spot (or the end), never inside a quote or equation; null when `create` is off and the box is empty.
  const insertionRange = (create: boolean): Range | null => {
    const el = editorRef.current;
    if (!el) return null;
    let range = savedRangeRef.current?.cloneRange() ?? null;
    if (!range || !el.contains(range.commonAncestorContainer)) {
      const block =
        el.lastElementChild ??
        (create ? el.appendChild(document.createElement('p')) : null);
      if (!block) return null;
      range = document.createRange();
      range.selectNodeContents(block);
      range.collapse(false);
    }
    // Paragraph tidying can leave the saved caret on the editor itself; move it into the paragraph beside it.
    if (range.startContainer === el) {
      const prev = el.childNodes[range.startOffset - 1];
      const next = el.childNodes[range.startOffset];
      const block = prev ?? next;
      if (block instanceof Element) {
        range = document.createRange();
        range.selectNodeContents(block);
        range.collapse(block !== prev);
      }
    }
    const startEl =
      range.startContainer instanceof Element
        ? range.startContainer
        : range.startContainer.parentElement;
    const insideQuote = startEl?.closest(
      `span[${QUOTE_ATTR}], span[${MATH_ATTR}]`
    );
    if (insideQuote && el.contains(insideQuote)) {
      range.setStartAfter(insideQuote);
      range.collapse(true);
    }
    // Insert after a highlighted passage of the student's own writing rather than replacing it.
    range.collapse(false);
    return range;
  };

  // Puts nodes at the insertion spot; `autoSpace` adds a space after a word.
  const placeNodes = (
    nodes: Node[],
    options: { autoSpace?: boolean; beforeInsert?: () => void } = {}
  ) => {
    const el = editorRef.current;
    if (!el || disabled || nodes.length === 0) return;
    const range = insertionRange(true);
    if (!range) return;
    const { startContainer, startOffset } = range;
    const before =
      startContainer.nodeType === Node.TEXT_NODE
        ? (startContainer.textContent ?? '').slice(0, startOffset)
        : (startContainer.childNodes[startOffset - 1]?.textContent ?? '');
    if (options.autoSpace !== false && before && !/\s$/.test(before)) {
      nodes.unshift(document.createTextNode(' '));
    }
    options.beforeInsert?.();
    const fragment = document.createDocumentFragment();
    fragment.append(...nodes);
    range.insertNode(fragment);
    el.focus();
    const caret = document.createRange();
    caret.setStartAfter(nodes[nodes.length - 1]);
    caret.collapse(true);
    const sel = document.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(caret);
    savedRangeRef.current = caret.cloneRange();
    handleInput();
  };

  const dictatedRef = useRef<DictatedPassage[]>([]);
  const [hasDictated, setHasDictated] = useState(false);
  const [tidy, setTidy] = useState<TidyState>(TIDY_IDLE);
  const [tidyOff, setTidyOff] = useState(isTidyUpOff);

  // Dictated text goes straight into the DOM, so no paste, drop or input event fires for it.
  const insertDictated = (text: string) => {
    const el = editorRef.current;
    if (!el || disabled || !text) return;
    const passage = buildDictatedPassage(document, text);
    placeNodes(
      passage.pieces.map((p) => p.node),
      {
        autoSpace: false,
        beforeInsert: () => {
          dictation?.onInsert?.(text);
          dispatchDictation(el, 'before', 0);
        },
      }
    );
    dictatedRef.current = [...dictatedRef.current, passage].slice(
      -DICTATION_UNDO_DEPTH
    );
    setHasDictated(true);
    setTidy(TIDY_IDLE);
    dispatchDictation(el, 'after', [...text].length);
  };

  // "Undo that": takes the last dictated passage back out if it is still there, unedited.
  const undoDictated = () => {
    const el = editorRef.current;
    const passage = dictatedRef.current[dictatedRef.current.length - 1];
    if (!el || disabled || !passage) return;
    dictatedRef.current = dictatedRef.current.slice(0, -1);
    setHasDictated(dictatedRef.current.length > 0);
    setTidy(TIDY_IDLE);
    if (!passageIntact(el, passage)) return;
    dispatchDictation(el, 'before', 0);
    savedRangeRef.current = removePieces(passage.pieces);
    handleInput();
    dispatchDictation(el, 'after', 0);
  };

  // Swaps intact dictated passages for new text in place; the caller is told first so the edit is labelled dictated.
  const swapDictated = (
    run: readonly DictatedPassage[],
    text: string
  ): DictatedPassage | null => {
    const el = editorRef.current;
    if (!el || disabled || run.length === 0) return null;
    if (!run.every((passage) => passageIntact(el, passage))) return null;
    const pieces = run.flatMap((passage) => passage.pieces);
    const before = run.map((passage) => passage.text).join('');
    const next = buildDictatedPassage(document, text);
    const follow = caretEndsPassage(savedRangeRef.current, pieces);
    const sel = document.getSelection();
    const followSelection =
      !!sel &&
      sel.rangeCount > 0 &&
      caretEndsPassage(sel.getRangeAt(0), pieces);
    dictation?.onInsert?.(text);
    dispatchDictation(el, 'before', 0);
    const after = replacePieces(pieces, next);
    if (follow) savedRangeRef.current = after.cloneRange();
    if (followSelection && sel) {
      sel.removeAllRanges();
      sel.addRange(after);
    }
    const at = dictatedRef.current.indexOf(run[0]);
    const rest = dictatedRef.current.filter((p) => !run.includes(p));
    rest.splice(at < 0 ? rest.length : at, 0, next);
    dictatedRef.current = rest;
    handleInput();
    dispatchDictation(
      el,
      'after',
      Math.max(0, [...text].length - [...before].length)
    );
    return next;
  };

  // The paid engine heard a phrase better: fix it only if the student has not touched it since.
  const reviseDictated = (previous: string, next: string) => {
    const at = dictatedRef.current.map((p) => p.text).lastIndexOf(previous);
    if (at < 0 || !next) return;
    swapDictated([dictatedRef.current[at]], next);
  };

  // Text in the caret's paragraph up to the caret, so dictation spaces and capitalises to fit.
  const dictationTextBefore = (): string => {
    const range = insertionRange(false);
    const el = editorRef.current;
    if (!range || !el) return '';
    const startEl =
      range.startContainer instanceof Element
        ? range.startContainer
        : range.startContainer.parentElement;
    const block = startEl?.closest(BLOCK_SELECTOR);
    const before = document.createRange();
    before.selectNodeContents(block && el.contains(block) ? block : el);
    before.setEnd(range.startContainer, range.startOffset);
    return before.toString();
  };

  const dictationController = useDictation({
    enabled: dictation !== undefined && !disabled,
    languages: dictation?.languages ?? ENGLISH_ONLY,
    onCommit: insertDictated,
    onUndo: undoDictated,
    onRevise: reviseDictated,
    textBefore: dictationTextBefore,
    paid: dictation?.paid,
  });
  const dictationInterim = dictation ? dictationController.interim : '';
  const paidSettings = useSpeechToTextSettings(
    disabled ? undefined : dictation?.paid?.assignmentId
  );
  const tidyOffered =
    dictation?.paid !== undefined &&
    paidSettings.tidyUp &&
    !tidyOff &&
    !disabled &&
    dictationController.supported;
  const showTidyButton =
    tidyOffered && hasDictated && dictationController.status === 'idle';

  const tidyPassage = async () => {
    const el = editorRef.current;
    const paid = dictation?.paid;
    if (!el || !paid || disabled) return;
    const run = latestDictatedRun(el, dictatedRef.current, TIDY_MAX_CHARS);
    const before = run.map((passage) => passage.text).join('');
    const lead = /^\s*/.exec(before)?.[0] ?? '';
    const spoken = before.trim();
    if (!spoken) {
      setHasDictated(false);
      return;
    }
    setTidy({ kind: 'loading' });
    try {
      const response = await callTidyDictation({
        assignmentId: paid.assignmentId,
        text: spoken,
        language: dictationController.language,
      });
      if ('fallback' in response) throw new Error(response.fallback);
      const tidied = response.text.trim();
      setTidy(
        !tidied || tidied === spoken
          ? { kind: 'same' }
          : { kind: 'preview', run, before: spoken, after: lead + tidied }
      );
    } catch {
      // D10: no message; the button is gone for the rest of the page.
      markTidyUpOff();
      setTidyOff(true);
      setTidy(TIDY_IDLE);
    }
  };

  const acceptTidied = () => {
    if (tidy.kind !== 'preview') return;
    const original = tidy.run.map((passage) => passage.text).join('');
    const passage = swapDictated(tidy.run, tidy.after);
    setTidy(passage ? { kind: 'done', passage, original } : TIDY_IDLE);
  };

  const undoTidied = () => {
    if (tidy.kind !== 'done') return;
    swapDictated([tidy.passage], tidy.original);
    setTidy(TIDY_IDLE);
  };

  useImperativeHandle(ref, () => ({
    insertQuote: (quote) => {
      if (!quote.text) return;
      placeNodes(buildQuoteNodes(document, quote));
    },
  }));

  const openEquation = (chip: HTMLElement | null) => {
    if (disabled) return;
    editingChipRef.current = chip;
    setMathDraft({
      editing: chip !== null,
      latex: chip?.getAttribute(MATH_ATTR) ?? '',
      plain: chip?.getAttribute(MATH_PLAIN_ATTR) ?? chip?.textContent ?? '',
    });
  };

  const commitEquation = () => {
    const draft = mathDraft;
    const editing = editingChipRef.current;
    editingChipRef.current = null;
    setMathDraft(null);
    const el = editorRef.current;
    if (!draft || !el) return;
    const plain = draft.plain.trim();
    if (editing && el.contains(editing)) {
      if (plain) {
        editing.setAttribute(MATH_ATTR, draft.latex);
        editing.removeAttribute(MATH_PLAIN_ATTR);
        editing.textContent = plain;
      } else {
        editing.remove();
      }
      handleInput();
      void drawMathChips(el);
      return;
    }
    if (!plain) return;
    const chip = document.createElement('span');
    chip.setAttribute(MATH_ATTR, draft.latex);
    chip.setAttribute('contenteditable', 'false');
    chip.textContent = plain;
    placeNodes([chip, document.createTextNode(' ')]);
    void drawMathChips(el);
  };

  // Strip formatting from pasted content so students can't inject styled
  // HTML by copy/pasting from rich sources. We only allow plain text on
  // paste; the toolbar buttons are the only path to formatting.
  //
  // When `blockClipboard` is on (teacher enabled "Block Copy & Paste"),
  // paste is suppressed entirely — preventDefault and bail before inserting.
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (blockClipboard) return;
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    if (allowInsert && !allowInsert(text, 'paste')) return;
    // Insert as plain text at the current selection.
    document.execCommand('insertText', false, text);
  };

  // Block copy/cut from inside the editor when clipboard is locked. (Paste is
  // handled above.) A no-op handler otherwise so the native clipboard works.
  const handleClipboardCopyCut = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (blockClipboard) {
      e.preventDefault();
      return;
    }
    onCopyText?.(document.getSelection()?.toString() ?? '');
  };

  // Drag-and-drop is the other channel for importing externally-composed text,
  // so block native drops when clipboard is locked. In-app this also bubbles
  // to QuizStudentApp's container guard, but keeping it here makes the editor
  // self-contained for any other caller.
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const inside = draggingInsideRef.current;
    draggingInsideRef.current = false;
    if (blockClipboard) {
      e.preventDefault();
      return;
    }
    if (!allowInsert) return;
    const text = e.dataTransfer.getData('text/plain');
    if (!allowInsert(text, inside ? 'drag-inside' : 'drop')) e.preventDefault();
  };

  const exec = (command: string) => {
    if (disabled) return;
    editorRef.current?.focus();
    document.execCommand(command);
    handleInput();
  };

  // Custom list handler that bypasses the broken Chrome
  // `execCommand('insertUnorderedList' | 'insertOrderedList')` —
  // see `utils/contentEditableLists.ts` for the underlying bug.
  // Wraps every paragraph the selection touches into a single
  // `<ul>`/`<ol>`, or toggles it back to `<p>` blocks if every
  // selected item is already in the target list type.
  const handleListToggle = (listTag: 'ul' | 'ol') => {
    if (disabled || !editorRef.current) return;
    editorRef.current.focus();
    // `toggleList` collects from `editor.children` (excludes text
    // nodes), so any loose top-level text must be wrapped first.
    ensureTopLevelBlocks(editorRef.current, { wrapTag: 'p' });
    toggleList(editorRef.current, listTag, 'p');
    handleInput();
  };

  const limit = { minWords, maxWords, enforceWordLimit };
  const limitTone = wordLimitStatus(wordCount, limit).tone;
  const outsideRange = limitTone !== 'ok';

  return (
    <div className="flex flex-col gap-2 w-full" ref={containerRef}>
      <div
        className={`flex items-center gap-1 px-2 py-1.5 border rounded-t-2xl ${
          light
            ? 'bg-slate-50 border-slate-200'
            : 'bg-slate-800 border-slate-700'
        }`}
      >
        <ToolbarButton
          label="Bold"
          tourKey="bold"
          onClick={() => exec('bold')}
          disabled={disabled}
          light={light}
        >
          <Bold className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          tourKey="italic"
          onClick={() => exec('italic')}
          disabled={disabled}
          light={light}
        >
          <Italic className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          tourKey="underline"
          onClick={() => exec('underline')}
          disabled={disabled}
          light={light}
        >
          <Underline className="w-4 h-4" />
        </ToolbarButton>
        <div
          className={`w-px h-5 mx-1 ${light ? 'bg-slate-200' : 'bg-slate-700'}`}
        />
        <ToolbarButton
          label="Bulleted list"
          tourKey="bullets"
          onClick={() => handleListToggle('ul')}
          disabled={disabled}
          light={light}
        >
          <List className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          tourKey="numbers"
          onClick={() => handleListToggle('ol')}
          disabled={disabled}
          light={light}
        >
          <ListOrdered className="w-4 h-4" />
        </ToolbarButton>
        {mathEnabled && (
          <>
            <div
              className={`w-px h-5 mx-1 ${light ? 'bg-slate-200' : 'bg-slate-700'}`}
            />
            <ToolbarButton
              label="Insert equation"
              tourKey="equation"
              onClick={() => openEquation(null)}
              disabled={disabled}
              light={light}
            >
              <Sigma className="w-4 h-4" />
            </ToolbarButton>
          </>
        )}
        {dictation && dictationController.supported && (
          <>
            <div
              className={`w-px h-5 mx-1 ${light ? 'bg-slate-200' : 'bg-slate-700'}`}
            />
            <DictateButton
              controller={dictationController}
              light={light}
              disabled={disabled}
            />
            {showTidyButton && (
              <TidyUpButton
                onClick={() => void tidyPassage()}
                busy={tidy.kind === 'loading'}
                light={light}
                disabled={disabled}
              />
            )}
          </>
        )}
        <div className="flex-1" />
        <span
          className={`text-xs font-mono px-2 py-0.5 rounded ${
            outsideRange
              ? light
                ? 'bg-amber-100 text-amber-700'
                : 'bg-amber-500/20 text-amber-300'
              : light
                ? 'text-slate-500'
                : 'text-slate-300'
          }`}
        >
          {wordCounterLabel(wordCount, limit)}
        </span>
      </div>

      {mathDraft && (
        <div
          className={`flex flex-col gap-2 p-2 border rounded-xl ${
            light
              ? 'bg-slate-50 border-slate-200'
              : 'bg-slate-800 border-slate-700'
          }`}
        >
          <React.Suspense fallback={null}>
            <MathAnswerField
              value={mathDraft.plain}
              initialLatex={mathDraft.latex || undefined}
              autoFocus
              ariaLabel="Equation"
              className={
                light
                  ? 'bg-white border-slate-300 text-slate-900'
                  : 'bg-slate-900 border-slate-700 text-white'
              }
              onChange={(plain, latex) =>
                setMathDraft((d) => (d ? { ...d, plain, latex } : d))
              }
              onEnter={commitEquation}
            />
          </React.Suspense>
          <div className="flex justify-center gap-2">
            <button
              {...tourAttr('student.quiz.equation-cancel')}
              type="button"
              onClick={() => {
                editingChipRef.current = null;
                setMathDraft(null);
              }}
              className={`px-4 py-2 rounded-lg text-sm font-bold ${
                light
                  ? 'text-slate-600 hover:bg-slate-100'
                  : 'text-slate-300 hover:bg-slate-700'
              }`}
            >
              Cancel
            </button>
            <button
              {...tourAttr('student.quiz.equation-insert')}
              type="button"
              onClick={commitEquation}
              className="px-4 py-2 rounded-lg text-sm font-bold bg-brand-blue-primary text-white hover:bg-brand-blue-dark"
            >
              {mathDraft.editing ? 'Update' : 'Insert'}
            </button>
          </div>
        </div>
      )}

      <div className="relative">
        <div
          {...tourAttr('student.quiz.written-answer')}
          ref={editorRef}
          role="textbox"
          aria-multiline="true"
          aria-label="Your response"
          aria-placeholder={placeholder}
          aria-disabled={disabled ? 'true' : 'false'}
          // contenteditable is not naturally in the tab order; opt in so
          // keyboard-only users can reach the editor after navigating
          // past the toolbar buttons.
          tabIndex={disabled ? -1 : 0}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={handleInput}
          onClick={(e) => {
            if (!mathEnabled || !(e.target instanceof Element)) return;
            const chip = e.target.closest<HTMLElement>(`span[${MATH_ATTR}]`);
            if (chip && editorRef.current?.contains(chip)) openEquation(chip);
          }}
          onPaste={handlePaste}
          onCopy={handleClipboardCopyCut}
          onCut={handleClipboardCopyCut}
          onDrop={handleDrop}
          onDragStart={() => {
            draggingInsideRef.current = true;
          }}
          onDragEnd={() => {
            draggingInsideRef.current = false;
          }}
          onContextMenu={
            blockContextMenu ? (e) => e.preventDefault() : undefined
          }
          spellCheck={spellCheck}
          className={`rich-text-content w-full px-5 py-4 border-2 border-t-0 ${
            light ? 'bg-white' : 'bg-slate-800'
          } ${
            disabled && !dimWhenDisabled
              ? 'border-slate-200 text-slate-800 cursor-default'
              : disabled
                ? light
                  ? 'border-slate-200 text-slate-400 cursor-not-allowed'
                  : 'border-slate-700 text-slate-400 cursor-not-allowed'
                : light
                  ? 'border-slate-300 text-slate-900 focus:outline-hidden focus:border-brand-blue-light focus-visible:ring-2 focus-visible:ring-brand-blue-light'
                  : 'border-slate-700 text-white focus:outline-hidden focus:border-violet-500 focus-visible:ring-2 focus-visible:ring-violet-400'
          } rounded-b-2xl text-base leading-relaxed overflow-y-auto [&_[data-math]]:inline-block [&_[data-math]]:px-1.5 [&_[data-math]]:mx-0.5 [&_[data-math]]:rounded [&_[data-math]]:align-middle [&_[data-math]]:cursor-pointer ${
            light
              ? '[&_[data-math]]:bg-slate-100 [&_[data-math]]:text-slate-900'
              : '[&_[data-math]]:bg-slate-700 [&_[data-math]]:text-white'
          }`}
          style={{
            wordBreak: 'break-word',
            height: `${heightPx}px`,
            minHeight: `${minHeight}px`,
          }}
        />
        {isEmpty && placeholder && (
          <div
            className={`absolute inset-0 px-5 py-4 text-base pointer-events-none select-none ${light ? 'text-slate-500' : 'text-slate-300'}`}
            aria-hidden
          >
            {placeholder}
          </div>
        )}
        {!disabled && (
          <button
            {...tourAttr('student.quiz.written-resize')}
            type="button"
            aria-label="Drag to resize response area (or use up and down arrow keys)"
            title="Drag to resize"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onKeyDown={handleHandleKeyDown}
            className={`absolute bottom-1.5 right-2 flex items-center justify-center w-7 h-5 rounded cursor-ns-resize touch-none focus-visible:outline-hidden focus-visible:ring-2 ${
              light
                ? 'text-slate-400 hover:text-slate-600 hover:bg-slate-100 focus-visible:ring-brand-blue-light'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/70 focus-visible:ring-violet-400'
            }`}
          >
            <GripHorizontal className="w-4 h-4" />
          </button>
        )}
      </div>
      {dictationInterim && (
        <p
          data-testid="dictation-interim"
          aria-live="polite"
          className={`px-2 text-sm italic ${light ? 'text-slate-500' : 'text-slate-300'}`}
        >
          {dictationInterim}
        </p>
      )}
      {tidyOffered && tidy.kind === 'preview' && (
        <TidyUpPreview
          before={tidy.before}
          after={tidy.after.trim()}
          onUse={acceptTidied}
          onKeep={() => setTidy(TIDY_IDLE)}
          light={light}
        />
      )}
      {tidyOffered && tidy.kind === 'done' && (
        <TidyUpNotice
          message={t('dictate.tidyDone', 'Tidied up.')}
          onUndo={undoTidied}
          light={light}
        />
      )}
      {tidyOffered && tidy.kind === 'same' && (
        <TidyUpNotice
          message={t('dictate.tidyNoChange', 'Nothing to tidy up.')}
          light={light}
        />
      )}
    </div>
  );
};

const ToolbarButton: React.FC<{
  label: string;
  tourKey: string;
  onClick: () => void;
  disabled?: boolean;
  light?: boolean;
  children: React.ReactNode;
}> = ({ label, tourKey, onClick, disabled, light = false, children }) => (
  <button
    {...tourFieldAttr('student.quiz.written-format', 'quiz-student', tourKey)}
    type="button"
    aria-label={label}
    title={label}
    disabled={disabled}
    onMouseDown={(e) => {
      // Prevent the contenteditable from losing focus when the user clicks
      // a toolbar button — execCommand operates on the active selection.
      e.preventDefault();
    }}
    onClick={onClick}
    className={`p-1.5 rounded focus-visible:outline-hidden focus-visible:ring-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
      light
        ? 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-brand-blue-light'
        : 'text-slate-300 hover:bg-slate-700 hover:text-white focus-visible:ring-violet-400'
    }`}
  >
    {children}
  </button>
);

/**
 * Public wrapper that remounts the inner editor whenever `questionKey`
 * changes — gives us cheap "load a different value" behavior without
 * having to imperatively reset the contenteditable.
 */
export const WrittenResponseEditor: React.FC<WrittenResponseEditorProps> = (
  props
) => {
  return <WrittenResponseEditorInner key={props.questionKey} {...props} />;
};

export default WrittenResponseEditor;
