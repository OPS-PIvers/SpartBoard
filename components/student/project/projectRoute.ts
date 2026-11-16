/** `/project/:runId` — the student entry point `/my-assignments` links to. */
export const PROJECT_ROUTE_PREFIX = '/project/';

export const projectHref = (runId: string): string =>
  `${PROJECT_ROUTE_PREFIX}${encodeURIComponent(runId)}`;

/** Null when the path carries no run id, which the page renders as "not found". */
export function parseProjectRunId(pathname: string): string | null {
  if (!pathname.startsWith(PROJECT_ROUTE_PREFIX)) return null;
  const raw = pathname.slice(PROJECT_ROUTE_PREFIX.length).split('/')[0] ?? '';
  if (!raw) return null;
  try {
    return decodeURIComponent(raw) || null;
  } catch {
    // A malformed escape is a bad link, not a crash.
    return null;
  }
}

/** Where Done goes: the `/my-assignments` page the student came from, else its top. */
export function projectBackHref(referrer: string, origin: string): string {
  try {
    const url = new URL(referrer);
    if (url.origin === origin && /^\/my-assignments(\/|$)/.test(url.pathname)) {
      return url.pathname;
    }
  } catch {
    // No or malformed referrer.
  }
  return '/my-assignments';
}
