import {
  WEB_TOUR_ATTR_KEYS,
  type WebTourLocator,
  type WebTourStableAttrs,
} from '@/types';
import { headingsUnder, nearestHeading, stableAttrsOf } from './clues';

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
  // Drop a hit that holds another hit, marking each hit's ancestors once instead of comparing every pair.
  const holders = new Set<Element>();
  for (const el of hits) {
    for (
      let up = el.parentElement;
      up && !holders.has(up);
      up = up.parentElement
    )
      holders.add(up);
  }
  return [...hits].filter((el) => !holders.has(el));
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

/** Scores text against `rawWant`: 1 for the same text, at most 0.9 for similar text (letter-pair overlap), 0 for none; icon glyphs are ignored. */
export function similarityTo(rawWant: string): (rawA: string) => number {
  const want = withoutGlyphs(rawWant);
  const wantPairs = want ? bigrams(want) : [];
  const counts = new Map<string, number>();
  for (const g of wantPairs) counts.set(g, (counts.get(g) ?? 0) + 1);
  return (rawA) => {
    if (rawA && rawA === rawWant) return 1;
    const a = withoutGlyphs(rawA);
    if (!a || !want) return 0;
    if (a === want) return 1;
    const pairs = bigrams(a);
    if (pairs.length === 0 || wantPairs.length === 0) return 0;
    const used = new Map<string, number>();
    let shared = 0;
    for (const g of pairs) {
      const have = counts.get(g);
      if (!have) continue;
      const u = used.get(g) ?? 0;
      if (u < have) {
        shared++;
        used.set(g, u + 1);
      }
    }
    return ((2 * shared) / (pairs.length + wantPairs.length)) * 0.9;
  };
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
/** Twins tied on every other clue: the nearest plays when the next is this much farther from the recorded box. */
export const TWIN_GAP = 0.02;
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
  /** Similarity to the wanted name, text and heading, each prepared once per search. */
  nameSim: (s: string) => number;
  textSim: (s: string) => number;
  headingSim: (s: string) => number;
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
    nameSim: () => 0,
    textSim: () => 0,
    headingSim: () => 0,
  };
  if (w.name) w.nameSim = similarityTo(w.name);
  if (w.text) w.textSim = similarityTo(w.text);
  if (w.heading) w.headingSim = similarityTo(w.heading);
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

/** Per-call caches, so one `locate` reads each element's attributes and heading once. */
interface Lookups {
  attrs: (el: Element) => WebTourStableAttrs;
  heading: (el: Element) => string;
  name: (el: Element) => string;
}

function lookups(): Lookups {
  const attrs = new Map<Element, WebTourStableAttrs>();
  const headings = new Map<Element, string>();
  const names = new Map<Element, string>();
  // Headings are listed once per document or shadow root; an ancestor's own are the few of those it contains.
  const rootHeadings = new Map<Node, Element[]>();
  const headingLists = new Map<Element, Element[]>();
  const headingsIn = (node: Element) => {
    let v = headingLists.get(node);
    if (v) return v;
    const root = node.getRootNode() as Document | ShadowRoot;
    let all = rootHeadings.get(root);
    if (!all) rootHeadings.set(root, (all = headingsUnder(root)));
    v = all.filter((h) => h !== node && node.contains(h));
    headingLists.set(node, v);
    return v;
  };
  return {
    name: (el) => {
      let v = names.get(el);
      if (v === undefined) names.set(el, (v = accessibleName(el)));
      return v;
    },
    attrs: (el) => {
      let v = attrs.get(el);
      if (!v) attrs.set(el, (v = stableAttrsOf(el)));
      return v;
    },
    heading: (el) => {
      let v = headings.get(el);
      if (v === undefined)
        headings.set(el, (v = nearestHeading(el, headingsIn)));
      return v;
    },
  };
}

interface Scored {
  el: Element;
  /** Gather order, which breaks score ties. */
  index: number;
  /** Clue weight matched before the heading and box, in the order the score adds them. */
  pre: number;
  boxPart: number;
  /** Raw distance from the recorded box; Infinity without one. */
  dist: number;
  /** Null until the heading is read. */
  headingPart: number | null;
  score: number;
  /** Matched at least one identifying clue, so position alone never picks it. */
  identified: boolean;
}

const finish = (s: Scored, w: Wanted) => {
  const got = s.pre + (s.headingPart ?? 0) + s.boxPart;
  s.score = w.total > 0 ? got / w.total : 0;
};

/** Every clue but the heading, which costs a walk up the tree and is added later only where it can matter. */
function scoreOf(el: Element, index: number, w: Wanted, look: Lookups): Scored {
  const C = CLUE_WEIGHTS;
  let got = 0;
  let identified = false;
  const role = w.role ? roleOf(el) : null;
  if (w.name) {
    const s = w.nameSim(look.name(el));
    if (w.role && role === w.role && s === 1) got += C.roleName;
    got += C.name * s;
    if (s >= SIMILAR) identified = true;
  }
  if (w.role && role === w.role) got += C.role;
  if (w.text) {
    const s = w.textSim(normalizeText(el.textContent ?? ''));
    got += C.text * s;
    if (s >= SIMILAR) identified = true;
  }
  if (w.css && matchesCss(el, w.css)) {
    got += C.css;
    identified = true;
  }
  if (w.tag && el.tagName === w.tag) got += C.tag;
  if (w.attrs.length) {
    const have = look.attrs(el);
    for (const [k, v] of w.attrs) {
      const mine = have[k];
      if (mine && attrValue(k, mine) === v) {
        got += ATTR_WEIGHT[k];
        identified = true;
      }
    }
  }
  const dist = w.box ? distance(el, w.box) : Infinity;
  const boxPart = w.box ? C.box * Math.max(0, 1 - dist / BOX_REACH) : 0;
  const s: Scored = {
    el,
    index,
    pre: got,
    boxPart,
    dist,
    headingPart: w.heading ? null : 0,
    score: 0,
    identified,
  };
  finish(s, w);
  return s;
}

/** Adds the heading clue to one candidate, once. */
function readHeading(s: Scored, w: Wanted, look: Lookups): void {
  if (s.headingPart !== null || !w.heading) return;
  s.headingPart =
    CLUE_WEIGHTS.heading * w.headingSim(normalizeText(look.heading(s.el)));
  finish(s, w);
}

const byRank = (a: Scored, b: Scored) => b.score - a.score || a.index - b.index;

/** The winner and its nearest rival among ranked candidates; a wrapper of the winner or a label inside it is the same control. */
function pickOf(ranked: Scored[]): { best?: Scored; rival?: Scored } {
  const best = ranked.find((s) => s.identified);
  if (!best) return {};
  const rival = ranked.find(
    (s) => s !== best && !s.el.contains(best.el) && !best.el.contains(s.el)
  );
  return { best, rival };
}

/** Adds the heading clue best-first, stopping once no unread candidate could still reach the winner or the rival. */
function addHeadings(scored: Scored[], w: Wanted, look: Lookups): Scored[] {
  if (!w.heading) return [...scored].sort(byRank);
  const reach = CLUE_WEIGHTS.heading / w.total;
  const pending = [...scored].sort(byRank);
  const done: Scored[] = [];
  while (pending.length) {
    const next = pending[0];
    if (done.length) {
      const { best, rival } = pickOf(done);
      if (
        best &&
        rival &&
        next.score + reach + 1e-9 < Math.min(best.score, rival.score)
      )
        break;
    }
    pending.shift();
    readHeading(next, w, look);
    done.push(next);
    done.sort(byRank);
  }
  return [...done, ...pending];
}

/** Every shown element some clue points at: role with a similar name, text, CSS path or a stable attribute. */
function gather(
  doc: Document,
  roots: (Document | ShadowRoot)[],
  w: Wanted,
  look: Lookups
): Element[] {
  const found = new Set<Element>();
  if (w.role && w.name) {
    const { role } = w;
    for (const el of queryAll(roots, INTERACTIVE)) {
      if (roleOf(el) !== role) continue;
      if (w.nameSim(look.name(el)) >= FUZZY_GATHER) found.add(el);
    }
  }
  // Exact hits on text, CSS path or an attribute are never cut by the cap.
  const exact = new Set<Element>();
  const hit = (el: Element) => {
    found.add(el);
    exact.add(el);
  };
  if (w.text) for (const el of byText(doc, roots, w.text)) hit(el);
  if (w.css) for (const el of byCss(roots, w.css)) hit(el);
  if (w.attrs.length) {
    const selector = w.attrs.map(([k]) => ATTR_SELECTOR[k]).join(',');
    for (const el of queryAll(roots, selector)) {
      const have = look.attrs(el);
      const same = w.attrs.some(([k, v]) => {
        const mine = have[k];
        return !!mine && attrValue(k, mine) === v;
      });
      if (same) hit(el);
    }
  }
  const shown = [...found].filter(isShown);
  if (shown.length <= MAX_CANDIDATES) return shown;
  // Past the cap, the similar names nearest the recorded box stay, in page order.
  const others = shown.filter((el) => !exact.has(el));
  const room = Math.max(0, MAX_CANDIDATES - (shown.length - others.length));
  const box = w.box;
  const ranked = box
    ? others
        .map((el) => ({ el, d: distance(el, box) }))
        .sort((a, b) => a.d - b.d)
        .map(({ el }) => el)
    : others;
  const kept = new Set(ranked.slice(0, room));
  return shown.filter((el) => exact.has(el) || kept.has(el));
}

/** Twins every clue but position scores alike: the one clearly nearest the recorded box plays, weakly (as the old chain picked list rows). */
function nearestTwin(
  scored: Scored[],
  best: Scored,
  w: Wanted,
  look: Lookups
): LocatorMatch | null {
  if (!w.box) return null;
  const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  const twins = scored.filter((s) => {
    if (!s.identified || !same(s.pre, best.pre)) return false;
    if (s !== best && (s.el.contains(best.el) || best.el.contains(s.el)))
      return false;
    readHeading(s, w, look);
    readHeading(best, w, look);
    return same(s.headingPart ?? 0, best.headingPart ?? 0);
  });
  const [near, next] = [...twins].sort((a, b) => a.dist - b.dist);
  if (!near || !next || next.dist - near.dist < TWIN_GAP) return null;
  return { el: near.el, weak: true, score: near.score };
}

/** What a search came to: a match, a tie it refused to break (`ambiguous`), or nothing above the floor, with the closest identified element when one comes near (C14). */
export type LocateOutcome =
  | { kind: 'match'; match: LocatorMatch }
  | { kind: 'ambiguous' }
  | { kind: 'none'; candidate?: Element };

/** Below the floor, an identified element scoring at least this is still worth suggesting. */
export const SUGGEST_FLOOR = SCORE_FLOOR / 2;

/** Scores every candidate on every recorded clue; the best plays above the floor, and is clear only by the margin (C1, C2). */
export function assessTarget(
  doc: Document,
  clues: WebLocatorClues,
  roots: (Document | ShadowRoot)[] = rootsOf(doc)
): LocateOutcome {
  const w = wantedOf(clues);
  if (w.total === 0) return { kind: 'none' };
  const look = lookups();
  const scored = gather(doc, roots, w, look).map((el, i) =>
    scoreOf(el, i, w, look)
  );
  const { best, rival } = pickOf(addHeadings(scored, w, look));
  if (!best) return { kind: 'none' };
  if (best.score < SCORE_FLOOR)
    return best.score >= SUGGEST_FLOOR
      ? { kind: 'none', candidate: best.el }
      : { kind: 'none' };
  const lead = rival ? best.score - rival.score : best.score;
  if (lead < SCORE_TIE) {
    const twin = nearestTwin(scored, best, w, look);
    return twin ? { kind: 'match', match: twin } : { kind: 'ambiguous' };
  }
  return {
    kind: 'match',
    match: { el: best.el, weak: lead < SCORE_MARGIN, score: best.score },
  };
}

/** The element a step plays on, or null when nothing clears the floor or a tie can't be broken. */
export function locate(
  doc: Document,
  clues: WebLocatorClues
): LocatorMatch | null {
  const out = assessTarget(doc, clues);
  return out.kind === 'match' ? out.match : null;
}
