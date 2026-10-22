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

/** The host a web tour starts on, for its badge; null when the first step's address has a wildcard host. */
export function webTourSite(set: {
  steps: readonly { web?: { urlPattern: string } }[];
}): string | null {
  const pattern = set.steps.find((s) => s.web)?.web?.urlPattern;
  const host = pattern ? /^https:\/\/([^/?#:]+)/.exec(pattern)?.[1] : null;
  return host && !host.includes('*') ? host : null;
}

/** The board's query parameter that opens a web tour draft in the editor. */
export const EDIT_WEB_TOUR_PARAM = 'edit-web-tour';
