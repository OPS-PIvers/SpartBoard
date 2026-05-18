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

import React, { useEffect, useRef, useState } from 'react';
import {
  Bold,
  GripHorizontal,
  Italic,
  List,
  ListOrdered,
  Underline,
} from 'lucide-react';
import { sanitizeQuizResponse } from '@/utils/security';
import {
  ensureTopLevelBlocks,
  needsBlockNormalization,
  normalizeEditorBlocks,
} from '@/utils/contentEditableBlocks';
import { toggleList } from '@/utils/contentEditableLists';
import { installDragSelectEnhancer } from '@/utils/contentEditableDragSelect';

interface WrittenResponseEditorProps {
  /** Initial HTML content. Sanitized on render. */
  value: string;
  /** Called with sanitized HTML on every edit. */
  onChange: (html: string) => void;
  /** Optional placeholder displayed when the editor is empty. */
  placeholder?: string;
  /** Optional soft word cap shown in the counter. 0/undefined = no cap. */
  maxWords?: number;
  /** Disable editing (e.g. when the quiz is paused or submitted). */
  disabled?: boolean;
  /**
   * When true, the toolbar exposes list controls and the editor grows to a
   * multi-paragraph height. Short-answer questions stay single-paragraph.
   */
  isEssay?: boolean;
  /**
   * Stable identity for the current question. Changing this remounts the
   * inner editor so a fresh `value` is loaded — used for cross-question
   * navigation and pause/resume rehydration without manually managing the
   * caret/selection.
   */
  questionKey: string;
}

const countWords = (html: string): number => {
  if (!html) return 0;
  // Strip tags, normalize whitespace, count word-ish runs.
  //
  // Known limitation (Phase 1): this is a whitespace-delimited token
  // count. CJK scripts (Chinese / Japanese / Korean) without inter-word
  // spaces will under-count (a 400-character Mandarin response counts
  // as 1 "word"), and HTML entities like `&amp;` survive the tag-strip
  // and inflate the count by one. The word cap is described to teachers
  // as a "soft suggestion" so the imprecision is acceptable for now —
  // Phase 2 can swap to `Intl.Segmenter(locale, { granularity: 'word' })`
  // operating on `editorRef.current.textContent` for proper Unicode
  // segmentation if non-Latin classrooms surface this as a real
  // problem.
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return 0;
  return text.split(' ').length;
};

const ESSAY_MIN_HEIGHT_PX = 352; // ~22rem — comfortable on a laptop
const SHORT_MIN_HEIGHT_PX = 128; // ~8rem
const MAX_HEIGHT_PX_CAP = 900; // hard cap so the editor can't push the page
const KEYBOARD_RESIZE_STEP_PX = 32;

const WrittenResponseEditorInner: React.FC<
  Omit<WrittenResponseEditorProps, 'questionKey'>
> = ({ value, onChange, placeholder, maxWords, disabled, isEssay }) => {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [wordCount, setWordCount] = useState(() => countWords(value));
  const [isEmpty, setIsEmpty] = useState(() => !value.trim());

  // Student-controlled editor height. Starts at the per-question default;
  // they can drag the bottom-right grip to enlarge it (or use ↑/↓ when the
  // handle has keyboard focus). Resets on remount per question via the
  // `questionKey` wrapper.
  const minHeight = isEssay ? ESSAY_MIN_HEIGHT_PX : SHORT_MIN_HEIGHT_PX;
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
        if (
          !(err instanceof DOMException && err.name === 'InvalidStateError')
        ) {
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
    setWordCount(countWords(initial));
    setIsEmpty(!editorRef.current.textContent?.trim());
    // We intentionally don't depend on `value` — the `questionKey`-driven
    // remount in the parent handles "load a different student's response."
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const raw = editorRef.current.innerHTML;
    const clean = sanitizeQuizResponse(raw);
    setWordCount(countWords(clean));
    setIsEmpty(!editorRef.current.textContent?.trim());
    onChange(clean);
  };

  // Strip formatting from pasted content so students can't inject styled
  // HTML by copy/pasting from rich sources. We only allow plain text on
  // paste; the toolbar buttons are the only path to formatting.
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    // Insert as plain text at the current selection.
    document.execCommand('insertText', false, text);
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
    // Always wrap loose top-level content in `<p>` blocks first. The
    // weaker `needsBlockNormalization` skips inline-only content (to
    // avoid stray line-boxes for `<b>hi</b>`-style snippets), but
    // `toggleList` collects from `editor.children` and silently no-ops
    // when no element children exist. ensureTopLevelBlocks is a no-op
    // when content already has blocks.
    ensureTopLevelBlocks(editorRef.current, { wrapTag: 'p' });
    toggleList(editorRef.current, listTag, 'p');
    handleInput();
  };

  const overCap = !!maxWords && maxWords > 0 && wordCount > maxWords;

  return (
    <div className="flex flex-col gap-2 w-full" ref={containerRef}>
      <div className="flex items-center gap-1 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-t-2xl">
        <ToolbarButton
          label="Bold"
          onClick={() => exec('bold')}
          disabled={disabled}
        >
          <Bold className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          onClick={() => exec('italic')}
          disabled={disabled}
        >
          <Italic className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          onClick={() => exec('underline')}
          disabled={disabled}
        >
          <Underline className="w-4 h-4" />
        </ToolbarButton>
        {isEssay && (
          <>
            <div className="w-px h-5 bg-slate-700 mx-1" />
            <ToolbarButton
              label="Bulleted list"
              onClick={() => handleListToggle('ul')}
              disabled={disabled}
            >
              <List className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
              label="Numbered list"
              onClick={() => handleListToggle('ol')}
              disabled={disabled}
            >
              <ListOrdered className="w-4 h-4" />
            </ToolbarButton>
          </>
        )}
        <div className="flex-1" />
        <span
          className={`text-xs font-mono px-2 py-0.5 rounded ${
            overCap ? 'bg-amber-500/20 text-amber-300' : 'text-slate-500'
          }`}
          aria-live="polite"
        >
          {wordCount}
          {maxWords && maxWords > 0 ? ` / ${maxWords}` : ''}{' '}
          {wordCount === 1 ? 'word' : 'words'}
        </span>
      </div>

      <div className="relative">
        <div
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
          onPaste={handlePaste}
          spellCheck
          className={`w-full px-5 py-4 bg-slate-800 border-2 border-t-0 ${
            disabled
              ? 'border-slate-700 text-slate-400 cursor-not-allowed'
              : 'border-slate-700 text-white focus:outline-none focus:border-violet-500 focus-visible:ring-2 focus-visible:ring-violet-400'
          } rounded-b-2xl text-sm leading-relaxed overflow-y-auto`}
          style={{
            wordBreak: 'break-word',
            height: `${heightPx}px`,
            minHeight: `${minHeight}px`,
          }}
        />
        {isEmpty && placeholder && (
          <div
            className="absolute inset-0 px-5 py-4 text-slate-500 text-sm pointer-events-none select-none"
            aria-hidden
          >
            {placeholder}
          </div>
        )}
        {!disabled && (
          <button
            type="button"
            aria-label="Drag to resize response area (or use up and down arrow keys)"
            title="Drag to resize"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onKeyDown={handleHandleKeyDown}
            className="absolute bottom-1.5 right-2 flex items-center justify-center w-7 h-5 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700/70 cursor-ns-resize touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <GripHorizontal className="w-4 h-4" />
          </button>
        )}
      </div>

      {overCap && (
        <p className="text-xs text-amber-400 italic">
          You&apos;re past the suggested word cap. Your teacher may take this
          into account when grading.
        </p>
      )}
    </div>
  );
};

const ToolbarButton: React.FC<{
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ label, onClick, disabled, children }) => (
  <button
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
    className="p-1.5 rounded text-slate-300 hover:bg-slate-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
