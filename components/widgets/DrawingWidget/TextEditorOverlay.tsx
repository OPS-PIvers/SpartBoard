import React, { useEffect, useRef } from 'react';
import { TextObject } from '@/types';

interface TextEditorOverlayProps {
  /** The TextObject being edited. The overlay positions/styles itself from this. */
  object: TextObject;
  /** Bounding rect of the canvas the object lives on, in CSS px on the page. */
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
}

/**
 * Positioned contenteditable overlay for editing a `TextObject` in the
 * DrawingWidget / AnnotationOverlay. The overlay floats above the canvas at
 * the object's bounds with the object's font/size/color so what-you-see-is-
 * what-you-get on commit.
 *
 * Commit triggers: blur, `Cmd/Ctrl+Enter`. Cancel: `Escape`.
 *
 * Empty content on commit triggers `onCancel` instead — callers treat that as
 * "drop the object" (matches the degenerate-shape rule in `useDrawingCanvas`).
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
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  // Stash callbacks + object in refs so blur/keydown handlers always see the
  // latest closure without re-binding listeners (avoids missed commits if
  // React re-renders between an in-flight pointer event and the handler
  // firing). Inline ref assignment (per CLAUDE.md: useEffect is an escape
  // hatch, not a default — refs derived from props should be assigned in the
  // render body, not in an effect).
  //
  // StrictMode safety: assigning to ref.current during render is safe even
  // under StrictMode's double-invoke render — the assignment is idempotent
  // (same prop value each time) and React clears refs between mounts. The
  // anti-pattern is mutating non-ref state during render, which we don't do.
  const onCommitRef = useRef(onCommit);
  const onCancelRef = useRef(onCancel);
  const objectRef = useRef(object);
  onCommitRef.current = onCommit;
  onCancelRef.current = onCancel;
  objectRef.current = object;
  // Guard so blur after a Cmd+Enter commit (which intentionally blurs the
  // editor) doesn't double-fire onCommit and clobber an upstream state reset.
  const finalizedRef = useRef(false);

  // Translate object coords (canvas-internal px) to CSS px on the page.
  const scaleX = canvasSize.width > 0 ? canvasRect.width / canvasSize.width : 1;
  const scaleY =
    canvasSize.height > 0 ? canvasRect.height / canvasSize.height : 1;
  // Use page-level coords so the overlay sits over the canvas no matter
  // where the parent container is scrolled. canvasRect already accounts for
  // page scroll via getBoundingClientRect + scroll offsets at call site.
  const leftPx = canvasRect.left + object.x * scaleX;
  const topPx = canvasRect.top + object.y * scaleY;
  const widthPx = object.w * scaleX;
  const heightPx = object.h * scaleY;
  const fontSizePx = object.fontSize * scaleY;

  // Focus + seed content on mount (and on object id change, when the same
  // overlay is re-used for a different TextObject — e.g. double-click flow).
  // Deliberately depends on `object.id` only (not `object.content`) so a
  // remote sync (live-share / multi-tab) that updates the persisted content
  // does NOT clobber the user's in-progress local edit.
  useEffect(() => {
    const node = editorRef.current;
    if (!node) return;
    // Set initial content via innerText so newline characters survive as
    // <br> in the browser's contenteditable model while keeping the source
    // string plain-text. We intentionally avoid innerHTML so a stale object
    // content with HTML-looking characters renders literally.
    node.innerText = object.content;
    finalizedRef.current = false;
    // Focus + place caret at end of content so the user can continue typing
    // when re-editing existing text.
    node.focus();
    const sel = window.getSelection();
    if (sel) {
      sel.selectAllChildren(node);
      sel.collapseToEnd();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [object.id]);

  const finalize = (commit: boolean) => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    const node = editorRef.current;
    const raw = node?.innerText ?? '';
    // Normalize newlines (browsers sometimes emit \r\n in contenteditable
    // serialization) and strip trailing newline that contenteditable can add
    // when the cursor sits on an empty trailing line.
    const sanitized = raw.replace(/\r\n/g, '\n').replace(/\n+$/u, '');
    if (!commit) {
      // Explicit Escape: caller restores prior state. Editor content is
      // discarded.
      onCancelRef.current();
      return;
    }
    // Always commit with the editor's final content — including the empty
    // string. The caller decides what an empty commit means (remove for an
    // existing object, no-op for a fresh spawn).
    onCommitRef.current({ ...objectRef.current, content: sanitized });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Always stop propagation so keystrokes inside the editor never reach the
    // canvas wrapper's key handler (which would delete the underlying object
    // on Backspace, or nudge it on Arrow keys) or the AnnotationOverlay's
    // window-level Escape handler (which would close the overlay entirely).
    // The overlay's window listener is ALSO gated on editingText==null —
    // belt + suspenders, since window-capture listeners can fire before
    // React's bubble phase.
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
      className="fixed outline-none ring-2 ring-indigo-500 rounded-sm bg-white/95 px-1 py-0 overflow-hidden whitespace-pre-wrap break-words"
      style={{
        left: `${leftPx}px`,
        top: `${topPx}px`,
        // Width is at minimum the placeholder width so a tiny click region
        // doesn't collapse the editor below typable size.
        minWidth: `${Math.max(widthPx, 80)}px`,
        minHeight: `${Math.max(heightPx, fontSizePx * 1.4)}px`,
        fontFamily: object.fontFamily,
        fontSize: `${fontSizePx}px`,
        lineHeight: 1.2,
        color: object.color,
        // High z-index keeps the editor above the dock/toolbar and any
        // other absolute-positioned widget chrome.
        zIndex: 2147483000,
      }}
    />
  );
};
