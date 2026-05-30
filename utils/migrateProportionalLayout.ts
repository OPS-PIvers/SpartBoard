import type { Dashboard, WidgetData } from '@/types';
import {
  REFERENCE_VIEWPORT,
  computeWidgetPixelRect,
  getSafeViewport,
  pixelToProp,
} from './proportionalLayout';

/**
 * Detect dashboards that still store widget bounds as pixels (pre-proportional
 * layout). A widget is considered "pre-migration" when it lacks proportional
 * fields, OR when its w field is unmistakably a pixel value (>1.5).
 */
export const widgetNeedsProportionalMigration = (w: WidgetData): boolean => {
  if (typeof w.aspectRatio !== 'number') return true;
  if (typeof w.wProp !== 'number') return true;
  if (typeof w.hProp !== 'number') return true;
  if (typeof w.xProp !== 'number') return true;
  if (typeof w.yProp !== 'number') return true;
  // Defensive: any proportional field that is non-finite (NaN / Infinity) or
  // whose magnitude is unmistakably a pixel value (>1.5) means the
  // proportional fields were never populated correctly — re-derive from the
  // pixel x/y/w/h. xProp / yProp use Math.abs because widgets dragged past
  // the viewport edge can legitimately have a negative pixel coordinate, so
  // -150 must still be flagged as "not a proportion".
  if (
    !Number.isFinite(w.wProp) ||
    !Number.isFinite(w.hProp) ||
    !Number.isFinite(w.xProp) ||
    !Number.isFinite(w.yProp)
  ) {
    return true;
  }
  if (
    w.wProp > 1.5 ||
    w.hProp > 1.5 ||
    Math.abs(w.xProp) > 1.5 ||
    Math.abs(w.yProp) > 1.5
  ) {
    return true;
  }
  // aspectRatio must be a positive, finite number. NaN, Infinity, zero, or a
  // negative value all cause computeWidgetPixelRect to silently skip
  // fitAspectInside, degrading 'preserve-aspect' widgets to 'fill' behaviour
  // and distorting their shape on viewport-aspect-ratio changes.
  if (!Number.isFinite(w.aspectRatio) || w.aspectRatio <= 0) {
    return true;
  }
  return false;
};

export const dashboardNeedsProportionalMigration = (d: Dashboard): boolean =>
  d.widgets.some(widgetNeedsProportionalMigration);

/**
 * Compute proportional fields for a single widget from its pre-migration
 * pixel bounds and the dashboard's saved viewport. Falls back to the
 * reference viewport when the saved viewport is missing or unreasonably
 * small (< 300px in either dimension — almost certainly corrupted).
 */
export const migrateWidgetToProportional = (
  widget: WidgetData,
  savedViewportW: number | undefined,
  savedViewportH: number | undefined
): WidgetData => {
  // Guard against zero/NaN pixel values from corrupted data — fall through
  // to a reasonable default so the widget is still usable after migration.
  const pixelW = widget.w > 0 && Number.isFinite(widget.w) ? widget.w : 200;
  const pixelH = widget.h > 0 && Number.isFinite(widget.h) ? widget.h : 200;

  // Targeted repair: if the four proportional fields are already valid and
  // migration was triggered solely by a corrupt aspectRatio, preserve the
  // existing canonical proportions and only re-derive the aspectRatio.
  // Recomputing proportions from pixel values here would risk layout drift —
  // when the saved viewport is missing/untrusted we fall back to
  // REFERENCE_VIEWPORT, producing wrong proportions for a widget that was
  // originally authored on a different-sized viewport.
  const proportionsValid =
    Number.isFinite(widget.xProp) &&
    Number.isFinite(widget.yProp) &&
    Number.isFinite(widget.wProp) &&
    Number.isFinite(widget.hProp);
  if (proportionsValid) {
    return {
      ...widget,
      aspectRatio: pixelW / pixelH,
    };
  }

  const vpW =
    typeof savedViewportW === 'number' && savedViewportW >= 300
      ? savedViewportW
      : REFERENCE_VIEWPORT.w;
  const vpH =
    typeof savedViewportH === 'number' && savedViewportH >= 300
      ? savedViewportH
      : REFERENCE_VIEWPORT.h;

  const pixelX = Number.isFinite(widget.x) ? widget.x : 0;
  const pixelY = Number.isFinite(widget.y) ? widget.y : 0;

  const prop = pixelToProp(
    { x: pixelX, y: pixelY, w: pixelW, h: pixelH },
    vpW,
    vpH
  );

  return {
    ...widget,
    xProp: prop.xProp,
    yProp: prop.yProp,
    wProp: prop.wProp,
    hProp: prop.hProp,
    aspectRatio: pixelW / pixelH,
  };
};

/**
 * Migrate every widget on a dashboard. Idempotent — already-migrated widgets
 * are returned unchanged. Returns a new array reference only when at least
 * one widget needed migration; identical-reference returns let consumers
 * skip re-renders cheaply.
 */
export const migrateDashboardWidgets = (
  widgets: WidgetData[],
  savedViewportW: number | undefined,
  savedViewportH: number | undefined
): WidgetData[] => {
  let changed = false;
  const out = widgets.map((w) => {
    if (!widgetNeedsProportionalMigration(w)) return w;
    changed = true;
    return migrateWidgetToProportional(w, savedViewportW, savedViewportH);
  });
  return changed ? out : widgets;
};

/**
 * Compute pixel x/y/w/h for a widget at the current viewport, using its
 * proportional fields (canonical) and aspect ratio. Used to hydrate widgets
 * after they enter React state so widget components can keep reading
 * widget.w / widget.h as pixels.
 *
 * If proportional fields are missing (legacy widget that hasn't been migrated
 * yet), this is a no-op — the existing pixel fields are kept.
 */
export const hydrateWidgetPixels = (
  widget: WidgetData,
  vpW: number,
  vpH: number,
  stretchBehavior: 'fill' | 'preserve-aspect' = 'preserve-aspect'
): WidgetData => {
  if (
    typeof widget.xProp !== 'number' ||
    typeof widget.yProp !== 'number' ||
    typeof widget.wProp !== 'number' ||
    typeof widget.hProp !== 'number'
  ) {
    return widget;
  }
  const rect = computeWidgetPixelRect(
    {
      xProp: widget.xProp,
      yProp: widget.yProp,
      wProp: widget.wProp,
      hProp: widget.hProp,
      aspectRatio: widget.aspectRatio,
    },
    vpW,
    vpH,
    stretchBehavior
  );
  if (
    rect.x === widget.x &&
    rect.y === widget.y &&
    rect.w === widget.w &&
    rect.h === widget.h
  ) {
    return widget;
  }
  return { ...widget, x: rect.x, y: rect.y, w: rect.w, h: rect.h };
};

/** Convenience: padding constant exported for migration consumers. */
export { getSafeViewport };
