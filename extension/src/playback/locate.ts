import { WEB_TOUR_ATTR_KEYS, type WebTourLocator } from '@/types';
import { nearestHeading, stableAttrsOf } from './clues';

/** The clues a frame searches with; frames are matched by the service worker. */
export type WebLocatorClues = Omit<WebTourLocator, 'frames'>;

export interface LocatorMatch {
  el: Element;
  /** Cleared the floor but not the margin over the runner-up (C2). */
  weak: boolean;
  /** 0-1, the share of the locator's clue weight this element matched. */
  score: number;
}

const INPUT_ROLES: Record<string, string> = {
  checkbox: 'checkbox',
  radio: 'radio',
  range: 'slider',
  button: 'button',
  submit: 'button',
  reset: 'button',
  search: 'searchbox',
};

const IMPLICIT_ROLES: Record<string, string> = {
  BUTTON: 'button',
  SELECT: 'combobox',
  TEXTAREA: 'textbox',
  SUMMARY: 'button',
};

export function roleOf(el: Element): string | null {
  const explicit = el.getAttribute('role');
  if (explicit) return explicit.split(/\s+/)[0];
  if (el.tagName === 'A') return el.hasAttribute('href') ? 'link' : null;
  if (el.tagName === 'INPUT') {
    return INPUT_ROLES[(el as HTMLInputElement).type] ?? 'textbox';
  }
  return IMPLICIT_ROLES[el.tagName] ?? null;
}

export const normalizeText = (s: string) =>
  s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Ids resolve in the element's own tree first, so labels inside a shadow root are found. */
function byIdNear(el: Element, id: string): Element | null {
  const root = el.getRootNode();
  const near = root instanceof ShadowRoot ? root.getElementById(id) : null;
  return near ?? el.ownerDocument.getElementById(id);
}

function labelFor(el: Element): string {
  const id = el.getAttribute('id');
  if (!id) return '';
  const selector = `label[for="${CSS.escape(id)}"]`;
  const root = el.getRootNode();
  const label =
    (root instanceof ShadowRoot ? root.querySelector(selector) : null) ??
    el.ownerDocument.querySelector(selector);
  return label?.textContent ?? '';
}

export function accessibleName(el: Element): string {
  const label = el.getAttribute('aria-label');
  if (label?.trim()) return normalizeText(label);
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => byIdNear(el, id)?.textContent ?? '')
      .join(' ');
    if (text.trim()) return normalizeText(text);
  }
  const forLabel = labelFor(el);
  if (forLabel.trim()) return normalizeText(forLabel);
  for (const attr of ['title', 'placeholder', 'alt']) {
    const v = el.getAttribute(attr);
    if (v?.trim()) return normalizeText(v);
  }
  return normalizeText(el.textContent ?? '');
}

export function isShown(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  return typeof el.checkVisibility === 'function'
    ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
    : true;
}

export const INTERACTIVE =
  'a[href],button,input,select,textarea,summary,[role],[tabindex],[onclick],[contenteditable="true"]';

/** The document and every open shadow root inside it, found in one walk. */
export function rootsOf(doc: Document): (Document | ShadowRoot)[] {
  const out: (Document | ShadowRoot)[] = [];
  const visit = (node: Document | ShadowRoot) => {
    out.push(node);
    for (const el of node.querySelectorAll('*')) {
      if (el.shadowRoot) visit(el.shadowRoot);
    }
  };
  visit(doc);
  return out;
}

const queryAll = (roots: (Document | ShadowRoot)[], selector: string) =>
  roots.flatMap((root) => [...root.querySelectorAll(selector)]);

/** The innermost elements whose own text is the wanted text, so a wrapper doesn't win over its button. */
export function byText(
  doc: Document,
  roots: (Document | ShadowRoot)[],
  text: string
): Element[] {
  const want = normalizeText(text);
  if (!want) return [];
  const inBody = (el: Element) =>
    el.getRootNode() !== doc || (el !== doc.body && !!doc.body?.contains(el));
  // Climb only from text that could be part of the wanted text, instead of reading every element's text.
  const hits = new Set<Element>();
  const seen = new Set<Element>();
  for (const root of roots) {
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const own = normalizeText(node.nodeValue ?? '');
      if (!own || !want.includes(own)) continue;
      for (
        let el = node.parentElement;
        el && !seen.has(el);
        el = el.parentElement
      ) {
        seen.add(el);
        const full = normalizeText(el.textContent ?? '');
        if (full.length > want.length) break;
        if (
          full === want &&
          el.tagName !== 'SCRIPT' &&
          el.tagName !== 'STYLE' &&
          inBody(el)
        )
          hits.add(el);
      }
    }
  }
  const list = [...hits];
  return list.filter((el) => !list.some((h) => h !== el && el.contains(h)));
}

export function byCss(
  roots: (Document | ShadowRoot)[],
  css: string
): Element[] {
  try {
    return queryAll(roots, css);
  } catch {
    return [];
  }
}

function matchesCss(el: Element, css: string): boolean {
  try {
    return el.matches(css);
  } catch {
    return false;
  }
}

/** Center-to-center distance from the recorded box, in viewport fractions. */
function distance(
  el: Element,
  box: NonNullable<WebLocatorClues['box']>
): number {
  const view = el.ownerDocument.defaultView;
  const w = view?.innerWidth || 1;
  const h = view?.innerHeight || 1;
  const r = el.getBoundingClientRect();
  const dx = (r.left + r.width / 2) / w - (box.x + box.w / 2);
  const dy = (r.top + r.height / 2) / h - (box.y + box.h / 2);
  return Math.sqrt(dx * dx + dy * dy);
}

const bigrams = (s: string): string[] => {
  const t = s.replace(/\s+/g, '');
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
};

// Icon-font glyphs (private-use characters) change with the icon, not the control.
const withoutGlyphs = (s: string) =>
  s
    .replace(/[\p{Co}�]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** 1 for the same text, at most 0.9 for similar text (letter-pair overlap), 0 for none; icon glyphs are ignored. */
export function similarity(rawA: string, rawB: string): number {
  if (rawA && rawA === rawB) return 1;
  const a = withoutGlyphs(rawA);
  const b = withoutGlyphs(rawB);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const x = bigrams(a);
  const y = bigrams(b);
  if (x.length === 0 || y.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const g of x) counts.set(g, (counts.get(g) ?? 0) + 1);
  let shared = 0;
  for (const g of y) {
    const n = counts.get(g) ?? 0;
    if (n > 0) {
      shared++;
      counts.set(g, n - 1);
    }
  }
  return ((2 * shared) / (x.length + y.length)) * 0.9;
}

/** Per-clue weights, Similo-style: what a site rarely changes counts most. */
export const CLUE_WEIGHTS = {
  roleName: 4,
  name: 2,
  role: 1,
  text: 2.5,
  css: 2,
  tag: 0.5,
  testId: 3,
  ariaLabel: 2,
  attrName: 2,
  href: 2.5,
  heading: 1,
  box: 1,
} as const;

/** A winner needs this share of the clue weight. */
export const SCORE_FLOOR = 0.15;
/** A lead over the runner-up below this is a weak match. */
export const SCORE_MARGIN = 0.1;
/** A lead below this can't tell two elements apart, so nothing is picked. */
export const SCORE_TIE = 0.02;
const SIMILAR = 0.7;
const FUZZY_GATHER = 0.6;
const MAX_CANDIDATES = 300;
const BOX_REACH = 0.5;

type AttrKey = (typeof WEB_TOUR_ATTR_KEYS)[number];

const ATTR_WEIGHT: Record<AttrKey, number> = {
  testId: CLUE_WEIGHTS.testId,
  ariaLabel: CLUE_WEIGHTS.ariaLabel,
  name: CLUE_WEIGHTS.attrName,
  href: CLUE_WEIGHTS.href,
};

const ATTR_SELECTOR: Record<AttrKey, string> = {
  testId: '[data-testid],[data-test-id],[data-test],[data-qa]',
  ariaLabel: '[aria-label]',
  name: '[name]',
  href: 'a[href]',
};

interface Wanted {
  role?: string;
  name?: string;
  text?: string;
  css?: string;
  tag?: string;
  heading?: string;
  attrs: [AttrKey, string][];
  box?: WebLocatorClues['box'];
  total: number;
}

/** The tag the CSS path ends on, when it names one. */
const tagOfCss = (css: string): string | undefined => {
  const last = css.split('>').pop()?.trim() ?? '';
  const m = /^[a-z][a-z0-9-]*/i.exec(last);
  return m ? m[0].toUpperCase() : undefined;
};

const attrValue = (k: AttrKey, v: string) =>
  k === 'href' ? v : normalizeText(v);

function wantedOf(clues: WebLocatorClues): Wanted {
  const norm = (s: string | undefined) =>
    s ? normalizeText(s) || undefined : undefined;
  const attrs: [AttrKey, string][] = [];
  for (const k of WEB_TOUR_ATTR_KEYS) {
    const v = clues.attrs?.[k];
    if (v) attrs.push([k, attrValue(k, v)]);
  }
  const w: Wanted = {
    role: clues.role || undefined,
    name: norm(clues.name),
    text: norm(clues.text),
    css: clues.css || undefined,
    tag: clues.css ? tagOfCss(clues.css) : undefined,
    heading: norm(clues.heading),
    attrs,
    box: clues.box,
    total: 0,
  };
  const C = CLUE_WEIGHTS;
  w.total =
    (w.role && w.name ? C.roleName : 0) +
    (w.name ? C.name : 0) +
    (w.role ? C.role : 0) +
    (w.text ? C.text : 0) +
    (w.css ? C.css : 0) +
    (w.tag ? C.tag : 0) +
    (w.heading ? C.heading : 0) +
    (w.box ? C.box : 0) +
    attrs.reduce((sum, [k]) => sum + ATTR_WEIGHT[k], 0);
  return w;
}

interface Scored {
  el: Element;
  score: number;
  /** Matched at least one identifying clue, so position alone never picks it. */
  identified: boolean;
}

function scoreOf(el: Element, w: Wanted): Scored {
  const C = CLUE_WEIGHTS;
  let got = 0;
  let identified = false;
  const role = w.role ? roleOf(el) : null;
  if (w.name) {
    const s = similarity(accessibleName(el), w.name);
    if (w.role && role === w.role && s === 1) got += C.roleName;
    got += C.name * s;
    if (s >= SIMILAR) identified = true;
  }
  if (w.role && role === w.role) got += C.role;
  if (w.text) {
    const s = similarity(normalizeText(el.textContent ?? ''), w.text);
    got += C.text * s;
    if (s >= SIMILAR) identified = true;
  }
  if (w.css && matchesCss(el, w.css)) {
    got += C.css;
    identified = true;
  }
  if (w.tag && el.tagName === w.tag) got += C.tag;
  if (w.attrs.length) {
    const have = stableAttrsOf(el);
    for (const [k, v] of w.attrs) {
      const mine = have[k];
      if (mine && attrValue(k, mine) === v) {
        got += ATTR_WEIGHT[k];
        identified = true;
      }
    }
  }
  if (w.heading) {
    got += C.heading * similarity(normalizeText(nearestHeading(el)), w.heading);
  }
  if (w.box) {
    got += C.box * Math.max(0, 1 - distance(el, w.box) / BOX_REACH);
  }
  return { el, score: w.total > 0 ? got / w.total : 0, identified };
}

/** Every shown element some clue points at: role with a similar name, text, CSS path or a stable attribute. */
function gather(
  doc: Document,
  roots: (Document | ShadowRoot)[],
  w: Wanted
): Element[] {
  const found = new Set<Element>();
  if (w.role && w.name) {
    const { role, name } = w;
    for (const el of queryAll(roots, INTERACTIVE)) {
      if (roleOf(el) !== role) continue;
      if (similarity(accessibleName(el), name) >= FUZZY_GATHER) found.add(el);
    }
  }
  if (w.text) for (const el of byText(doc, roots, w.text)) found.add(el);
  if (w.css) for (const el of byCss(roots, w.css)) found.add(el);
  if (w.attrs.length) {
    const selector = w.attrs.map(([k]) => ATTR_SELECTOR[k]).join(',');
    for (const el of queryAll(roots, selector)) {
      const have = stableAttrsOf(el);
      const hit = w.attrs.some(([k, v]) => {
        const mine = have[k];
        return !!mine && attrValue(k, mine) === v;
      });
      if (hit) found.add(el);
    }
  }
  return [...found].filter(isShown).slice(0, MAX_CANDIDATES);
}

/** Scores every candidate on every recorded clue; the best plays above the floor, and is clear only by the margin (C1, C2). */
export function locate(
  doc: Document,
  clues: WebLocatorClues
): LocatorMatch | null {
  const w = wantedOf(clues);
  if (w.total === 0) return null;
  const scored = gather(doc, rootsOf(doc), w)
    .map((el) => scoreOf(el, w))
    .sort((a, b) => b.score - a.score);
  const best = scored.find((s) => s.identified);
  if (!best || best.score < SCORE_FLOOR) return null;
  // A wrapper of the winner, or a label inside it, is the same control rather than a rival.
  const rival = scored.find(
    (s) => s !== best && !s.el.contains(best.el) && !best.el.contains(s.el)
  );
  const lead = rival ? best.score - rival.score : best.score;
  if (lead < SCORE_TIE) return null;
  return { el: best.el, weak: lead < SCORE_MARGIN, score: best.score };
}
