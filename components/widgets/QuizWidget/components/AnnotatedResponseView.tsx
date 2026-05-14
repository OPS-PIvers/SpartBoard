/**
 * Phase 2 surface for written-response annotations.
 *
 * In `mode="edit"` (teacher's grader):
 *  - Renders the frozen `gradingSnapshot` with existing marks via
 *    `renderAnnotatedSnapshot` (offsets computed against the snapshot's
 *    plaintext projection).
 *  - On mouseup with a non-empty selection, surfaces a small floating
 *    palette anchored to the selection's bounding rect; choosing a color
 *    creates an annotation. Choosing the comment icon also creates an
 *    annotation and selects it.
 *  - When an annotation is active (selected by the teacher or just
 *    created via comment-icon), renders an editor popover anchored next
 *    to the highlighted mark so the comment input is visible exactly
 *    where the teacher is looking. The teacher's right-side annotations
 *    list lives in the parent grader sidebar — clicking a list item
 *    sets `activeId` here and the popover opens at the mark.
 *
 * In `mode="read"` (student review surface after publish):
 *  - Same snapshot rendered read-only.
 *  - Comments appear pinned in the right margin at the same vertical
 *    level as their highlight (with a simple collision-avoidance pass).
 *  - On narrow viewports the margin column stacks below the article as a
 *    plain list.
 *
 * The student's live `answer` field is never read here — the snapshot is
 * the only source of truth, which keeps annotation offsets stable even
 * if the teacher later unlocks the attempt and the student edits.
 */

import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { MessageSquare, Trash2, X } from 'lucide-react';
import type { WrittenAnswerAnnotation } from '@/types';
import {
  getPlainTextOffsetFromRange,
  parseSnapshotRoot,
  renderAnnotatedSnapshot,
} from '@/utils/writtenAnnotations';

type Color = NonNullable<WrittenAnswerAnnotation['highlightColor']>;

const COLORS: { id: Color; label: string; swatch: string }[] = [
  { id: 'yellow', label: 'Yellow highlight', swatch: 'bg-amber-300' },
  { id: 'green', label: 'Green highlight', swatch: 'bg-emerald-300' },
  { id: 'pink', label: 'Pink highlight', swatch: 'bg-pink-300' },
  { id: 'blue', label: 'Blue highlight', swatch: 'bg-sky-300' },
];

// Module-level monotonic counter so back-to-back highlight actions
// inside the same millisecond can't collide on `id`. `useId()` makes
// the prefix unique across React component instances, but two
// annotations in the same modal share the same prefix — without a
// counter, two clicks within one ms would produce identical ids and
// silently overwrite each other in `annotationListsEqual`'s id Map
// and in the renderer's React keys.
let annotationSeq = 0;

interface BaseProps {
  snapshot: string;
  annotations: WrittenAnswerAnnotation[];
}

interface EditProps extends BaseProps {
  mode: 'edit';
  /** Teacher uid stamped on every new annotation. */
  authorUid: string;
  /** Called with the next annotation list whenever it changes. */
  onChange: (next: WrittenAnswerAnnotation[]) => void;
  /**
   * Controlled active-annotation id. The annotation editor popover renders
   * next to this mark; if `null`, no popover is open. The parent grader
   * sidebar drives this when the teacher clicks an annotation list item.
   */
  activeId: string | null;
  /** Called when the active annotation changes (click on mark, popover close, create-with-comment). */
  onActiveIdChange: (id: string | null) => void;
}

interface ReadProps extends BaseProps {
  mode: 'read';
}

type Props = EditProps | ReadProps;

export const AnnotatedResponseView: React.FC<Props> = (props) => {
  if (props.mode === 'read') {
    return <ReadOnlyView {...props} />;
  }
  return <EditView {...props} />;
};

// ─── Read-only (student review) ─────────────────────────────────────────────

const COMMENT_CHIP_MIN_HEIGHT = 56;
const COMMENT_CHIP_GAP = 8;
const COMMENT_COLUMN_WIDTH_PX = 240;

const ReadOnlyView: React.FC<ReadProps> = ({ snapshot, annotations }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // The mark/chip pair currently being pulsed after a click. Cleared a
  // short moment after the click so the highlight feels intentional
  // without lingering forever.
  const [pulsedId, setPulsedId] = useState<string | null>(null);
  // Position of each comment chip in the right margin. Recomputed when
  // the article reflows.
  const [pinnedTops, setPinnedTops] = useState<Record<string, number>>({});
  // `useMediaQuery` would be cleaner, but a one-off matchMedia read
  // avoids pulling in another hook. Mobile (<= md) falls back to a
  // stacked list because absolute-pinning has nowhere to anchor.
  const [isWide, setIsWide] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    if (typeof window.matchMedia !== 'function') return true;
    return window.matchMedia('(min-width: 768px)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => setIsWide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Parse the snapshot once per `snapshot` and re-walk only when
  // `annotations` change. Hover-induced state changes (and the
  // student's own `setHoveredId` updates) would otherwise re-DOMParse
  // the whole snapshot on every render.
  const parsedRoot = useMemo(() => parseSnapshotRoot(snapshot), [snapshot]);
  const tree = useMemo(
    () => renderAnnotatedSnapshot({ root: parsedRoot, annotations }),
    [parsedRoot, annotations]
  );

  const commented = useMemo(
    () => annotations.filter((a) => a.comment?.trim()),
    [annotations]
  );

  // Measure each commented mark's vertical position relative to the
  // article and run a collision-avoidance pass so chips never overlap.
  const recomputePinnedTops = useCallback(() => {
    if (!isWide) return;
    if (!articleRef.current) return;
    const article = articleRef.current;
    const rows: { id: string; top: number }[] = [];
    for (const a of commented) {
      const mark = article.querySelector(
        `mark[data-annotation-id="${CSS.escape(a.id)}"]`
      );
      if (!mark) {
        // The annotation has a comment but no <mark> rendered for it —
        // either offsets pointed past the snapshot's plaintext length or
        // a future renderer change dropped it. Either way the comment
        // would silently disappear from the margin; surface it.
        console.warn(
          '[AnnotatedResponseView] commented annotation has no <mark> in DOM',
          a.id
        );
        continue;
      }
      // Use the first client rect so a mark that wraps to a new line
      // anchors its comment to the FIRST visual line. The bounding rect
      // would span both lines and place the chip in the gap between.
      const rects = (mark as HTMLElement).getClientRects();
      const markRect = rects.length > 0 ? rects[0] : null;
      if (!markRect || (markRect.width === 0 && markRect.height === 0)) {
        continue;
      }
      const articleRect = article.getBoundingClientRect();
      rows.push({ id: a.id, top: markRect.top - articleRect.top });
    }
    rows.sort((a, b) => a.top - b.top);
    // Push down rows that would overlap the previous one.
    const next: Record<string, number> = {};
    let cursor = 0;
    for (const r of rows) {
      const top = Math.max(r.top, cursor);
      next[r.id] = top;
      cursor = top + COMMENT_CHIP_MIN_HEIGHT + COMMENT_CHIP_GAP;
    }
    // Skip the setState entirely when the result is identical so a
    // grader-side annotations array mutation that doesn't shift any
    // mark's position doesn't trigger a render cascade.
    setPinnedTops((prev) => {
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length === nextKeys.length) {
        let same = true;
        for (const k of nextKeys) {
          if (prev[k] !== next[k]) {
            same = false;
            break;
          }
        }
        if (same) return prev;
      }
      return next;
    });
  }, [commented, isWide]);

  // Hold the latest measurement callback in a ref so the long-lived
  // ResizeObserver effect below can invoke the current closure without
  // having to depend on `recomputePinnedTops` itself — depending on it
  // would re-create the observer on every annotation change.
  const recomputePinnedTopsRef = useRef(recomputePinnedTops);
  useEffect(() => {
    recomputePinnedTopsRef.current = recomputePinnedTops;
  }, [recomputePinnedTops]);

  // Measure the rendered article once it's in the DOM. The setState
  // inside `recomputePinnedTops` is the standard DOM-measurement
  // pattern (read layout in useLayoutEffect, project it into state) —
  // there's no external system to synchronize, so the lint rule fires
  // a false positive here.
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    recomputePinnedTops();
  }, [recomputePinnedTops, tree]);

  // Re-measure when the article box itself changes size (font load,
  // viewport resize, content reflow). Observe once per mounted article;
  // the callback ref keeps the listener pointing at the latest closure
  // without churning observer subscriptions.
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const article = articleRef.current;
    if (!article) return;
    const ro = new ResizeObserver(() => recomputePinnedTopsRef.current());
    ro.observe(article);
    return () => ro.disconnect();
  }, []);

  // Auto-clear the pulse after the animation finishes so a second click
  // on the same mark visibly re-triggers it. Watching `pulsedId` directly
  // means: (a) the cleanup function clears the timer on unmount, (b)
  // changing pulsedId mid-pulse (clicking a different mark) cleanly
  // cancels the previous timer via cleanup, (c) the click handler stays
  // a pure setter — no manual timer bookkeeping at the call site.
  useEffect(() => {
    if (!pulsedId) return;
    const t = window.setTimeout(() => setPulsedId(null), 1200);
    return () => window.clearTimeout(t);
  }, [pulsedId]);

  const handleMarkClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const mark = (e.target as HTMLElement).closest('mark');
      if (!mark) return;
      const id = mark.getAttribute('data-annotation-id');
      if (!id) return;
      const a = annotations.find((x) => x.id === id);
      if (!a?.comment?.trim()) return;
      setPulsedId(id);
    },
    [annotations]
  );

  // Stacked (mobile or no-comments) fallback layout.
  if (!isWide || commented.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <article
          ref={articleRef}
          className="rounded-xl border border-slate-700 bg-slate-800/60 p-4 text-sm leading-relaxed text-slate-100 max-w-none [&_mark]:transition-colors"
          onMouseOver={(e) => {
            const t = (e.target as HTMLElement).closest('mark');
            if (t) setHoveredId(t.getAttribute('data-annotation-id'));
          }}
          onMouseOut={() => setHoveredId(null)}
          onClick={handleMarkClick}
        >
          {tree}
        </article>
        {commented.length > 0 && (
          <aside className="flex flex-col gap-2">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Teacher notes
            </h4>
            {commented.map((a) => (
              <CommentChip
                key={a.id}
                annotation={a}
                highlighted={hoveredId === a.id || pulsedId === a.id}
                onHover={(on) => setHoveredId(on ? a.id : null)}
              />
            ))}
          </aside>
        )}
      </div>
    );
  }

  // Wide layout: comments pinned in the right margin, vertically aligned
  // with their highlight. Note the column is `relative` so absolute-pinned
  // chips position against it.
  return (
    <div
      ref={containerRef}
      className="grid grid-cols-[1fr_auto] gap-4"
      style={{ gridTemplateColumns: `1fr ${COMMENT_COLUMN_WIDTH_PX}px` }}
    >
      <article
        ref={articleRef}
        className="rounded-xl border border-slate-700 bg-slate-800/60 p-4 text-sm leading-relaxed text-slate-100 max-w-none [&_mark]:transition-colors"
        onMouseOver={(e) => {
          const t = (e.target as HTMLElement).closest('mark');
          if (t) setHoveredId(t.getAttribute('data-annotation-id'));
        }}
        onMouseOut={() => setHoveredId(null)}
        onClick={handleMarkClick}
      >
        {tree}
      </article>
      <aside
        className="relative"
        style={{ minHeight: '100%' }}
        aria-label="Teacher notes"
      >
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
          Teacher notes
        </h4>
        {commented.map((a) => (
          <CommentChip
            key={a.id}
            annotation={a}
            highlighted={hoveredId === a.id || pulsedId === a.id}
            pinned
            top={pinnedTops[a.id] ?? 0}
            onHover={(on) => setHoveredId(on ? a.id : null)}
          />
        ))}
      </aside>
    </div>
  );
};

const CommentChip: React.FC<{
  annotation: WrittenAnswerAnnotation;
  highlighted: boolean;
  onHover: (on: boolean) => void;
  /** When pinned, the chip uses absolute positioning at the supplied top. */
  pinned?: boolean;
  top?: number;
}> = ({ annotation, highlighted, onHover, pinned, top }) => (
  <div
    className={`rounded-lg border p-2.5 text-xs leading-relaxed transition-colors ${
      highlighted
        ? 'border-violet-400/60 bg-violet-500/10 text-slate-100 shadow-lg shadow-violet-500/10'
        : 'border-slate-700 bg-slate-800/60 text-slate-300'
    } ${pinned ? 'absolute left-0 right-0' : ''}`}
    style={pinned ? { top: `${top ?? 0}px` } : undefined}
    onMouseEnter={() => onHover(true)}
    onMouseLeave={() => onHover(false)}
  >
    <span
      aria-hidden
      className={`inline-block w-2 h-2 rounded-full mr-1.5 ${
        annotation.highlightColor === 'green'
          ? 'bg-emerald-400'
          : annotation.highlightColor === 'pink'
            ? 'bg-pink-400'
            : annotation.highlightColor === 'blue'
              ? 'bg-sky-400'
              : 'bg-amber-400'
      }`}
    />
    {annotation.comment}
  </div>
);

// ─── Edit (teacher grader) ──────────────────────────────────────────────────

const EditView: React.FC<EditProps> = ({
  snapshot,
  annotations,
  authorUid,
  onChange,
  activeId,
  onActiveIdChange,
}) => {
  const articleRef = useRef<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const reactId = useId();
  const [palette, setPalette] = useState<{
    x: number;
    y: number;
    from: number;
    to: number;
  } | null>(null);

  // Same memoization split as ReadOnlyView: parse once per snapshot,
  // re-walk on annotation changes. Critical in edit mode because the
  // popover comment editor calls `onChange` on every keystroke, so
  // `annotations` mutates per keypress and would otherwise re-
  // DOMParse the whole snapshot each time.
  const parsedRoot = useMemo(() => parseSnapshotRoot(snapshot), [snapshot]);
  const tree = useMemo(
    () => renderAnnotatedSnapshot({ root: parsedRoot, annotations }),
    [parsedRoot, annotations]
  );

  // Compute the rectangle of the current text selection inside the
  // article and convert it to plaintext offsets. If nothing's selected
  // (or the selection is outside the article), close the palette.
  const handleMouseUp = useCallback(() => {
    if (!articleRef.current || !containerRef.current) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setPalette(null);
      return;
    }
    const range = selection.getRangeAt(0);
    const offsets = getPlainTextOffsetFromRange(articleRef.current, range);
    if (!offsets) {
      // Surface this — a silently-dismissed palette looks like the
      // feature is broken. Common cause: the selection straddles the
      // article and an adjacent element.
      if (!selection.isCollapsed) {
        console.warn(
          '[AnnotatedResponseView] selection could not be resolved to a snapshot offset (does it escape the response?)'
        );
      }
      setPalette(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setPalette(null);
      return;
    }
    const containerRect = containerRef.current.getBoundingClientRect();
    setPalette({
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.top - containerRect.top - 8,
      from: offsets.from,
      to: offsets.to,
    });
    onActiveIdChange(null);
  }, [onActiveIdChange]);

  // Dismiss the palette / popover on Escape. Listener is scoped to the
  // container so an Escape pressed inside the grading sidebar (Points
  // input, Overall comment textarea) still bubbles to the parent modal's
  // close handler.
  useEffect(() => {
    const containerEl = containerRef.current;
    if (!containerEl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (palette) {
        setPalette(null);
      } else if (activeId) {
        onActiveIdChange(null);
      } else {
        return;
      }
      // Only stop propagation when we actually handled the key, so the
      // parent modal can still close via Esc when nothing's open here.
      e.stopPropagation();
    };
    containerEl.addEventListener('keydown', onKey);
    return () => containerEl.removeEventListener('keydown', onKey);
  }, [palette, activeId, onActiveIdChange]);

  const handleArticleClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const mark = (e.target as HTMLElement).closest('mark');
      if (mark) {
        const id = mark.getAttribute('data-annotation-id');
        if (id) {
          onActiveIdChange(id);
          setPalette(null);
          // Clear any selection so the palette doesn't immediately
          // reopen on mouseup.
          window.getSelection()?.removeAllRanges();
        }
        return;
      }
      // Bare-text click — only dismiss the popover if this is a true
      // click (no active selection). Without this guard, finishing a
      // drag-selection lands a `click` event on bare text and would
      // close the popover the teacher just opened via the palette.
      if (!activeId) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      onActiveIdChange(null);
    },
    [activeId, onActiveIdChange]
  );

  const createAnnotation = useCallback(
    (color: Color, withCommentInput: boolean) => {
      if (!palette) return;
      const id = `${reactId}-${Date.now()}-${++annotationSeq}`;
      const next: WrittenAnswerAnnotation = {
        id,
        from: palette.from,
        to: palette.to,
        highlightColor: color,
        authorUid,
        createdAt: Date.now(),
      };
      onChange([...annotations, next]);
      setPalette(null);
      if (withCommentInput) {
        onActiveIdChange(id);
      }
      window.getSelection()?.removeAllRanges();
    },
    [palette, reactId, authorUid, onChange, annotations, onActiveIdChange]
  );

  const updateActiveAnnotation = useCallback(
    (patch: Partial<WrittenAnswerAnnotation>) => {
      if (!activeId) return;
      onChange(
        annotations.map((a) => (a.id === activeId ? { ...a, ...patch } : a))
      );
    },
    [activeId, annotations, onChange]
  );

  const deleteActive = useCallback(() => {
    if (!activeId) return;
    onChange(annotations.filter((a) => a.id !== activeId));
    onActiveIdChange(null);
  }, [activeId, annotations, onChange, onActiveIdChange]);

  const active = activeId
    ? (annotations.find((a) => a.id === activeId) ?? null)
    : null;

  // Position the comment popover beneath the active mark (or above if it
  // would overflow the container bottom). Recomputes when the active id
  // changes or the article reflows; uses the first client rect so a
  // line-wrapped mark anchors to its first visual line (a single
  // bounding rect would span both lines and place the popover in dead
  // space). Skips the setState when the result is unchanged so
  // keystrokes in the textarea don't flicker the popover.
  const [popoverPos, setPopoverPos] = useState<{
    x: number;
    y: number;
    placement: 'below' | 'above';
  } | null>(null);
  useLayoutEffect(() => {
    if (!activeId || !articleRef.current || !containerRef.current) {
      setPopoverPos((prev) => (prev === null ? prev : null));
      return;
    }
    const mark = articleRef.current.querySelector(
      `mark[data-annotation-id="${CSS.escape(activeId)}"]`
    );
    if (!mark) {
      // The annotation exists in props but no <mark> rendered for it —
      // shouldn't happen after `renderAnnotatedSnapshot`, but if it
      // does the popover would silently disappear without explanation.
      console.warn(
        '[AnnotatedResponseView] active annotation has no <mark> in DOM',
        activeId
      );
      setPopoverPos((prev) => (prev === null ? prev : null));
      return;
    }
    // `getClientRects()` returns one rect per line for a wrapped mark;
    // we use the first so the popover anchors to the first visible line
    // rather than spanning the gap between two. In environments where
    // layout isn't computed (e.g. jsdom in unit tests) the list is empty
    // and we fall back to the single bounding rect so the popover still
    // renders.
    const rects = (mark as HTMLElement).getClientRects();
    const markRect =
      rects.length > 0
        ? rects[0]
        : (mark as HTMLElement).getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    const x = markRect.left - containerRect.left + markRect.width / 2;
    const below = markRect.bottom - containerRect.top + 8;
    const above = markRect.top - containerRect.top - 8;
    // Prefer below; flip if the popover would render past the container.
    const placement: 'below' | 'above' =
      below + 200 > containerRect.height && above > 100 ? 'above' : 'below';
    const next = { x, y: placement === 'below' ? below : above, placement };
    setPopoverPos((prev) =>
      prev &&
      prev.x === next.x &&
      prev.y === next.y &&
      prev.placement === next.placement
        ? prev
        : next
    );
  }, [activeId, tree]);

  return (
    <div ref={containerRef} className="relative">
      <article
        ref={articleRef}
        className="rounded-xl border border-slate-200 bg-white p-6 text-base leading-relaxed text-slate-800 max-w-none cursor-text select-text"
        onMouseUp={handleMouseUp}
        onClick={handleArticleClick}
      >
        {tree}
      </article>
      {palette && (
        <div
          role="toolbar"
          aria-label="Annotation palette"
          className="absolute z-popover -translate-x-1/2 -translate-y-full flex items-center gap-1 px-1.5 py-1 bg-slate-900 text-white rounded-lg shadow-xl"
          style={{ left: palette.x, top: palette.y }}
          // Prevent the article's mouseup from clearing the selection
          // before we read it; the palette handles its own clicks.
          onMouseDown={(e) => e.preventDefault()}
        >
          {COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-label={c.label}
              title={c.label}
              onClick={() => createAnnotation(c.id, false)}
              className={`w-5 h-5 rounded-full ${c.swatch} ring-1 ring-white/40 hover:ring-2 hover:ring-white transition`}
            />
          ))}
          <div className="w-px h-4 bg-slate-700 mx-0.5" />
          <button
            type="button"
            aria-label="Add comment"
            title="Add comment"
            onClick={() => createAnnotation('yellow', true)}
            className="p-1 rounded text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
          </button>
        </div>
      )}
      {active && popoverPos && (
        // `key={active.id}` remounts the popover for each annotation, so
        // its internal `commentDraft` state is reset cleanly without
        // having to track a `prevActiveId` reset pattern in the parent.
        <AnchoredAnnotationEditor
          key={active.id}
          annotation={active}
          x={popoverPos.x}
          y={popoverPos.y}
          placement={popoverPos.placement}
          onCommentChange={(v) =>
            updateActiveAnnotation({ comment: v.trim() || undefined })
          }
          onColorChange={(c) => updateActiveAnnotation({ highlightColor: c })}
          onDelete={deleteActive}
          onClose={() => onActiveIdChange(null)}
        />
      )}
    </div>
  );
};

/**
 * Editor popover anchored to the active mark. Auto-focuses its textarea on
 * mount (parent uses `key={annotation.id}` to remount per annotation, which
 * also resets the internal `commentDraft`). Uses `role="group"` rather than
 * `role="dialog"` to communicate "non-modal inline editor" — there's no
 * focus trap, the document under it is still interactive, and the parent
 * scopes its own Escape handler.
 */
const AnchoredAnnotationEditor: React.FC<{
  annotation: WrittenAnswerAnnotation;
  x: number;
  y: number;
  placement: 'below' | 'above';
  onCommentChange: (v: string) => void;
  onColorChange: (c: Color) => void;
  onDelete: () => void;
  onClose: () => void;
}> = ({
  annotation,
  x,
  y,
  placement,
  onCommentChange,
  onColorChange,
  onDelete,
  onClose,
}) => {
  const labelId = useId();
  // Local draft state. Initialized from the annotation that mounted the
  // editor; reset is handled by the parent via `key`, so we never have to
  // sync to incoming prop changes ourselves.
  const [commentDraft, setCommentDraft] = useState<string>(
    annotation.comment ?? ''
  );
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className={`absolute z-popover -translate-x-1/2 ${
        placement === 'above' ? '-translate-y-full' : ''
      } w-72 rounded-xl border border-violet-300 bg-white p-3 shadow-xl flex flex-col gap-2`}
      style={{ left: x, top: y }}
      // Block clicks inside the popover from bubbling to the article
      // (which would clear activeId via `handleArticleClick`).
      onClick={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
    >
      <span id={labelId} className="sr-only">
        Edit annotation
      </span>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-label={c.label}
              title={c.label}
              onClick={() => onColorChange(c.id)}
              className={`w-5 h-5 rounded-full ${c.swatch} ${
                annotation.highlightColor === c.id
                  ? 'ring-2 ring-violet-600'
                  : 'ring-1 ring-slate-300'
              } transition`}
            />
          ))}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Delete annotation"
            title="Delete"
            onClick={onDelete}
            className="p-1 rounded text-slate-500 hover:bg-brand-red-lighter/40 hover:text-brand-red-dark transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label="Close annotation editor"
            title="Close"
            onClick={onClose}
            className="p-1 rounded text-slate-500 hover:bg-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <textarea
        autoFocus
        value={commentDraft}
        onChange={(e) => {
          const next = e.target.value;
          setCommentDraft(next);
          onCommentChange(next);
        }}
        rows={3}
        placeholder="Margin comment (optional)"
        className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400/40 focus:border-violet-400 resize-none"
      />
    </div>
  );
};

export default AnnotatedResponseView;
