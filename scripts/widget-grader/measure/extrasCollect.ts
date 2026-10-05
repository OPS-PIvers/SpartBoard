// In-page collectors for the S7 criteria; each runs via page.evaluate, so none may reference anything outside its own body.

export interface ClutterProxies {
  visibleControls: number;
  fontSizes: number;
  colors: number;
  words: number;
  borders: number;
  boxes: number;
}

export interface ControlVisibility {
  path: string;
  hidden: boolean;
  x: number;
  y: number;
}

export interface TabStop {
  path: string;
  /** Rendered outline, ring or border differs from the unfocused element. */
  visibleFocus: boolean;
  x: number;
  y: number;
}

export interface Tabbables {
  controls: number;
  /** Face controls the keyboard can never reach. */
  unreachable: string[];
}

export interface Theming {
  /** Share of the card covered by opaque widget surfaces under the alternate style. */
  opaqueFraction: number;
  /** Share of text elements rendered in the board's font. */
  fontMatch: number;
  textElements: number;
  /** Opaque widget surfaces touching a card corner with a different radius than the card. */
  radiusMismatches: number;
}

export interface FaceState {
  text: string;
  controls: number;
  media: number;
  spinner: boolean;
}

export interface PanelControl {
  index: number;
  kind: 'toggle' | 'select' | 'range' | 'number' | 'text' | 'radio' | 'pressed';
  label: string;
}

export interface Destructive {
  index: number;
  label: string;
}

export function collectClutter(opts: {
  widgetId: string;
  controlSelector: string;
}): ClutterProxies {
  const root = document.querySelector<HTMLElement>(
    `[data-draggable-window][data-widget-id="${opts.widgetId}"]`
  );
  if (!root) throw new Error(`No window for ${opts.widgetId}`);
  const shown = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    for (let n: Element | null = el; n && n !== root; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.visibility === 'hidden' || Number(s.opacity) < 0.05) return false;
    }
    return true;
  };
  const transparent = (c: string) =>
    c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c);
  const fontSizes = new Set<string>();
  const colors = new Set<string>();
  let words = 0;
  let borders = 0;
  let boxes = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.textContent ?? '').trim();
    const parent = n.parentElement;
    if (!text || !parent || !shown(parent)) continue;
    const s = getComputedStyle(parent);
    fontSizes.add(s.fontSize);
    colors.add(s.color);
    words += text.split(/\s+/).filter(Boolean).length;
  }
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
    if (!shown(el)) continue;
    const s = getComputedStyle(el);
    const bordered = ['Top', 'Right', 'Bottom', 'Left'].some(
      (side) =>
        parseFloat(s.getPropertyValue(`border-${side.toLowerCase()}-width`)) >
          0 &&
        s.getPropertyValue(`border-${side.toLowerCase()}-style`) !== 'none' &&
        !transparent(s.getPropertyValue(`border-${side.toLowerCase()}-color`))
    );
    if (bordered) borders++;
    if (!transparent(s.backgroundColor)) colors.add(s.backgroundColor);
    if (
      bordered ||
      !transparent(s.backgroundColor) ||
      (s.boxShadow !== 'none' && s.boxShadow !== '')
    )
      boxes++;
  }
  const visibleControls = Array.from(
    root.querySelectorAll(opts.controlSelector)
  ).filter(
    (el) => !el.closest('.resize-handle, [data-inner-edge-strip]') && shown(el)
  ).length;
  return {
    visibleControls,
    fontSizes: fontSizes.size,
    colors: colors.size,
    words,
    borders,
    boxes,
  };
}

export function collectControlVisibility(opts: {
  widgetId: string;
  controlSelector: string;
}): ControlVisibility[] {
  const root = document.querySelector<HTMLElement>(
    `[data-draggable-window][data-widget-id="${opts.widgetId}"]`
  );
  if (!root) throw new Error(`No window for ${opts.widgetId}`);
  const path = (el: Element): string => {
    const parts: string[] = [];
    for (
      let n: Element | null = el;
      n && n !== root && parts.length < 3;
      n = n.parentElement
    )
      parts.unshift(
        n.tagName.toLowerCase() +
          (n.getAttribute('aria-label')
            ? `[${n.getAttribute('aria-label')}]`
            : '')
      );
    return parts.join(' > ');
  };
  return Array.from(root.querySelectorAll<HTMLElement>(opts.controlSelector))
    .filter((el) => !el.closest('.resize-handle, [data-inner-edge-strip]'))
    .map((el) => {
      const r = el.getBoundingClientRect();
      let opacity = 1;
      let hidden = false;
      for (let n: Element | null = el; n; n = n.parentElement) {
        const s = getComputedStyle(n);
        opacity *= Number(s.opacity);
        if (s.visibility === 'hidden') hidden = true;
        if (n === root) break;
      }
      return {
        path: path(el),
        hidden: hidden || opacity < 0.1,
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
      };
    })
    .filter((c) => c.x > 0 || c.y > 0);
}

/** Elements on the face with a React double-click handler. */
export function countDoubleClickHandlers(widgetId: string): number {
  const root = document.querySelector<HTMLElement>(
    `[data-draggable-window][data-widget-id="${widgetId}"]`
  );
  if (!root) throw new Error(`No window for ${widgetId}`);
  let count = 0;
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
    if (!key) continue;
    const props = (el as unknown as Record<string, Record<string, unknown>>)[
      key
    ];
    if (el !== root && typeof props?.onDoubleClick === 'function') count++;
  }
  return count;
}

export function collectTabbables(opts: {
  widgetId: string;
  controlSelector: string;
}): Tabbables {
  const root = document.querySelector<HTMLElement>(
    `[data-draggable-window][data-widget-id="${opts.widgetId}"]`
  );
  if (!root) throw new Error(`No window for ${opts.widgetId}`);
  const focusable = (el: HTMLElement): boolean => {
    if ((el as HTMLButtonElement).disabled) return true;
    if (el.closest('[inert]')) return true;
    if (el.tabIndex >= 0) return true;
    // A control inside a focusable control is reached through its parent.
    return !!el.parentElement?.closest(
      'button, a[href], [tabindex]:not([tabindex="-1"])'
    );
  };
  const shown = (el: HTMLElement): boolean => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    for (let n: Element | null = el; n && n !== root; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.visibility === 'hidden' || s.display === 'none') return false;
    }
    return true;
  };
  const controls = Array.from(
    root.querySelectorAll<HTMLElement>(opts.controlSelector)
  ).filter(
    (el) =>
      !el.closest('.resize-handle, [data-inner-edge-strip]') &&
      shown(el) &&
      // A label activates its input; the input is the tab stop.
      el.tagName !== 'LABEL'
  );
  const unreachable = controls
    .filter((el) => !focusable(el))
    .map(
      (el) =>
        `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.innerText ?? '').trim().slice(0, 30)}"`
    );
  return { controls: controls.length, unreachable };
}

/** Stamps every face element's unfocused look so focusStop can compare. */
export function stampFocusBaseline(widgetId: string): void {
  const root = document.querySelector<HTMLElement>(
    `[data-draggable-window][data-widget-id="${widgetId}"]`
  );
  if (!root) throw new Error(`No window for ${widgetId}`);
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
    const s = getComputedStyle(el);
    el.dataset.graderFocusLook = [
      s.outlineStyle === 'none' ? 'none' : `${s.outlineStyle}${s.outlineWidth}`,
      s.boxShadow,
      s.borderColor,
      s.backgroundColor,
    ].join('|');
  }
}

/** The focused element if it is inside the face, with whether focus shows. */
export function focusStop(widgetId: string): TabStop | null {
  const root = document.querySelector<HTMLElement>(
    `[data-draggable-window][data-widget-id="${widgetId}"]`
  );
  const el = document.activeElement as HTMLElement | null;
  if (!root || !el || el === root || !root.contains(el)) return null;
  if (el.closest('.resize-handle, [data-inner-edge-strip]')) return null;
  const look = (n: HTMLElement) => {
    const s = getComputedStyle(n);
    return [
      s.outlineStyle === 'none' ? 'none' : `${s.outlineStyle}${s.outlineWidth}`,
      s.boxShadow,
      s.borderColor,
      s.backgroundColor,
    ].join('|');
  };
  // Focus can show on the element or a wrapper (focus-within).
  let visibleFocus = false;
  for (
    let n: HTMLElement | null = el;
    n && n !== root && !visibleFocus;
    n = n.parentElement
  ) {
    const before = n.dataset.graderFocusLook;
    if (before !== undefined && before !== look(n)) visibleFocus = true;
  }
  const r = el.getBoundingClientRect();
  return {
    path: `${el.tagName.toLowerCase()}${el.getAttribute('aria-label') ? `[${el.getAttribute('aria-label')}]` : ''}`,
    visibleFocus,
    x: r.left,
    y: r.top,
  };
}

/** Running animations on the face: total and those that loop forever. */
export function collectAnimations(widgetId: string): {
  running: number;
  infinite: number;
} {
  const root = document.querySelector<HTMLElement>(
    `[data-draggable-window][data-widget-id="${widgetId}"]`
  );
  if (!root) throw new Error(`No window for ${widgetId}`);
  let running = 0;
  let infinite = 0;
  for (const a of document.getAnimations()) {
    const target = (a.effect as KeyframeEffect | null)?.target;
    if (!target || !root.contains(target) || a.playState !== 'running')
      continue;
    running++;
    if (a.effect?.getTiming().iterations === Infinity) infinite++;
  }
  return { running, infinite };
}

export function collectTheming(opts: {
  widgetId: string;
  gridCols: number;
  gridRows: number;
}): Theming {
  const root = document.querySelector<HTMLElement>(
    `[data-draggable-window][data-widget-id="${opts.widgetId}"]`
  );
  const board = document.querySelector<HTMLElement>('[data-grader-board]');
  if (!root || !board) throw new Error(`No window for ${opts.widgetId}`);
  const alpha = (c: string): number => {
    if (c === 'transparent') return 0;
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return 1;
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    return parts.length > 3 ? Number(parts[3]) : 1;
  };
  const opaque = (el: Element): boolean => {
    const s = getComputedStyle(el);
    return (
      alpha(s.backgroundColor) >= 0.95 ||
      (s.backgroundImage !== 'none' && !s.backgroundImage.includes('rgba'))
    );
  };
  const r = root.getBoundingClientRect();
  let samples = 0;
  let covered = 0;
  for (let i = 0; i < opts.gridCols; i++) {
    for (let j = 0; j < opts.gridRows; j++) {
      const x = r.left + ((i + 0.5) * r.width) / opts.gridCols;
      const y = r.top + ((j + 0.5) * r.height) / opts.gridRows;
      if (x >= window.innerWidth || y >= window.innerHeight) continue;
      samples++;
      for (const el of document.elementsFromPoint(x, y)) {
        if (el === root || !root.contains(el)) break;
        if (opaque(el)) {
          covered++;
          break;
        }
      }
    }
  }
  const boardFont = getComputedStyle(board).fontFamily;
  let texts = 0;
  let matching = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const parent = n.parentElement;
    if (!parent || !(n.textContent ?? '').trim()) continue;
    if (parent.closest('svg')) continue;
    texts++;
    if (getComputedStyle(parent).fontFamily === boardFont) matching++;
  }
  const cardRadius = parseFloat(getComputedStyle(root).borderTopLeftRadius);
  let radiusMismatches = 0;
  const EDGE = 2;
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
    if (!opaque(el)) continue;
    const b = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    const corners: [boolean, string][] = [
      [b.left - r.left <= EDGE && b.top - r.top <= EDGE, s.borderTopLeftRadius],
      [
        r.right - b.right <= EDGE && b.top - r.top <= EDGE,
        s.borderTopRightRadius,
      ],
      [
        b.left - r.left <= EDGE && r.bottom - b.bottom <= EDGE,
        s.borderBottomLeftRadius,
      ],
      [
        r.right - b.right <= EDGE && r.bottom - b.bottom <= EDGE,
        s.borderBottomRightRadius,
      ],
    ];
    if (
      corners.some(
        ([touches, radius]) =>
          touches && Math.abs(parseFloat(radius) - cardRadius) > 1
      )
    )
      radiusMismatches++;
  }
  return {
    opaqueFraction: samples ? covered / samples : 0,
    fontMatch: texts ? matching / texts : 1,
    textElements: texts,
    radiusMismatches,
  };
}

export function collectFaceState(opts: {
  widgetId: string;
  controlSelector: string;
}): FaceState {
  const root = document.querySelector<HTMLElement>(
    `[data-draggable-window][data-widget-id="${opts.widgetId}"]`
  );
  if (!root) throw new Error(`No window for ${opts.widgetId}`);
  const big = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width >= 20 && r.height >= 20;
  };
  return {
    text: root.innerText.replace(/\s+/g, ' ').trim(),
    controls: Array.from(root.querySelectorAll(opts.controlSelector)).filter(
      (el) => !el.closest('.resize-handle, [data-inner-edge-strip]') && big(el)
    ).length,
    media: Array.from(
      root.querySelectorAll('img, svg, canvas, video, iframe')
    ).filter(big).length,
    spinner: Array.from(root.querySelectorAll('.animate-spin')).some(big),
  };
}

/** A point on the card where a pointer-down starts a window drag. */
export function findDragPoint(opts: {
  widgetId: string;
  dragBlockingSelector: string;
}): { x: number; y: number } | null {
  const root = document.querySelector<HTMLElement>(
    `[data-draggable-window][data-widget-id="${opts.widgetId}"]`
  );
  if (!root) return null;
  const r = root.getBoundingClientRect();
  for (let j = 1; j < 10; j++) {
    for (let i = 1; i < 10; i++) {
      const x = r.left + (i * r.width) / 10;
      const y = r.top + (j * r.height) / 10;
      const hit = document.elementFromPoint(x, y);
      if (hit && root.contains(hit) && !hit.closest(opts.dragBlockingSelector))
        return { x, y };
    }
  }
  return null;
}

/** Settings controls the measurer can change, in the widget's settings panel. */
export function collectPanelControls(widgetId: string): PanelControl[] {
  const panel = document.querySelector<HTMLElement>(
    `[data-widget-portal][data-widget-id="${widgetId}"] .overflow-y-auto`
  );
  if (!panel) return [];
  const DESTRUCTIVE = /\b(delete|remove|clear|reset|trash|erase)\b/i;
  const all = Array.from(
    panel.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, [role="switch"], [role="radio"], [role="checkbox"]'
    )
  );
  const out: PanelControl[] = [];
  all.forEach((el, index) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    if ((el as HTMLInputElement).disabled) return;
    const labelled = el.id
      ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
      : null;
    const label = (
      el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      el.innerText ||
      labelled?.textContent ||
      el.closest('label')?.textContent ||
      el.getAttribute('placeholder') ||
      el.getAttribute('name') ||
      ''
    )
      .trim()
      .slice(0, 40);
    if (DESTRUCTIVE.test(label)) return;
    const role = el.getAttribute('role');
    const type = (el as HTMLInputElement).type;
    let kind: PanelControl['kind'] | null = null;
    if (role === 'switch' || role === 'checkbox' || type === 'checkbox')
      kind = 'toggle';
    else if (role === 'radio' || type === 'radio') {
      // Picking the option already chosen changes nothing.
      const checked =
        el.getAttribute('aria-checked') === 'true' ||
        (el as HTMLInputElement).checked;
      if (checked) return;
      kind = 'radio';
    } else if (el.tagName === 'SELECT') kind = 'select';
    else if (type === 'range') kind = 'range';
    else if (type === 'number') kind = 'number';
    else if (
      el.tagName === 'TEXTAREA' ||
      (el.tagName === 'INPUT' && type === 'text')
    )
      kind = 'text';
    else if (el.hasAttribute('aria-pressed')) kind = 'pressed';
    if (kind) out.push({ index, kind, label });
  });
  return out;
}

export function collectDestructive(opts: {
  widgetId: string;
  controlSelector: string;
}): Destructive[] {
  const root = document.querySelector<HTMLElement>(
    `[data-draggable-window][data-widget-id="${opts.widgetId}"]`
  );
  if (!root) return [];
  const DESTRUCTIVE = /\b(delete|remove|clear|reset|trash|erase)\b/i;
  const out: Destructive[] = [];
  Array.from(root.querySelectorAll<HTMLElement>(opts.controlSelector)).forEach(
    (el, index) => {
      if (el.closest('.resize-handle, [data-inner-edge-strip]')) return;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      const label = [
        el.getAttribute('aria-label'),
        el.getAttribute('title'),
        el.innerText,
      ]
        .filter(Boolean)
        .join(' ')
        .trim();
      if (DESTRUCTIVE.test(label))
        out.push({ index, label: label.slice(0, 40) });
    }
  );
  return out;
}
