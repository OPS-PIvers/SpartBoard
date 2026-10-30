// The generic read behind Send to SpartBoard (IMPORT D14): the main content, or only the selection, and never a form value.

import {
  GENERIC_PLATFORM,
  IMPORT_MAX_BLOCK_CHARS,
  IMPORT_MAX_BLOCKS,
  IMPORT_MAX_REASON_CHARS,
  IMPORT_MAX_TABLE_CELLS,
  IMPORT_MAX_TABLE_ROWS,
  IMPORT_MAX_TEXT_CHARS,
  IMPORT_MAX_TITLE_CHARS,
  IMPORT_MAX_URL_CHARS,
  type ImportBlock,
  type ImportImage,
  type ImportSendRequest,
} from '@/utils/import/contract';

export const MAX_IMAGES = 50;
const MIN_IMAGE_PX = 48;
const MIN_MAIN_CHARS = 250;

// Never read: code, media, and every form control, so a typed value can't leave the page.
const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'IFRAME',
  'FRAME',
  'OBJECT',
  'EMBED',
  'SVG',
  'CANVAS',
  'VIDEO',
  'AUDIO',
  'INPUT',
  'TEXTAREA',
  'SELECT',
  'OPTION',
  'DATALIST',
  'OUTPUT',
  'BUTTON',
  'NAV',
  'ASIDE',
  'FOOTER',
  'DIALOG',
]);

const SKIP_ROLES = new Set([
  'navigation',
  'banner',
  'contentinfo',
  'complementary',
  'search',
  'dialog',
  'alertdialog',
  'menu',
  'menubar',
  'toolbar',
  'tablist',
  'textbox',
  'combobox',
  'searchbox',
  'listbox',
  'spinbutton',
]);

const BLOCK_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'BLOCKQUOTE',
  'DD',
  'DETAILS',
  'DIV',
  'DL',
  'DT',
  'FIELDSET',
  'FIGCAPTION',
  'FIGURE',
  'FORM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'LI',
  'MAIN',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'SUMMARY',
  'TABLE',
  'TBODY',
  'TD',
  'TFOOT',
  'TH',
  'THEAD',
  'TR',
  'UL',
]);

const tagOf = (el: Element) => el.tagName.toUpperCase();

/** Hidden, a control, editable or page chrome: nothing inside it is read. */
function skipped(el: Element): boolean {
  if (SKIP_TAGS.has(tagOf(el))) return true;
  const role = el.getAttribute('role');
  if (role && SKIP_ROLES.has(role)) return true;
  // Modal libraries hide the whole app this way while a dialog is open; that isn't hidden content.
  if (
    el.getAttribute('aria-hidden') === 'true' &&
    el !== el.ownerDocument.body &&
    el !== el.ownerDocument.documentElement &&
    el.parentElement !== el.ownerDocument.body
  )
    return true;
  if ((el as HTMLElement).hidden) return true;
  // Editable text is something the teacher typed, as good as a form value.
  const editable = el.getAttribute('contenteditable');
  if (editable !== null && editable !== 'false') return true;
  // Our own Send button, and anything another extension injected the same way.
  if (el.id === 'spartboard-send' || el.id === 'spartboard-schoology-import')
    return true;
  const view = el.ownerDocument.defaultView;
  if (!view || !el.isConnected) return false;
  if ((el as HTMLElement).isContentEditable) return true;
  const style = view.getComputedStyle(el);
  return style.display === 'none' || style.visibility === 'hidden';
}

/** `el` or anything between it and the page root is skipped; answers are kept per read. */
function skippedWithin(el: Element, memo: Map<Element, boolean>): boolean {
  const seen: Element[] = [];
  let found = false;
  for (let at: Element | null = el; at; at = at.parentElement) {
    const known = memo.get(at);
    if (known !== undefined) {
      found = known;
      break;
    }
    seen.push(at);
    if (skipped(at)) {
      found = true;
      break;
    }
  }
  for (const at of seen) memo.set(at, found);
  return found;
}

const clean = (text: string) =>
  text
    .replace(/[ \t\f\v\r\u00a0\u200b]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** The visible inline text of a node, with line breaks kept. */
function inlineText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as Element;
  if (skipped(el)) return '';
  if (tagOf(el) === 'BR') return '\n';
  let out = '';
  for (const child of Array.from(el.childNodes)) out += inlineText(child);
  return out;
}

const hasBlockChild = (el: Element) =>
  Array.from(el.children).some((c) => BLOCK_TAGS.has(tagOf(c)));

class Collector {
  blocks: ImportBlock[] = [];
  chars = 0;
  full = false;

  /** Room for `text` under the caps; false once the read is full. */
  private fits(length: number): boolean {
    if (
      this.blocks.length >= IMPORT_MAX_BLOCKS ||
      this.chars + length > IMPORT_MAX_TEXT_CHARS
    )
      this.full = true;
    return !this.full;
  }

  push(
    type: 'heading' | 'paragraph' | 'listItem' | 'quote',
    raw: string,
    level = 0
  ) {
    if (this.full) return;
    const text = clean(raw).slice(0, IMPORT_MAX_BLOCK_CHARS);
    if (!text) return;
    const last = this.blocks.at(-1);
    if (last && last.type === type && 'text' in last && last.text === text)
      return;
    if (!this.fits(text.length)) return;
    this.chars += text.length;
    this.blocks.push(
      type === 'heading' ? { type, level, text } : { type, text }
    );
  }

  walk(el: Element) {
    if (this.full || skipped(el)) return;
    const tag = tagOf(el);
    const heading = /^H([1-6])$/.exec(tag);
    if (heading) return this.push('heading', inlineText(el), +heading[1]);
    if (tag === 'PRE') return this.push('paragraph', inlineText(el));
    if (tag === 'TABLE') return this.table(el);
    if (tag === 'LI') return this.listItem(el);
    if (tag === 'BLOCKQUOTE' && !hasBlockChild(el))
      return this.push('quote', inlineText(el));
    if (!hasBlockChild(el)) return this.push('paragraph', inlineText(el));
    // Mixed content: runs of inline nodes between blocks become paragraphs.
    let run = '';
    for (const child of Array.from(el.childNodes)) {
      if (
        child.nodeType === Node.ELEMENT_NODE &&
        BLOCK_TAGS.has(tagOf(child as Element))
      ) {
        this.push('paragraph', run);
        run = '';
        this.walk(child as Element);
      } else {
        run += inlineText(child);
      }
    }
    this.push('paragraph', run);
  }

  table(table: Element) {
    if (this.full) return;
    const rows: { cells: string[] }[] = [];
    let chars = 0;
    for (const tr of Array.from(table.querySelectorAll('tr'))) {
      if (rows.length >= IMPORT_MAX_TABLE_ROWS) break;
      // Rows of a table nested inside this one are read with it, not twice.
      if (tr.closest('table') !== table || skipped(tr)) continue;
      const cells = Array.from(tr.children)
        .filter((c) => !skipped(c))
        .slice(0, IMPORT_MAX_TABLE_CELLS)
        .map((c) =>
          clean(inlineText(c))
            .replace(/\n+/g, ' ')
            .slice(0, IMPORT_MAX_BLOCK_CHARS)
        );
      if (!cells.some(Boolean)) continue;
      // Counted as the server counts it: one per row and per cell, plus the text.
      chars += 1 + cells.reduce((n, c) => n + 1 + c.length, 0);
      rows.push({ cells });
    }
    if (!rows.length || !this.fits(chars)) return;
    this.chars += chars;
    this.blocks.push({ type: 'table', rows });
  }

  listItem(li: Element) {
    let own = '';
    const nested: Element[] = [];
    for (const child of Array.from(li.childNodes)) {
      if (
        child.nodeType === Node.ELEMENT_NODE &&
        BLOCK_TAGS.has(tagOf(child as Element))
      ) {
        const tag = tagOf(child as Element);
        if (tag === 'UL' || tag === 'OL') nested.push(child as Element);
        else own += `\n${inlineText(child)}`;
      } else {
        own += inlineText(child);
      }
    }
    this.push('listItem', own);
    for (const list of nested) this.walk(list);
  }
}

/** Readability-style pick: the element whose paragraphs hold the most text, with links counting against it. */
export function mainContent(doc: Document): Element {
  const body = doc.body ?? doc.documentElement;
  const memo = new Map<Element, boolean>();
  const lengths = new Map<Element, number>();
  const textLength = (el: Element) => {
    let len = lengths.get(el);
    if (len === undefined) {
      len = clean(inlineText(el)).length;
      lengths.set(el, len);
    }
    return len;
  };
  const marked = [
    ...Array.from(doc.querySelectorAll('main, [role="main"]')),
    ...Array.from(doc.querySelectorAll('article')),
  ].filter((el) => !skippedWithin(el, memo));
  const markedBest = marked
    .map((el) => ({ el, len: textLength(el) }))
    .sort((a, b) => b.len - a.len)[0];
  if (markedBest && markedBest.len >= MIN_MAIN_CHARS) return markedBest.el;

  // Only text the read would keep counts, so a hidden or editable region never wins.
  const scores = new Map<Element, number>();
  const linked = new Map<Element, number>();
  for (const p of Array.from(
    body.querySelectorAll('p, pre, li, td, blockquote, h2, h3')
  )) {
    if (skippedWithin(p, memo)) continue;
    const len = textLength(p);
    if (len < 25) continue;
    const parent = p.parentElement;
    const grand = parent?.parentElement;
    if (parent) scores.set(parent, (scores.get(parent) ?? 0) + len);
    if (grand) scores.set(grand, (scores.get(grand) ?? 0) + len / 2);
  }
  for (const a of Array.from(body.querySelectorAll('a'))) {
    if (skippedWithin(a, memo)) continue;
    const len = textLength(a);
    for (let at = a.parentElement; at; at = at.parentElement)
      if (scores.has(at)) linked.set(at, (linked.get(at) ?? 0) + len);
  }
  let top: Element | null = null;
  let topScore = 0;
  for (const [el, score] of scores) {
    const all = textLength(el) || 1;
    const adjusted = score * (1 - Math.min((linked.get(el) ?? 0) / all, 1));
    if (adjusted > topScore) {
      top = el;
      topScore = adjusted;
    }
  }
  return top && topScore >= MIN_MAIN_CHARS ? top : body;
}

function images(root: Element, baseUrl: string): ImportImage[] {
  const found = new Map<string, ImportImage>();
  const memo = new Map<Element, boolean>();
  for (const img of Array.from(root.querySelectorAll('img'))) {
    if (found.size >= MAX_IMAGES) break;
    // Pictures in a hidden, editable or chrome region stay with it.
    if (img.closest('nav, footer, aside') || skippedWithin(img, memo)) continue;
    const width = Number(img.getAttribute('width') ?? img.naturalWidth ?? 0);
    const height = Number(img.getAttribute('height') ?? img.naturalHeight ?? 0);
    // Icons and tracking pixels; an image with no size known yet is kept.
    if ((width && width < MIN_IMAGE_PX) || (height && height < MIN_IMAGE_PX))
      continue;
    const src = img.currentSrc || img.getAttribute('src') || '';
    try {
      const url = new URL(src, baseUrl);
      const href = url.toString();
      const alt = clean(img.getAttribute('alt') ?? '').slice(
        0,
        IMPORT_MAX_REASON_CHARS
      );
      if (
        (url.protocol === 'https:' || url.protocol === 'http:') &&
        href.length <= 2048 &&
        !found.has(href)
      )
        found.set(href, alt ? { url: href, alt } : { url: href });
    } catch {
      // A malformed src is left out.
    }
  }
  return [...found.values()];
}

/** A copy of the selected part of `node`, checked against the live page so CSS-hidden text stays out. */
function selectedCopy(node: Node, range: Range, doc: Document): Node | null {
  if (!range.intersectsNode(node)) return null;
  if (node.nodeType === Node.TEXT_NODE) {
    let text = node.textContent ?? '';
    if (node === range.endContainer) text = text.slice(0, range.endOffset);
    if (node === range.startContainer) text = text.slice(range.startOffset);
    return doc.createTextNode(text);
  }
  if (node.nodeType !== Node.ELEMENT_NODE || skipped(node as Element))
    return null;
  const copy = node.cloneNode(false) as Element;
  for (const child of Array.from(node.childNodes)) {
    const part = selectedCopy(child, range, doc);
    if (part) copy.append(part);
  }
  return copy;
}

/** The selection's readable contents as a detached tree; null when the teacher selected nothing. */
function selectionRoot(win: Window): Element | null {
  const selection = win.getSelection();
  if (
    !selection ||
    selection.isCollapsed ||
    selection.rangeCount === 0 ||
    !selection.toString().trim()
  )
    return null;
  const doc = win.document;
  const memo = new Map<Element, boolean>();
  const holder = doc.createElement('div');
  for (let i = 0; i < selection.rangeCount; i++) {
    const range = selection.getRangeAt(i);
    const common = range.commonAncestorContainer;
    const host =
      common.nodeType === Node.ELEMENT_NODE
        ? (common as Element)
        : common.parentElement;
    // A selection inside a control, an editable or a hidden region reads nothing.
    if (!host || skippedWithin(host, memo)) continue;
    const part = selectedCopy(common, range, doc);
    if (!part) continue;
    const wrap = doc.createElement('div');
    wrap.append(part);
    holder.append(wrap);
  }
  return holder;
}

/** The address the server accepts: no sign-in part or fragment, and the query dropped when it would run past the cap. */
export function pageUrl(href: string): string {
  try {
    const u = new URL(href);
    u.username = '';
    u.password = '';
    u.hash = '';
    if (u.href.length > IMPORT_MAX_URL_CHARS) u.search = '';
    return u.href.length > IMPORT_MAX_URL_CHARS ? u.origin : u.href;
  } catch {
    return href;
  }
}

const titleOf = (doc: Document) =>
  (
    clean(doc.title) ||
    clean(doc.querySelector('h1')?.textContent ?? '') ||
    doc.location?.hostname ||
    'Page'
  ).slice(0, IMPORT_MAX_TITLE_CHARS);

/** Reads the page the teacher is on, as the inbox request; only a click calls this. */
export function readPage(win: Window): ImportSendRequest {
  const doc = win.document;
  const url = pageUrl(doc.location?.href ?? '');
  const base = { url, title: titleOf(doc), platform: GENERIC_PLATFORM };
  const selected = selectionRoot(win);
  // A selection that holds nothing readable sends nothing, rather than the whole page.
  if (selected) {
    const read = new Collector();
    read.walk(selected);
    return {
      ...base,
      selectionOnly: true,
      blocks: read.blocks,
      images: read.blocks.length ? images(selected, url) : [],
    };
  }
  const root = mainContent(doc);
  const read = new Collector();
  read.walk(root);
  return {
    ...base,
    selectionOnly: false,
    blocks: read.blocks,
    images: images(root, url),
  };
}

/** A selection Chrome copied from an embedded frame, as paragraphs under the top page's address. */
export function readSelectionText(
  win: Window,
  text: string
): ImportSendRequest {
  const blocks: ImportBlock[] = [];
  let chars = 0;
  for (const line of text.split(/\n+/)) {
    const t = clean(line).slice(0, IMPORT_MAX_BLOCK_CHARS);
    if (!t) continue;
    if (
      blocks.length >= IMPORT_MAX_BLOCKS ||
      chars + t.length > IMPORT_MAX_TEXT_CHARS
    )
      break;
    chars += t.length;
    blocks.push({ type: 'paragraph', text: t });
  }
  return {
    url: pageUrl(win.document.location?.href ?? ''),
    title: titleOf(win.document),
    platform: GENERIC_PLATFORM,
    selectionOnly: true,
    blocks,
    images: [],
  };
}
