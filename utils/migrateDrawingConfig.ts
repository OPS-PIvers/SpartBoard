import { DrawableObject, DrawingConfig, Path, PathObject } from '../types';

/** DrawingConfig with `objects` guaranteed non-optional. Post-migration shape. */
export type MigratedDrawingConfig = DrawingConfig & {
  objects: DrawableObject[];
};

/**
 * Forward-migrate a DrawingConfig to the Phase-2 object-model shape.
 *
 * Legacy (Phase 1) shape: `{ paths: Path[]; mode?; color?; width?; customColors? }`.
 * Canonical (Phase 2a) shape: `{ objects: DrawableObject[]; ... }`.
 *
 * Behavior:
 * - If `objects[]` is non-empty, it's the source of truth — we keep it and
 *   drop any lingering legacy `paths`/`mode`.
 * - If `objects` is missing or empty AND `paths` has content, each legacy
 *   Path is wrapped as a `PathObject` with a fresh UUID and sequential z.
 *   Preferring `paths` in this edge case prevents data loss when a widget is
 *   halfway through migration (shouldn't happen in production, but defensive
 *   behavior is cheap).
 * - If neither has content, `objects` becomes `[]`.
 * - Malformed `paths` entries (missing points array, empty points, etc.) are
 *   dropped rather than crashing the widget.
 *
 * This function is pure and idempotent — calling it on an already-migrated
 * config returns an equivalent config.
 */
export const migrateDrawingConfig = (
  raw: DrawingConfig | undefined | null
): MigratedDrawingConfig => {
  if (!raw || typeof raw !== 'object') {
    return { objects: [] };
  }

  const { paths, mode: _mode, ...rest } = raw;

  if (Array.isArray(raw.objects) && raw.objects.length > 0) {
    // Already migrated with content — strip legacy fields and return.
    return { ...rest, objects: raw.objects };
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
    return { ...rest, objects: migratedFromPaths };
  }

  // Nothing to migrate — preserve existing `objects` (even if empty) so that
  // intentional resets like `clear()` round-trip correctly.
  return { ...rest, objects: Array.isArray(raw.objects) ? raw.objects : [] };
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
