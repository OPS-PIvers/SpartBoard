// Shows a text field's <datalist> suggestions in the app's own list instead of the browser's, keeping the field and its events.

import {
  PANEL_CLASS,
  PANEL_EVENTS,
  createPanel,
  fieldLabel,
  placePanel,
  setFieldValue,
  touchOnly,
  showPanel,
} from './pickerPanel';

const ID = 'spart-suggestions';
const STASH = 'suggestList';
const MAX_HEIGHT_PX = 280;
const MAX_WIDTH_PX = 384;
const ROW_CLASS =
  'flex w-full cursor-pointer items-center px-3 py-2 touch:py-3 font-medium text-slate-700';
const ACTIVE_CLASS = 'bg-slate-100';

interface Open {
  input: HTMLInputElement;
  panel: HTMLElement;
  status: HTMLElement;
  values: string[];
  active: number;
  frame: number;
  placedAt: string;
}

let current: Open | null = null;
let installed = false;
let seq = 0;
let choosing = false;

const listFor = (input: HTMLInputElement): HTMLDataListElement | null => {
  const id = input.dataset[STASH];
  const el = id ? document.getElementById(id) : null;
  return el instanceof HTMLDataListElement ? el : null;
};

const matches = (input: HTMLInputElement): string[] => {
  const list = listFor(input);
  if (!list) return [];
  const typed = input.value.trim().toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const option of Array.from(list.options)) {
    const value = option.value;
    if (!value || option.disabled || seen.has(value)) continue;
    seen.add(value);
    if (!typed || value.toLowerCase().includes(typed)) out.push(value);
  }
  // A field that already holds the only match needs no list.
  return out.length === 1 && out[0] === input.value ? [] : out;
};

const setActive = (o: Open, index: number) => {
  const rows = o.panel.querySelectorAll<HTMLElement>('[role="option"]');
  rows[o.active]?.classList.remove(ACTIVE_CLASS);
  rows[o.active]?.setAttribute('aria-selected', 'false');
  o.active = index;
  const row = rows[index];
  if (!row) {
    o.input.removeAttribute('aria-activedescendant');
    return;
  }
  row.classList.add(ACTIVE_CLASS);
  row.setAttribute('aria-selected', 'true');
  row.scrollIntoView?.({ block: 'nearest' });
  o.input.setAttribute('aria-activedescendant', row.id);
  o.status.textContent = `${o.values[index]}, ${index + 1} of ${o.values.length}`;
};

const place = (o: Open, force = false) => {
  const rect = o.input.getBoundingClientRect();
  const key = `${rect.left},${rect.top},${rect.width},${rect.height},${window.innerWidth},${window.innerHeight}`;
  if (!force && key === o.placedAt) return;
  o.placedAt = key;
  placePanel(o.panel, rect, MAX_HEIGHT_PX, MAX_WIDTH_PX);
};

const fill = (o: Open) => {
  o.panel.replaceChildren(
    ...o.values.map((value, i) => {
      const row = document.createElement('div');
      row.id = `${o.panel.id}-${i}`;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', 'false');
      row.dataset.index = String(i);
      row.className = ROW_CLASS;
      row.textContent = value;
      return row;
    })
  );
  o.active = -1;
  o.input.removeAttribute('aria-activedescendant');
  place(o, true);
};

const follow = (o: Open) => {
  o.frame = requestAnimationFrame(() => {
    if (current !== o) return;
    const rect = o.input.getBoundingClientRect();
    if (!o.input.isConnected || (rect.width === 0 && rect.height === 0)) {
      closeSuggestions();
      return;
    }
    place(o);
    follow(o);
  });
};

/** Opens or refreshes the list for this field; closes it when nothing matches. */
const showSuggestions = (input: HTMLInputElement) => {
  const values = matches(input);
  if (!values.length) {
    if (current?.input === input) closeSuggestions();
    return;
  }
  if (current?.input === input) {
    current.values = values;
    fill(current);
    return;
  }
  closeSuggestions();
  const { panel, status } = createPanel(
    `${ID}-${++seq}`,
    'listbox',
    fieldLabel(input)
  );
  panel.className = `${PANEL_CLASS} py-1`;
  panel.addEventListener('mousemove', (e) => {
    const row =
      e.target instanceof Element
        ? e.target.closest<HTMLElement>('[role="option"]')
        : null;
    if (current && row && Number(row.dataset.index) !== current.active)
      setActive(current, Number(row.dataset.index));
  });
  const o: Open = {
    input,
    panel,
    status,
    values,
    active: -1,
    frame: 0,
    placedAt: '',
  };
  current = o;
  showPanel(panel, status);
  input.setAttribute('aria-expanded', 'true');
  input.setAttribute('aria-controls', panel.id);
  input.setAttribute('aria-autocomplete', 'list');
  fill(o);
  follow(o);
};

export const closeSuggestions = () => {
  const o = current;
  if (!o) return;
  current = null;
  cancelAnimationFrame(o.frame);
  o.panel.remove();
  o.status.remove();
  for (const key of [
    'aria-expanded',
    'aria-controls',
    'aria-activedescendant',
    'aria-autocomplete',
  ])
    o.input.removeAttribute(key);
};

export const isSuggestionListOpen = () => current !== null;

const choose = (o: Open, index: number) => {
  const value = o.values[index];
  if (value === undefined) return;
  closeSuggestions();
  choosing = true;
  try {
    setFieldValue(o.input, value);
  } finally {
    choosing = false;
  }
};

const TEXT_TYPES = new Set(['text', 'search', 'url', 'email', 'tel']);

const isSuggestField = (el: unknown): el is HTMLInputElement =>
  el instanceof HTMLInputElement &&
  TEXT_TYPES.has(el.type) &&
  !el.readOnly &&
  !el.matches(':disabled') &&
  (el.hasAttribute('list') || !!el.dataset[STASH]);

/** Hides the browser's list by parking the field's list id while it has focus. */
const park = (input: HTMLInputElement) => {
  const id = input.getAttribute('list');
  if (!id) return;
  input.dataset[STASH] = id;
  input.removeAttribute('list');
};

const unpark = (input: HTMLInputElement) => {
  const id = input.dataset[STASH];
  if (!id) return;
  delete input.dataset[STASH];
  if (!input.hasAttribute('list')) input.setAttribute('list', id);
};

/** Installs the app's suggestion list for every field with a <datalist>; returns the uninstaller. */
export const installSuggestionLists = (): (() => void) => {
  if (installed) return () => undefined;
  installed = true;

  const onPanelEvent = (e: Event) => {
    const o = current;
    if (!o || !o.panel.contains(e.target as Node)) return;
    e.stopImmediatePropagation();
    if (e.type === 'mousedown' || e.type === 'contextmenu') e.preventDefault();
    if (e.type !== 'click') return;
    const row =
      e.target instanceof Element
        ? e.target.closest<HTMLElement>('[role="option"]')
        : null;
    if (row) choose(o, Number(row.dataset.index));
  };

  const onFocusIn = (e: FocusEvent) => {
    if (isSuggestField(e.target) && !touchOnly()) park(e.target);
  };

  const onFocusOut = (e: FocusEvent) => {
    if (!(e.target instanceof HTMLInputElement)) return;
    if (current?.input === e.target) closeSuggestions();
    unpark(e.target);
  };

  const onMouseDown = (e: MouseEvent) => {
    if (current?.panel.contains(e.target as Node)) return;
    if (current && e.target !== current.input) closeSuggestions();
  };

  // A click on the field toggles the list, as the browser's does.
  const onClick = (e: MouseEvent) => {
    const input = e.target;
    if (e.button !== 0 || !isSuggestField(input) || !input.dataset[STASH])
      return;
    if (current?.input === input) closeSuggestions();
    else showSuggestions(input);
  };

  const onInput = (e: Event) => {
    if (!choosing && isSuggestField(e.target) && e.target.dataset[STASH])
      showSuggestions(e.target);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const input = e.target;
    if (!isSuggestField(input) || !input.dataset[STASH]) return;
    const o = current?.input === input ? current : null;
    if (!o) {
      if (e.key === 'ArrowDown' || (e.altKey && e.key === 'ArrowDown')) {
        showSuggestions(input);
        if (current) e.preventDefault();
      }
      return;
    }
    const last = o.values.length - 1;
    switch (e.key) {
      case 'ArrowDown':
        setActive(o, o.active >= last ? 0 : o.active + 1);
        break;
      case 'ArrowUp':
        setActive(o, o.active <= 0 ? last : o.active - 1);
        break;
      case 'Enter':
        if (o.active < 0) {
          closeSuggestions();
          return;
        }
        choose(o, o.active);
        break;
      case 'Escape':
        closeSuggestions();
        break;
      case 'Tab':
        closeSuggestions();
        return;
      default:
        return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  const onResize = () => closeSuggestions();

  for (const type of PANEL_EVENTS)
    window.addEventListener(type, onPanelEvent, true);
  window.addEventListener('focusin', onFocusIn, true);
  window.addEventListener('focusout', onFocusOut, true);
  window.addEventListener('mousedown', onMouseDown, true);
  window.addEventListener('click', onClick, true);
  window.addEventListener('input', onInput, true);
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('resize', onResize);
  window.addEventListener('blur', onResize);
  return () => {
    closeSuggestions();
    installed = false;
    for (const type of PANEL_EVENTS)
      window.removeEventListener(type, onPanelEvent, true);
    window.removeEventListener('focusin', onFocusIn, true);
    window.removeEventListener('focusout', onFocusOut, true);
    window.removeEventListener('mousedown', onMouseDown, true);
    window.removeEventListener('click', onClick, true);
    window.removeEventListener('input', onInput, true);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('blur', onResize);
  };
};
