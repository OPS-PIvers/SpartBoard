import { describe, expect, it } from 'vitest';
import type { PlcBentoTile, PlcGridCoords } from '@/types';
import {
  GRID_COLS,
  GRID_MIN_H,
  GRID_MIN_W,
  clampCoords,
  commitTileCoords,
  deriveCoordsFromLegacy,
  migrateLayoutToCoords,
  packTiles,
  spanForLegacySize,
} from '@/components/plc/grid/tileGridMath';

/**
 * Round-trip + invariant tests for the v1→v2 PLC overview layout migration.
 * The migration must:
 *   - preserve tile order
 *   - never overlap two tiles
 *   - keep coords inside the legal grid range
 *   - leave already-coords'd layouts essentially unchanged
 */
describe('plcLayoutMigration', () => {
  describe('spanForLegacySize', () => {
    it('maps every legacy size variant to a span', () => {
      expect(spanForLegacySize('sm')).toEqual({ w: 3, h: 2 });
      expect(spanForLegacySize('md-wide')).toEqual({ w: 6, h: 2 });
      expect(spanForLegacySize('md-tall')).toEqual({ w: 3, h: 4 });
      expect(spanForLegacySize('lg')).toEqual({ w: 6, h: 4 });
    });
  });

  describe('clampCoords', () => {
    it('clamps negative x/y to zero', () => {
      expect(clampCoords({ x: -5, y: -1, w: 3, h: 2 })).toEqual({
        x: 0,
        y: 0,
        w: 3,
        h: 2,
      });
    });

    it('clamps oversized w to fit the row', () => {
      expect(clampCoords({ x: 10, y: 0, w: 6, h: 2 })).toEqual({
        x: 10,
        y: 0,
        w: 2, // 12 cols - x:10 = 2
        h: 2,
      });
    });

    it('lifts w below GRID_MIN_W to the minimum', () => {
      const c = clampCoords({ x: 0, y: 0, w: 1, h: 1 });
      expect(c.w).toBe(GRID_MIN_W);
      expect(c.h).toBe(GRID_MIN_H);
    });

    it('rounds fractional inputs to integers', () => {
      expect(clampCoords({ x: 2.6, y: 1.4, w: 3.5, h: 2.5 })).toEqual({
        x: 3,
        y: 1,
        w: 4,
        h: 3,
      });
    });

    it('rejects NaN by coercing to the legal minimum', () => {
      expect(clampCoords({ x: NaN, y: NaN, w: NaN, h: NaN })).toEqual({
        x: 0,
        y: 0,
        w: GRID_MIN_W,
        h: GRID_MIN_H,
      });
    });
  });

  describe('deriveCoordsFromLegacy', () => {
    it('uses tile.coords when present (clamped)', () => {
      const tile: PlcBentoTile = {
        kind: 'notes',
        coords: { x: 99, y: 0, w: 99, h: 99 },
      };
      const c = deriveCoordsFromLegacy(tile);
      expect(c.x).toBeLessThanOrEqual(GRID_COLS - GRID_MIN_W);
      expect(c.x + c.w).toBeLessThanOrEqual(GRID_COLS);
    });

    it('falls back to the legacy size span when coords absent', () => {
      const tile: PlcBentoTile = { kind: 'notes', size: 'lg' };
      expect(deriveCoordsFromLegacy(tile)).toEqual({
        x: 0,
        y: 0,
        w: 6,
        h: 4,
      });
    });

    it('defaults to 3x2 when neither size nor coords are present', () => {
      const tile: PlcBentoTile = { kind: 'notes' };
      expect(deriveCoordsFromLegacy(tile)).toEqual({
        x: 0,
        y: 0,
        w: 3,
        h: 2,
      });
    });
  });

  describe('migrateLayoutToCoords', () => {
    it('stamps coords on every legacy tile and preserves order', () => {
      const legacy: PlcBentoTile[] = [
        { kind: 'plcInfo', size: 'md-wide' },
        { kind: 'quickActions', size: 'md-wide' },
        { kind: 'members', size: 'sm' },
        { kind: 'sharedSheet', size: 'sm' },
      ];
      const migrated = migrateLayoutToCoords(legacy);

      // Order preserved.
      expect(migrated.map((t) => t.kind)).toEqual(legacy.map((t) => t.kind));
      // Every tile has coords.
      for (const tile of migrated) {
        expect(tile.coords).toBeDefined();
      }
      // No tile overlaps.
      expect(hasOverlap(migrated)).toBe(false);
      // Original sizes preserved (back-compat for v1 path).
      expect(migrated.map((t) => t.size)).toEqual(legacy.map((t) => t.size));
    });

    it('leaves already-coords-stamped layouts in place (just clamps)', () => {
      const v2: PlcBentoTile[] = [
        { kind: 'plcInfo', coords: { x: 0, y: 0, w: 6, h: 2 } },
        { kind: 'quickActions', coords: { x: 6, y: 0, w: 6, h: 2 } },
      ];
      const migrated = migrateLayoutToCoords(v2);
      expect(migrated[0]?.coords).toEqual(v2[0]?.coords);
      expect(migrated[1]?.coords).toEqual(v2[1]?.coords);
    });

    it('handles mixed legacy + v2 entries', () => {
      const mixed: PlcBentoTile[] = [
        { kind: 'plcInfo', coords: { x: 0, y: 0, w: 6, h: 2 } },
        { kind: 'quickActions', size: 'sm' },
        { kind: 'members', size: 'md-wide' },
      ];
      const migrated = migrateLayoutToCoords(mixed);
      expect(migrated).toHaveLength(3);
      for (const tile of migrated) {
        expect(tile.coords).toBeDefined();
      }
      expect(hasOverlap(migrated)).toBe(false);
      // The pinned plcInfo keeps its coords.
      expect(migrated[0]?.coords).toEqual({ x: 0, y: 0, w: 6, h: 2 });
    });

    it('is idempotent (round-trip stable)', () => {
      const legacy: PlcBentoTile[] = [
        { kind: 'plcInfo', size: 'md-wide' },
        { kind: 'todos', size: 'md-tall' },
        { kind: 'notes', size: 'lg' },
      ];
      const once = migrateLayoutToCoords(legacy);
      const twice = migrateLayoutToCoords(once);
      expect(twice.map((t) => t.coords)).toEqual(once.map((t) => t.coords));
    });
  });

  describe('packTiles', () => {
    it('places non-overlapping tiles in row-major order', () => {
      const tiles: PlcBentoTile[] = [
        { kind: 'plcInfo', size: 'md-wide' }, // 6x2
        { kind: 'quickActions', size: 'md-wide' }, // 6x2
        { kind: 'members', size: 'sm' }, // 3x2
        { kind: 'sharedSheet', size: 'sm' }, // 3x2
      ];
      const packed = packTiles(tiles);
      expect(packed[0]?.coords).toEqual({ x: 0, y: 0, w: 6, h: 2 });
      expect(packed[1]?.coords).toEqual({ x: 6, y: 0, w: 6, h: 2 });
      // Next row.
      expect(packed[2]?.coords).toEqual({ x: 0, y: 2, w: 3, h: 2 });
      expect(packed[3]?.coords).toEqual({ x: 3, y: 2, w: 3, h: 2 });
    });

    it('honors seed pins and packs others around', () => {
      const tiles: PlcBentoTile[] = [
        { kind: 'plcInfo', size: 'md-wide' },
        { kind: 'quickActions', size: 'md-wide' },
        { kind: 'members', size: 'sm' },
      ];
      const seed = new Map<string, PlcGridCoords>([
        ['members', { x: 0, y: 0, w: 3, h: 2 }],
      ]);
      const packed = packTiles(tiles, seed);
      // Members keeps its pinned spot.
      const members = packed.find((t) => t.kind === 'members');
      expect(members?.coords).toEqual({ x: 0, y: 0, w: 3, h: 2 });
      // Original tile order preserved in output.
      expect(packed.map((t) => t.kind)).toEqual([
        'plcInfo',
        'quickActions',
        'members',
      ]);
      expect(hasOverlap(packed)).toBe(false);
    });
  });

  describe('commitTileCoords', () => {
    it('pins the resized tile and repacks the rest', () => {
      const tiles: PlcBentoTile[] = [
        { kind: 'plcInfo', coords: { x: 0, y: 0, w: 6, h: 2 } },
        { kind: 'quickActions', coords: { x: 6, y: 0, w: 6, h: 2 } },
        { kind: 'members', coords: { x: 0, y: 2, w: 3, h: 2 } },
      ];
      const next = commitTileCoords(tiles, 'plcInfo', {
        x: 0,
        y: 0,
        w: 12,
        h: 4,
      });
      const plcInfo = next.find((t) => t.kind === 'plcInfo');
      expect(plcInfo?.coords).toEqual({ x: 0, y: 0, w: 12, h: 4 });
      expect(hasOverlap(next)).toBe(false);
      // Original tile order preserved.
      expect(next.map((t) => t.kind)).toEqual([
        'plcInfo',
        'quickActions',
        'members',
      ]);
    });

    it('clamps out-of-bounds resize input', () => {
      const tiles: PlcBentoTile[] = [
        { kind: 'plcInfo', coords: { x: 0, y: 0, w: 6, h: 2 } },
      ];
      const next = commitTileCoords(tiles, 'plcInfo', {
        x: 0,
        y: 0,
        w: 99,
        h: 99,
      });
      const plcInfo = next.find((t) => t.kind === 'plcInfo');
      expect(plcInfo?.coords?.w).toBe(GRID_COLS);
    });
  });
});

/**
 * Test helper: detect any overlapping cell between two tiles in a packed
 * layout. Returns true if at least one cell is claimed twice.
 */
function hasOverlap(tiles: PlcBentoTile[]): boolean {
  const seen = new Set<string>();
  for (const tile of tiles) {
    if (!tile.coords) continue;
    const { x, y, w, h } = tile.coords;
    for (let dx = 0; dx < w; dx++) {
      for (let dy = 0; dy < h; dy++) {
        const key = `${x + dx},${y + dy}`;
        if (seen.has(key)) return true;
        seen.add(key);
      }
    }
  }
  return false;
}
