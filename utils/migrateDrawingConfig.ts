import {
  DrawableObject,
  DrawingConfig,
  DrawingPage,
  Path,
  PathObject,
  ShapeTool,
} from '../types';

/**
 * DrawingConfig with `pages` guaranteed non-empty and `currentPage` clamped
 * into range. Post-Phase-2-PR-2.3 shape. `objects` is preserved as `undefined`
 * (the deprecated single-page field is dropped during migration).
 */
export type MigratedDrawingConfig = DrawingConfig & {
  pages: DrawingPage[];
  currentPage: number;
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
  // `activeTool`. Once migrated, `color` is always a real color string.
  let activeTool = rest.activeTool;
  let color = rest.color;
  if (color === 'eraser') {
    activeTool = 'eraser';
    color = undefined; // fall back to the palette default at render time
  }
  if (!activeTool || !VALID_TOOLS.includes(activeTool)) activeTool = 'pen';
  const shapeFill = rest.shapeFill ?? false;

  // Step 1: collapse legacy single-page sources into a flat `singlePageObjects`
  // array. `pages` (if present) takes precedence over `objects`/`paths`.
  let singlePageObjects: DrawableObject[] = [];
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

  // Step 2: build the page list.
  // PR 2.5: every page gets a `background` field. Defaults to the widget-level
  // `background` (if set on `raw`) and finally to `'blank'`. We materialise the
  // field at migration time so consumers (renderer, settings UI, export
  // pipeline) can read a guaranteed value without per-call fallback chains.
  const widgetDefaultBackground = (rest.background ?? 'blank') as
    | 'blank'
    | 'grid'
    | 'lines'
    | 'dots';
  let pages: DrawingPage[];
  if (Array.isArray(raw.pages) && raw.pages.length > 0) {
    // Already paged. Backfill missing ids defensively (hand-edited docs,
    // imports). Preserve `background` + `objects` references where present.
    pages = raw.pages.map((p) => {
      const objects = Array.isArray(p?.objects) ? p.objects : [];
      const id = typeof p?.id === 'string' && p.id ? p.id : crypto.randomUUID();
      const background = p?.background ?? widgetDefaultBackground;
      return { id, objects, background };
    });
  } else {
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
 * Convenience: the "empty" drawing config used for new widgets.
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
 */
export const nextZ = (objects: readonly DrawableObject[]): number => {
  if (objects.length === 0) return 0;
  let max = objects[0].z;
  for (let i = 1; i < objects.length; i++) {
    if (objects[i].z > max) max = objects[i].z;
  }
  return max + 1;
};
