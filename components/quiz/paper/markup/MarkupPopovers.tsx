import React, {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquarePlus, MessageSquareText, Trash2 } from 'lucide-react';
import { PAPER_MARKUP_MAX_COMMENT_CHARS } from '@/types';
import { tourTypeAttr } from '@/config/tourAnchors';
import type { PaperMarkupEditor } from './usePaperMarkupEditor';

const GAP = 8;
const OFFSET = 6;
/** The counter appears once a comment is this close to the cap. */
export const COMMENT_COUNTER_FROM = PAPER_MARKUP_MAX_COMMENT_CHARS - 60;

type Pos = { left: number; top: number };

/** Places its child beside the marked item and keeps it inside `container`, flipping above near the bottom. */
const AnchoredPopover: React.FC<{
  containerRef: React.RefObject<HTMLElement | null>;
  scrollRef: React.RefObject<HTMLElement | null>;
  anchorId: string;
  /** Changes whenever the anchor may have moved. */
  anchorKey: string;
  /** Fixed width, capped by the panel; omit to size to the content. */
  maxWidth?: number;
  children: React.ReactNode;
}> = ({ containerRef, scrollRef, anchorId, anchorKey, maxWidth, children }) => {
  const popRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const [width, setWidth] = useState<number | undefined>(maxWidth);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const pop = popRef.current;
    if (!container || !pop) return;
    const place = () => {
      const anchor = container.querySelector(
        `[data-markup-anchor="${anchorId}"]`
      );
      if (!anchor) return;
      const c = container.getBoundingClientRect();
      const ox = c.left + container.clientLeft;
      const oy = c.top + container.clientTop;
      const raw = anchor.getBoundingClientRect();
      const view = scrollRef.current?.getBoundingClientRect();
      const clampY = (y: number) =>
        view ? Math.min(Math.max(y, view.top), view.bottom) : y;
      const clampX = (x: number) =>
        view ? Math.min(Math.max(x, view.left), view.right) : x;
      const a = {
        top: clampY(raw.top) - oy,
        bottom: clampY(raw.bottom) - oy,
        mid: clampX((raw.left + raw.right) / 2) - ox,
      };
      const innerW = container.clientWidth;
      const innerH = container.clientHeight;
      const w = Math.min(maxWidth ?? pop.offsetWidth, innerW - GAP * 2);
      const h = pop.offsetHeight;
      const left = Math.min(Math.max(a.mid - w / 2, GAP), innerW - w - GAP);
      // Never above the image box, so the toolbar stays usable; past the panel's bottom is fine.
      const minTop = view ? Math.max(GAP, view.top - oy) : GAP;
      let top = a.bottom + OFFSET;
      if (top + h > innerH - GAP && a.top - OFFSET - h >= minTop)
        top = a.top - OFFSET - h;
      if (maxWidth !== undefined) setWidth(w);
      setPos((p) =>
        p && p.left === left && p.top === top ? p : { left, top }
      );
    };
    place();
    const scroller = scrollRef.current;
    scroller?.addEventListener('scroll', place, { passive: true });
    window.addEventListener('resize', place);
    const ro =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    ro?.observe(container);
    ro?.observe(pop);
    return () => {
      scroller?.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
      ro?.disconnect();
    };
  }, [containerRef, scrollRef, anchorId, anchorKey, maxWidth]);

  return (
    <div
      ref={popRef}
      className="absolute z-popover"
      style={{
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        width,
        maxWidth: `calc(100% - ${GAP * 2}px)`,
        // Opacity, not visibility, so the comment box can take focus before it is placed.
        opacity: pos ? 1 : 0,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
};

const focusLayer = (container: HTMLElement | null) =>
  container
    ?.querySelector<HTMLElement>('[data-tour="quiz-grading.markup-canvas"]')
    ?.focus({ preventScroll: true });

const SMALL_BTN =
  'inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-blue-primary [@media(pointer:coarse)]:h-11';

/** The selection's actions: comment and delete. */
const SelectionBar: React.FC<{ editor: PaperMarkupEditor }> = ({ editor }) => {
  const { t } = useTranslation();
  const tm = (key: string) =>
    t(`quizMediaResponse.grading.paper.markup.${key}`);
  const item = editor.selected;
  if (!item) return null;
  const hasComment = !!item.comment?.trim();
  return (
    <div
      role="group"
      aria-label={tm('selectedMark')}
      className="flex w-max items-center gap-0.5 rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
    >
      <button
        type="button"
        onClick={() => editor.openComment(item.id)}
        {...tourTypeAttr('quiz-grading.markup-add-comment', 'quiz')}
        className={SMALL_BTN}
      >
        {hasComment ? (
          <MessageSquareText aria-hidden className="h-4 w-4 text-slate-500" />
        ) : (
          <MessageSquarePlus aria-hidden className="h-4 w-4 text-slate-500" />
        )}
        {tm(hasComment ? 'editComment' : 'addComment')}
      </button>
      <span aria-hidden className="h-5 w-px bg-slate-200" />
      <button
        type="button"
        onClick={editor.deleteSelected}
        aria-label={tm('delete')}
        title={tm('deleteKeys')}
        {...tourTypeAttr('quiz-grading.markup-selection-delete', 'quiz')}
        className={`${SMALL_BTN} px-1.5 text-slate-500 hover:bg-brand-red-lighter/40 hover:text-brand-red-dark`}
      >
        <Trash2 aria-hidden className="h-4 w-4" />
      </button>
    </div>
  );
};

/** Writing a comment on a mark, or the text of a new pin. */
export const MarkupCommentEditor: React.FC<{
  editor: PaperMarkupEditor;
  heading: string;
  snippets?: readonly string[];
  onClosed?: () => void;
}> = ({ editor, heading, snippets, onClosed }) => {
  const { t } = useTranslation();
  const tm = (key: string, params?: Record<string, unknown>) =>
    t(`quizMediaResponse.grading.paper.markup.${key}`, params);
  const headingId = useId();
  const counterId = useId();
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const onClosedRef = useRef(onClosed);
  useLayoutEffect(() => {
    onClosedRef.current = onClosed;
  });
  useEffect(() => () => onClosedRef.current?.(), []);
  const text = editor.comment?.text ?? '';
  const showCounter = text.length >= COMMENT_COUNTER_FROM;
  const insert = (snippet: string) => {
    const el = textRef.current;
    const at = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? at;
    editor.setCommentText(text.slice(0, at) + snippet + text.slice(end));
    el?.focus();
  };

  return (
    <div
      role="dialog"
      aria-labelledby={headingId}
      className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
    >
      <span
        id={headingId}
        className="text-xxs font-bold uppercase tracking-wider text-slate-500"
      >
        {heading}
      </span>
      <textarea
        ref={textRef}
        autoFocus
        value={text}
        maxLength={PAPER_MARKUP_MAX_COMMENT_CHARS}
        rows={3}
        onChange={(e) => editor.setCommentText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            editor.saveComment();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            editor.cancelComment();
          }
        }}
        aria-label={heading}
        aria-describedby={showCounter ? counterId : undefined}
        placeholder={tm('commentPlaceholder')}
        {...tourTypeAttr('quiz-grading.markup-comment', 'quiz')}
        className="max-h-48 min-h-18 w-full resize-none rounded-lg border [field-sizing:content] border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-blue-primary focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary/20"
      />
      {snippets && snippets.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) insert(e.target.value);
          }}
          aria-label={tm('snippets')}
          {...tourTypeAttr('quiz-grading.markup-snippet', 'quiz')}
          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
        >
          <option value="">{tm('snippets')}</option>
          {snippets.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      )}
      <div className="flex items-center gap-2">
        {showCounter && (
          <span
            id={counterId}
            className={`font-mono text-xs tabular-nums ${
              text.length >= PAPER_MARKUP_MAX_COMMENT_CHARS
                ? 'font-bold text-brand-red-dark'
                : 'text-slate-500'
            }`}
          >
            {tm('counter', {
              count: text.length,
              max: PAPER_MARKUP_MAX_COMMENT_CHARS,
            })}
          </span>
        )}
        <span className="ml-auto" />
        <button
          type="button"
          onClick={editor.cancelComment}
          {...tourTypeAttr('quiz-grading.markup-comment-cancel', 'quiz')}
          className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 [@media(pointer:coarse)]:h-11"
        >
          {tm('cancel')}
        </button>
        <button
          type="button"
          onClick={editor.saveComment}
          title={tm('saveKeys')}
          {...tourTypeAttr('quiz-grading.markup-comment-save', 'quiz')}
          className="inline-flex h-8 items-center rounded-lg bg-brand-blue-primary px-3 text-xs font-bold text-white transition-colors hover:bg-brand-blue-dark [@media(pointer:coarse)]:h-11"
        >
          {tm('save')}
        </button>
      </div>
    </div>
  );
};

/** The popover for whatever the editor has open: a comment, or the selection's actions. */
export const MarkupPopovers: React.FC<{
  editor: PaperMarkupEditor;
  containerRef: React.RefObject<HTMLElement | null>;
  scrollRef: React.RefObject<HTMLElement | null>;
  snippets?: readonly string[];
}> = ({ editor, containerRef, scrollRef, snippets }) => {
  const { t } = useTranslation();
  const tm = (key: string, params?: Record<string, unknown>) =>
    t(`quizMediaResponse.grading.paper.markup.${key}`, params);
  if (editor.dragging) return null;
  const c = editor.comment;
  if (c) {
    const anchorId = c.target === 'item' ? c.id : 'pending-pin';
    const item = c.target === 'item' ? editor.selected : null;
    const anchorKey = JSON.stringify(c.target === 'item' ? item : c.at);
    const n = c.target === 'item' ? editor.numbers.get(c.id) : undefined;
    return (
      <AnchoredPopover
        containerRef={containerRef}
        scrollRef={scrollRef}
        anchorId={anchorId}
        anchorKey={anchorKey}
        maxWidth={300}
      >
        <MarkupCommentEditor
          key={anchorId}
          editor={editor}
          heading={n ? tm('commentNumber', { number: n }) : tm('comment')}
          snippets={snippets}
          onClosed={() => {
            const active = document.activeElement;
            if (!active || active === document.body)
              focusLayer(containerRef.current);
          }}
        />
      </AnchoredPopover>
    );
  }
  if (!editor.selected) return null;
  return (
    <AnchoredPopover
      containerRef={containerRef}
      scrollRef={scrollRef}
      anchorId={editor.selected.id}
      anchorKey={JSON.stringify(editor.selected)}
    >
      <SelectionBar editor={editor} />
    </AnchoredPopover>
  );
};
