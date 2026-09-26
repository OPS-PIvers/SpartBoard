// Live-tour helpers for Playwright capture scripts; they mirror components/tours/resolveTourAnchor.ts.
import { loadTourAnchors } from './validate_gl_json.mjs';

// utils/layoutMath.ts SNAP_LAYOUT_CONSTANTS.PADDING: the board's gap from each screen edge.
const BOARD_PADDING = 16;
const round = (n) => Math.round(n * 10000) / 10000;
const quote = (value) => `"${value.replace(/["\\]/g, '\\$&')}"`;

let registry;
const anchors = async () => (registry ??= await loadTourAnchors());

/** The CSS selector the runner uses for a ref (`id`, `id:type` or `id:type#field`). */
export async function tourSelector(ref) {
  const { parseTourAnchorRef } = await anchors();
  const { id, widgetType, fieldKey } = parseTourAnchorRef(ref);
  return (
    `[data-tour=${quote(id)}]` +
    (widgetType ? `[data-tour-widget-type=${quote(widgetType)}]` : '') +
    (fieldKey ? `[data-tour-field=${quote(fieldKey)}]` : '')
  );
}

/** The ref for the tagged element at or around a locator, composed like tourAnchorRef(). */
export async function refFor(locator) {
  const { TOUR_ANCHORS } = await anchors();
  const tag = await locator.evaluate((el) => {
    const tagged = el.closest('[data-tour]');
    return tagged
      ? {
          id: tagged.getAttribute('data-tour'),
          widgetType: tagged.getAttribute('data-tour-widget-type'),
          fieldKey: tagged.getAttribute('data-tour-field'),
        }
      : null;
  });
  if (!tag) throw new Error('No data-tour element at or around this locator');
  const def = TOUR_ANCHORS[tag.id];
  if (!def) throw new Error(`data-tour="${tag.id}" is not in the registry`);
  const scoped = def.perWidget || def.perWidgetType || def.perField;
  if (!scoped || !tag.widgetType) return tag.id;
  return def.perField && tag.fieldKey
    ? `${tag.id}:${tag.widgetType}#${tag.fieldKey}`
    : `${tag.id}:${tag.widgetType}`;
}

/** Fails unless the ref resolves to a visible, clickable, on-screen element; returns its box. */
export async function checkAnchor(page, ref, { widgetId } = {}) {
  const selector = await tourSelector(ref);
  const found = await page.evaluate(
    ({ selector, widgetId }) => {
      const usable = (el) => {
        if (el.closest('[data-tour-ignore]')) return false;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return false;
        if (el.checkVisibility && !el.checkVisibility()) return false;
        if (getComputedStyle(el).pointerEvents === 'none') return false;
        let opacity = 1;
        for (let n = el; n; n = n.parentElement) {
          const o = parseFloat(getComputedStyle(n).opacity);
          if (!Number.isNaN(o)) opacity *= o;
          if (opacity <= 0.05) return false;
        }
        return (
          r.x + r.width > 0 &&
          r.y + r.height > 0 &&
          r.x < innerWidth &&
          r.y < innerHeight
        );
      };
      const matches = [...document.querySelectorAll(selector)].filter(usable);
      const el = widgetId
        ? matches.find((m) => m.getAttribute('data-tour-widget') === widgetId)
        : matches[0];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        count: matches.length,
        box: { x: r.x, y: r.y, width: r.width, height: r.height },
      };
    },
    { selector, widgetId }
  );
  if (!found) throw new Error(`Tour anchor "${ref}" is missing or not usable`);
  return found;
}

/** A widget window's layout as board fractions, the same math as pixelToProp(). */
export function layoutOf(box, viewport, slot, type) {
  const safeW = Math.max(1, viewport.width - BOARD_PADDING * 2);
  const safeH = Math.max(1, viewport.height - BOARD_PADDING * 2);
  return {
    slot,
    type,
    xProp: round((box.x - BOARD_PADDING) / safeW),
    yProp: round((box.y - BOARD_PADDING) / safeH),
    wProp: round(box.width / safeW),
    hProp: round(box.height / safeH),
  };
}

/** Measures the first widget window of a type on the board as a tour layout. */
export async function measureWidgetLayout(page, type, slot) {
  const { box } = await checkAnchor(page, `widget.window:${type}`);
  return layoutOf(box, page.viewportSize(), slot, type);
}
