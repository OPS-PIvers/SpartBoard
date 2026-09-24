/** What a reload needs to offer the teacher their tour back. */
export interface SavedTour {
  setId: string;
  index: number;
  addedIds: string[];
  /** A Studio test run of the unpublished draft. */
  draft?: boolean;
}

export const SAVED_TOUR_KEY = 'spart:live-tour';

const isSavedTour = (v: unknown): v is SavedTour => {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.setId === 'string' &&
    o.setId.length > 0 &&
    typeof o.index === 'number' &&
    Number.isInteger(o.index) &&
    o.index >= 0 &&
    Array.isArray(o.addedIds) &&
    o.addedIds.every((id) => typeof id === 'string') &&
    (o.draft === undefined || typeof o.draft === 'boolean')
  );
};

/** The tour a reload interrupted, or null when storage is empty, blocked or corrupt. */
export function readSavedTour(): SavedTour | null {
  try {
    const raw = window.sessionStorage.getItem(SAVED_TOUR_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isSavedTour(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeSavedTour(tour: SavedTour): void {
  try {
    window.sessionStorage.setItem(SAVED_TOUR_KEY, JSON.stringify(tour));
  } catch {
    // Without storage a reload just ends the tour.
  }
}

export function clearSavedTour(): void {
  try {
    window.sessionStorage.removeItem(SAVED_TOUR_KEY);
  } catch {
    // Nothing to clear when storage is blocked.
  }
}
