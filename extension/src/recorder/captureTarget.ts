import type { WebTourAction, WebTourLocator } from '@/types';
import { roleOf } from '@/components/tours/resolveTourAnchor';
import { scrubCapturedText } from '@/components/tours/web/studentData';

/** What one recorded click captured in its own frame, before the service worker adds frames and the picture. */
export interface CapturedTarget {
  action: WebTourAction;
  locator: Omit<WebTourLocator, 'frames' | 'box'>;
  /** CSS px in this frame's viewport. */
  rect: { x: number; y: number; width: number; height: number };
  viewport: { w: number; h: number };
}

const CLICKABLE =
  'a[href], button, input, select, textarea, summary, label, [role], [tabindex], [onclick], [contenteditable="true"]';
const MAX_CSS_DEPTH = 4;
// Ids and classes with digits or long hex runs are per-record or per-build, never stable.
const UNSTABLE = /\d{2,}|[0-9a-f]{6,}|^css-|^sc-|^jsx-/i;

/** The control a click landed on: the nearest clickable ancestor, else the element itself. */
export function targetOf(el: Element): Element {
  return el.closest(CLICKABLE) ?? el;
}

const stableId = (el: Element): string | null => {
  const id = el.id;
  return id && !UNSTABLE.test(id) && id.length <= 40 ? id : null;
};

const stableClasses = (el: Element): string[] =>
  Array.from(el.classList)
    .filter((c) => !UNSTABLE.test(c) && c.length <= 30)
    .slice(0, 2);

const cssEscape = (s: string) =>
  typeof CSS !== 'undefined' && CSS.escape
    ? CSS.escape(s)
    : s.replace(/[^\w-]/g, '\\$&');

const stepSelector = (el: Element): string => {
  const id = stableId(el);
  if (id) return `#${cssEscape(id)}`;
  let sel = el.tagName.toLowerCase();
  for (const c of stableClasses(el)) sel += `.${cssEscape(c)}`;
  const parent = el.parentElement;
  if (parent) {
    const same = Array.from(parent.children).filter(
      (c) => c.tagName === el.tagName
    );
    if (same.length > 1) sel += `:nth-of-type(${same.indexOf(el) + 1})`;
  }
  return sel;
};

/** A short CSS path: stops at a stable id or after a few levels. */
export function shortCssPath(el: Element): string {
  const parts: string[] = [];
  for (
    let node: Element | null = el;
    node && node.tagName !== 'HTML' && parts.length < MAX_CSS_DEPTH;
    node = node.parentElement
  ) {
    const part = stepSelector(node);
    parts.unshift(part);
    if (part.startsWith('#')) break;
  }
  return parts.join(' > ');
}

const FIELD_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'listbox']);

/** Inputs, editors and anything whose content is what someone typed or chose. */
const isField = (el: Element): boolean =>
  el instanceof HTMLInputElement ||
  el instanceof HTMLTextAreaElement ||
  el instanceof HTMLSelectElement ||
  (el as HTMLElement).isContentEditable ||
  el.getAttribute('contenteditable') === 'true' ||
  FIELD_ROLES.has(el.getAttribute('role') ?? '');

const labelText = (el: Element): string => {
  const labels = (el as HTMLInputElement).labels;
  return labels?.[0]?.textContent ?? '';
};

const actionOf = (el: Element): WebTourAction => {
  if (el instanceof HTMLSelectElement) return 'select';
  if (el instanceof HTMLTextAreaElement) return 'type';
  if (el instanceof HTMLInputElement) {
    const t = el.type;
    if (['button', 'submit', 'reset', 'checkbox', 'radio', 'image'].includes(t))
      return 'click';
    return 'type';
  }
  if (
    (el as HTMLElement).isContentEditable ||
    el.getAttribute('contenteditable') === 'true' ||
    ['textbox', 'searchbox'].includes(el.getAttribute('role') ?? '')
  )
    return 'type';
  return 'click';
};

// Typed and chosen values are the learner's, never part of a tour.
const visibleText = (el: Element): string => {
  if (isField(el)) return '';
  return (el as HTMLElement).innerText ?? el.textContent ?? '';
};

const nameOf = (el: Element): string => {
  // A field's own name comes from its label, never its contents.
  if (isField(el))
    return (
      el.getAttribute('aria-label') ||
      labelText(el) ||
      el.getAttribute('placeholder') ||
      el.getAttribute('aria-placeholder') ||
      ''
    );
  // Same order as the playback resolver's accessible name, keeping case for the editor.
  const labelledBy = el.getAttribute('aria-labelledby');
  const byIds = labelledBy
    ? labelledBy
        .split(/\s+/)
        .map((id) => el.ownerDocument.getElementById(id)?.textContent ?? '')
        .join(' ')
        .trim()
    : '';
  return (
    el.getAttribute('aria-label') ||
    byIds ||
    el.getAttribute('title') ||
    el.getAttribute('alt') ||
    el.textContent ||
    ''
  );
};

/** Locator clues for the clicked control, already scrubbed of emails, ids and long text. */
export function captureTarget(clicked: Element): CapturedTarget {
  const el = targetOf(clicked);
  const view = el.ownerDocument.defaultView;
  const r = el.getBoundingClientRect();
  const role = roleOf(el) ?? undefined;
  const name = scrubCapturedText(nameOf(el)) || undefined;
  const text = scrubCapturedText(visibleText(el));
  const css = shortCssPath(el);
  return {
    action: actionOf(el),
    locator: {
      ...(role ? { role } : {}),
      ...(name ? { name } : {}),
      ...(text && text.toLowerCase() !== name?.toLowerCase() ? { text } : {}),
      ...(css ? { css } : {}),
    },
    rect: { x: r.x, y: r.y, width: r.width, height: r.height },
    viewport: { w: view?.innerWidth ?? 0, h: view?.innerHeight ?? 0 },
  };
}
