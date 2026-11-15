// Opens date, time and date-and-time fields with the app's own calendar and time columns instead of the browser's, keeping the native field and its events.

import i18n from '@/i18n';
import {
  PANEL_CLASS,
  PANEL_EVENTS,
  createPanel,
  fieldLabel,
  placePanel,
  setFieldValue,
  showPanel,
  touchOnly,
  isChromium,
} from './pickerPanel';

type Kind = 'date' | 'time' | 'datetime-local';

const KINDS = new Set<string>(['date', 'time', 'datetime-local']);
const ID = 'spart-date-picker';
const MAX_HEIGHT_PX = 420;
const MAX_WIDTH_PX = 520;
// The browser's calendar or clock button sits in this many pixels at the field's right edge.
const ICON_ZONE_PX = 28;

const NAV_CLASS =
  'flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700';
const DAY_CLASS =
  'flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-sm font-medium';
const CELL_CLASS =
  'flex h-8 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-sm font-medium';
const PICKED_CLASS = 'bg-brand-blue-primary font-bold text-white';
const FOOTER_BUTTON_CLASS =
  'rounded-lg px-2 py-1 text-xs font-bold hover:bg-slate-100';

interface OpenPicker {
  input: HTMLInputElement;
  kind: Kind;
  panel: HTMLElement;
  status: HTMLElement;
  viewY: number;
  viewM: number;
  active: string;
  frame: number;
  placedAt: string;
  onInput: () => void;
  onChange: (e: Event) => void;
  anchor: HTMLElement | null;
  // Holds focus and the combobox attributes: the anchor button when there is one, else the field.
  owner: HTMLElement;
  // The value when the panel opened; change fires on close, as the browser's picker does.
  openedWith: string;
}

let current: OpenPicker | null = null;
let installed = false;
let swallowClickOn: HTMLInputElement | null = null;
// A press on the button that opened the panel closes it; its click must not reopen it.
let closedByAnchor: HTMLElement | null = null;

const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (y: number, m: number, d: number) => {
  const dt = new Date(y, m, d);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
};
const parseDay = (value: string) => {
  const m = /^(\d{4,})-(\d{2})-(\d{2})/.exec(value);
  return m ? { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) } : null;
};
const parseTime = (value: string) => {
  const m = /(\d{2}):(\d{2})/.exec(value);
  return m ? { h: Number(m[1]), mi: Number(m[2]) } : null;
};
const today = () => {
  const n = new Date();
  return isoDate(n.getFullYear(), n.getMonth(), n.getDate());
};
const nowTime = () => {
  const n = new Date();
  return `${pad(n.getHours())}:${pad(n.getMinutes())}`;
};
const locale = () =>
  i18n.language ||
  (typeof navigator !== 'undefined' ? navigator.language : 'en-US');
// The field itself is drawn in the browser's locale, so its hour format and week start come from there.
const browserLocale = () =>
  typeof navigator !== 'undefined' ? navigator.language : 'en-US';
const firstWeekday = (): number => {
  try {
    const loc = new Intl.Locale(browserLocale()) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const day = loc.getWeekInfo?.().firstDay ?? loc.weekInfo?.firstDay ?? 7;
    return day % 7;
  } catch {
    return 0;
  }
};
const uses12h = () => {
  try {
    const { hourCycle, hour12 } = new Intl.DateTimeFormat(browserLocale(), {
      hour: 'numeric',
    }).resolvedOptions();
    return hour12 ?? (hourCycle === 'h11' || hourCycle === 'h12');
  } catch {
    return true;
  }
};
const t = (key: string, fallback: string) =>
  i18n.t(`picker.${key}`, { defaultValue: fallback });

const isPickerField = (el: unknown): el is HTMLInputElement =>
  el instanceof HTMLInputElement &&
  KINDS.has(el.type) &&
  !el.readOnly &&
  !el.matches(':disabled');

const datePart = (p: OpenPicker) =>
  p.kind === 'time' ? '' : p.input.value.slice(0, 10);
const timePart = (p: OpenPicker) =>
  p.kind === 'date'
    ? ''
    : p.kind === 'time'
      ? p.input.value
      : p.input.value.slice(11);
// Seconds and fractions the field already holds survive a new hour or minute.
const secondsOf = (time: string) => time.slice(5);

const outOfRange = (p: OpenPicker, iso: string) => {
  const min = p.input.min.slice(0, 10);
  const max = p.input.max.slice(0, 10);
  return (!!min && iso < min) || (!!max && iso > max);
};

const commitDay = (p: OpenPicker, iso: string) => {
  if (outOfRange(p, iso)) return;
  if (p.kind === 'date') {
    closeDatePicker();
    setFieldValue(p.input, iso);
    return;
  }
  setFieldValue(p.input, `${iso}T${timePart(p) || nowTime()}`, false);
  p.active = iso;
  render(p);
};

const commitTime = (p: OpenPicker, h: number, mi: number) => {
  const time = `${pad(h)}:${pad(mi)}${secondsOf(timePart(p))}`;
  if (p.kind === 'time') setFieldValue(p.input, time, false);
  else
    setFieldValue(
      p.input,
      `${datePart(p) || p.active || today()}T${time}`,
      false
    );
};

const button = (
  label: string,
  className: string,
  action: string,
  value = ''
) => {
  const el = document.createElement('button');
  el.type = 'button';
  el.tabIndex = -1;
  el.className = className;
  el.dataset.action = action;
  if (value) el.dataset.value = value;
  el.textContent = label;
  return el;
};

const chevron = (dir: 'left' | 'right') => {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'pointer-events-none');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', dir === 'left' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6');
  svg.appendChild(path);
  return svg;
};

const renderCalendar = (p: OpenPicker): HTMLElement => {
  const section = document.createElement('div');
  section.className = 'w-[16.5rem] shrink-0';
  const head = document.createElement('div');
  head.className = 'mb-1 flex items-center justify-between';
  const title = document.createElement('div');
  title.className = 'pl-1 text-sm font-bold text-slate-800';
  title.setAttribute('aria-live', 'polite');
  title.textContent = new Intl.DateTimeFormat(locale(), {
    month: 'long',
    year: 'numeric',
  }).format(new Date(p.viewY, p.viewM, 1));
  const nav = document.createElement('div');
  nav.className = 'flex items-center gap-1';
  const prev = button('', NAV_CLASS, 'prev');
  prev.setAttribute('aria-label', t('previousMonth', 'Previous month'));
  prev.appendChild(chevron('left'));
  const next = button('', NAV_CLASS, 'next');
  next.setAttribute('aria-label', t('nextMonth', 'Next month'));
  next.appendChild(chevron('right'));
  nav.append(prev, next);
  head.append(title, nav);

  const grid = document.createElement('div');
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', title.textContent);
  const weekdays = document.createElement('div');
  weekdays.setAttribute('role', 'row');
  weekdays.className = 'grid grid-cols-7 gap-0.5';
  const dayName = new Intl.DateTimeFormat(locale(), { weekday: 'short' });
  const weekStart = firstWeekday();
  for (let i = 0; i < 7; i++) {
    const cell = document.createElement('div');
    cell.setAttribute('role', 'columnheader');
    cell.className =
      'flex h-7 items-center justify-center text-xs font-semibold text-slate-500';
    cell.textContent = dayName
      .format(new Date(2023, 0, 1 + ((i + weekStart) % 7)))
      .slice(0, 2);
    weekdays.appendChild(cell);
  }
  grid.appendChild(weekdays);

  const first = (new Date(p.viewY, p.viewM, 1).getDay() - weekStart + 7) % 7;
  const picked = datePart(p);
  const now = today();
  const longDay = new Intl.DateTimeFormat(locale(), { dateStyle: 'full' });
  for (let week = 0; week < 6; week++) {
    const row = document.createElement('div');
    row.setAttribute('role', 'row');
    row.className = 'grid grid-cols-7 gap-0.5';
    for (let col = 0; col < 7; col++) {
      const date = new Date(p.viewY, p.viewM, 1 - first + week * 7 + col);
      const iso = isoDate(date.getFullYear(), date.getMonth(), date.getDate());
      const cell = document.createElement('div');
      cell.setAttribute('role', 'gridcell');
      cell.id = `${p.panel.id}-${iso}`;
      cell.dataset.action = 'day';
      cell.dataset.value = iso;
      cell.textContent = String(date.getDate());
      cell.setAttribute('aria-label', longDay.format(date));
      const isPicked = iso === picked;
      const disabled = outOfRange(p, iso);
      cell.setAttribute('aria-selected', String(isPicked));
      if (disabled) cell.setAttribute('aria-disabled', 'true');
      if (iso === now) cell.setAttribute('aria-current', 'date');
      const inMonth = date.getMonth() === p.viewM;
      const tone = disabled
        ? 'cursor-not-allowed text-slate-300'
        : isPicked
          ? PICKED_CLASS
          : iso === now
            ? 'font-bold text-brand-blue-primary hover:bg-slate-100'
            : inMonth
              ? 'text-slate-700 hover:bg-slate-100'
              : 'text-slate-400 hover:bg-slate-100';
      const focus =
        iso === p.active
          ? isPicked
            ? 'ring-2 ring-brand-blue-primary/40 ring-offset-1'
            : 'ring-2 ring-inset ring-brand-blue-primary/40'
          : '';
      cell.className = `${DAY_CLASS} ${tone} ${focus}`;
      row.appendChild(cell);
    }
    grid.appendChild(row);
  }
  section.append(head, grid);
  return section;
};

const timeColumn = (
  label: string,
  cells: { text: string; value: string; picked: boolean }[],
  action: string
) => {
  const col = document.createElement('div');
  col.setAttribute('role', 'listbox');
  col.setAttribute('aria-label', label);
  col.className =
    'flex max-h-[15.5rem] flex-col gap-0.5 overflow-y-auto overscroll-contain pr-0.5';
  for (const c of cells) {
    const cell = document.createElement('div');
    cell.setAttribute('role', 'option');
    cell.setAttribute('aria-selected', String(c.picked));
    cell.dataset.action = action;
    cell.dataset.value = c.value;
    cell.className = `${CELL_CLASS} ${c.picked ? PICKED_CLASS : 'text-slate-700 hover:bg-slate-100'}`;
    cell.textContent = c.text;
    col.appendChild(cell);
  }
  return col;
};

const renderTime = (p: OpenPicker): HTMLElement => {
  const section = document.createElement('div');
  section.className = `flex shrink-0 gap-1 ${p.kind === 'datetime-local' ? 'border-l border-slate-100 pl-3' : ''}`;
  const time = parseTime(timePart(p));
  const twelve = uses12h();
  const hours = twelve
    ? Array.from({ length: 12 }, (_, i) => (i === 0 ? 12 : i))
    : Array.from({ length: 24 }, (_, i) => i);
  const pm = time ? time.h >= 12 : false;
  const shownHour = time ? (twelve ? time.h % 12 || 12 : time.h) : -1;
  section.append(
    timeColumn(
      t('hour', 'Hour'),
      hours.map((h) => ({
        text: twelve ? String(h) : pad(h),
        value: String(h),
        picked: h === shownHour,
      })),
      'hour'
    ),
    timeColumn(
      t('minute', 'Minute'),
      Array.from({ length: 60 }, (_, mi) => ({
        text: pad(mi),
        value: String(mi),
        picked: !!time && time.mi === mi,
      })),
      'minute'
    )
  );
  if (twelve) {
    const parts = new Intl.DateTimeFormat(locale(), {
      hour: 'numeric',
      hour12: true,
    });
    const mark = (h: number) =>
      parts
        .formatToParts(new Date(2023, 0, 1, h))
        .find((x) => x.type === 'dayPeriod')?.value ?? (h < 12 ? 'AM' : 'PM');
    section.append(
      timeColumn(
        t('period', 'AM or PM'),
        [
          { text: mark(9), value: 'am', picked: !!time && !pm },
          { text: mark(15), value: 'pm', picked: !!time && pm },
        ],
        'period'
      )
    );
  }
  return section;
};

const render = (p: OpenPicker) => {
  const body = document.createElement('div');
  body.className = 'flex items-start gap-3 p-3';
  if (p.kind !== 'time') body.appendChild(renderCalendar(p));
  if (p.kind !== 'date') body.appendChild(renderTime(p));
  const children: HTMLElement[] = [body];
  if (p.kind !== 'time') {
    const footer = document.createElement('div');
    footer.className =
      'flex items-center justify-between border-t border-slate-100 px-3 py-2';
    footer.append(
      button(
        t('clear', 'Clear'),
        `${FOOTER_BUTTON_CLASS} text-slate-500`,
        'clear'
      ),
      button(
        t('today', 'Today'),
        `${FOOTER_BUTTON_CLASS} text-brand-blue-primary`,
        'today'
      )
    );
    children.push(footer);
  }
  p.panel.replaceChildren(...children);
  if (p.kind !== 'time')
    p.owner.setAttribute('aria-activedescendant', `${p.panel.id}-${p.active}`);
  // Keeps the picked hour and minute in view.
  p.panel
    .querySelectorAll<HTMLElement>('[role="listbox"] [aria-selected="true"]')
    .forEach((el) => {
      const col = el.parentElement;
      if (col)
        col.scrollTop =
          el.offsetTop -
          col.offsetTop -
          (col.clientHeight - el.offsetHeight) / 2;
    });
  place(p, true);
};

const fieldRect = (input: HTMLInputElement): DOMRect => {
  const rect = input.getBoundingClientRect();
  const parent = input.parentElement;
  if (!parent || parent === document.body || parent.tagName === 'LABEL')
    return rect;
  const box = parent.getBoundingClientRect();
  const others = Array.from(
    parent.querySelectorAll('input, button, textarea, a[href], select')
  ).some((el) => el !== input);
  return !others &&
    box.height <= rect.height + 12 &&
    box.width <= rect.width + 80
    ? box
    : rect;
};

const place = (p: OpenPicker, force = false) => {
  const rect = p.anchor?.isConnected
    ? p.anchor.getBoundingClientRect()
    : fieldRect(p.input);
  const key = `${rect.left},${rect.top},${rect.width},${rect.height},${window.innerWidth},${window.innerHeight}`;
  if (!force && key === p.placedAt) return;
  p.placedAt = key;
  placePanel(p.panel, rect, MAX_HEIGHT_PX, MAX_WIDTH_PX);
  p.panel.style.minWidth = '';
};

const follow = (p: OpenPicker) => {
  p.frame = requestAnimationFrame(() => {
    if (current !== p) return;
    const rect = p.input.getBoundingClientRect();
    if (
      !p.input.isConnected ||
      !isPickerField(p.input) ||
      (rect.width === 0 && rect.height === 0)
    ) {
      closeDatePicker();
      return;
    }
    place(p);
    follow(p);
  });
};

const syncView = (p: OpenPicker) => {
  const day = parseDay(datePart(p)) ?? parseDay(p.active) ?? parseDay(today());
  if (!day) return;
  p.viewY = day.y;
  p.viewM = day.m;
  p.active = isoDate(day.y, day.m, day.d);
};

/** Opens the app's picker for a date, time or date-and-time field; false when it should stay native. */
export const openDatePicker = (
  input: HTMLInputElement,
  anchor: HTMLElement | null = null
): boolean => {
  if (!isPickerField(input)) return false;
  closeDatePicker();
  const kind = input.type as Kind;
  const { panel, status } = createPanel(
    `${ID}-${Date.now().toString(36)}`,
    'dialog',
    fieldLabel(input)
  );
  panel.className = PANEL_CLASS;
  const p: OpenPicker = {
    input,
    kind,
    panel,
    status,
    viewY: 0,
    viewM: 0,
    active: '',
    frame: 0,
    placedAt: '',
    anchor,
    owner: anchor ?? input,
    openedWith: input.value,
    onChange: (e) => {
      // Typing fires its own change; only the panel's picks are left for close.
      if (e.isTrusted) p.openedWith = input.value;
    },
    onInput: () => {
      if (current !== p) return;
      syncView(p);
      render(p);
    },
  };
  syncView(p);
  current = p;
  showPanel(panel, status);
  p.owner.setAttribute('aria-expanded', 'true');
  p.owner.setAttribute('aria-controls', panel.id);
  input.addEventListener('input', p.onInput);
  input.addEventListener('change', p.onChange);
  if (document.activeElement !== p.owner)
    p.owner.focus({ preventScroll: true });
  render(p);
  follow(p);
  return true;
};

/** Opens a field's picker from a button of its own: the app's on computers, the system one on phones and tablets. */
export const openFieldPicker = (
  input: HTMLInputElement | null,
  anchor: HTMLElement | null = null
) => {
  if (!input) return;
  if (anchor && closedByAnchor === anchor) {
    closedByAnchor = null;
    return;
  }
  if (!touchOnly() && isChromium() && openDatePicker(input, anchor)) return;
  try {
    input.showPicker();
  } catch {
    input.focus();
  }
};

export const closeDatePicker = () => {
  const p = current;
  if (!p) return;
  current = null;
  cancelAnimationFrame(p.frame);
  p.input.removeEventListener('input', p.onInput);
  p.input.removeEventListener('change', p.onChange);
  p.panel.remove();
  p.status.remove();
  p.owner.removeAttribute('aria-expanded');
  p.owner.removeAttribute('aria-controls');
  p.owner.removeAttribute('aria-activedescendant');
  if (p.input.value !== p.openedWith)
    p.input.dispatchEvent(new Event('change', { bubbles: true }));
  if (p.anchor?.isConnected && document.activeElement === p.input)
    p.anchor.focus({ preventScroll: true });
};

export const isDatePickerOpen = () => current !== null;

const moveActive = (p: OpenPicker, days: number, months = 0) => {
  const day = parseDay(p.active) ?? parseDay(today());
  if (!day) return;
  const next = months
    ? new Date(day.y, day.m + months, 1)
    : new Date(day.y, day.m, day.d + days);
  if (months) {
    const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(day.d, last));
  }
  p.active = isoDate(next.getFullYear(), next.getMonth(), next.getDate());
  p.viewY = next.getFullYear();
  p.viewM = next.getMonth();
  render(p);
  p.status.textContent = new Intl.DateTimeFormat(locale(), {
    dateStyle: 'full',
  }).format(next);
};

const onOpenKey = (e: KeyboardEvent, p: OpenPicker) => {
  if (e.key === 'Tab') {
    closeDatePicker();
    return;
  }
  if (e.key === 'Escape') {
    closeDatePicker();
  } else if (e.key === 'Enter') {
    if (p.kind === 'time') closeDatePicker();
    else {
      commitDay(p, p.active);
      closeDatePicker();
    }
  } else if (p.kind === 'time' || e.ctrlKey || e.metaKey || e.altKey) {
    // Typing and arrows keep editing the field itself; the columns follow it.
    return;
  } else {
    const day = parseDay(p.active);
    const weekday = day
      ? (new Date(day.y, day.m, day.d).getDay() - firstWeekday() + 7) % 7
      : 0;
    switch (e.key) {
      case 'ArrowLeft':
        moveActive(p, -1);
        break;
      case 'ArrowRight':
        moveActive(p, 1);
        break;
      case 'ArrowUp':
        moveActive(p, -7);
        break;
      case 'ArrowDown':
        moveActive(p, 7);
        break;
      case 'Home':
        moveActive(p, -weekday);
        break;
      case 'End':
        moveActive(p, 6 - weekday);
        break;
      case 'PageUp':
        moveActive(p, 0, e.shiftKey ? -12 : -1);
        break;
      case 'PageDown':
        moveActive(p, 0, e.shiftKey ? 12 : 1);
        break;
      case ' ':
        commitDay(p, p.active);
        break;
      default:
        return;
    }
  }
  e.preventDefault();
  e.stopImmediatePropagation();
};

const onAction = (p: OpenPicker, el: HTMLElement) => {
  const value = el.dataset.value ?? '';
  const time = parseTime(timePart(p)) ?? parseTime(nowTime());
  if (!time) return;
  switch (el.dataset.action) {
    case 'prev':
    case 'next': {
      const d = new Date(
        p.viewY,
        p.viewM + (el.dataset.action === 'next' ? 1 : -1),
        1
      );
      p.viewY = d.getFullYear();
      p.viewM = d.getMonth();
      render(p);
      break;
    }
    case 'day':
      commitDay(p, value);
      break;
    case 'hour': {
      const h = Number(value);
      const pm = time.h >= 12;
      commitTime(p, uses12h() ? (h % 12) + (pm ? 12 : 0) : h, time.mi);
      break;
    }
    case 'minute':
      commitTime(p, time.h, Number(value));
      break;
    case 'period':
      commitTime(p, (time.h % 12) + (value === 'pm' ? 12 : 0), time.mi);
      break;
    case 'clear':
      closeDatePicker();
      setFieldValue(p.input, '');
      break;
    case 'today': {
      const iso = today();
      if (outOfRange(p, iso)) return;
      closeDatePicker();
      setFieldValue(
        p.input,
        p.kind === 'date' ? iso : `${iso}T${timePart(p) || nowTime()}`
      );
      break;
    }
  }
};

const inIconZone = (input: HTMLInputElement, e: MouseEvent) => {
  const rect = input.getBoundingClientRect();
  const scale = input.offsetWidth ? rect.width / input.offsetWidth : 1;
  const style = getComputedStyle(input);
  const inset =
    (parseFloat(style.paddingRight) || 0) +
    (parseFloat(style.borderRightWidth) || 0);
  return e.clientX >= rect.right - (inset + ICON_ZONE_PX) * scale;
};

const opensPicker = (e: KeyboardEvent) =>
  (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) ||
  e.key === 'F4' ||
  (e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.altKey);

/** Installs the app's date and time pickers; returns the uninstaller. Runs before React so its window listeners go first. */
export const installDatePickers = (): (() => void) => {
  if (installed || !isChromium()) return () => undefined;
  installed = true;

  const onPanelEvent = (e: Event) => {
    const p = current;
    if (!p || !p.panel.contains(e.target as Node)) return;
    e.stopImmediatePropagation();
    // Keeps focus (and typing) in the field while the panel is pressed.
    if (e.type === 'mousedown' || e.type === 'contextmenu') e.preventDefault();
    if (e.type !== 'click') return;
    const el =
      e.target instanceof Element
        ? e.target.closest<HTMLElement>('[data-action]')
        : null;
    if (el && el.getAttribute('aria-disabled') !== 'true') onAction(p, el);
  };

  const onMouseDown = (e: MouseEvent) => {
    if (current?.panel.contains(e.target as Node)) return;
    swallowClickOn = null;
    closedByAnchor = current?.anchor?.contains(e.target as Node)
      ? current.anchor
      : null;
    const input = e.target;
    if (current && input === current.input) {
      if (isPickerField(input) && inIconZone(input, e)) swallowClickOn = input;
      closeDatePicker();
      return;
    }
    if (current) closeDatePicker();
  };

  const onClick = (e: MouseEvent) => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || !KINDS.has(input.type)) return;
    if (swallowClickOn === input) {
      swallowClickOn = null;
      e.preventDefault();
      return;
    }
    if (e.button !== 0 || !isPickerField(input) || touchOnly()) return;
    // Stops the browser's own calendar, which opens on this click.
    e.preventDefault();
    if (inIconZone(input, e)) openDatePicker(input);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const p = current;
    if (p) {
      if (e.target === p.owner) onOpenKey(e, p);
      return;
    }
    const input = e.target;
    if (!isPickerField(input) || touchOnly() || !opensPicker(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    openDatePicker(input);
  };

  const onFocusOut = (e: FocusEvent) => {
    if (current && e.target === current.owner) closeDatePicker();
  };

  // The anchor's click lands in the same task as mouseup, so a press dragged off it clears here.
  const onMouseUp = () => {
    if (closedByAnchor)
      window.setTimeout(() => {
        closedByAnchor = null;
      }, 0);
  };

  const onResize = () => closeDatePicker();

  for (const type of PANEL_EVENTS)
    window.addEventListener(type, onPanelEvent, true);
  window.addEventListener('mousedown', onMouseDown, true);
  window.addEventListener('mouseup', onMouseUp, true);
  window.addEventListener('click', onClick, true);
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('focusout', onFocusOut, true);
  window.addEventListener('resize', onResize);
  window.addEventListener('blur', onResize);
  return () => {
    closeDatePicker();
    installed = false;
    swallowClickOn = null;
    closedByAnchor = null;
    for (const type of PANEL_EVENTS)
      window.removeEventListener(type, onPanelEvent, true);
    window.removeEventListener('mousedown', onMouseDown, true);
    window.removeEventListener('mouseup', onMouseUp, true);
    window.removeEventListener('click', onClick, true);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('focusout', onFocusOut, true);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('blur', onResize);
  };
};
