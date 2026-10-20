// Below this tile edge a label cannot be read, so the links switch to a list.
export const MIN_TILE_PX = 64;
// Narrowest list column before the list splits into another column.
export const LIST_COLUMN_PX = 110;

export type LinkLayout =
  { mode: 'tiles'; rows: number[] } | { mode: 'list'; columns: number };

const fallbackCols = (count: number): number => {
  if (count <= 2) return count;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  if (count <= 16) return 4;
  return 5;
};

/** Splits `count` tiles into `rowCount` rows whose sizes differ by at most one, longest rows first. */
export function balancedRows(count: number, rowCount: number): number[] {
  const base = Math.floor(count / rowCount);
  const extra = count % rowCount;
  return Array.from({ length: rowCount }, (_, i) =>
    i < extra ? base + 1 : base
  );
}

/** Picks the tile grid whose smallest tile is largest for this box, or a list when every grid is too small. */
export function pickLinkLayout(
  count: number,
  width: number,
  height: number,
  gap: number
): LinkLayout {
  if (count <= 0) return { mode: 'tiles', rows: [] };
  if (width <= 0 || height <= 0) {
    const cols = fallbackCols(count);
    return {
      mode: 'tiles',
      rows: balancedRows(count, Math.ceil(count / cols)),
    };
  }
  let bestRows = 1;
  let bestEdge = -1;
  for (let rowCount = 1; rowCount <= count; rowCount++) {
    const widest = Math.ceil(count / rowCount);
    const tileW = (width - gap * (widest - 1)) / widest;
    const tileH = (height - gap * (rowCount - 1)) / rowCount;
    const edge = Math.min(tileW, tileH);
    if (edge > bestEdge) {
      bestEdge = edge;
      bestRows = rowCount;
    }
  }
  if (bestEdge < MIN_TILE_PX) {
    return {
      mode: 'list',
      columns: Math.max(1, Math.floor(width / LIST_COLUMN_PX)),
    };
  }
  return { mode: 'tiles', rows: balancedRows(count, bestRows) };
}
