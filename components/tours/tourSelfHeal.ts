// Self-heal (LIVE_TOUR_ONE_SHOT.md D4): reopens a missing step's panel by replaying the clicks on its route.
import {
  isCreatesAnchor,
  isDestructiveAnchor,
  isPersistsAnchor,
} from '@/config/tourAnchors';
import { dispatchAutoClick, waitFor } from './autopilot';
import {
  findTourAnchor,
  isAnchorReachable,
  type TourAnchorScope,
} from './resolveTourAnchor';

const OPEN_WAIT_MS = 2500;

/** The clicks still to make: from the deepest opener on screen to the end; null when none of the route shows. */
export function remainingClicks(
  path: readonly string[],
  visible: (ref: string) => boolean
): string[] | null {
  for (let i = path.length - 1; i >= 0; i--)
    if (visible(path[i])) return path.slice(i);
  return null;
}

const safeClicks = (clicks: readonly string[] | null): boolean =>
  !!clicks?.length &&
  !clicks.some(
    (c) => isDestructiveAnchor(c) || isPersistsAnchor(c) || isCreatesAnchor(c)
  );

/** Whether some route to the control can be walked from what is on screen now, so Take me back can be offered (TOURS_10X.md P5). */
export function canHeal(
  ref: string,
  routesOf: (ref: string) => readonly { path: readonly string[] }[],
  scope: TourAnchorScope
): boolean {
  const visible = (anchor: string) =>
    !!findTourAnchor({ anchor }, { ...scope, accept: isAnchorReachable });
  return routesOf(ref).some(({ path }) =>
    safeClicks(remainingClicks(path, visible))
  );
}

/** Replays the first route that can still be walked; true once the step's control shows. */
export async function healAnchor(
  ref: string,
  routesOf: (ref: string) => readonly { path: readonly string[] }[],
  scope: TourAnchorScope,
  signal: AbortSignal
): Promise<boolean> {
  const find = (anchor: string) =>
    findTourAnchor({ anchor }, { ...scope, accept: isAnchorReachable });
  const visible = (anchor: string) => !!find(anchor);
  for (const { path } of routesOf(ref)) {
    const clicks = remainingClicks(path, visible);
    // Openers only: a click that changes or removes something is never replayed.
    if (!clicks || !safeClicks(clicks)) continue;
    let reached = true;
    for (const [i, click] of clicks.entries()) {
      const el = find(click);
      if (!el || signal.aborted) return false;
      dispatchAutoClick(el);
      const next = clicks[i + 1] ?? ref;
      if (!(await waitFor(() => visible(next), OPEN_WAIT_MS, signal))) {
        reached = false;
        break;
      }
    }
    if (reached) return true;
  }
  return false;
}
