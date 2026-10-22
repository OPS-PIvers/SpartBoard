const TOUR_PATH = '/tour/';

/** The set id in a `/tour/{setId}` path, or null when the path is not one. */
export function parseTourPath(pathname: string): string | null {
  if (!pathname.startsWith(TOUR_PATH)) return null;
  const id = pathname.slice(TOUR_PATH.length).split('/')[0];
  return /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : null;
}

export function buildTourUrl(setId: string): string {
  return `${window.location.origin}${TOUR_PATH}${encodeURIComponent(setId)}`;
}

// One /r/ code per tour so every copy of its link adds to the same click count.
export function tourShortLinkCode(setId: string): string {
  return `tour-${setId.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.slice(0, 32);
}
