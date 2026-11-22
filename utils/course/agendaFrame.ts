// Sizes an Agenda deck's frame to the deck's own slide shape, so Google draws no black bars.
import type { CSSProperties } from 'react';
import { cleanAgendaAspect, type CourseAgenda } from './contract';

export const DEFAULT_AGENDA_ASPECT = 16 / 9;
// Google's /preview viewer insets the slide 1px on every side above a 36px page bar.
const PREVIEW_CHROME_PX = 38;
const PREVIEW_INSET_PX = 2;

/** The deck's width over height, or 16:9 when it was never read. */
export function agendaAspect(
  agenda: Pick<CourseAgenda, 'aspect'> | null | undefined
): number {
  return cleanAgendaAspect(agenda?.aspect) ?? DEFAULT_AGENDA_ASPECT;
}

/** Style for a /preview iframe inside a `container-type: inline-size` box. */
export function previewFrameStyle(aspect: number): CSSProperties {
  return {
    height: `calc((100cqw - ${PREVIEW_INSET_PX}px) / ${aspect} + ${PREVIEW_CHROME_PX}px)`,
  };
}

/** Width cap for the /preview box so a tall deck's frame stays within 85% of the screen height. */
export function previewBoxMaxWidth(aspect: number): string {
  return `calc((85vh - ${PREVIEW_CHROME_PX}px) * ${aspect} + ${PREVIEW_INSET_PX}px)`;
}

/** Width over height from a Slides API pageSize, or null. */
export function aspectFromPageSize(pageSize: unknown): number | null {
  if (!pageSize || typeof pageSize !== 'object') return null;
  const size = pageSize as {
    width?: { magnitude?: unknown };
    height?: { magnitude?: unknown };
  };
  const w = size.width?.magnitude;
  const h = size.height?.magnitude;
  if (typeof w !== 'number' || typeof h !== 'number' || h <= 0) return null;
  return cleanAgendaAspect(w / h);
}

/** True when a newly read shape differs enough from the saved one to be worth saving. */
export function aspectChanged(
  saved: number | undefined,
  next: number
): boolean {
  return saved === undefined || Math.abs(saved - next) > 0.002;
}
