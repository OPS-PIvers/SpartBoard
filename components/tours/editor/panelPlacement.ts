import type { TourEditPlayback } from './tourEditStore';

export const PANEL_WIDTH = 320;
export const RAIL_WIDTH = 52;
export const PANEL_EDGE = 12;
export const TOUR_EDITOR_SIDE_KEY = 'spart_tour_editor_side';
export const TOUR_EDITOR_COLLAPSED_KEY = 'spart_tour_editor_collapsed';

export type Side = 'left' | 'right';

export const readStored = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
export const writeStored = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the panel just forgets its place.
  }
};

/** The side the panel sits on: the remembered one, unless the step's control is under it. */
export const panelSide = (
  preferred: Side,
  rect: TourEditPlayback['rect'],
  viewportWidth: number,
  width: number
): Side => {
  if (!rect) return preferred;
  const span = width + PANEL_EDGE * 2;
  const under =
    preferred === 'right'
      ? rect.x + rect.w > viewportWidth - span
      : rect.x < span;
  return under ? (preferred === 'right' ? 'left' : 'right') : preferred;
};
