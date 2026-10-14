import {
  TOUR_SURFACES,
  type TourSurfaceDef,
  type TourSurfaceKind,
  type TourSurfaceNeed,
} from './tourSurfaces';
import { TOUR_ANCHOR_SURFACES } from './tourAnchorSurfaces.generated';
import { parseTourAnchorRef } from './tourAnchors';

export interface TourAnchorRoute {
  surface: string;
  kind: TourSurfaceKind;
  label: string;
  widgetType?: string;
  url?: string;
  /** Anchor refs to click, in order, from the board to a state where this anchor shows. */
  path: string[];
  needs: TourSurfaceNeed[];
}

const MAX_DEPTH = 12;

type AnchorSurfaces = Readonly<Record<string, readonly string[]>>;

/** The surface an opener anchor is clicked on: the explicit parent, or the opener's only surface. */
export function openerSurface(
  def: TourSurfaceDef,
  anchorSurfaces: AnchorSurfaces = TOUR_ANCHOR_SURFACES
): string | undefined {
  if (!def.opensWith) return undefined;
  if (def.parent) return def.parent;
  const on = anchorSurfaces[parseTourAnchorRef(def.opensWith).id];
  return on?.length === 1 ? on[0] : undefined;
}

/** Clicks from the board that open `surfaceId`, or null when the chain is broken or loops. */
export function surfacePath(
  surfaceId: string,
  anchorSurfaces: AnchorSurfaces = TOUR_ANCHOR_SURFACES
): {
  path: string[];
  needs: TourSurfaceNeed[];
} | null {
  const path: string[] = [];
  const needs = new Set<TourSurfaceNeed>();
  const seen = new Set<string>();
  let id: string | undefined = surfaceId;
  while (id) {
    if (seen.has(id) || seen.size > MAX_DEPTH) return null;
    seen.add(id);
    const def: TourSurfaceDef | undefined = TOUR_SURFACES[id];
    if (!def) return null;
    def.needs?.forEach((n) => needs.add(n));
    if (def.openerMissing) return null;
    if (!def.opensWith) break;
    path.unshift(def.opensWith);
    id = openerSurface(def, anchorSurfaces);
    if (!id) return null;
    // An opener hidden behind a tab or menu on its own surface needs that click first.
    const reveal =
      TOUR_SURFACES[id]?.inner?.[parseTourAnchorRef(def.opensWith).id];
    if (reveal) path.unshift(reveal);
  }
  return { path, needs: [...needs] };
}

/** Every way to reach an anchor: one route per surface it renders on. */
export function tourAnchorRoutes(ref: string): TourAnchorRoute[] {
  const { id } = parseTourAnchorRef(ref);
  return (TOUR_ANCHOR_SURFACES[id] ?? []).flatMap((surface) => {
    const def = TOUR_SURFACES[surface];
    const reach = def ? surfacePath(surface) : null;
    if (!def || !reach) return [];
    const inner = def.inner?.[id];
    return [
      {
        surface,
        kind: def.kind,
        label: def.label,
        ...(def.widgetType ? { widgetType: def.widgetType } : {}),
        ...(def.url ? { url: def.url } : {}),
        path: inner ? [...reach.path, inner] : reach.path,
        needs: reach.needs,
      },
    ];
  });
}
