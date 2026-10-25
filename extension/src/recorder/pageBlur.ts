import { findPageBlurSpans } from '@/components/tours/web/studentData';
import type { BlurSettings } from './blurSettings';

/** Set on each element blurred for one picture; removed right after it. */
export const BLUR_ATTR = 'data-spart-blur';
/** Set on elements the admin picked with Click to blur; kept while recording. */
export const PICK_ATTR = 'data-spart-blur-pick';
export const HOVER_ATTR = 'data-spart-blur-hover';
const STYLE_ATTR = 'data-spart-blur-style';
const OWN_HOST = '[data-spart-extension]';
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD']);
// Below this, an image is an icon, not content.
const MIN_IMAGE_AREA = 32 * 32;
// A text node beside more siblings than this is wrapped, so its whole container isn't blurred.
const MAX_SIBLINGS = 3;
const FIELD_SKIP_TYPES = new Set([
  'button',
  'submit',
  'reset',
  'checkbox',
  'radio',
  'range',
  'color',
  'file',
  'image',
  'hidden',
]);

// Filter only: blur never moves anything, and no transition delays it.
const blurCss = (attr: string) =>
  `[${attr}]{filter:blur(6px)!important;transition:none!important}`;

type Root = Document | ShadowRoot;

/** The document and every open shadow root inside it. */
function rootsOf(doc: Document): Root[] {
  const out: Root[] = [doc];
  for (let i = 0; i < out.length; i++)
    out[i].querySelectorAll('*').forEach((el) => {
      if (el.shadowRoot) out.push(el.shadowRoot);
    });
  return out;
}

/** Adds this attribute's blur rule to the root once; the returned function removes it if it was added here. */
export function ensureBlurStyle(root: Root, attr: string): () => void {
  const host =
    root instanceof Document ? (root.head ?? root.documentElement) : root;
  if (host.querySelector(`style[${STYLE_ATTR}="${attr}"]`))
    return () => undefined;
  const style = (
    root instanceof Document ? root : root.ownerDocument
  ).createElement('style');
  style.setAttribute(STYLE_ATTR, attr);
  style.textContent = blurCss(attr);
  host.appendChild(style);
  return () => style.remove();
}

const own = (el: Element) => !!el.closest(OWN_HOST);

const textPatternsOn = (s: BlurSettings) => s.emails || s.ids || s.lastFirst;

const isField = (
  el: Element
): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
  (el instanceof HTMLInputElement && !FIELD_SKIP_TYPES.has(el.type)) ||
  el instanceof HTMLTextAreaElement ||
  el instanceof HTMLSelectElement;

const fieldText = (
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
) =>
  el instanceof HTMLSelectElement
    ? Array.from(el.selectedOptions, (o) => o.text).join(' ')
    : el.value;

const bigEnough = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width * r.height >= MIN_IMAGE_AREA;
};

const CELLS =
  ':scope > th, :scope > td, [role="columnheader"], [role="rowheader"], [role="gridcell"], [role="cell"]';

/** A row of column headings: every cell is a column header (a `th scope="row"` is a row header). */
const isHeaderRow = (row: Element): boolean => {
  const cells = Array.from(row.querySelectorAll(CELLS));
  return (
    cells.length > 0 &&
    cells.every((c) =>
      c.hasAttribute('role')
        ? c.getAttribute('role') === 'columnheader'
        : c.tagName === 'TH' && c.getAttribute('scope') !== 'row'
    )
  );
};

/** Elements to blur in one root, plus text nodes whose matches need their own wrapper. */
function findTargets(
  root: Root,
  settings: BlurSettings
): {
  elements: Set<Element>;
  wraps: Map<Text, { start: number; end: number }[]>;
} {
  const elements = new Set<Element>();
  const wraps = new Map<Text, { start: number; end: number }[]>();
  const doc = root instanceof Document ? root : root.ownerDocument;
  if (textPatternsOn(settings)) {
    const start = root instanceof Document ? root.body : root;
    if (start) {
      const walker = doc.createTreeWalker(start, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n as Text;
        const parent = text.parentElement;
        const value = text.nodeValue ?? '';
        // The shortest match is a five-digit id.
        if (!parent || value.trim().length < 5 || SKIP_TAGS.has(parent.tagName))
          continue;
        const spans = findPageBlurSpans(value, settings);
        if (!spans.length || own(parent)) continue;
        const crowded =
          parent === doc.body ||
          parent === doc.documentElement ||
          parent.childElementCount > MAX_SIBLINGS;
        if (crowded) wraps.set(text, spans);
        else elements.add(parent);
      }
    }
  }
  root.querySelectorAll('input, textarea, select').forEach((el) => {
    if (!isField(el) || own(el)) return;
    const value = fieldText(el);
    if (!value.trim()) return;
    if (settings.fields || findPageBlurSpans(value, settings).length)
      elements.add(el);
  });
  if (settings.tableRows)
    root.querySelectorAll('tr, [role="row"]').forEach((el) => {
      if (own(el) || el.closest('thead') || isHeaderRow(el)) return;
      elements.add(el);
    });
  if (settings.images)
    root
      .querySelectorAll('img, picture, video, canvas, svg image')
      .forEach((el) => {
        if (!own(el) && bigEnough(el)) elements.add(el);
      });
  return { elements, wraps };
}

/** Wraps each matched span of the text node in a blurred span; the returned function puts the node back. */
function wrapSpans(
  text: Text,
  spans: readonly { start: number; end: number }[]
): () => void {
  const doc = text.ownerDocument;
  const value = text.nodeValue ?? '';
  const nodes: Node[] = [];
  let at = 0;
  for (const { start, end } of spans) {
    if (start > at) nodes.push(doc.createTextNode(value.slice(at, start)));
    const span = doc.createElement('span');
    span.setAttribute(BLUR_ATTR, '');
    span.textContent = value.slice(start, end);
    nodes.push(span);
    at = end;
  }
  if (at < value.length) nodes.push(doc.createTextNode(value.slice(at)));
  const parent = text.parentNode;
  if (!parent) return () => undefined;
  for (const node of nodes) parent.insertBefore(node, text);
  text.remove();
  return () => {
    const first = nodes[0];
    if (first?.parentNode) first.parentNode.insertBefore(text, first);
    for (const node of nodes) node.parentNode?.removeChild(node);
  };
}

const cssEscape = (s: string) =>
  typeof CSS !== 'undefined' && CSS.escape
    ? CSS.escape(s)
    : s.replace(/[^\w-]/g, '\\$&');

const countOf = (doc: Document, sel: string) => {
  try {
    return doc.querySelectorAll(sel).length;
  } catch {
    return 0;
  }
};

/** A selector that matches only this element right now, lengthened one ancestor at a time until it does. */
export function uniqueSelector(el: Element): string {
  const doc = el.ownerDocument;
  const parts: string[] = [];
  for (
    let node: Element | null = el;
    node && node !== doc.documentElement;
    node = node.parentElement
  ) {
    const id = node.id;
    if (id && countOf(doc, `#${cssEscape(id)}`) === 1) {
      parts.unshift(`#${cssEscape(id)}`);
    } else {
      const tag = node.tagName.toLowerCase();
      const parent: Element | null = node.parentElement;
      const index = parent
        ? Array.from(parent.children)
            .filter((c) => c.tagName === node?.tagName)
            .indexOf(node) + 1
        : 1;
      parts.unshift(`${tag}:nth-of-type(${index})`);
    }
    const sel = parts.join(' > ');
    if (countOf(doc, sel) === 1) return sel;
  }
  return `html > ${parts.join(' > ')}`;
}

/** Marks every element each picked selector matches, so a vague one blurs too much rather than too little. */
export function markPicks(
  doc: Document,
  selectors: readonly string[]
): Element[] {
  const out: Element[] = [];
  for (const sel of selectors) {
    let found: Element[];
    try {
      found = Array.from(doc.querySelectorAll(sel));
    } catch {
      continue;
    }
    for (const el of found)
      if (!own(el)) {
        el.setAttribute(PICK_ATTR, '');
        out.push(el);
      }
  }
  if (out.length) ensureBlurStyle(doc, PICK_ATTR);
  return out;
}

/** Blurs these elements for one picture; the returned function lifts exactly that. */
export function blurElements(
  doc: Document,
  els: readonly Element[]
): () => void {
  const lift = ensureBlurStyle(doc, BLUR_ATTR);
  const added = els.filter((el) => !el.hasAttribute(BLUR_ATTR));
  for (const el of added) el.setAttribute(BLUR_ATTR, '');
  return () => {
    for (const el of added) el.removeAttribute(BLUR_ATTR);
    if (!doc.querySelector(`[${BLUR_ATTR}]`)) lift();
  };
}

/** Blurs everything the settings and picks cover in this frame; the returned function undoes exactly that. */
export function applyPageBlur(
  doc: Document,
  settings: BlurSettings,
  picks: readonly string[] = []
): () => void {
  const undo: (() => void)[] = [];
  const picked = markPicks(doc, picks);
  for (const root of rootsOf(doc)) {
    const { elements, wraps } = findTargets(root, settings);
    for (const el of picked) if (el.getRootNode() === root) elements.delete(el);
    if (!elements.size && !wraps.size) continue;
    undo.push(ensureBlurStyle(root, BLUR_ATTR));
    for (const el of elements)
      if (!el.hasAttribute(BLUR_ATTR)) {
        el.setAttribute(BLUR_ATTR, '');
        undo.push(() => el.removeAttribute(BLUR_ATTR));
      }
    for (const [text, spans] of wraps) undo.push(wrapSpans(text, spans));
  }
  let undone = false;
  return () => {
    if (undone) return;
    undone = true;
    for (const fn of undo.reverse()) fn();
  };
}
