import type { GuidedLearningTourBinding, WidgetType } from '@/types';
import { accessibleName, roleOf } from '@/components/tours/resolveTourAnchor';
import type {
  TourAnchorAncestor,
  UnmappedAnchorContext,
} from '@/components/tours/anchorQueue';
import type { NameMatcher } from './redaction';

export interface RecordedAnchor {
  /** Tour anchor ref; empty when untagged, so the runner goes straight to the fallback. */
  anchor: string;
  fallback?: GuidedLearningTourBinding['fallback'];
  untagged: boolean;
  /** For untagged steps: an id Paul can add to the registry and tag in code. */
  suggestedId?: string;
  /** The element whose bounds become the step's region. */
  element: HTMLElement;
}

const INTERACTIVE = '[role], button, a[href], input, select, textarea, label';

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

/** The registry id to tag an untagged element with, from its role and name. */
export const suggestAnchorId = (
  fallback: GuidedLearningTourBinding['fallback']
): string | undefined =>
  fallback ? `${fallback.role}.${slug(fallback.name)}` : undefined;

const fallbackOf = (el: Element): RecordedAnchor['fallback'] => {
  const role = roleOf(el);
  const name = accessibleName(el);
  return role && name ? { role, name } : undefined;
};

/** Resolves what a recorded click landed on; null for the recorder's own UI. */
export function resolveRecordedAnchor(target: Element): RecordedAnchor | null {
  if (target.closest('[data-tour-ignore]')) return null;
  const tagged = target.closest<HTMLElement>('[data-tour]');
  if (tagged) {
    const id = tagged.getAttribute('data-tour') ?? '';
    const type = tagged.getAttribute('data-tour-widget-type');
    return {
      anchor: type ? `${id}:${type}` : id,
      fallback: fallbackOf(tagged),
      untagged: false,
      element: tagged,
    };
  }
  const element =
    target.closest<HTMLElement>(INTERACTIVE) ??
    (target instanceof HTMLElement ? target : null);
  if (!element) return null;
  const fallback = fallbackOf(element);
  return {
    anchor: '',
    fallback,
    untagged: true,
    suggestedId: suggestAnchorId(fallback),
    element,
  };
}

const MAX_ANCESTORS = 8;
/** The queue's cap on the excerpt, in UTF-8 bytes. */
export const MAX_EXCERPT_BYTES = 2048;
const MAX_LABEL = 120;
const KEEP_ATTRS = new Set(['class', 'role', 'type', 'title', 'data-testid']);
const DROP_SUBTREES = '[data-pii], [data-tour-ignore], script, style, svg';
const TEXT_ATTRS = new Set([
  'aria-label',
  'aria-valuetext',
  'aria-description',
  'title',
]);

const keepAttr = (name: string) =>
  KEEP_ATTRS.has(name) ||
  name.startsWith('aria-') ||
  name.startsWith('data-tour');

const redactNames = (text: string, matcher: NameMatcher | null): string => {
  if (!matcher || !matcher.test(text)) return text;
  let out = '';
  let at = 0;
  for (const [start, end] of matcher.ranges(text)) {
    out += `${text.slice(at, start)}[name]`;
    at = end;
  }
  return out + text.slice(at);
};

const byteLength = (s: string) => new TextEncoder().encode(s).length;

/** Trims to `max` UTF-8 bytes, marking the cut. */
const capBytes = (s: string, max: number): string => {
  if (byteLength(s) <= max) return s;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (byteLength(s.slice(0, mid)) + 3 <= max) lo = mid;
    else hi = mid - 1;
  }
  return `${s.slice(0, lo)}...`;
};

/** A redacted outerHTML of `element`: whitelisted attributes, no `data-pii` subtrees, names replaced. */
export function redactedExcerpt(
  element: Element,
  matcher: NameMatcher | null,
  max = MAX_EXCERPT_BYTES
): string {
  const pii = !!element.closest('[data-pii]');
  const clone = element.cloneNode(true) as Element;
  if (pii) clone.replaceChildren();
  clone.querySelectorAll(DROP_SUBTREES).forEach((el) => el.remove());
  for (const el of [clone, ...Array.from(clone.querySelectorAll('*'))]) {
    for (const attr of Array.from(el.attributes)) {
      if (!keepAttr(attr.name) || (pii && TEXT_ATTRS.has(attr.name)))
        el.removeAttribute(attr.name);
      else el.setAttribute(attr.name, redactNames(attr.value, matcher));
    }
  }
  const doc = clone.ownerDocument;
  const walker = doc.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.textContent ?? '').replace(/\s+/g, ' ');
    node.textContent = redactNames(text, matcher);
  }
  return capBytes(clone.outerHTML, max);
}

const clip = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL);

/** The tag, test id, label and role of `element` and its ancestors, innermost first. */
export function ancestorChain(
  element: Element,
  matcher: NameMatcher | null
): TourAnchorAncestor[] {
  const out: TourAnchorAncestor[] = [];
  for (
    let el: Element | null = element;
    el && out.length < MAX_ANCESTORS && el.tagName !== 'BODY';
    el = el.parentElement
  ) {
    const testId = el.getAttribute('data-testid');
    const label = el.getAttribute('aria-label');
    const role = el.getAttribute('role');
    const pii = !!el.closest('[data-pii]');
    out.push({
      tag: el.tagName.toLowerCase(),
      ...(testId ? { testId: clip(testId) } : {}),
      ...(label && !pii
        ? { ariaLabel: clip(redactNames(label, matcher)) }
        : {}),
      ...(role ? { role: clip(role) } : {}),
    });
  }
  return out;
}

interface ContextOptions {
  matcher: NameMatcher | null;
  /** Already scrubbed of student names. */
  fallback?: GuidedLearningTourBinding['fallback'];
  suggestedId?: string;
  pathname?: string;
}

/** Structural, redacted context for an untagged click, for the unmapped-anchor queue. */
export function captureUnmappedContext(
  element: Element,
  { matcher, fallback, suggestedId, pathname }: ContextOptions
): UnmappedAnchorContext {
  const widgetType = element
    .closest('[data-tour-widget-type]')
    ?.getAttribute('data-tour-widget-type');
  // Inside student work or a photo, the name itself may be personal.
  const pii = !!element.closest('[data-pii]');
  return {
    suggestedId: pii ? null : (suggestedId ?? null),
    role: fallback?.role ?? null,
    name: pii ? null : (fallback?.name ?? null),
    widgetType: (widgetType as WidgetType | undefined) ?? null,
    pathname: pathname ?? window.location.pathname,
    nearestAnchor:
      element.closest('[data-tour]')?.getAttribute('data-tour') ?? null,
    ancestors: ancestorChain(element, matcher),
    htmlExcerpt: redactedExcerpt(element, matcher),
  };
}

export interface Size {
  w: number;
  h: number;
}

export interface RecordedPlacement {
  xPct: number;
  yPct: number;
  region: { shape: 'rect'; wPct: number; hPct: number };
}

const REGION_PAD_PX = 4;

const clampPct = (n: number) => Math.min(Math.max(n, 0), 100);
const round = (n: number) => Math.round(n * 100) / 100;

export interface FrameBox {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}

/** Maps a padded viewport rect (CSS px) onto the captured frame as a top-left image-% box, allowing for DPR and letterboxing. */
export function rectToFrameBox(
  rect: { x: number; y: number; width: number; height: number },
  viewport: Size,
  frame: Size,
  pad = REGION_PAD_PX
): FrameBox {
  const scale = Math.min(frame.w / viewport.w, frame.h / viewport.h);
  const offsetX = (frame.w - viewport.w * scale) / 2;
  const offsetY = (frame.h - viewport.h * scale) / 2;
  const x0 = clampPct(((offsetX + (rect.x - pad) * scale) / frame.w) * 100);
  const x1 = clampPct(
    ((offsetX + (rect.x + rect.width + pad) * scale) / frame.w) * 100
  );
  const y0 = clampPct(((offsetY + (rect.y - pad) * scale) / frame.h) * 100);
  const y1 = clampPct(
    ((offsetY + (rect.y + rect.height + pad) * scale) / frame.h) * 100
  );
  return { xPct: x0, yPct: y0, wPct: x1 - x0, hPct: y1 - y0 };
}

/** The step placement for a clicked element: its padded box as a centre point and region. */
export function rectToImagePct(
  rect: { x: number; y: number; width: number; height: number },
  viewport: Size,
  frame: Size
): RecordedPlacement {
  const box = rectToFrameBox(rect, viewport, frame);
  return {
    xPct: round(box.xPct + box.wPct / 2),
    yPct: round(box.yPct + box.hPct / 2),
    region: { shape: 'rect', wPct: round(box.wPct), hPct: round(box.hPct) },
  };
}
