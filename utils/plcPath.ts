/**
 * PLC route-path parsing + building (PRD §2.1, Decision 0.3).
 *
 * `App.tsx` does manual `window.location.pathname` routing (no react-router),
 * so the PLC routes are parsed here. The grammar:
 *
 *   /plc                              → index hub        { plcId: null }
 *   /plc/:plcId                       → dashboard (home) { plcId, section: 'home' }
 *   /plc/:plcId/:section              → a section        { plcId, section }
 *   /plc/:plcId/meeting              → Meeting Mode     { plcId, section: 'meeting' }
 *   /plc/:plcId/meeting/:meetingId   → a meeting record { plcId, section: 'meeting', meetingId }
 *
 * Section is validated against the router-accepted token set via
 * `isPlcRouteSection`, then normalised to a canonical `PlcSectionId` via
 * `resolvePlcSection` (so legacy aliases like `quizzes` / `videoActivities`
 * rewrite to `assessments`). An unknown section falls back to `'home'` (never
 * throws — a bad deep link lands the user on the PLC home rather than a blank
 * screen).
 */

import {
  isPlcRouteSection,
  resolvePlcSection,
  type PlcSectionId,
} from '@/components/plc/sections';

export interface ParsedPlcPath {
  /** The PLC id from the path, or `null` for the bare `/plc` index hub. */
  plcId: string | null;
  /** The active section. Defaults to `'home'`; unknown sections coerce to `'home'`. */
  section: PlcSectionId;
  /** A specific meeting record id, only present on `/plc/:id/meeting/:meetingId`. */
  meetingId: string | null;
}

/** True when `pathname` is any route this module owns (`/plc` or under it). */
export function isPlcRoute(pathname: string): boolean {
  return pathname === '/plc' || pathname.startsWith('/plc/');
}

/**
 * Parse a `/plc...` pathname into `{ plcId, section, meetingId }`.
 *
 * Tolerant: trailing slashes, empty segments, and an unknown section id are all
 * normalised rather than rejected. Returns `{ plcId: null, section: 'home',
 * meetingId: null }` for the bare `/plc` index hub or any non-PLC path.
 */
export function parsePlcPath(pathname: string): ParsedPlcPath {
  const fallback: ParsedPlcPath = {
    plcId: null,
    section: 'home',
    meetingId: null,
  };
  if (!isPlcRoute(pathname)) return fallback;

  // Drop the leading "/plc", then split the remainder into non-empty segments.
  // `/plc` → []; `/plc/abc/data` → ['abc', 'data']; trailing slashes vanish.
  const segments = pathname
    .replace(/^\/plc/, '')
    .split('/')
    .filter((s) => s.length > 0)
    .map((s) => decodeURIComponent(s));

  const plcId = segments[0] ?? null;
  if (!plcId) return fallback;

  // Validate against the router-accepted token set (canonical ids + legacy
  // aliases), then collapse aliases to their canonical section. `quizzes` and
  // `videoActivities` therefore both resolve to `assessments` so old deep
  // links never 404.
  const rawSection = segments[1];
  const section: PlcSectionId =
    rawSection !== undefined && isPlcRouteSection(rawSection)
      ? resolvePlcSection(rawSection)
      : 'home';

  // Only `/plc/:id/meeting/:meetingId` carries a meeting id. We accept it
  // regardless of whether the section coerced (defensive) but only when the
  // raw second segment was literally "meeting" — a meeting id under any other
  // section makes no sense and is ignored.
  const meetingId =
    rawSection === 'meeting' && segments[2] ? segments[2] : null;

  return { plcId, section, meetingId };
}

/**
 * Custom event the SPA dispatches after a `history.pushState`/`replaceState`
 * so the manual pathname router in `App.tsx` re-renders (a programmatic
 * `pushState` does NOT fire `popstate`). Browser back/forward still fire the
 * native `popstate`; the router listens for both.
 */
export const SPA_NAVIGATE_EVENT = 'spa:navigate';

/**
 * SPA-navigate to `path`: push it onto history and notify the router. Use for
 * forward navigation (clicking a PLC, switching sections) so back/forward work.
 */
export function spaNavigate(path: string): void {
  if (typeof window === 'undefined') return;
  window.history.pushState(null, '', path);
  window.dispatchEvent(new Event(SPA_NAVIGATE_EVENT));
}

/**
 * SPA-navigate to `path` without growing the history stack (replace). Used when
 * normalising a URL (e.g. coercing an unknown section to its canonical form)
 * so the bad URL doesn't become a back-button trap.
 */
export function spaReplace(path: string): void {
  if (typeof window === 'undefined') return;
  window.history.replaceState(null, '', path);
  window.dispatchEvent(new Event(SPA_NAVIGATE_EVENT));
}

/**
 * Build a canonical `/plc...` pathname from its parts. Inverse of
 * `parsePlcPath` (round-trips for all valid inputs). `home` collapses to the
 * bare `/plc/:plcId` form so the default section produces the shortest URL.
 */
export function buildPlcPath(
  plcId: string,
  section: PlcSectionId = 'home',
  meetingId?: string | null
): string {
  const id = encodeURIComponent(plcId);
  if (section === 'home') return `/plc/${id}`;
  if (section === 'meeting' && meetingId) {
    return `/plc/${id}/meeting/${encodeURIComponent(meetingId)}`;
  }
  return `/plc/${id}/${section}`;
}
