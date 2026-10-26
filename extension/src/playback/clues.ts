// Clues read the same way when recording a click and when scoring candidates in playback.
import type { WebTourStableAttrs } from '@/types';
import {
  scrubCapturedText,
  toHrefPattern,
} from '@/components/tours/web/studentData';

// Ids and classes with digits or long hex runs are per-record or per-build, never stable.
export const UNSTABLE = /\d{2,}|[0-9a-f]{6,}|^css-|^sc-|^jsx-/i;

const HEADING = 'h1,h2,h3,h4,h5,h6,[role="heading"],legend,caption';
// Containers whose own label names the group a control sits in, like a menu or dialog.
const LABELLED_GROUPS = new Set([
  'dialog',
  'alertdialog',
  'menu',
  'menubar',
  'navigation',
  'region',
  'tablist',
  'toolbar',
  'group',
  'radiogroup',
]);
const MAX_HEADING_DEPTH = 8;
const TEST_ID_ATTRS = ['data-testid', 'data-test-id', 'data-test', 'data-qa'];

const groupLabel = (node: Element): string => {
  const label = node.getAttribute('aria-label');
  if (label?.trim()) return label;
  const ids = node.getAttribute('aria-labelledby');
  if (!ids) return '';
  return ids
    .split(/\s+/)
    .map((id) => node.ownerDocument.getElementById(id)?.textContent ?? '')
    .join(' ');
};

export const headingsUnder = (node: ParentNode): Element[] => [
  ...node.querySelectorAll(HEADING),
];

/** The closest heading before the control, or the label of the menu, dialog or group around it; scrubbed. `headingsIn` lets a search over many controls share each ancestor's heading list. */
export function nearestHeading(
  el: Element,
  headingsIn: (node: Element) => Element[] = headingsUnder
): string {
  let node = el.parentElement;
  for (let depth = 0; node && depth < MAX_HEADING_DEPTH; depth++) {
    const before = headingsIn(node).filter(
      (h) =>
        !h.contains(el) &&
        !!(h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)
    );
    const last = before[before.length - 1];
    const text = scrubCapturedText(last?.textContent);
    if (text) return text;
    const role = node.getAttribute('role');
    if (role && LABELLED_GROUPS.has(role)) {
      const label = scrubCapturedText(groupLabel(node));
      if (label) return label;
    }
    node = node.parentElement;
  }
  return '';
}

const stableToken = (v: string | null): string => {
  const s = v?.trim() ?? '';
  return s && s.length <= 80 && !UNSTABLE.test(s) ? s : '';
};

/** Stable attributes on the control, scrubbed; a per-record id or name is left out. */
export function stableAttrsOf(el: Element): WebTourStableAttrs {
  const out: WebTourStableAttrs = {};
  const testId = stableToken(
    TEST_ID_ATTRS.map((a) => el.getAttribute(a)).find((v) => v) ?? null
  );
  if (testId) out.testId = testId;
  const ariaLabel = scrubCapturedText(el.getAttribute('aria-label'));
  if (ariaLabel) out.ariaLabel = ariaLabel;
  const name = stableToken(el.getAttribute('name'));
  if (name) out.name = name;
  const href = el.tagName === 'A' ? el.getAttribute('href') : null;
  const pattern =
    href && !href.startsWith('#')
      ? toHrefPattern(href, el.ownerDocument.URL)
      : null;
  if (pattern) out.href = pattern;
  return out;
}
