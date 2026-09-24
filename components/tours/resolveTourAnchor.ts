import type { GuidedLearningTourBinding } from '@/types';
import { parseTourAnchorRef } from '@/config/tourAnchors';

export interface TourAnchorScope {
  /** Widgets the tour added; per-widget anchors prefer these. */
  widgetIds?: readonly string[];
}

const quote = (value: string) => `"${value.replace(/["\\]/g, '\\$&')}"`;

const INPUT_ROLES: Record<string, string> = {
  checkbox: 'checkbox',
  radio: 'radio',
  range: 'slider',
  button: 'button',
  submit: 'button',
  reset: 'button',
  search: 'searchbox',
};

export function roleOf(el: Element): string | null {
  const explicit = el.getAttribute('role');
  if (explicit) return explicit.split(/\s+/)[0];
  switch (el.tagName) {
    case 'BUTTON':
      return 'button';
    case 'A':
      return el.hasAttribute('href') ? 'link' : null;
    case 'SELECT':
      return 'combobox';
    case 'TEXTAREA':
      return 'textbox';
    case 'INPUT':
      return INPUT_ROLES[(el as HTMLInputElement).type] ?? 'textbox';
    default:
      return null;
  }
}

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

export function accessibleName(el: Element): string {
  const label = el.getAttribute('aria-label');
  if (label) return normalize(label);
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => el.ownerDocument.getElementById(id)?.textContent ?? '')
      .join(' ');
    if (text.trim()) return normalize(text);
  }
  const title = el.getAttribute('title');
  if (title) return normalize(title);
  const placeholder = el.getAttribute('placeholder');
  if (placeholder) return normalize(placeholder);
  return normalize(el.textContent ?? '');
}

const ignored = (el: Element) => el.closest('[data-tour-ignore]') !== null;

/** Hidden or zero-size matches don't count, so a closed panel reads as missing. */
export function isAnchorVisible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  return typeof el.checkVisibility === 'function' ? el.checkVisibility() : true;
}

const usable = (el: Element) => !ignored(el) && isAnchorVisible(el);

const FALLBACK_CANDIDATES = '[role], button, a[href], input, select, textarea';

/** Finds a tour step's element: `data-tour` first, then role plus accessible name. */
export function findTourAnchor(
  binding: Pick<GuidedLearningTourBinding, 'anchor' | 'fallback'>,
  scope: TourAnchorScope = {},
  root: ParentNode = document
): HTMLElement | null {
  const { id, widgetType } = parseTourAnchorRef(binding.anchor);
  const selector =
    `[data-tour=${quote(id)}]` +
    (widgetType ? `[data-tour-widget-type=${quote(widgetType)}]` : '');
  const tagged = Array.from(
    root.querySelectorAll<HTMLElement>(selector)
  ).filter(usable);
  if (tagged.length > 0) {
    const scoped = scope.widgetIds?.length
      ? tagged.find((el) =>
          scope.widgetIds?.includes(el.getAttribute('data-tour-widget') ?? '')
        )
      : undefined;
    return scoped ?? tagged[0];
  }
  if (!binding.fallback) return null;
  const role = binding.fallback.role;
  const name = normalize(binding.fallback.name);
  if (!name) return null;
  return (
    Array.from(root.querySelectorAll<HTMLElement>(FALLBACK_CANDIDATES)).find(
      (el) => roleOf(el) === role && accessibleName(el) === name && usable(el)
    ) ?? null
  );
}
