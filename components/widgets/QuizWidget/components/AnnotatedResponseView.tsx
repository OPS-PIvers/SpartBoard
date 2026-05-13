/**
 * Phase 2 surface for written-response annotations.
 *
 * In `mode="edit"` (teacher's grader) the component:
 *  - Renders the frozen `gradingSnapshot` with existing marks via
 *    `renderAnnotatedSnapshot` (offsets computed against the snapshot's
 *    plaintext projection).
 *  - On mouseup with a non-empty selection, surfaces a small floating
 *    palette anchored to the selection's bounding rect; choosing a color
 *    creates an annotation. Choosing the comment icon opens an inline
 *    comment input docked in the right rail.
 *  - Clicking an existing mark opens that annotation in the rail for
 *    color/comment edits and exposes a delete button.
 *
 * In `mode="read"` (student review surface after publish) the component
 * renders the same snapshot read-only, with the right-rail margin column
 * showing the teacher's comments. No selection palette, no edit handles.
 *
 * The student's live `answer` field is never read here — the snapshot is
 * the only source of truth, which keeps annotation offsets stable even
 * if the teacher later unlocks the attempt and the student edits.
 */

import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { MessageSquare, Trash2, X } from 'lucide-react';
import type { WrittenAnswerAnnotation } from '@/types';
import {
  getPlainTextOffsetFromRange,
  highlightClass,
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

const ReadOnlyView: React.FC<ReadProps> = ({ snapshot, annotations }) => {
  const articleRef = useRef<HTMLElement | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Parse the snapshot once per `snapshot` and re-walk only when
  // `annotations` change. Hover-induced state changes (and the
  // student's own `setHoveredId` updates) would otherwise re-DOMParse
  // the whole snapshot on every render.
  const parsedRoot = useMemo(() => parseSnapshotRoot(snapshot), [snapshot]);
  const tree = useMemo(
    () => renderAnnotatedSnapshot({ root: parsedRoot, annotations }),
    [parsedRoot, annotations]
  );

  const commented = annotations.filter((a) => a.comment?.trim());

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3">
      <article
        ref={articleRef}
        className="rounded-xl border border-slate-700 bg-slate-800/60 p-4 text-sm leading-relaxed text-slate-100 prose prose-sm prose-invert max-w-none [&_mark]:transition-colors"
        onMouseOver={(e) => {
          const t = (e.target as HTMLElement).closest('mark');
          if (t) setHoveredId(t.getAttribute('data-annotation-id'));
        }}
        onMouseOut={() => setHoveredId(null)}
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
              highlighted={hoveredId === a.id}
              onHover={(on) => setHoveredId(on ? a.id : null)}
            />
          ))}
        </aside>
      )}
    </div>
  );
};

const CommentChip: React.FC<{
  annotation: WrittenAnswerAnnotation;
  highlighted: boolean;
  onHover: (on: boolean) => void;
}> = ({ annotation, highlighted, onHover }) => (
  <div
    className={`rounded-lg border p-2.5 text-xs leading-relaxed transition-colors ${
      highlighted
        ? 'border-violet-400/60 bg-violet-500/10 text-slate-100'
        : 'border-slate-700 bg-slate-800/60 text-slate-300'
    }`}
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
}) => {
  const articleRef = useRef<HTMLElement | null>(null);
  const reactId = useId();
  const [palette, setPalette] = useState<{
    x: number;
    y: number;
    from: number;
    to: number;
  } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState<string>('');

  // Same memoization split as ReadOnlyView: parse once per snapshot,
  // re-walk on annotation changes. Critical in edit mode because the
  // margin-comment editor calls `onChange` on every keystroke, so
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
    if (!articleRef.current) return;
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
      // article and an adjacent element (e.g. the margin column).
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
    const articleRect = articleRef.current.getBoundingClientRect();
    setPalette({
      x: rect.left - articleRect.left + rect.width / 2,
      y: rect.top - articleRect.top - 8,
      from: offsets.from,
      to: offsets.to,
    });
    setActiveId(null);
  }, []);

  // Dismiss the palette on Escape so a teacher mid-selection can bail
  // without closing the entire modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && palette) {
        // Don't stopPropagation — the modal still wants Esc-to-close
        // when nothing's selected. We intentionally let both run.
        setPalette(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [palette]);

  const handleArticleClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const mark = (e.target as HTMLElement).closest('mark');
      if (mark) {
        const id = mark.getAttribute('data-annotation-id');
        if (id) {
          const a = annotations.find((x) => x.id === id);
          setActiveId(id);
          setCommentDraft(a?.comment ?? '');
          setPalette(null);
          // Clear any selection so the palette doesn't immediately
          // reopen on mouseup.
          window.getSelection()?.removeAllRanges();
        }
        return;
      }
      // Click on bare text — dismiss the active editor panel.
      setActiveId(null);
    },
    [annotations]
  );

  const createAnnotation = useCallback(
    (color: Color, withCommentInput: boolean) => {
      if (!palette) return;
      const id = `${reactId}-${Date.now()}`;
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
        setActiveId(id);
        setCommentDraft('');
      }
      window.getSelection()?.removeAllRanges();
    },
    [palette, reactId, authorUid, onChange, annotations]
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
    setActiveId(null);
    setCommentDraft('');
  }, [activeId, annotations, onChange]);

  const active = activeId
    ? (annotations.find((a) => a.id === activeId) ?? null)
    : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-3">
      <div className="relative">
        <article
          ref={articleRef}
          className="rounded-xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-800 prose prose-sm max-w-none cursor-text select-text"
          onMouseUp={handleMouseUp}
          onClick={handleArticleClick}
        >
          {tree}
        </article>
        {palette && (
          <div
            role="toolbar"
            aria-label="Annotation palette"
            className="absolute z-10 -translate-x-1/2 -translate-y-full flex items-center gap-1 px-1.5 py-1 bg-slate-900 text-white rounded-lg shadow-xl"
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
      </div>

      <aside className="flex flex-col gap-2">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Annotations ({annotations.length})
        </h4>
        {annotations.length === 0 && (
          <p className="text-xs text-slate-500 italic leading-relaxed">
            Select text in the response to add a highlight or margin comment.
          </p>
        )}
        {active ? (
          <ActiveAnnotationEditor
            annotation={active}
            commentDraft={commentDraft}
            onCommentChange={(v) => {
              setCommentDraft(v);
              updateActiveAnnotation({ comment: v.trim() || undefined });
            }}
            onColorChange={(c) => updateActiveAnnotation({ highlightColor: c })}
            onDelete={deleteActive}
            onClose={() => setActiveId(null)}
          />
        ) : (
          annotations.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => {
                setActiveId(a.id);
                setCommentDraft(a.comment ?? '');
              }}
              className="text-left rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 p-2 text-xs leading-relaxed transition-colors"
            >
              <span
                className={`inline-block px-1.5 rounded ${highlightClass(a.highlightColor)} pointer-events-none`}
              >
                highlight
              </span>
              {a.comment ? (
                <span className="ml-2 text-slate-700">{a.comment}</span>
              ) : (
                <span className="ml-2 text-slate-400 italic">(no comment)</span>
              )}
            </button>
          ))
        )}
      </aside>
    </div>
  );
};

const ActiveAnnotationEditor: React.FC<{
  annotation: WrittenAnswerAnnotation;
  commentDraft: string;
  onCommentChange: (v: string) => void;
  onColorChange: (c: Color) => void;
  onDelete: () => void;
  onClose: () => void;
}> = ({
  annotation,
  commentDraft,
  onCommentChange,
  onColorChange,
  onDelete,
  onClose,
}) => (
  <div className="rounded-lg border border-violet-400/60 bg-violet-50 p-2.5 flex flex-col gap-2">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1">
        {COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-label={c.label}
            title={c.label}
            onClick={() => onColorChange(c.id)}
            className={`w-4 h-4 rounded-full ${c.swatch} ${
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
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          aria-label="Close annotation editor"
          title="Close"
          onClick={onClose}
          className="p-1 rounded text-slate-500 hover:bg-slate-200 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
    <textarea
      value={commentDraft}
      onChange={(e) => onCommentChange(e.target.value)}
      rows={3}
      placeholder="Margin comment (optional)"
      className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400/40 focus:border-violet-400 resize-none"
    />
  </div>
);

export default AnnotatedResponseView;
