/**
 * Phase 2 utilities for the written-response annotation system.
 *
 * The teacher annotates a frozen sanitized-HTML snapshot of the student's
 * answer. Annotations are stored as plaintext offsets into the snapshot's
 * `textContent` projection — NOT against the student's live answer doc —
 * so highlights stay anchored even if the student later edits after a
 * teacher-initiated unlock.
 *
 * One walker drives both directions of the offset math:
 * - `htmlToPlainText` is the canonical "what does this HTML look like
 *   as plaintext for annotation offsets" function.
 * - `renderAnnotatedSnapshot` walks the SAME parsed DOM in the SAME
 *   order, splitting text nodes at annotation boundaries and emitting a
 *   React tree with `<mark>` wraps.
 *
 * Block-level tags (`<p>`, `<li>`, `<br>`) contribute a single `\n` to
 * the plaintext so the offsets agree with what a teacher visually
 * perceives when selecting across paragraph boundaries.
 */

import React from 'react';
import type { WrittenAnswerAnnotation } from '@/types';

const BLOCK_TAGS = new Set(['P', 'LI', 'UL', 'OL', 'DIV']);

/**
 * Deterministically project a sanitized HTML string to plaintext.
 *
 * Mirrors the walker in `renderAnnotatedSnapshot`: each `<br>` and each
 * block-level container contributes exactly one newline character. The
 * result MUST match the offsets the renderer computes; both sides use
 * `walkPlaintext` so they can never drift apart.
 *
 * Returns '' in non-DOM environments (e.g. SSR). Callers in JSX shouldn't
 * hit that path, but the guard keeps unit tests / Node usage safe.
 */
export const htmlToPlainText = (html: string): string => {
  if (!html) return '';
  if (typeof DOMParser === 'undefined') return '';
  const doc = new DOMParser().parseFromString(
    `<div>${html}</div>`,
    'text/html'
  );
  const root = doc.body.firstChild as Element | null;
  if (!root) return '';
  let out = '';
  walkPlaintext(root, (chunk) => {
    out += chunk;
  });
  return out;
};

const walkPlaintext = (
  node: Node,
  emit: (chunk: string) => void,
  ctx: { atBlockStart: boolean } = { atBlockStart: true }
): void => {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.nodeValue ?? '';
      if (text.length > 0) {
        emit(text);
        ctx.atBlockStart = false;
      }
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const el = child as Element;
    const tag = el.tagName.toUpperCase();
    if (tag === 'BR') {
      emit('\n');
      ctx.atBlockStart = true;
      continue;
    }
    if (BLOCK_TAGS.has(tag)) {
      // Insert a leading newline between consecutive blocks, but not
      // before the very first block of the document.
      if (!ctx.atBlockStart) {
        emit('\n');
        ctx.atBlockStart = true;
      }
      walkPlaintext(el, emit, ctx);
      continue;
    }
    walkPlaintext(el, emit, ctx);
  }
};

/**
 * Build the React node tree for the snapshot with mark wrappers at
 * annotation boundaries.
 *
 * The renderer makes the same plaintext walk as `htmlToPlainText`, but
 * for each text node it knows its absolute plaintext offset range and
 * can split it at every annotation boundary inside that range. The
 * resulting segments are wrapped in `<mark>` elements with stable
 * `data-annotation-id` so the parent component can attach interaction
 * handlers (hover, click-to-edit).
 *
 * Block-level newlines from `<p>`, `<li>`, `<br>` are NOT rendered into
 * the React tree — the original DOM structure already gives the browser
 * the right line breaks. The newlines are purely an offset-bookkeeping
 * device shared with `htmlToPlainText`.
 */
export const renderAnnotatedSnapshot = ({
  html,
  root,
  annotations,
}: {
  /** Raw sanitized HTML. Parsed on every call — prefer `root` in hot paths. */
  html?: string;
  /**
   * Pre-parsed DOM root (typically the wrapping `<div>`). Lets callers
   * memoize the parse once per snapshot and re-walk on annotation
   * changes without re-DOMParsing — important for the live editor
   * where margin-comment keystrokes change `annotations` on every
   * keypress.
   */
  root?: Element | null;
  annotations: WrittenAnswerAnnotation[];
}): React.ReactNode => {
  let actualRoot = root ?? null;
  if (!actualRoot && html) {
    actualRoot = parseSnapshotRoot(html);
  }
  if (!actualRoot) return null;

  const sorted = [...annotations].sort((a, b) => a.from - b.from);
  const ctx = { offset: 0, atBlockStart: true, keyCounter: 0 };

  return renderChildren(actualRoot, sorted, ctx);
};

/**
 * Parse a sanitized snapshot HTML string into the wrapping `<div>`
 * `Element`. Returns null in non-DOM environments (e.g. SSR). Hot-path
 * callers should memoize the returned node and pass it back to
 * `renderAnnotatedSnapshot` as `root` so per-keystroke annotation
 * changes don't re-DOMParse the whole snapshot.
 */
export const parseSnapshotRoot = (html: string): Element | null => {
  if (!html) return null;
  if (typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(
    `<div>${html}</div>`,
    'text/html'
  );
  return (doc.body.firstChild as Element | null) ?? null;
};

interface RenderCtx {
  offset: number;
  atBlockStart: boolean;
  keyCounter: number;
}

const renderChildren = (
  node: Node,
  annotations: WrittenAnswerAnnotation[],
  ctx: RenderCtx
): React.ReactNode[] => {
  const out: React.ReactNode[] = [];
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.nodeValue ?? '';
      if (text.length === 0) continue;
      const start = ctx.offset;
      const end = start + text.length;
      ctx.offset = end;
      ctx.atBlockStart = false;
      out.push(...sliceTextWithAnnotations(text, start, end, annotations, ctx));
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const el = child as Element;
    const tag = el.tagName.toUpperCase();
    if (tag === 'BR') {
      ctx.offset += 1;
      ctx.atBlockStart = true;
      out.push(React.createElement('br', { key: `n${ctx.keyCounter++}` }));
      continue;
    }
    if (BLOCK_TAGS.has(tag)) {
      if (!ctx.atBlockStart) {
        ctx.offset += 1;
      }
      ctx.atBlockStart = true;
      const innerKey = `n${ctx.keyCounter++}`;
      const inner = renderChildren(el, annotations, ctx);
      out.push(
        React.createElement(tag.toLowerCase(), { key: innerKey }, ...inner)
      );
      continue;
    }
    // Inline element (b, i, em, strong, u). Recurse, then wrap in the
    // same tag — this preserves bold/italic styling around annotations.
    const innerKey = `n${ctx.keyCounter++}`;
    const inner = renderChildren(el, annotations, ctx);
    out.push(
      React.createElement(tag.toLowerCase(), { key: innerKey }, ...inner)
    );
  }
  return out;
};

/**
 * Split a text node's [start, end) range at every annotation boundary
 * inside it. Each resulting sub-segment becomes either a bare string or
 * a `<mark>` wrapping a string, depending on which annotations cover it.
 *
 * For overlapping annotations (a fairly uncommon teacher action), the
 * earliest-by-`from` annotation in `active` (the input is sorted by
 * `from` in the caller) ends up on `data-annotation-id`, and all
 * overlapping ids are stored on `data-overlap-ids` so the editor
 * surface can still resolve clicks against any of them. Multi-color
 * overlap UX (e.g. split-into-N-marks) is a follow-up.
 */
const sliceTextWithAnnotations = (
  text: string,
  start: number,
  end: number,
  annotations: WrittenAnswerAnnotation[],
  ctx: RenderCtx
): React.ReactNode[] => {
  // Pre-filter annotations that actually overlap this text node, then
  // do all subsequent work against the smaller set. The previous
  // implementation re-scanned the full `annotations` array once per
  // segment, making rendering scale as O(segments × annotations) even
  // when only one annotation touched the current text node.
  const local: WrittenAnswerAnnotation[] = [];
  for (const a of annotations) {
    if (a.to <= start || a.from >= end) continue;
    local.push(a);
  }
  // Collect the offsets where coverage changes within this text node.
  const boundaries = new Set<number>([start, end]);
  for (const a of local) {
    boundaries.add(Math.max(start, a.from));
    boundaries.add(Math.min(end, a.to));
  }
  const sorted = Array.from(boundaries).sort((a, b) => a - b);

  const out: React.ReactNode[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const segFrom = sorted[i];
    const segTo = sorted[i + 1];
    if (segFrom === segTo) continue;
    const chunk = text.slice(segFrom - start, segTo - start);
    const active = local.filter((a) => a.from < segTo && a.to > segFrom);
    if (active.length === 0) {
      out.push(chunk);
      continue;
    }
    const primary = active[0];
    const overlapIds = active.map((a) => a.id).join(',');
    const isPreview = primary.id === PREVIEW_ANNOTATION_ID;
    out.push(
      React.createElement(
        'mark',
        {
          key: `m${ctx.keyCounter++}`,
          'data-annotation-id': primary.id,
          'data-overlap-ids': overlapIds,
          'data-color': isPreview
            ? 'preview'
            : (primary.highlightColor ?? 'yellow'),
          className: isPreview
            ? PREVIEW_HIGHLIGHT_CLASS
            : highlightClass(primary.highlightColor),
        },
        chunk
      )
    );
  }
  return out;
};

/**
 * Reserved annotation id for the "pending selection" preview mark
 * rendered while the teacher has drag-selected text but not yet picked
 * a color. The edit surface injects a synthetic annotation with this
 * id into the rendered list so the user keeps visual feedback even
 * after the textarea's autoFocus collapses the native browser
 * selection. Never persisted — `EditView` swaps it for a real
 * annotation on the first color click.
 */
export const PREVIEW_ANNOTATION_ID = '__preview__';

/**
 * Distinctive style for the pending-selection preview mark. Soft
 * violet tint + dashed outline communicates "you've selected this,
 * pick a color to commit" without claiming one of the real
 * highlight-color slots.
 */
export const PREVIEW_HIGHLIGHT_CLASS =
  'bg-violet-200/50 outline-dashed outline-1 outline-violet-400 text-inherit rounded-sm px-0.5';

// The four `<mark>` background classes shipped by `highlightClass`.
// Exported so `tailwind.config.js` can spread them into its `safelist`
// without duplicating the list — these classes live in this file, which
// Tailwind already scans via the `utils/` content glob, but the safelist
// is a belt-and-braces guarantee against future content-glob regressions
// and needs to stay in lockstep with the switch below.
export const HIGHLIGHT_BG_CLASSES = [
  'bg-amber-300/60',
  'bg-emerald-300/60',
  'bg-pink-300/60',
  'bg-sky-300/60',
  // Preview mark for the pending-selection state — see
  // `PREVIEW_HIGHLIGHT_CLASS`. Kept in the same safelist so a
  // content-glob regression can't strip just the preview style.
  'bg-violet-200/50',
  'outline-violet-400',
] as const;

/**
 * Tailwind classes for each highlight color. Kept here so the same
 * palette is used by both the teacher's edit surface (live marks) and
 * the student's read-only review. Background uses the brand-style soft
 * tint; text stays on `currentColor` so dark/light contexts both work.
 */
export const highlightClass = (
  color: WrittenAnswerAnnotation['highlightColor']
): string => {
  const base = 'text-inherit rounded-sm px-0.5 cursor-pointer';
  switch (color) {
    case 'green':
      return `bg-emerald-300/60 ${base}`;
    case 'pink':
      return `bg-pink-300/60 ${base}`;
    case 'blue':
      return `bg-sky-300/60 ${base}`;
    case 'yellow':
    default:
      return `bg-amber-300/60 ${base}`;
  }
};

/**
 * Convert a live DOM Range inside the rendered snapshot to plaintext
 * offsets. Returns null if the range falls outside the snapshot root or
 * is collapsed (no text selected).
 *
 * Implementation: walk every text node of `root` in document order;
 * track cumulative plaintext offset including block-boundary newlines;
 * when we reach the range's start container, add the in-node offset;
 * same for end.
 */
export const getPlainTextOffsetFromRange = (
  root: Element,
  range: Range
): { from: number; to: number } | null => {
  if (range.collapsed) return null;
  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  ) {
    return null;
  }
  const result: { from: number | null; to: number | null } = {
    from: null,
    to: null,
  };

  // Single-pass walk. Both text-node offsets and element-node offsets
  // (where `range.startOffset` is a child index, e.g. when a user
  // clicks past the last character of a paragraph) are resolved
  // inline against the same monotonically-advancing `offset` and
  // `atBlockStart` state, so block-boundary newlines stay consistent
  // with `htmlToPlainText`'s projection. The previous version
  // recomputed preceding-sibling lengths via `htmlToPlainText` per
  // call — O(N²) and ignored `atBlockStart`, producing off-by-one
  // offsets near block boundaries.
  let offset = 0;
  let atBlockStart = true;

  const visit = (node: Node): void => {
    if (result.from != null && result.to != null) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue ?? '';
      if (node === range.startContainer && result.from == null) {
        result.from = offset + range.startOffset;
      }
      if (node === range.endContainer && result.to == null) {
        result.to = offset + range.endOffset;
      }
      offset += text.length;
      if (text.length > 0) atBlockStart = false;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toUpperCase();
    if (tag === 'BR') {
      if (node === range.startContainer && result.from == null) {
        result.from = offset;
      }
      if (node === range.endContainer && result.to == null) {
        result.to = offset;
      }
      offset += 1;
      atBlockStart = true;
      return;
    }
    if (BLOCK_TAGS.has(tag)) {
      if (!atBlockStart) {
        offset += 1;
      }
      atBlockStart = true;
    }
    // Range may anchor on this element with `range.startOffset` as a
    // child-index. We resolve it by checking before each child:
    // if the index equals `i`, the offset point is "just before
    // child i" and we capture the current cumulative `offset`.
    const children = el.childNodes;
    for (let i = 0; i < children.length; i++) {
      if (
        node === range.startContainer &&
        result.from == null &&
        range.startOffset === i
      ) {
        result.from = offset;
      }
      if (
        node === range.endContainer &&
        result.to == null &&
        range.endOffset === i
      ) {
        result.to = offset;
      }
      visit(children[i]);
      if (result.from != null && result.to != null) return;
    }
    // Trailing boundary: range.{start,end}Offset === children.length
    // means the anchor sits after the last child.
    if (
      node === range.startContainer &&
      result.from == null &&
      range.startOffset === children.length
    ) {
      result.from = offset;
    }
    if (
      node === range.endContainer &&
      result.to == null &&
      range.endOffset === children.length
    ) {
      result.to = offset;
    }
  };
  visit(root);

  if (result.from == null || result.to == null) return null;
  if (result.from === result.to) return null;
  return result.from < result.to
    ? { from: result.from, to: result.to }
    : { from: result.to, to: result.from };
};
