import {
  DrawableObject,
  DrawingBackground,
  DrawingConfig,
  DrawingPage,
  Path,
  PathObject,
  ShapeTool,
} from '@/types';

/**
 * DrawingConfig with `pages` guaranteed non-empty and `currentPage` clamped
 * into range. Post-Phase-2-PR-2.3 shape. The deprecated top-level `objects`
 * field is stripped from the returned config (the field becomes absent).
 */
export type MigratedDrawingConfig = DrawingConfig & {
  pages: DrawingPage[];
  currentPage: number;
  // The migration guarantees these are non-optional after running — every
  // call site that destructures one of them off the result is reading a
  // definite value, not `undefined`. Tightening the type captures the full
  // post-migration invariant so consumers don't have to handle impossible
  // undefined cases.
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
  'text',
  'select',
];

const VALID_BACKGROUNDS: readonly DrawingBackground[] = [
  'blank',
  'grid',
  'lines',
  'dots',
];

const sanitizeBackground = (
  value: unknown,
  fallback: DrawingBackground
): DrawingBackground => {
  if (
    typeof value === 'string' &&
    VALID_BACKGROUNDS.includes(value as DrawingBackground)
  ) {
    return value as DrawingBackground;
  }
  return fallback;
};

/**
 * Forward-migrate a DrawingConfig to the Phase-2 object-model shape.
 *
 * Migration steps (ordered, idempotent, pure):
 * 1. Strip legacy `paths` + `mode` from Phase 1.
 * 2. Rewrite `color === 'eraser'` into `activeTool: 'eraser'`.
 * 3. Default `activeTool` to `'pen'`, `shapeFill` to `false`.
 * 4. If legacy `objects[]` is non-empty, use it. Otherwise wrap legacy
 *    `paths[]` into `PathObject[]` (defensive; production never sees this).
 * 5. Wrap the resulting single object list into `pages: [{ id, objects }]`
 *    if `pages` is missing. If `pages` exists but a page lacks an `id`,
 *    backfill it. Drop the deprecated top-level `objects` field once paged.
 * 6. Default `currentPage` to 0; clamp into `[0, pages.length - 1]`.
 *
 * This function is pure and idempotent — calling it on an already-migrated
 * config returns an equivalent config.
 */
export const migrateDrawingConfig = (
  raw: DrawingConfig | undefined | null
): MigratedDrawingConfig => {
  if (!raw || typeof raw !== 'object') {
    return {
      pages: [{ id: crypto.randomUUID(), objects: [], background: 'blank' }],
      currentPage: 0,
      activeTool: 'pen',
      shapeFill: false,
    };
  }

  const { paths, mode: _mode, ...rest } = raw;

  // Phase 2 PR 2.1b: legacy `color === 'eraser'` overload becomes explicit
  // `activeTool`. Once migrated, `color` is always a real color string (or
  // undefined → fall back to palette default at render time).
  const isLegacyEraser = rest.color === 'eraser';
  const rawActiveTool = isLegacyEraser ? 'eraser' : rest.activeTool;
  const color = isLegacyEraser ? undefined : rest.color;
  const activeTool: ShapeTool =
    rawActiveTool && VALID_TOOLS.includes(rawActiveTool)
      ? rawActiveTool
      : 'pen';
  const shapeFill = rest.shapeFill ?? false;

  // Step 1: build the page list.
  // PR 2.5: every page gets a `background` field. Defaults to the widget-level
  // `background` (if set on `raw`) and finally to `'blank'`. We materialise the
  // field at migration time so consumers (renderer, settings UI, export
  // pipeline) can read a guaranteed value without per-call fallback chains.
  // The widget-level default is sanitized against the allowlist so a corrupt
  // import (e.g. hand-edited JSON with `background: 'foo'`) can't leak an
  // invalid value through the migration.
  const widgetDefaultBackground = sanitizeBackground(rest.background, 'blank');
  let pages: DrawingPage[];
  if (Array.isArray(raw.pages) && raw.pages.length > 0) {
    // Already paged. Backfill missing ids defensively (hand-edited docs,
    // imports). Preserve `background` + `objects` references where present.
    // Per-page backgrounds are also validated through the allowlist so the
    // renderer only ever sees a known value.
    pages = raw.pages.map((p) => {
      const objects = Array.isArray(p?.objects) ? p.objects : [];
      const id = typeof p?.id === 'string' && p.id ? p.id : crypto.randomUUID();
      const background = sanitizeBackground(
        p?.background,
        widgetDefaultBackground
      );
      return { id, objects, background };
    });
  } else {
    // Collapse legacy single-page sources into a flat object list. `pages`
    // (handled above) takes precedence over `objects`/`paths`; this branch
    // only runs when no paged data exists, so we lazily compute the
    // legacy-to-pages-0 conversion here instead of unconditionally upstream.
    let singlePageObjects: DrawableObject[];
    if (Array.isArray(raw.objects) && raw.objects.length > 0) {
      singlePageObjects = raw.objects;
    } else {
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
      singlePageObjects = migratedFromPaths;
    }
    // Wrap legacy single-page content into one page. Always produce at least
    // one page so the widget never has to render against an empty array.
    pages = [
      {
        id: crypto.randomUUID(),
        objects: singlePageObjects,
        background: widgetDefaultBackground,
      },
    ];
  }

  // Step 3: clamp currentPage into range.
  const rawCurrent =
    typeof raw.currentPage === 'number' && Number.isFinite(raw.currentPage)
      ? raw.currentPage
      : 0;
  const currentPage = Math.max(0, Math.min(rawCurrent, pages.length - 1));

  // Strip the deprecated top-level `objects` field — `pages[0].objects` is
  // the source of truth post-migration.
  const { objects: _legacyObjects, pages: _legacyPages, ...restClean } = rest;

  return {
    ...restClean,
    color,
    activeTool,
    shapeFill,
    pages,
    currentPage,
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
 * Convenience: the "empty" drawing config used for new widgets. Note that
 * `subcollectionMigrated` is intentionally absent — a fresh widget has no
 * objects to relocate, so `needsSubcollectionMigration` will return false
 * until the user draws something. When that first object lands in
 * `pages[0].objects`, the migration kicker picks it up on the next render
 * and writes the subcollection / flips the flag.
 */
export const emptyDrawingConfig = (): MigratedDrawingConfig => ({
  pages: [{ id: crypto.randomUUID(), objects: [], background: 'blank' }],
  currentPage: 0,
  activeTool: 'pen',
  shapeFill: false,
});

/**
 * Return the next z-index to use when appending a new object. Matches the
 * "last-drawn-on-top" rule: max(z) + 1, or 0 for an empty list.
 *
 * Performance: O(n) over the full object list. Intentional — classroom-scale
 * widgets cap out around 500-1000 objects and this is microseconds even at
 * the upper bound; keeping the implementation a plain loop avoids any
 * incremental-tracking footgun.
 */
export const nextZ = (objects: readonly DrawableObject[]): number => {
  if (objects.length === 0) return 0;
  let max = objects[0].z;
  for (let i = 1; i < objects.length; i++) {
    if (objects[i].z > max) max = objects[i].z;
  }
  return max + 1;
};
