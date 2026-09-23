import type { GuidedLearningTourBinding } from '@/types';
import type { RedactRect } from '../../utils/redactImage';
import { rectToFrameBox, type Size } from './resolveAnchor';

/** Single names shorter than this only match as part of a full name. */
const MIN_SINGLE_NAME = 3;
// Form controls are covered whole, by value.
const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'OPTION',
  'TEXTAREA',
]);
const IGNORE = '[data-tour-ignore]';

export interface RosterPerson {
  firstName: string;
  lastName: string;
  /** Nicknames or pseudonyms, where a roster has them. */
  otherNames?: string[];
}

export interface NameMatcher {
  test: (text: string) => boolean;
  /** [start, end) offsets of every name in the text. */
  ranges: (text: string) => [number, number][];
}

const escapeRe = (s: string) =>
  s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');

/** Case-insensitive, word-bounded matcher for every roster name; null when there are none. */
export function buildNameMatcher(
  people: readonly RosterPerson[]
): NameMatcher | null {
  const terms = new Map<string, string>();
  const add = (raw: string, single: boolean) => {
    const name = raw.trim().replace(/\s+/g, ' ');
    if (!name || (single && name.length < MIN_SINGLE_NAME)) return;
    terms.set(name.toLowerCase(), escapeRe(name));
  };
  for (const p of people) {
    const first = p.firstName ?? '';
    const last = p.lastName ?? '';
    add(first, true);
    add(last, true);
    for (const other of p.otherNames ?? []) add(other, true);
    if (first.trim() && last.trim()) {
      add(`${first} ${last}`, false);
      add(`${last}, ${first}`, false);
      add(`${last} ${first}`, false);
    }
  }
  if (terms.size === 0) return null;
  // Longest first, so a full name wins over its parts.
  const alternation = [...terms.entries()]
    .sort((a, b) => b[0].length - a[0].length)
    .map(([, re]) => re)
    .join('|');
  const source = `(?<![\\p{L}\\p{N}])(?:${alternation})(?![\\p{L}\\p{N}])`;
  const once = new RegExp(source, 'iu');
  const all = new RegExp(source, 'giu');
  return {
    test: (text) => once.test(text),
    ranges: (text) =>
      [...text.matchAll(all)].map((m) => [m.index, m.index + m[0].length]),
  };
}

export interface ViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const visible = (r: ViewportRect, viewport: Size) =>
  r.width > 0 &&
  r.height > 0 &&
  r.x < viewport.w &&
  r.y < viewport.h &&
  r.x + r.width > 0 &&
  r.y + r.height > 0;

const fieldValue = (el: Element): string => {
  if (el instanceof HTMLSelectElement)
    return el.selectedOptions[0]?.textContent ?? '';
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
    return el.value;
  return '';
};

/** Viewport rects of every roster name in text or form fields, and every `data-pii` element. */
export function collectRedactionRects(
  root: Element,
  matcher: NameMatcher | null,
  viewport: Size
): ViewportRect[] {
  const out: ViewportRect[] = [];
  const push = (r: ViewportRect) => {
    if (visible(r, viewport))
      out.push({ x: r.x, y: r.y, width: r.width, height: r.height });
  };

  root.querySelectorAll('[data-pii]').forEach((el) => {
    if (!el.closest(IGNORE)) push(el.getBoundingClientRect());
  });
  if (!matcher) return out;

  root.querySelectorAll('input, textarea, select').forEach((el) => {
    if (!el.closest(IGNORE) && matcher.test(fieldValue(el)))
      push(el.getBoundingClientRect());
  });

  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent || SKIP_TAGS.has(parent.tagName) || parent.closest(IGNORE))
        return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const range = doc.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? '';
    if (!matcher.test(text)) continue;
    for (const [start, end] of matcher.ranges(text)) {
      range.setStart(node, start);
      range.setEnd(node, end);
      for (const r of Array.from(range.getClientRects())) push(r);
    }
  }
  return out;
}

/** Converts viewport rects to padded, de-duplicated image-% boxes on the frame. */
export function toFrameRedactions(
  rects: readonly ViewportRect[],
  viewport: Size,
  frame: Size
): RedactRect[] {
  const seen = new Set<string>();
  const out: RedactRect[] = [];
  for (const r of rects) {
    const box = rectToFrameBox(r, viewport, frame);
    if (box.wPct <= 0 || box.hPct <= 0) continue;
    const key = [box.xPct, box.yPct, box.wPct, box.hPct]
      .map((n) => n.toFixed(2))
      .join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(box);
  }
  return out;
}

/** Drops a role-and-name fallback whose name is a student's, so it is never stored. */
export function scrubFallback(
  fallback: GuidedLearningTourBinding['fallback'],
  matcher: NameMatcher | null
): GuidedLearningTourBinding['fallback'] {
  if (!fallback || !matcher) return fallback;
  return matcher.test(fallback.name) ? undefined : fallback;
}
