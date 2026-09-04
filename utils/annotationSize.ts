import type { DrawableObject, WidgetData } from '@/types';
import { scrubWidgetsPII } from '@/utils/dashboardPII';
import { getWorldBounds } from '@/utils/zoomPanMath';

// The overlay shares the dashboard document, which Firestore caps at 1 MiB.
// Warn well before that and refuse new ink past a hard ceiling.
export const ANNOTATION_SOFT_LIMIT_BYTES = 300_000;
export const ANNOTATION_HARD_LIMIT_BYTES = 600_000;
// Ink and widgets live in the same doc, so they share one budget. Leaves
// headroom under 1 MiB for the rest of the board (name, background, settings).
export const DASHBOARD_DOC_BUDGET_BYTES = 850_000;
// Warn once the combined document nears that budget, whatever is filling it.
export const DASHBOARD_DOC_SOFT_LIMIT_BYTES = 680_000;

/** Serialized size of a value in UTF-8 bytes (what Firestore counts). */
export const estimateJsonBytes = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value ?? null)).length;

/** Serialized size of the overlay objects in UTF-8 bytes. */
export const estimateAnnotationBytes = (objects: DrawableObject[]): number =>
  estimateJsonBytes(objects);

/**
 * Serialized size of the widgets that share the annotation layer's document.
 * Measured scrubbed, because student PII never reaches the document we are
 * budgeting — an unscrubbed roster would inflate the estimate.
 */
export const estimateWidgetBytes = (
  widgets: WidgetData[] | undefined
): number => estimateJsonBytes(scrubWidgetsPII(widgets ?? []));

/**
 * Why a growing ink write was refused, or null when it is allowed. The two
 * ceilings are distinct on purpose: the annotation layer has its own cap so
 * ink can never crowd out the board, and the shared budget catches a board
 * whose widgets already fill the document.
 */
export type AnnotationCapReason = 'ink' | 'document';

export const getAnnotationCapReason = (
  inkBytes: number,
  widgetBytes: number
): AnnotationCapReason | null => {
  if (inkBytes > ANNOTATION_HARD_LIMIT_BYTES) return 'ink';
  if (inkBytes + widgetBytes > DASHBOARD_DOC_BUDGET_BYTES) return 'document';
  return null;
};

/**
 * Which "getting full" warning a growing ink write should raise, or null.
 * Ink is compared against its own soft limit — folding widget bytes into that
 * comparison fired the ink warning on the first stroke of a widget-heavy
 * board. The shared document has its own, larger threshold.
 */
export type AnnotationSoftWarning = 'ink' | 'document';

export const getAnnotationSoftWarning = (
  currentInkBytes: number,
  nextInkBytes: number,
  widgetBytes: number
): AnnotationSoftWarning | null => {
  if (
    nextInkBytes > ANNOTATION_SOFT_LIMIT_BYTES &&
    currentInkBytes <= ANNOTATION_SOFT_LIMIT_BYTES
  ) {
    return 'ink';
  }
  if (
    nextInkBytes + widgetBytes > DASHBOARD_DOC_SOFT_LIMIT_BYTES &&
    currentInkBytes + widgetBytes <= DASHBOARD_DOC_SOFT_LIMIT_BYTES
  ) {
    return 'document';
  }
  return null;
};

export interface AnnotationCanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The annotation canvas covers the whole world rect, not just the viewport:
 * inside `#dashboard-zoom-surface` at ZOOM_MIN the viewport shows the entire
 * world, so a viewport-sized canvas would leave the outer band un-inkable.
 */
export const getAnnotationWorldRect = (
  vw: number,
  vh: number
): AnnotationCanvasRect => {
  const b = getWorldBounds(vw, vh);
  return {
    left: b.minX,
    top: b.minY,
    width: b.maxX - b.minX,
    height: b.maxY - b.minY,
  };
};
