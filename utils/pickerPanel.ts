// Shared pieces for the app's own date, time and suggestion panels that replace the browser's.

export const PANEL_CLASS =
  'fixed bottom-auto right-auto z-[2147483647] m-0 h-auto w-auto overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white text-left text-sm text-slate-700 shadow-lg outline-none';
export const STATUS_CLASS =
  'pointer-events-none fixed -left-[9999px] top-0 h-px w-px overflow-hidden';

const GAP_PX = 4;
const EDGE_PX = 8;

// Presses on a panel stop at the window, so no "click outside" closer behind it sees them.
export const PANEL_EVENTS = [
  'pointerdown',
  'pointerup',
  'mousedown',
  'mouseup',
  'click',
  'dblclick',
  'touchstart',
  'touchend',
  'contextmenu',
] as const;

export const isMac = () =>
  typeof navigator !== 'undefined' &&
  /Mac|iP(hone|od|ad)/.test(navigator.platform);

/** Chromium opens its own calendar only from the field's icon; Firefox and Safari keep theirs. */
export const isChromium = () =>
  typeof navigator !== 'undefined' &&
  /Chrome\/|Chromium\/|CriOS\//.test(navigator.userAgent) &&
  !/Firefox\//.test(navigator.userAgent);

/** Phones and tablets keep the system picker; touch panels and Chromebooks get the app's. */
export const touchOnly = () =>
  typeof navigator !== 'undefined' &&
  (/Android|iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/** Creates the panel in the top layer, tagged so tours and click-outside closers look past it. */
export const createPanel = (id: string, role: string, label: string | null) => {
  const panel = document.createElement('div');
  panel.id = id;
  panel.setAttribute('role', role);
  panel.setAttribute('data-picker-panel', '');
  panel.setAttribute('data-tour-ignore', '');
  panel.setAttribute('data-click-outside-ignore', 'true');
  panel.tabIndex = -1;
  if (label) panel.setAttribute('aria-label', label);
  const status = document.createElement('div');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.className = STATUS_CLASS;
  return { panel, status };
};

export const showPanel = (panel: HTMLElement, status: HTMLElement) => {
  document.body.appendChild(status);
  document.body.appendChild(panel);
  if (typeof panel.showPopover === 'function') {
    panel.setAttribute('popover', 'manual');
    try {
      panel.showPopover();
    } catch {
      // Not in the top layer; the high z-index still lifts it.
    }
  }
};

export const fieldLabel = (field: HTMLElement): string | null => {
  const aria = field.getAttribute('aria-label');
  if (aria) return aria;
  const label = (field as HTMLInputElement).labels?.[0];
  if (!label) return null;
  const copy = label.cloneNode(true) as HTMLElement;
  copy
    .querySelectorAll('select, input, textarea, button')
    .forEach((el) => el.remove());
  return copy.textContent?.trim() || null;
};

/** Places the panel under the field, or above it when there is more room there. */
export const placePanel = (
  panel: HTMLElement,
  rect: DOMRect,
  maxHeight: number,
  maxWidth: number
) => {
  const vw = document.documentElement.clientWidth || window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(Math.max(rect.width, 0), vw - EDGE_PX * 2);
  panel.style.minWidth = `${width}px`;
  panel.style.maxWidth = `${Math.max(width, Math.min(maxWidth, vw - EDGE_PX * 2))}px`;
  const below = vh - rect.bottom - GAP_PX - EDGE_PX;
  const above = rect.top - GAP_PX - EDGE_PX;
  panel.style.maxHeight = `${Math.min(maxHeight, Math.max(below, above))}px`;
  const height = panel.offsetHeight;
  const top =
    height <= below || below >= above
      ? rect.bottom + GAP_PX
      : rect.top - GAP_PX - height;
  const left = Math.min(
    Math.max(rect.left, EDGE_PX),
    Math.max(EDGE_PX, vw - EDGE_PX - panel.offsetWidth)
  );
  panel.style.top = `${Math.round(top)}px`;
  panel.style.left = `${Math.round(left)}px`;
};

/** Sets a field's value the way typing does, so React's onChange and plain listeners both run. */
export const setFieldValue = (
  input: HTMLInputElement,
  value: string,
  fireChange = true
) => {
  if (input.value === value) return;
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value'
  );
  // The prototype setter skips React's value tracker, so React sees the change.
  if (descriptor?.set) descriptor.set.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  if (fireChange) input.dispatchEvent(new Event('change', { bubbles: true }));
};
