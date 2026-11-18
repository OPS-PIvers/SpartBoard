import type { GuidedLearningTourBinding } from '@/types';
import {
  TOUR_ANCHORS,
  isRowWildcardRef,
  isTourAnchorId,
  parseTourAnchorRef,
  type TourAnchorDef,
} from '@/config/tourAnchors';

export interface TourAnchorScope {
  /** Widgets the tour added; per-widget anchors prefer these. */
  widgetIds?: readonly string[];
  /** Tour slot to widget id; a step with a bound slot matches only that widget. */
  slots?: Readonly<Record<number, string>>;
  /** Extra check a match must pass, such as being clickable on screen. */
  accept?: (el: Element) => boolean;
  /** The row each wildcard step was answered with, by `id:type`, so a replayed route reopens the same row. */
  picks?: Readonly<Record<string, string>>;
}

/** The `id:type#row-N` ref a wildcard click landed on, read from the clicked element. */
export function pickedRowRef(ref: string, el: Element): string | null {
  if (!isRowWildcardRef(ref)) return null;
  const key = rowKeyOf(el);
  return key ? `${ref.slice(0, ref.indexOf('#'))}#${key}` : null;
}

/** Records the row a wildcard step was answered with, under its route form `id:type`, latest last. */
export function notePickedRow(
  picks: Record<string, string>,
  ref: string,
  el: Element
): boolean {
  const picked = pickedRowRef(ref, el);
  if (!picked) return false;
  const at = ref.slice(0, ref.indexOf('#'));
  delete picks[at];
  picks[at] = picked;
  return true;
}

const ROW_KEY = /^row-(\d+)(?=$|-)/;
const ROW_ONLY = /^row-([1-9]\d*)$/;

const defOf = (id: string): TourAnchorDef | null => {
  if (!isTourAnchorId(id)) return null;
  const def: TourAnchorDef = TOUR_ANCHORS[id];
  return def;
};

/** A list anchor whose keys the app computes freely, so its rows may be keyed by record instead of row-N. */
const countsRows = (def: TourAnchorDef | null): boolean =>
  !!def && (!!def.rows || !!def.rowList) && !def.keyPattern;

const fieldOf = (el: Element) => el.getAttribute('data-tour-field') ?? '';

/** Every element of a list anchor in page order, shown or not. */
function rowElements(
  id: string,
  widgetType: string | undefined,
  root: ParentNode
): HTMLElement[] {
  const selector =
    `[data-tour=${quote(id)}]` +
    (widgetType ? `[data-tour-widget-type=${quote(widgetType)}]` : '');
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => !el.closest('[data-tour-ignore]')
  );
}

const widgetHolding = (el: Element): string =>
  el.closest('[data-tour-widget]')?.getAttribute('data-tour-widget') ?? '';

/** A list anchor's elements split by the widget they sit in, so each widget counts its own rows. */
function byWidget(els: readonly HTMLElement[]): HTMLElement[][] {
  const groups = new Map<string, HTMLElement[]>();
  for (const el of els) {
    const widget = widgetHolding(el);
    groups.set(widget, [...(groups.get(widget) ?? []), el]);
  }
  return [...groups.values()];
}

/** Whether a list keys its rows by record, so row-N is the Nth on the page. */
const keyedByRecord = (els: readonly Element[]): boolean =>
  els.length > 0 && !els.some((el) => ROW_KEY.test(fieldOf(el)));

/** An element's field key; a row keyed by record reads as its `row-N` place on the page. */
export function rowKeyOf(el: Element): string | null {
  const field = el.getAttribute('data-tour-field');
  if (!field || ROW_KEY.test(field)) return field;
  const id = el.getAttribute('data-tour') ?? '';
  if (!countsRows(defOf(id))) return field;
  const type = el.getAttribute('data-tour-widget-type') ?? undefined;
  const els = rowElements(id, type, el.ownerDocument);
  const mine = els.filter((o) => widgetHolding(o) === widgetHolding(el));
  const at = mine.indexOf(el as HTMLElement);
  return keyedByRecord(els) && at >= 0 ? `row-${at + 1}` : field;
}

/** Row N of a list keyed by record, one per widget: the picked row's record (null when it lacks this control), else the Nth in that widget. */
function rowByOrder(
  anchor: string,
  picks: Readonly<Record<string, string>> | undefined,
  root: ParentNode
): HTMLElement[] | null | undefined {
  const { id, widgetType, fieldKey } = parseTourAnchorRef(anchor);
  const n = Number(ROW_ONLY.exec(fieldKey ?? '')?.[1]);
  const def = defOf(id);
  if (!n || !countsRows(def)) return undefined;
  const els = rowElements(id, widgetType, root);
  if (!keyedByRecord(els)) return undefined;
  // Only the newest pick on the list names the row; an older one counted a different list.
  const newest = def?.rowList
    ? Object.values(picks ?? {})
        .map(parseTourAnchorRef)
        .reverse()
        .find(
          (p) =>
            !!p.fieldKey &&
            p.widgetType === widgetType &&
            rowListOf(p.id) === def.rowList
        )
    : undefined;
  const picked =
    newest && newest.id !== id && newest.fieldKey === fieldKey
      ? newest
      : undefined;
  const theirs = picked ? rowElements(picked.id, widgetType, root) : [];
  const byRecord = picked !== undefined && keyedByRecord(theirs);
  const found: HTMLElement[] = [];
  let lacksControl = false;
  for (const mine of byWidget(els)) {
    const widget = widgetHolding(mine[0]);
    const record = byRecord
      ? theirs.filter((o) => widgetHolding(o) === widget)[n - 1]
      : undefined;
    const shared =
      record &&
      mine.some((el) => theirs.some((o) => fieldOf(o) === fieldOf(el)));
    // Lists that share record keys match by record; a row without this control has no match.
    const row =
      record && shared
        ? mine.find((el) => fieldOf(el) === fieldOf(record))
        : mine[n - 1];
    if (row) found.push(row);
    else if (record && shared) lacksControl = true;
  }
  if (found.length > 0) return found;
  return lacksControl ? null : undefined;
}

/** A ref with no key or a row key, moved to the row the teacher picked earlier on its list. */
export function followPickedRow(
  anchor: string,
  picks: Readonly<Record<string, string>> | undefined
): string {
  if (!picks) return anchor;
  const { id, widgetType, fieldKey } = parseTourAnchorRef(anchor);
  const def = isTourAnchorId(id) ? (TOUR_ANCHORS[id] as TourAnchorDef) : null;
  const list = def?.rowList;
  // A keyless ref only takes a row on anchors with one element per row.
  const followable =
    fieldKey === undefined ? !!def?.rows : ROW_KEY.test(fieldKey);
  if (list && widgetType && followable) {
    // Every control in a row, menu items keyed row-N-item-K too, follows the row picked last on its list.
    const row = lastRowOn(list, widgetType, picks);
    if (!row) return anchor;
    return `${id}:${widgetType}#${fieldKey ? fieldKey.replace(ROW_KEY, row) : row}`;
  }
  if (fieldKey !== undefined && !/^row-\d+$/.test(fieldKey)) return anchor;
  const pick = widgetType
    ? picks[`${id}:${widgetType}`]
    : Object.entries(picks).find(([k]) => k.startsWith(`${id}:`))?.[1];
  return pick ?? anchor;
}

const rowListOf = (id: string): string | undefined =>
  isTourAnchorId(id) ? (TOUR_ANCHORS[id] as TourAnchorDef).rowList : undefined;

/** The `row-N` most recently picked on any anchor of `list` for this widget type. */
function lastRowOn(
  list: string,
  widgetType: string | undefined,
  picks: Readonly<Record<string, string>>
): string | undefined {
  let row: string | undefined;
  for (const picked of Object.values(picks)) {
    const p = parseTourAnchorRef(picked);
    if (p.widgetType === widgetType && rowListOf(p.id) === list && p.fieldKey)
      row = p.fieldKey;
  }
  return row;
}

const pickedRef = (anchor: string, scope: TourAnchorScope): string =>
  followPickedRow(anchor, scope.picks);

export const quote = (value: string) => `"${value.replace(/["\\]/g, '\\$&')}"`;

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

/** Visible and neither faded out nor click-through, wherever it sits. */
function isAnchorShown(el: Element): boolean {
  if (!isAnchorVisible(el)) return false;
  const view = el.ownerDocument.defaultView;
  if (!view) return true;
  if (view.getComputedStyle(el).pointerEvents === 'none') return false;
  let opacity = 1;
  for (let n: Element | null = el; n; n = n.parentElement) {
    const o = parseFloat(view.getComputedStyle(n).opacity);
    if (!Number.isNaN(o)) opacity *= o;
    if (opacity <= 0.05) return false;
  }
  return true;
}

const onScreen = (el: Element) => {
  const view = el.ownerDocument.defaultView;
  if (!view) return true;
  const r = el.getBoundingClientRect();
  return (
    r.x + r.width > 0 &&
    r.y + r.height > 0 &&
    r.x < view.innerWidth &&
    r.y < view.innerHeight
  );
};

/** Visible, not faded out or click-through, and at least partly on screen. */
export function isAnchorUsable(el: Element): boolean {
  return isAnchorShown(el) && onScreen(el);
}

const SCROLLS = /(auto|scroll|overlay)/;

/** Ancestors that scroll and hold more than they show, nearest first; a fixed box escapes those above it. */
function scrollers(el: Element): HTMLElement[] {
  const view = el.ownerDocument.defaultView;
  const body = el.ownerDocument.body;
  const out: HTMLElement[] = [];
  for (let n: Element | null = el; n && n !== body;) {
    if (view?.getComputedStyle(n).position === 'fixed') break;
    n = n.parentElement;
    if (!(n instanceof HTMLElement) || n === body) break;
    const style = view?.getComputedStyle(n);
    const y =
      n.scrollHeight > n.clientHeight && SCROLLS.test(style?.overflowY ?? '');
    const x =
      n.scrollWidth > n.clientWidth && SCROLLS.test(style?.overflowX ?? '');
    if (x || y) out.push(n);
  }
  return out;
}

/** The nearest ancestor that scrolls and holds more than it shows, if any. */
export const scrollParent = (el: Element): HTMLElement | null =>
  scrollers(el)[0] ?? null;

/** Usable, or off screen inside a panel that can scroll it into view. */
export function isAnchorReachable(el: Element): boolean {
  return isAnchorShown(el) && (onScreen(el) || scrollParent(el) !== null);
}

/** The part of the viewport an element can show in, inside every panel that scrolls it. */
export function clipBox(el: Element): DOMRect {
  const view = el.ownerDocument.defaultView;
  let left = 0;
  let top = 0;
  let right = view?.innerWidth ?? Infinity;
  let bottom = view?.innerHeight ?? Infinity;
  for (const n of scrollers(el)) {
    const b = n.getBoundingClientRect();
    left = Math.max(left, b.left);
    top = Math.max(top, b.top);
    right = Math.min(right, b.right);
    bottom = Math.min(bottom, b.bottom);
  }
  return new DOMRect(left, top, right - left, bottom - top);
}

/** How the anchor sits in the part of the screen it can show in. */
export function anchorInView(el: Element): 'full' | 'part' | 'none' {
  const r = el.getBoundingClientRect();
  const box = clipBox(el);
  if (
    r.right <= box.left ||
    r.bottom <= box.top ||
    r.left >= box.right ||
    r.top >= box.bottom
  )
    return 'none';
  // A control taller or wider than the panel counts as shown once its start edge is.
  const fitsX =
    r.left >= box.left - 1 && (r.right <= box.right + 1 || r.width > box.width);
  const fitsY =
    r.top >= box.top - 1 &&
    (r.bottom <= box.bottom + 1 || r.height > box.height);
  return fitsX && fitsY ? 'full' : 'part';
}

/** Every usable element tagged with `ref`; a `#row-*` ref takes each row of its list. */
function taggedAnchors(
  ref: string,
  usable: (el: Element) => boolean,
  scope: TourAnchorScope,
  root: ParentNode
): HTMLElement[] {
  const followed = pickedRef(ref, scope);
  const find = (anchor: string): HTMLElement[] | null => {
    const byOrder = rowByOrder(anchor, scope.picks, root);
    if (byOrder === null) return null;
    return byOrder ? byOrder.filter(usable) : taggedAs(anchor, usable, root);
  };
  const found = find(followed);
  // The picked record has no such control, so no other row stands in for it.
  if (!found) return [];
  // A followed row that isn't on screen, like another tab's list, leaves the step as written.
  return found.length > 0 || followed === ref ? found : (find(ref) ?? []);
}

function taggedAs(
  anchor: string,
  usable: (el: Element) => boolean,
  root: ParentNode
): HTMLElement[] {
  const { id, widgetType, fieldKey } = parseTourAnchorRef(anchor);
  if (!id) return [];
  const anyRow = isRowWildcardRef(anchor);
  const selector =
    `[data-tour=${quote(id)}]` +
    (widgetType ? `[data-tour-widget-type=${quote(widgetType)}]` : '') +
    (fieldKey && !anyRow ? `[data-tour-field=${quote(fieldKey)}]` : '');
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
    usable
  );
}

/** Every row a wildcard step can take, in page order; just the one match for any other step. */
export function findTourAnchors(
  binding: Pick<GuidedLearningTourBinding, 'anchor' | 'fallback' | 'slot'>,
  scope: TourAnchorScope = {},
  root: ParentNode = document
): HTMLElement[] {
  if (!isRowWildcardRef(binding.anchor)) {
    const one = findTourAnchor(binding, scope, root);
    return one ? [one] : [];
  }
  const usable = (el: Element) =>
    !ignored(el) && isAnchorVisible(el) && (scope.accept?.(el) ?? true);
  return taggedAnchors(binding.anchor, usable, scope, root);
}

const FALLBACK_CANDIDATES = '[role], button, a[href], input, select, textarea';

/** Finds a tour step's element: `data-tour` first, then role plus accessible name. */
export function findTourAnchor(
  binding: Pick<GuidedLearningTourBinding, 'anchor' | 'fallback' | 'slot'>,
  scope: TourAnchorScope = {},
  root: ParentNode = document
): HTMLElement | null {
  const boundId =
    binding.slot === undefined ? undefined : scope.slots?.[binding.slot];
  const usable = (el: Element) =>
    !ignored(el) && isAnchorVisible(el) && (scope.accept?.(el) ?? true);
  const tagged = taggedAnchors(binding.anchor, usable, scope, root);
  // Field rows carry no widget id; the drawer around them does.
  const widgetOf = (el: Element) =>
    el.closest('[data-tour-widget]')?.getAttribute('data-tour-widget') ?? '';
  if (boundId && parseTourAnchorRef(binding.anchor).id) {
    return tagged.find((el) => widgetOf(el) === boundId) ?? null;
  }
  if (tagged.length > 0) {
    const scoped = scope.widgetIds?.length
      ? tagged.find((el) => scope.widgetIds?.includes(widgetOf(el)))
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
