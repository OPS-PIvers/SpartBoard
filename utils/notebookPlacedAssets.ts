import { PlacedNotebookAsset } from '@/types';

/** Default placed-asset width, as a fraction of page width. */
export const DEFAULT_PLACED_ASSET_WIDTH_FRAC = 0.18;
/** Minimum / maximum placed-asset width fractions (keeps it grabbable + sane). */
export const MIN_PLACED_ASSET_WIDTH_FRAC = 0.04;
export const MAX_PLACED_ASSET_WIDTH_FRAC = 1;

export const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

export const clampWidthFrac = (n: number): number =>
  Math.min(
    MAX_PLACED_ASSET_WIDTH_FRAC,
    Math.max(MIN_PLACED_ASSET_WIDTH_FRAC, n)
  );

/**
 * Clamp a top-left position fraction so a `sizeFrac`-wide/tall asset stays
 * fully on the page (not just its origin corner). Width is used as the height
 * proxy too: only `wFrac` is stored, so we keep roughly-square assets bounded
 * on both axes rather than letting the right/bottom edge overflow.
 */
export const clampPosFrac = (n: number, sizeFrac: number): number =>
  Math.min(Math.max(0, 1 - sizeFrac), Math.max(0, n));

/** Placed assets belonging to a given notebook + page, in insertion order. */
export const assetsForPage = (
  all: PlacedNotebookAsset[],
  notebookId: string,
  page: number
): PlacedNotebookAsset[] =>
  all.filter((a) => a.notebookId === notebookId && a.page === page);

/**
 * Build a placed asset centered on a drop point. `xFrac`/`yFrac` are the drop
 * coordinates (page-relative); the asset is offset so its center lands there,
 * with both position and width clamped to stay on the page.
 */
export const createPlacedAsset = (params: {
  notebookId: string;
  page: number;
  url: string;
  xFrac: number;
  yFrac: number;
  wFrac?: number;
}): PlacedNotebookAsset => {
  const wFrac = clampWidthFrac(params.wFrac ?? DEFAULT_PLACED_ASSET_WIDTH_FRAC);
  return {
    id: crypto.randomUUID(),
    notebookId: params.notebookId,
    page: params.page,
    url: params.url,
    xFrac: clampPosFrac(params.xFrac - wFrac / 2, wFrac),
    yFrac: clampPosFrac(params.yFrac - wFrac / 2, wFrac),
    wFrac,
  };
};

export const updatePlacedAsset = (
  all: PlacedNotebookAsset[],
  id: string,
  patch: Partial<Pick<PlacedNotebookAsset, 'xFrac' | 'yFrac' | 'wFrac'>>
): PlacedNotebookAsset[] =>
  all.map((a) => {
    if (a.id !== id) return a;
    // Re-clamp position against the (possibly new) width so a move *or* a
    // resize near the edge can't push the asset off-page.
    const wFrac =
      patch.wFrac !== undefined ? clampWidthFrac(patch.wFrac) : a.wFrac;
    const xFrac = patch.xFrac ?? a.xFrac;
    const yFrac = patch.yFrac ?? a.yFrac;
    return {
      ...a,
      xFrac: clampPosFrac(xFrac, wFrac),
      yFrac: clampPosFrac(yFrac, wFrac),
      wFrac,
    };
  });

export const removePlacedAsset = (
  all: PlacedNotebookAsset[],
  id: string
): PlacedNotebookAsset[] => all.filter((a) => a.id !== id);
