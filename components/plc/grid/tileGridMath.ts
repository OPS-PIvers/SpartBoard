import type { PlcBentoTile, PlcBentoTileSize, PlcGridCoords } from '@/types';

/**
 * Math + migration helpers for the v2 PLC overview grid.
 *
 * The grid is 12 columns wide. Tiles occupy `{x, y, w, h}` in grid cells.
 * Row height ≈ column width on most viewports; the exact pixel size is
 * computed at render time by `PlcGridLayout` via `ResizeObserver` on the
 * grid container.
 *
 * Coords are persisted as integers — no fractional cells. All public
 * helpers here normalize/clamp so client code can treat any incoming
 * `PlcGridCoords` as already valid.
 */

/** Grid column count (matches the rule-side validator). */
export const GRID_COLS = 12;
/** Minimum tile width (cells). Prevents tiles from collapsing to a sliver. */
export const GRID_MIN_W = 2;
/** Minimum tile height (cells). */
export const GRID_MIN_H = 2;
/**
 * Upper bound on `y`. The rule mirror is 99 — tiles further down than that
 * would be off-screen on any realistic viewport. Bin-packer never hits this.
 */
export const GRID_MAX_Y = 99;
/** Upper bound on `h`. Same intuition as MAX_Y. */
export const GRID_MAX_H = 24;

/**
 * Legacy v1 size → v2 coords mapping. Width × height in 12-col cells. The
 * derived widths/heights preserve the visual proportion the user had under
 * v1 (sm = 3×2, md-wide = 6×2, md-tall = 3×4, lg = 6×4).
 */
const LEGACY_SIZE_SPAN: Record<PlcBentoTileSize, { w: number; h: number }> = {
  sm: { w: 3, h: 2 },
  'md-wide': { w: 6, h: 2 },
  'md-tall': { w: 3, h: 4 },
  lg: { w: 6, h: 4 },
};

export function spanForLegacySize(size: PlcBentoTileSize): {
  w: number;
  h: number;
} {
  return LEGACY_SIZE_SPAN[size];
}

/**
 * Clamp incoming coords into the grid's legal range. Used as a defensive
 * normalizer on every read AND right before persistence. Negative or NaN
 * inputs are coerced to the nearest valid integer.
 */
export function clampCoords(raw: PlcGridCoords): PlcGridCoords {
  const x = clampInt(raw.x, 0, GRID_COLS - GRID_MIN_W);
  const w = clampInt(raw.w, GRID_MIN_W, GRID_COLS - x);
  const y = clampInt(raw.y, 0, GRID_MAX_Y);
  const h = clampInt(raw.h, GRID_MIN_H, GRID_MAX_H);
  return { x, y, w, h };
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const rounded = Math.round(value);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

/**
 * Bin-pack tiles into the grid in array order. Each tile claims the
 * top-most/left-most slot of its `w × h` size that doesn't overlap a
 * previously placed tile. Used to derive coords for legacy v1 layouts
 * (no `coords`) and as the collision resolver after a drag/resize commit.
 *
 * `seed` lets callers pin specific tiles (the one currently being
 * resized/dragged); seeded coords are placed first and the rest of the
 * tiles flow around them.
 */
export function packTiles(
  tiles: PlcBentoTile[],
  seed?: Map<string, PlcGridCoords>
): PlcBentoTile[] {
  const occupied = new Set<string>();
  const result: PlcBentoTile[] = [];

  // First pass: place seeded tiles at their pinned coords.
  for (const tile of tiles) {
    const seeded = seed?.get(tile.kind);
    if (!seeded) continue;
    const coords = clampCoords(seeded);
    markOccupied(occupied, coords);
    result.push({ ...tile, coords });
  }

  // Second pass: place the rest in array order at the first free slot.
  for (const tile of tiles) {
    if (seed?.has(tile.kind)) continue;
    const desired = tile.coords ?? deriveCoordsFromLegacy(tile);
    const placed = findFreeSlot(occupied, desired.w, desired.h, desired);
    markOccupied(occupied, placed);
    result.push({ ...tile, coords: placed });
  }

  // Preserve original tile order in the output (`packTiles` is order-
  // preserving on input; the two-pass loop above can reorder seeded tiles
  // to the front, so we resort by the original index).
  const order = new Map<string, number>();
  tiles.forEach((t, i) => order.set(t.kind, i));
  result.sort((a, b) => (order.get(a.kind) ?? 0) - (order.get(b.kind) ?? 0));
  return result;
}

/**
 * Find the first row-major free slot of size `w × h` starting at the
 * preferred coords (`prefer.x, prefer.y`). Scans top-to-bottom, left-to-
 * right. Used by `packTiles` for incremental placement.
 */
function findFreeSlot(
  occupied: Set<string>,
  w: number,
  h: number,
  prefer: PlcGridCoords
): PlcGridCoords {
  const clampedW = Math.min(Math.max(w, GRID_MIN_W), GRID_COLS);
  const clampedH = Math.min(Math.max(h, GRID_MIN_H), GRID_MAX_H);

  // Try the preferred coords first if they fit and are free.
  if (
    prefer.x + clampedW <= GRID_COLS &&
    prefer.y >= 0 &&
    isRegionFree(occupied, prefer.x, prefer.y, clampedW, clampedH)
  ) {
    return { x: prefer.x, y: prefer.y, w: clampedW, h: clampedH };
  }

  // Fall back to row-major scan.
  for (let y = 0; y <= GRID_MAX_Y; y++) {
    for (let x = 0; x <= GRID_COLS - clampedW; x++) {
      if (isRegionFree(occupied, x, y, clampedW, clampedH)) {
        return { x, y, w: clampedW, h: clampedH };
      }
    }
  }

  // Pathological — shouldn't happen given MAX_Y but return something safe.
  return { x: 0, y: GRID_MAX_Y, w: clampedW, h: clampedH };
}

function isRegionFree(
  occupied: Set<string>,
  x: number,
  y: number,
  w: number,
  h: number
): boolean {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      if (occupied.has(cellKey(x + dx, y + dy))) return false;
    }
  }
  return true;
}

function markOccupied(occupied: Set<string>, c: PlcGridCoords): void {
  for (let dy = 0; dy < c.h; dy++) {
    for (let dx = 0; dx < c.w; dx++) {
      occupied.add(cellKey(c.x + dx, c.y + dy));
    }
  }
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * Derive v2 coords from a v1 tile that only has `size`. If neither is
 * present, fall back to a small (3×2) tile.
 */
export function deriveCoordsFromLegacy(tile: PlcBentoTile): PlcGridCoords {
  if (tile.coords) return clampCoords(tile.coords);
  const span = tile.size ? LEGACY_SIZE_SPAN[tile.size] : { w: 3, h: 2 };
  return { x: 0, y: 0, w: span.w, h: span.h };
}

/**
 * Apply a layout migration: ensure every tile has `coords`. Tiles already
 * carrying coords keep them (clamped to legal range); legacy tiles get
 * bin-packed in array order from their derived size.
 */
export function migrateLayoutToCoords(tiles: PlcBentoTile[]): PlcBentoTile[] {
  const allCoordsPresent = tiles.every((t) => t.coords);
  if (allCoordsPresent) {
    return tiles.map((t) => ({
      ...t,
      coords: clampCoords(t.coords ?? deriveCoordsFromLegacy(t)),
    }));
  }
  return packTiles(tiles);
}

/**
 * Resolve a single tile's new coords against the rest of the layout via
 * push-down: pin the moved/resized tile, then re-pack everything else.
 * Returns the new tiles list with all coords stamped.
 */
export function commitTileCoords(
  tiles: PlcBentoTile[],
  kind: string,
  next: PlcGridCoords
): PlcBentoTile[] {
  const seed = new Map<string, PlcGridCoords>();
  seed.set(kind, clampCoords(next));
  return packTiles(tiles, seed);
}
