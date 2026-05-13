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
import { Bold, Italic, List, ListOrdered, Underline } from 'lucide-react';
import { sanitizeQuizResponse } from '@/utils/security';

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

const WrittenResponseEditorInner: React.FC<
  Omit<WrittenResponseEditorProps, 'questionKey'>
> = ({ value, onChange, placeholder, maxWords, disabled, isEssay }) => {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [wordCount, setWordCount] = useState(() => countWords(value));
  const [isEmpty, setIsEmpty] = useState(() => !value.trim());

  // Seed innerHTML once on mount. Subsequent edits are driven by the
  // contenteditable element itself — re-writing innerHTML on every value
  // change would reset the caret on every keystroke.
  useEffect(() => {
    if (!editorRef.current) return;
    const initial = sanitizeQuizResponse(value);
    editorRef.current.innerHTML = initial;
    setWordCount(countWords(initial));
    setIsEmpty(!editorRef.current.textContent?.trim());
    // We intentionally don't depend on `value` — the `questionKey`-driven
    // remount in the parent handles "load a different student's response."
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInput = () => {
    if (!editorRef.current) return;
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

  const overCap = !!maxWords && maxWords > 0 && wordCount > maxWords;

  return (
    <div className="flex flex-col gap-2 w-full">
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
              onClick={() => exec('insertUnorderedList')}
              disabled={disabled}
            >
              <List className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton
              label="Numbered list"
              onClick={() => exec('insertOrderedList')}
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
          } rounded-b-2xl text-sm leading-relaxed overflow-y-auto ${
            isEssay ? 'min-h-[18rem]' : 'min-h-[6rem]'
          }`}
          style={{ wordBreak: 'break-word' }}
        />
        {isEmpty && placeholder && (
          <div
            className="absolute inset-0 px-5 py-4 text-slate-500 text-sm pointer-events-none select-none"
            aria-hidden
          >
            {placeholder}
          </div>
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
