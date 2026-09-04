import React, { useEffect, useImperativeHandle, useRef } from 'react';
import { TextObject } from '@/types';
import { LINE_HEIGHT_RATIO, measureTextObject } from './renderers/text';

export interface TextEditorHandle {
  /** Commit the editor's current content now (e.g. before Exit). */
  commit: () => void;
}

interface TextEditorOverlayProps {
  /** The TextObject being edited. The overlay positions/styles itself from this. */
  object: TextObject;
  /** Bounding rect of the canvas the object lives on, in viewport-relative
   *  CSS px (i.e. the value returned by `getBoundingClientRect()` — no scroll
   *  offsets applied). The overlay is `position: fixed`, so it consumes these
   *  coordinates as-is. */
  canvasRect: DOMRect;
  /**
   * Internal canvas resolution. Object coordinates live in this space, so we
   * scale them to CSS px via `canvasRect.width / canvasSize.width` (matches
   * the inverse of the pointer-coord scaling in `useDrawingCanvas.getPos`).
   */
  canvasSize: { width: number; height: number };
  /**
   * Called when the user commits text. The `next` object always carries the
   * editor's final (sanitized) content — including the empty string. The
   * caller decides what an empty commit means (for the DrawingWidget /
   * AnnotationOverlay, an empty commit on an EXISTING TextObject removes it;
   * on a fresh spawn it just closes the overlay).
   */
  onCommit: (next: TextObject) => void;
  /** Called only when the user explicitly cancels via Escape. */
  onCancel: () => void;
  /** Imperative handle so a parent can force a commit before unmounting. */
  ref?: React.Ref<TextEditorHandle>;
}

/**
 * Positioned contenteditable overlay for editing a `TextObject` in the
 * DrawingWidget / AnnotationOverlay. The overlay floats above the canvas at
 * the object's bounds with the object's font/size/color so what-you-see-is-
 * what-you-get on commit.
 *
 * Commit triggers: blur, `Cmd/Ctrl+Enter`, the `commit()` handle, and an
 * object swap while unfinalized. Cancel: `Escape`.
 *
 * Empty content is committed via `onCommit({...object, content: ''})` —
 * callers resolve the "drop vs no-op" decision (fresh-spawn empty → no-op,
 * existing-object emptied → remove via the appropriate command). This
 * differs from the cancel path (`Escape`), which always calls `onCancel`
 * without persisting the editor's content.
 *
 * Sanitization: we extract `innerText` (browser-stripped plain text) rather
 * than `innerHTML`, so paste-in HTML never reaches the persisted object. The
 * canvas renderer uses `ctx.fillText` which never interprets HTML either, so
 * the round-trip is plain-text-only.
 */
export const TextEditorOverlay: React.FC<TextEditorOverlayProps> = ({
  object,
  canvasRect,
  canvasSize,
  onCommit,
  onCancel,
  ref,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  // Stash callbacks + object in refs so blur/keydown handlers always see the
  // latest closure without re-binding listeners (avoids missed commits if
  // React re-renders between an in-flight pointer event and the handler
  // firing). Refs are assigned during render — the consumers (blur/keydown
  // handlers) fire from event loops after the render commits, so the
  // synchronous assignment is exactly what they need. The `react-hooks/refs`
  // rule flags this on principle, but the assignments are idempotent and the
  // pattern is the standard "ref-as-latest-prop" trick.
  const onCommitRef = useRef(onCommit);
  const onCancelRef = useRef(onCancel);
  const objectRef = useRef(object);
  // eslint-disable-next-line react-hooks/refs
  onCommitRef.current = onCommit;
  // eslint-disable-next-line react-hooks/refs
  onCancelRef.current = onCancel;
  // eslint-disable-next-line react-hooks/refs
  objectRef.current = object;
  // Guard so blur after a Cmd+Enter commit (which intentionally blurs the
  // editor) doesn't double-fire onCommit and clobber an upstream state reset.
  const finalizedRef = useRef(false);
  // Object the editor DOM currently holds content for; differs from
  // `objectRef` between a parent swap and the reseed effect below.
  const seededRef = useRef<TextObject | null>(null);

  // Translate object coords (canvas-internal px) to CSS px on the page.
  const scaleX = canvasSize.width > 0 ? canvasRect.width / canvasSize.width : 1;
  const scaleY =
    canvasSize.height > 0 ? canvasRect.height / canvasSize.height : 1;
  // The overlay is `position: fixed`, so coordinates are viewport-relative
  // — exactly what `getBoundingClientRect()` returns at the call site. Do
  // NOT add window.scrollX/Y here: that would double-shift the overlay when
  // the page is scrolled.
  const leftPx = canvasRect.left + object.x * scaleX;
  const topPx = canvasRect.top + object.y * scaleY;
  const widthPx = object.w * scaleX;
  const heightPx = object.h * scaleY;
  const fontSizePx = object.fontSize * scaleY;

  // Natural content size in object (canvas) units. `pre` mode grows the
  // box with content; `wrap` mode keeps the handle-set width.
  const measure = (node: HTMLDivElement, obj: TextObject) => {
    const w = obj.wrap
      ? obj.w
      : Math.max(Math.ceil(node.offsetWidth / scaleX), obj.fontSize);
    const h = Math.max(
      Math.ceil(node.offsetHeight / scaleY),
      Math.ceil(obj.fontSize * LINE_HEIGHT_RATIO)
    );
    return { w, h };
  };

  const commitContent = (
    obj: TextObject,
    node: HTMLDivElement | null,
    // On an object swap the DOM already wears the NEW object's styles, so
    // size the previous object from its content rather than live layout.
    fromContent = false
  ) => {
    const raw = node?.innerText ?? '';
    // Normalize newlines (browsers sometimes emit \r\n in contenteditable
    // serialization) and strip trailing newline that contenteditable can add
    // when the cursor sits on an empty trailing line.
    const sanitized = raw.replace(/\r\n/g, '\n').replace(/\n+$/u, '');
    let size = { w: obj.w, h: obj.h };
    if (fromContent) {
      const natural = measureTextObject({ ...obj, content: sanitized });
      size = { w: obj.wrap ? obj.w : natural.w, h: natural.h };
    } else if (node) {
      size = measure(node, obj);
    }
    // Always commit with the editor's final content — including the empty
    // string. The caller decides what an empty commit means (remove for an
    // existing object, no-op for a fresh spawn).
    onCommitRef.current({ ...obj, ...size, content: sanitized });
  };
  // Latest-closure ref so the seeding effect can commit without listing
  // commitContent as a dependency.
  const commitContentRef = useRef(commitContent);
  // eslint-disable-next-line react-hooks/refs
  commitContentRef.current = commitContent;

  // Focus + seed content on mount (and on object id change, when the same
  // overlay is re-used for a different TextObject — e.g. double-click flow).
  // Deliberately keys on `object.id` only (not `object.content`) so a
  // remote sync (live-share / multi-tab) that updates the persisted content
  // does NOT clobber the user's in-progress local edit. We read the seed
  // content from `objectRef.current` (assigned during render above), so the
  // exhaustive-deps lint rule sees an accurate dep list without suppression.
  useEffect(() => {
    const node = editorRef.current;
    if (!node) return;
    // Swapped to a new object while an edit was still open (parent spawned
    // or double-clicked before blur fired): commit the old text first so
    // the reseed below never wipes unsaved content.
    const prev = seededRef.current;
    if (prev && prev.id !== objectRef.current.id && !finalizedRef.current) {
      commitContentRef.current(prev, node, true);
    }
    seededRef.current = objectRef.current;
    // Set initial content via innerText so newline characters survive as
    // <br> in the browser's contenteditable model while keeping the source
    // string plain-text. We intentionally avoid innerHTML so a stale object
    // content with HTML-looking characters renders literally.
    node.innerText = objectRef.current.content;
    finalizedRef.current = false;
    // Focus + place caret at end of content so the user can continue typing
    // when re-editing existing text.
    node.focus();
    const sel = window.getSelection();
    if (sel) {
      sel.selectAllChildren(node);
      sel.collapseToEnd();
    }
  }, [object.id]);

  const finalize = (commit: boolean) => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    if (!commit) {
      // Explicit Escape: caller restores prior state. Editor content is
      // discarded.
      onCancelRef.current();
      return;
    }
    commitContent(objectRef.current, editorRef.current);
  };

  useImperativeHandle(ref, () => ({ commit: () => finalize(true) }));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Always stop propagation so keystrokes inside the editor never reach the
    // canvas wrapper's key handler (which would delete the underlying object
    // on Backspace, or nudge it on Arrow keys) or the AnnotationOverlay's
    // window-level Escape handler (which would close the overlay entirely).
    // That window listener is NOT gated on editing state, so this
    // stopPropagation is the only thing keeping Escape local to the editor.
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      finalize(false);
      return;
    }
    // Cmd/Ctrl+Enter commits. Plain Enter inserts a newline (handled natively
    // by contenteditable) so multi-line text edits feel natural.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      finalize(true);
    }
  };

  const handleBlur = () => {
    finalize(true);
  };

  return (
    <div
      ref={editorRef}
      role="textbox"
      aria-label="Edit text"
      aria-multiline="true"
      contentEditable
      suppressContentEditableWarning
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      // Stop pointer events from reaching the canvas (so a click on the
      // editor doesn't spawn a second TextObject under it when the text tool
      // is active).
      onPointerDown={(e) => e.stopPropagation()}
      className={`fixed outline-none ring-2 ring-indigo-500 rounded-sm bg-white/95 px-1 py-0 overflow-hidden ${
        object.wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'
      }`}
      style={{
        left: `${leftPx}px`,
        top: `${topPx}px`,
        // Wrap mode pins the handle-set width; otherwise the box grows with
        // content from a small typable minimum.
        width: object.wrap ? `${widthPx}px` : undefined,
        minWidth: object.wrap ? undefined : `${Math.max(fontSizePx * 2, 32)}px`,
        maxWidth: object.wrap ? undefined : `calc(100vw - ${leftPx}px)`,
        minHeight: `${Math.max(heightPx, fontSizePx * LINE_HEIGHT_RATIO)}px`,
        boxSizing: 'border-box',
        fontFamily: object.fontFamily,
        fontSize: `${fontSizePx}px`,
        lineHeight: LINE_HEIGHT_RATIO,
        color: object.color,
        // High z-index keeps the editor above the dock/toolbar and any
        // other absolute-positioned widget chrome.
        zIndex: 2147483000,
      }}
    />
  );
};
