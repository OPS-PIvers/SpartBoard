import type { WebTourLocator } from '@/types';

/** The clues a frame searches with; frames are matched by the service worker. */
export type WebLocatorClues = Omit<WebTourLocator, 'frames'>;

/** Which clue found the target, strongest first. */
export type LocatorClue = 'role' | 'text' | 'css';

export interface LocatorMatch {
  el: Element;
  clue: LocatorClue;
  /** More than one element matched that clue, so position picked one. */
  tied: boolean;
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

const INTERACTIVE =
  'a[href],button,input,select,textarea,summary,[role],[tabindex],[onclick],[contenteditable="true"]';

/** Every element in the document and its open shadow roots that matches the selector. */
function queryDeep(root: Document | ShadowRoot, selector: string): Element[] {
  const out: Element[] = [];
  const visit = (node: Document | ShadowRoot) => {
    out.push(...node.querySelectorAll(selector));
    for (const el of node.querySelectorAll('*')) {
      if (el.shadowRoot) visit(el.shadowRoot);
    }
  };
  visit(root);
  return out;
}

function byRole(doc: Document, role: string, name: string): Element[] {
  const want = normalizeText(name);
  return queryDeep(doc, INTERACTIVE).filter(
    (el) => roleOf(el) === role && accessibleName(el) === want
  );
}

/** The innermost elements whose own text is the wanted text, so a wrapper doesn't win over its button. */
function byText(doc: Document, text: string): Element[] {
  const want = normalizeText(text);
  if (!want) return [];
  const inBody = (el: Element) =>
    el.getRootNode() !== doc || (el !== doc.body && !!doc.body?.contains(el));
  const hits = queryDeep(doc, '*').filter(
    (el) =>
      inBody(el) &&
      el.tagName !== 'SCRIPT' &&
      el.tagName !== 'STYLE' &&
      normalizeText(el.textContent ?? '') === want
  );
  return hits.filter((el) => !hits.some((h) => h !== el && el.contains(h)));
}

function byCss(doc: Document, css: string): Element[] {
  try {
    return queryDeep(doc, css);
  } catch {
    return [];
  }
}

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
  return dx * dx + dy * dy;
}

function pick(
  found: Element[],
  box: WebLocatorClues['box']
): { el: Element; tied: boolean } | null {
  const shown = [...new Set(found)].filter(isShown);
  if (shown.length === 0) return null;
  if (shown.length === 1) return { el: shown[0], tied: false };
  if (!box) return null;
  const ranked = shown
    .map((el) => ({ el, d: distance(el, box) }))
    .sort((a, b) => a.d - b.d);
  return { el: ranked[0].el, tied: true };
}

/** Role and name, then text, then CSS path; the recorded box only breaks a tie within one clue (T4). */
export function locate(
  doc: Document,
  clues: WebLocatorClues
): LocatorMatch | null {
  const layers: [LocatorClue, () => Element[]][] = [];
  if (clues.role && clues.name) {
    const { role, name } = clues;
    layers.push(['role', () => byRole(doc, role, name)]);
  }
  if (clues.text) {
    const { text } = clues;
    layers.push(['text', () => byText(doc, text)]);
  }
  if (clues.css) {
    const { css } = clues;
    layers.push(['css', () => byCss(doc, css)]);
  }
  for (const [clue, find] of layers) {
    const hit = pick(find(), clues.box);
    if (hit) return { el: hit.el, clue, tied: hit.tied };
  }
  return null;
}
