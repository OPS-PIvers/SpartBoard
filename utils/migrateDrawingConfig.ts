import {
  DrawableObject,
  DrawingConfig,
  Path,
  PathObject,
  ShapeTool,
} from '../types';

/** DrawingConfig with `objects` guaranteed non-optional. Post-migration shape. */
export type MigratedDrawingConfig = DrawingConfig & {
  objects: DrawableObject[];
  activeTool: ShapeTool;
  shapeFill: boolean;
};

const VALID_TOOLS: readonly ShapeTool[] = [
  'pen',
  'eraser',
  'rect',
  'ellipse',
  'line',
  'arrow',
];

/**
 * Normalize activeTool and shapeFill from a raw config object.
 * Handles:
 * - Legacy `color === 'eraser'` overload → activeTool: 'eraser', color cleared
 * - Missing or invalid activeTool → 'pen'
 * - Missing shapeFill → false
 */
const normalizeToolFields = (
  raw: DrawingConfig
): { activeTool: ShapeTool; shapeFill: boolean; color?: string } => {
  let activeTool: ShapeTool = 'pen';
  let color = raw.color;

  if (color === 'eraser') {
    // Legacy overload: the string 'eraser' was stuffed into color to toggle
    // eraser mode. Promote to activeTool and clear the overloaded color.
    activeTool = 'eraser';
    color = undefined;
  } else if (
    raw.activeTool !== undefined &&
    VALID_TOOLS.includes(raw.activeTool)
  ) {
    activeTool = raw.activeTool;
  }

  const shapeFill = typeof raw.shapeFill === 'boolean' ? raw.shapeFill : false;

  return { activeTool, shapeFill, color };
};

/**
 * Forward-migrate a DrawingConfig to the Phase-2.1b object-model shape.
 *
 * Legacy (Phase 1) shape: `{ paths: Path[]; mode?; color?; width?; customColors? }`.
 * Phase 2a shape: `{ objects: DrawableObject[]; ... }`.
 * Phase 2.1b shape: adds `activeTool: ShapeTool` and `shapeFill: boolean`.
 *
 * Behavior:
 * - If `objects[]` is non-empty, it's the source of truth — we keep it and
 *   drop any lingering legacy `paths`/`mode`.
 * - If `objects` is missing or empty AND `paths` has content, each legacy
 *   Path is wrapped as a `PathObject` with a fresh UUID and sequential z.
 * - If neither has content, `objects` becomes `[]`.
 * - Malformed `paths` entries are dropped rather than crashing the widget.
 * - Legacy `color === 'eraser'` is promoted to `activeTool: 'eraser'`.
 * - Missing/invalid `activeTool` defaults to `'pen'`.
 * - Missing `shapeFill` defaults to `false`.
 *
 * This function is pure and idempotent — calling it on an already-migrated
 * config returns an equivalent config.
 */
export const migrateDrawingConfig = (
  raw: DrawingConfig | undefined | null
): MigratedDrawingConfig => {
  if (!raw || typeof raw !== 'object') {
    return { objects: [], activeTool: 'pen', shapeFill: false };
  }

  const { paths, mode: _mode, activeTool: _at, shapeFill: _sf, ...rest } = raw;
  const { activeTool, shapeFill, color } = normalizeToolFields(raw);

  if (Array.isArray(raw.objects) && raw.objects.length > 0) {
    // Already migrated with content — strip legacy fields and return.
    return { ...rest, color, objects: raw.objects, activeTool, shapeFill };
  }

  const migratedFromPaths: PathObject[] = Array.isArray(paths)
    ? paths.reduce<PathObject[]>((acc, p, idx) => {
        if (!isValidLegacyPath(p)) return acc;
        acc.push({
          id: crypto.randomUUID(),
          kind: 'path',
          z: idx,
          points: p.points,
          color: p.color,
          width: p.width,
        });
        return acc;
      }, [])
    : [];

  if (migratedFromPaths.length > 0) {
    return {
      ...rest,
      color,
      objects: migratedFromPaths,
      activeTool,
      shapeFill,
    };
  }

  // Nothing to migrate — preserve existing `objects` (even if empty) so that
  // intentional resets like `clear()` round-trip correctly.
  return {
    ...rest,
    color,
    objects: Array.isArray(raw.objects) ? raw.objects : [],
    activeTool,
    shapeFill,
  };
};

const isValidLegacyPath = (p: unknown): p is Path => {
  if (!p || typeof p !== 'object') return false;
  const candidate = p as Partial<Path>;
  return (
    Array.isArray(candidate.points) &&
    candidate.points.length > 0 &&
    typeof candidate.color === 'string' &&
    typeof candidate.width === 'number'
  );
};

/**
 * Convenience: the "empty" drawing config used for new widgets.
 */
export const emptyDrawingConfig = (): MigratedDrawingConfig => ({
  objects: [],
  activeTool: 'pen',
  shapeFill: false,
});

/**
 * Return the next z-index to use when appending a new object. Matches the
 * "last-drawn-on-top" rule: max(z) + 1, or 0 for an empty list.
 */
export const nextZ = (objects: readonly DrawableObject[]): number => {
  if (objects.length === 0) return 0;
  let max = objects[0].z;
  for (let i = 1; i < objects.length; i++) {
    if (objects[i].z > max) max = objects[i].z;
  }
  return max + 1;
};
