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
  annotations,
}: {
  html: string;
  annotations: WrittenAnswerAnnotation[];
}): React.ReactNode => {
  if (!html) return null;
  if (typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(
    `<div>${html}</div>`,
    'text/html'
  );
  const root = doc.body.firstChild as Element | null;
  if (!root) return null;

  const sorted = [...annotations].sort((a, b) => a.from - b.from);
  const ctx = { offset: 0, atBlockStart: true, keyCounter: 0 };

  return renderChildren(root, sorted, ctx);
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
 * outermost-by-color-priority annotation's id ends up on `data-id`, but
 * all overlapping ids are stored on `data-overlap-ids` so the editing
 * surface can still resolve clicks. Phase 2 ships with a simple "first
 * annotation wins" pick — multi-color overlap UX is a follow-up.
 */
const sliceTextWithAnnotations = (
  text: string,
  start: number,
  end: number,
  annotations: WrittenAnswerAnnotation[],
  ctx: RenderCtx
): React.ReactNode[] => {
  // Collect the offsets where coverage changes within this text node.
  const boundaries = new Set<number>([start, end]);
  for (const a of annotations) {
    if (a.to <= start || a.from >= end) continue;
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
    const active = annotations.filter((a) => a.from < segTo && a.to > segFrom);
    if (active.length === 0) {
      out.push(chunk);
      continue;
    }
    const primary = active[0];
    const overlapIds = active.map((a) => a.id).join(',');
    out.push(
      React.createElement(
        'mark',
        {
          key: `m${ctx.keyCounter++}`,
          'data-annotation-id': primary.id,
          'data-overlap-ids': overlapIds,
          'data-color': primary.highlightColor ?? 'yellow',
          className: highlightClass(primary.highlightColor),
        },
        chunk
      )
    );
  }
  return out;
};

/**
 * Tailwind classes for each highlight color. Kept here so the same
 * palette is used by both the teacher's edit surface (live marks) and
 * the student's read-only review. Background uses the brand-style soft
 * tint; text stays on `currentColor` so dark/light contexts both work.
 */
export const highlightClass = (
  color: WrittenAnswerAnnotation['highlightColor']
): string => {
  switch (color) {
    case 'green':
      return 'bg-emerald-300/60 text-inherit rounded-sm px-0.5 cursor-pointer';
    case 'pink':
      return 'bg-pink-300/60 text-inherit rounded-sm px-0.5 cursor-pointer';
    case 'blue':
      return 'bg-sky-300/60 text-inherit rounded-sm px-0.5 cursor-pointer';
    case 'yellow':
    default:
      return 'bg-amber-300/60 text-inherit rounded-sm px-0.5 cursor-pointer';
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
    // Range may land on an element node (e.g. clicking past the last
    // character of a paragraph). When that happens, the offset is a
    // child index — sum the plaintext length of preceding children.
    if (
      node === range.startContainer &&
      result.from == null &&
      node.nodeType === Node.ELEMENT_NODE
    ) {
      const before = childrenPlaintextLength(el, range.startOffset);
      result.from = offset + before;
    }
    if (
      node === range.endContainer &&
      result.to == null &&
      node.nodeType === Node.ELEMENT_NODE
    ) {
      const before = childrenPlaintextLength(el, range.endOffset);
      result.to = offset + before;
    }
    for (const child of Array.from(el.childNodes)) {
      visit(child);
      if (result.from != null && result.to != null) return;
    }
  };
  visit(root);

  if (result.from == null || result.to == null) return null;
  if (result.from === result.to) return null;
  return result.from < result.to
    ? { from: result.from, to: result.to }
    : { from: result.to, to: result.from };
};

const childrenPlaintextLength = (parent: Element, count: number): number => {
  let len = 0;
  const children = Array.from(parent.childNodes).slice(0, count);
  for (const child of children) {
    if (child.nodeType === Node.TEXT_NODE) {
      len += (child.nodeValue ?? '').length;
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      const tag = el.tagName.toUpperCase();
      if (tag === 'BR') {
        len += 1;
      } else if (BLOCK_TAGS.has(tag)) {
        len += htmlToPlainText(el.innerHTML).length;
        // Block boundaries contribute a newline only between blocks. We
        // don't double-count for a leading block — htmlToPlainText
        // handles that case the same way.
      } else {
        len += htmlToPlainText(el.innerHTML).length;
      }
    }
  }
  return len;
};
