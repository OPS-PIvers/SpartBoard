import type { PlcBentoTileSize } from '@/types';

/**
 * CSS-grid span values for each tile size variant. Keyed by `PlcBentoTileSize`
 * so adding a new size = one entry here + a new union member in `types.ts`.
 *
 * The grid container is `grid-cols-4` (4 columns of equal width) with
 * `auto-rows-[180px]` (each row 180px tall, plus 16px gap). On viewport
 * `< 768px` the grid collapses to 1 column and these spans are ignored
 * — every tile becomes natural-height, ordered by user preference.
 */
export const TILE_GRID_SPANS: Record<
  PlcBentoTileSize,
  { col: number; row: number }
> = {
  sm: { col: 1, row: 1 },
  'md-wide': { col: 2, row: 1 },
  'md-tall': { col: 1, row: 2 },
  lg: { col: 2, row: 2 },
};

/**
 * Cycle order for the resize button. Click cycles through these in order.
 */
export const SIZE_CYCLE: readonly PlcBentoTileSize[] = [
  'sm',
  'md-wide',
  'md-tall',
  'lg',
] as const;

export function nextSize(current: PlcBentoTileSize): PlcBentoTileSize {
  const idx = SIZE_CYCLE.indexOf(current);
  if (idx === -1) return 'sm';
  return SIZE_CYCLE[(idx + 1) % SIZE_CYCLE.length] ?? 'sm';
}
