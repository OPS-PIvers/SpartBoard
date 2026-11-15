// Opens every single-choice <select> as the app's own list instead of the browser's, keeping the native control, its value and change events.
import { appPickersEnabled } from './pickerPanel';

const MENU_ID = 'spart-select-menu';
const LIST_CLASS =
  'fixed bottom-auto right-auto z-[2147483647] m-0 h-auto w-auto overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white px-0 py-1 text-left text-sm shadow-lg outline-none';
const OPTION_CLASS =
  'flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 touch:py-3 font-medium text-slate-700';
const ACTIVE_CLASS = 'bg-slate-100';
const SELECTED_CLASS =
  'bg-brand-blue-lighter/30 font-bold text-brand-blue-primary';
const DISABLED_CLASS = 'cursor-not-allowed text-slate-400';
const GROUP_CLASS =
  'px-3 pb-1 pt-2 text-xs font-bold text-slate-500 select-none';
const STATUS_CLASS =
  'pointer-events-none fixed -left-[9999px] top-0 h-px w-px overflow-hidden';
const GAP_PX = 4;
const EDGE_PX = 8;
const MAX_HEIGHT_PX = 320;
const MAX_WIDTH_PX = 384;
const TYPEAHEAD_RESET_MS = 700;
const CLOSED_TYPEAHEAD_MS = 1000;
// Presses on the list stop here, so no "click outside" closer behind it sees them.
const LIST_EVENTS = [
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

interface Row {
  option: HTMLOptionElement;
  el: HTMLElement;
}

interface OpenMenu {
  select: HTMLSelectElement;
  list: HTMLElement;
  status: HTMLElement;
  rows: Row[];
  active: number;
  saved: Record<string, string | null>;
  frame: number;
  placedAt: string;
  typed: string;
  typedAt: number;
  observer: MutationObserver | null;
}

const ARIA_KEYS = ['aria-expanded', 'aria-controls', 'aria-activedescendant'];

let current: OpenMenu | null = null;
let idSeq = 0;
let installed = false;
let closedTyped: { select: HTMLSelectElement; at: number } | null = null;

const isMac = () =>
  typeof navigator !== 'undefined' &&
  /Mac|iP(hone|od|ad)/.test(navigator.platform);

/** Phones and tablets keep the system picker; touch panels and Chromebooks get the list. */
const touchOnly = () =>
  typeof navigator !== 'undefined' &&
  (/Android|iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

const isMenuSelect = (el: unknown): el is HTMLSelectElement =>
  appPickersEnabled() &&
  el instanceof HTMLSelectElement &&
  !el.multiple &&
  el.size <= 1 &&
  !el.matches(':disabled');

const isHidden = (option: HTMLOptionElement) =>
  option.hidden ||
  (option.parentElement instanceof HTMLOptGroupElement &&
    option.parentElement.hidden);

const isDisabled = (option: HTMLOptionElement) =>
  option.disabled ||
  (option.parentElement instanceof HTMLOptGroupElement &&
    option.parentElement.disabled);

const optionText = (option: HTMLOptionElement) => option.label || option.text;

const checkIcon = (): SVGSVGElement => {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'shrink-0');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M20 6 9 17l-5-5');
  svg.appendChild(path);
  return svg;
};

const enabledIndex = (rows: Row[], from: number, step: 1 | -1): number => {
  for (let i = from; i >= 0 && i < rows.length; i += step)
    if (!isDisabled(rows[i].option)) return i;
  return -1;
};

const setActive = (
  menu: OpenMenu,
  index: number,
  { scroll = true, announce = true } = {}
) => {
  if (index < 0 || index >= menu.rows.length) return;
  menu.rows[menu.active]?.el.classList.remove(ACTIVE_CLASS);
  menu.active = index;
  const { el, option } = menu.rows[index];
  el.classList.add(ACTIVE_CLASS);
  menu.select.setAttribute('aria-activedescendant', el.id);
  if (scroll) el.scrollIntoView?.({ block: 'nearest' });
  // Screen readers may ignore aria-activedescendant on a native select, so the row is also spoken.
  if (announce)
    menu.status.textContent = `${optionText(option)}, ${index + 1} of ${menu.rows.length}`;
};

const OTHER_CONTROLS = 'input, button, textarea, a[href], select';

/** The visible field: a tight wrapper that draws the select's box and icons, or the select itself. */
const fieldRect = (select: HTMLSelectElement): DOMRect => {
  const rect = select.getBoundingClientRect();
  const parent = select.parentElement;
  if (!parent || parent === document.body || parent.tagName === 'LABEL')
    return rect;
  const box = parent.getBoundingClientRect();
  const others = Array.from(parent.querySelectorAll(OTHER_CONTROLS)).some(
    (el) => el !== select
  );
  return !others &&
    box.height <= rect.height + 12 &&
    box.width <= rect.width + 80
    ? box
    : rect;
};

const position = (menu: OpenMenu, rect: DOMRect) => {
  const { list } = menu;
  const vw = document.documentElement.clientWidth || window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(Math.max(rect.width, 0), vw - EDGE_PX * 2);
  list.style.minWidth = `${width}px`;
  list.style.maxWidth = `${Math.max(width, Math.min(MAX_WIDTH_PX, vw - EDGE_PX * 2))}px`;
  const below = vh - rect.bottom - GAP_PX - EDGE_PX;
  const above = rect.top - GAP_PX - EDGE_PX;
  list.style.maxHeight = `${Math.min(MAX_HEIGHT_PX, Math.max(below, above))}px`;
  const height = list.offsetHeight;
  const top =
    height <= below || below >= above
      ? rect.bottom + GAP_PX
      : rect.top - GAP_PX - height;
  const left = Math.min(
    Math.max(rect.left, EDGE_PX),
    Math.max(EDGE_PX, vw - EDGE_PX - list.offsetWidth)
  );
  list.style.top = `${Math.round(top)}px`;
  list.style.left = `${Math.round(left)}px`;
};

const place = (menu: OpenMenu, force = false) => {
  const rect = fieldRect(menu.select);
  const key = `${rect.left},${rect.top},${rect.width},${rect.height},${window.innerWidth},${window.innerHeight}`;
  if (!force && key === menu.placedAt) return;
  menu.placedAt = key;
  position(menu, rect);
};

const follow = (menu: OpenMenu) => {
  menu.frame = requestAnimationFrame(() => {
    if (current !== menu) return;
    const rect = menu.select.getBoundingClientRect();
    if (
      !menu.select.isConnected ||
      !isMenuSelect(menu.select) ||
      (rect.width === 0 && rect.height === 0)
    ) {
      closeSelectMenu();
      return;
    }
    place(menu);
    follow(menu);
  });
};

const commit = (select: HTMLSelectElement, option: HTMLOptionElement) => {
  if (option.selected || option.closest('select') !== select) return;
  option.selected = true;
  select.dispatchEvent(new Event('input', { bubbles: true }));
  select.dispatchEvent(new Event('change', { bubbles: true }));
};

const choose = (index: number) => {
  const menu = current;
  if (!menu) return;
  const row = menu.rows[index];
  if (!row || isDisabled(row.option)) return;
  closeSelectMenu();
  commit(menu.select, row.option);
};

const labelText = (select: HTMLSelectElement): string | null => {
  const label = select.labels?.[0];
  if (!label) return null;
  const copy = label.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('select').forEach((el) => el.remove());
  return copy.textContent?.trim() || null;
};

const fillList = (menu: OpenMenu) => {
  const { select, list } = menu;
  const listId = list.id;
  list.replaceChildren();
  const rows: Row[] = [];
  let group: HTMLOptGroupElement | null = null;
  let groupEl: HTMLElement = list;
  for (const option of Array.from(select.options)) {
    if (isHidden(option)) continue;
    const parent =
      option.parentElement instanceof HTMLOptGroupElement
        ? option.parentElement
        : null;
    if (parent !== group) {
      group = parent;
      groupEl = list;
      if (parent) {
        groupEl = document.createElement('div');
        groupEl.setAttribute('role', 'group');
        const heading = document.createElement('div');
        heading.id = `${listId}-g${rows.length}`;
        heading.className = GROUP_CLASS;
        heading.textContent = parent.label;
        heading.setAttribute('role', 'presentation');
        groupEl.setAttribute('aria-labelledby', heading.id);
        groupEl.appendChild(heading);
        list.appendChild(groupEl);
      }
    }
    const el = document.createElement('div');
    el.id = `${listId}-o${rows.length}`;
    el.setAttribute('role', 'option');
    el.setAttribute('aria-selected', String(option.selected));
    el.dataset.index = String(rows.length);
    const disabled = isDisabled(option);
    if (disabled) el.setAttribute('aria-disabled', 'true');
    el.className = `${OPTION_CLASS} ${
      disabled ? DISABLED_CLASS : option.selected ? SELECTED_CLASS : ''
    }`;
    const text = document.createElement('span');
    text.className = 'min-w-0 break-words';
    text.textContent = optionText(option);
    el.appendChild(text);
    if (option.selected) el.appendChild(checkIcon());
    rows.push({ option, el });
    groupEl.appendChild(el);
  }
  menu.rows = rows;
  menu.active = -1;
  const selected = rows.findIndex((r) => r.option.selected);
  setActive(menu, selected >= 0 ? selected : enabledIndex(rows, 0, 1));
};

const rowIndex = (target: EventTarget | null): number => {
  const row =
    target instanceof Element
      ? target.closest<HTMLElement>('[role="option"]')
      : null;
  return row?.dataset.index ? Number(row.dataset.index) : -1;
};

/** Opens the app's list for this select; false when it should stay native. */
export const openSelectMenu = (select: HTMLSelectElement): boolean => {
  if (!isMenuSelect(select)) return false;
  closeSelectMenu();
  const list = document.createElement('div');
  list.id = `${MENU_ID}-${++idSeq}`;
  list.setAttribute('role', 'listbox');
  list.setAttribute('data-select-menu', '');
  list.setAttribute('data-tour-ignore', '');
  list.setAttribute('data-click-outside-ignore', 'true');
  list.tabIndex = -1;
  list.className = LIST_CLASS;
  const label = select.getAttribute('aria-label') ?? labelText(select);
  if (label) list.setAttribute('aria-label', label);
  list.addEventListener('mousemove', (e) => {
    const index = rowIndex(e.target);
    if (current && index >= 0 && index !== current.active)
      if (!isDisabled(current.rows[index].option))
        setActive(current, index, { scroll: false, announce: false });
  });
  const status = document.createElement('div');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.className = STATUS_CLASS;
  const saved: Record<string, string | null> = {};
  for (const key of ARIA_KEYS) saved[key] = select.getAttribute(key);
  const menu: OpenMenu = {
    select,
    list,
    status,
    rows: [],
    active: -1,
    saved,
    frame: 0,
    placedAt: '',
    typed: '',
    typedAt: 0,
    observer: null,
  };
  current = menu;
  document.body.appendChild(status);
  document.body.appendChild(list);
  if (typeof list.showPopover === 'function') {
    list.setAttribute('popover', 'manual');
    try {
      list.showPopover();
    } catch {
      // Not in the top layer; the high z-index still lifts it.
    }
  }
  select.setAttribute('aria-expanded', 'true');
  select.setAttribute('aria-controls', list.id);
  if (document.activeElement !== select) select.focus({ preventScroll: true });
  fillList(menu);
  place(menu, true);
  if (typeof MutationObserver === 'function') {
    menu.observer = new MutationObserver(() => {
      if (current !== menu) return;
      fillList(menu);
      place(menu, true);
    });
    menu.observer.observe(select, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['disabled', 'hidden', 'label', 'value'],
    });
  }
  follow(menu);
  return true;
};

export const closeSelectMenu = () => {
  const menu = current;
  if (!menu) return;
  current = null;
  cancelAnimationFrame(menu.frame);
  menu.observer?.disconnect();
  menu.list.remove();
  menu.status.remove();
  for (const key of ARIA_KEYS) {
    const value = menu.saved[key];
    if (value === null) menu.select.removeAttribute(key);
    else menu.select.setAttribute(key, value);
  }
};

export const isSelectMenuOpen = () => current !== null;

const typeahead = (menu: OpenMenu, key: string) => {
  const now = Date.now();
  menu.typed = now - menu.typedAt > TYPEAHEAD_RESET_MS ? key : menu.typed + key;
  menu.typedAt = now;
  const needle = menu.typed.toLowerCase();
  const start = menu.typed.length === 1 ? menu.active + 1 : menu.active;
  for (let n = 0; n < menu.rows.length; n++) {
    const i = (Math.max(start, 0) + n) % menu.rows.length;
    const { option } = menu.rows[i];
    if (
      !isDisabled(option) &&
      optionText(option).trim().toLowerCase().startsWith(needle)
    ) {
      setActive(menu, i);
      return;
    }
  }
};

const onOpenKey = (e: KeyboardEvent, menu: OpenMenu) => {
  const { rows } = menu;
  const page = Math.max(1, Math.floor(menu.list.clientHeight / 36) - 1);
  let next = -1;
  if (e.key === 'Tab') {
    closeSelectMenu();
    return;
  }
  if (
    (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) ||
    e.key === 'F4'
  ) {
    choose(menu.active);
    if (current === menu) closeSelectMenu();
  } else if (e.ctrlKey || e.metaKey) {
    // Shortcuts wait until the list closes, as with the browser's list.
  } else
    switch (e.key) {
      case 'ArrowDown':
        next = enabledIndex(rows, menu.active + 1, 1);
        break;
      case 'ArrowUp':
        next = enabledIndex(rows, menu.active - 1, -1);
        break;
      case 'Home':
        next = enabledIndex(rows, 0, 1);
        break;
      case 'End':
        next = enabledIndex(rows, rows.length - 1, -1);
        break;
      case 'PageDown':
        next = enabledIndex(
          rows,
          Math.min(rows.length - 1, menu.active + page),
          -1
        );
        break;
      case 'PageUp':
        next = enabledIndex(rows, Math.max(0, menu.active - page), 1);
        break;
      case 'Enter':
      case ' ':
        if (
          e.key === ' ' &&
          menu.typed &&
          Date.now() - menu.typedAt < TYPEAHEAD_RESET_MS
        ) {
          typeahead(menu, ' ');
          break;
        }
        choose(menu.active);
        break;
      case 'Escape':
        closeSelectMenu();
        break;
      default:
        if (e.key.length === 1 && !e.altKey) typeahead(menu, e.key);
        break;
    }
  if (next >= 0) setActive(menu, next);
  e.preventDefault();
  e.stopImmediatePropagation();
};

const opensMenu = (e: KeyboardEvent, select: HTMLSelectElement) => {
  if (e.key === ' ')
    return (
      !e.ctrlKey &&
      !e.metaKey &&
      !(
        closedTyped?.select === select &&
        Date.now() - closedTyped.at < CLOSED_TYPEAHEAD_MS
      )
    );
  return (
    (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) ||
    e.key === 'F4' ||
    (isMac() && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.metaKey)
  );
};

/** Installs the list for every select on the page; returns the uninstaller. Runs before React so its window listeners go first. */
export const installSelectMenus = (): (() => void) => {
  if (installed) return () => undefined;
  installed = true;

  const onListEvent = (e: Event) => {
    const menu = current;
    if (!menu || !menu.list.contains(e.target as Node)) return;
    e.stopImmediatePropagation();
    // Keeps focus (and the keyboard) on the select while the list is pressed.
    if (e.type === 'mousedown' || e.type === 'contextmenu') e.preventDefault();
    if (e.type === 'click') choose(rowIndex(e.target));
  };

  const onMouseDown = (e: MouseEvent) => {
    if (!appPickersEnabled() && !current) return;
    if (current?.list.contains(e.target as Node)) return;
    const target = e.target as Element | null;
    const select = target?.closest?.('select');
    if (current && select === current.select) {
      e.preventDefault();
      closeSelectMenu();
      return;
    }
    if (current) closeSelectMenu();
    if (
      e.button !== 0 ||
      (isMac() && e.ctrlKey) ||
      !isMenuSelect(select) ||
      touchOnly()
    )
      return;
    e.preventDefault();
    openSelectMenu(select);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!appPickersEnabled() && !current) return;
    const menu = current;
    if (menu) {
      if (e.target === menu.select || menu.list.contains(e.target as Node))
        onOpenKey(e, menu);
      return;
    }
    const select = e.target;
    if (!isMenuSelect(select) || touchOnly()) return;
    if (opensMenu(e, select)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      openSelectMenu(select);
      return;
    }
    if (e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey)
      closedTyped = { select, at: Date.now() };
  };

  const onFocusOut = (e: FocusEvent) => {
    if (current && e.target === current.select) closeSelectMenu();
  };

  const onResize = () => closeSelectMenu();

  for (const type of LIST_EVENTS)
    window.addEventListener(type, onListEvent, true);
  window.addEventListener('mousedown', onMouseDown, true);
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('focusout', onFocusOut, true);
  window.addEventListener('resize', onResize);
  window.addEventListener('blur', onResize);
  return () => {
    closeSelectMenu();
    installed = false;
    closedTyped = null;
    for (const type of LIST_EVENTS)
      window.removeEventListener(type, onListEvent, true);
    window.removeEventListener('mousedown', onMouseDown, true);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('focusout', onFocusOut, true);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('blur', onResize);
  };
};
