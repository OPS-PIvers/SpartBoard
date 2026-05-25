import { describe, it, expect } from 'vitest';
import {
  emptyDrawingConfig,
  migrateDrawingConfig,
  nextZ,
} from '@/utils/migrateDrawingConfig';
import type {
  DrawableObject,
  DrawingConfig,
  DrawingPage,
  Path,
  PathObject,
  RectObject,
} from '@/types';

const legacyPath = (overrides: Partial<Path> = {}): Path => ({
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
  ],
  color: '#123456',
  width: 4,
  ...overrides,
});

const pathObject = (overrides: Partial<PathObject> = {}): PathObject => ({
  id: 'obj-1',
  kind: 'path',
  z: 0,
  points: [{ x: 0, y: 0 }],
  color: '#000',
  width: 2,
  ...overrides,
});

const page = (overrides: Partial<DrawingPage> = {}): DrawingPage => ({
  id: 'page-fixed-id',
  objects: [],
  ...overrides,
});

describe('migrateDrawingConfig', () => {
  it('returns an empty single-page config when input is null or undefined', () => {
    const outNull = migrateDrawingConfig(null);
    expect(outNull.pages).toHaveLength(1);
    expect(outNull.pages[0].objects).toEqual([]);
    expect(typeof outNull.pages[0].id).toBe('string');
    expect(outNull.pages[0].id).not.toHaveLength(0);
    expect(outNull.currentPage).toBe(0);
    expect(outNull.activeTool).toBe('pen');
    expect(outNull.shapeFill).toBe(false);

    const outUndef = migrateDrawingConfig(undefined);
    expect(outUndef.pages).toHaveLength(1);
    expect(outUndef.pages[0].objects).toEqual([]);
  });

  it('wraps a legacy already-migrated `objects[]` into pages[0]', () => {
    const existing: DrawableObject[] = [
      pathObject(),
      pathObject({ id: 'obj-2', z: 1 }),
    ];
    const input: DrawingConfig = {
      objects: existing,
      color: '#ff0000',
      width: 6,
      customColors: ['#111', '#222'],
    };
    const out = migrateDrawingConfig(input);
    expect(out.pages).toHaveLength(1);
    expect(out.pages[0].objects).toBe(existing);
    expect(out.currentPage).toBe(0);
    expect(out.color).toBe('#ff0000');
    expect(out.width).toBe(6);
    expect(out.customColors).toEqual(['#111', '#222']);
    // Deprecated top-level `objects` is stripped post-migration.
    expect(out.objects).toBeUndefined();
  });

  it('passes through an already-paged config without changing it', () => {
    const input: DrawingConfig = {
      pages: [page({ id: 'p1', objects: [pathObject()] })],
      currentPage: 0,
      color: '#123',
    };
    const out = migrateDrawingConfig(input);
    expect(out.pages).toHaveLength(1);
    expect(out.pages[0].id).toBe('p1');
    expect(out.pages[0].objects).toHaveLength(1);
    expect(out.currentPage).toBe(0);
    expect(out.color).toBe('#123');
  });

  it('strips deprecated `paths` and `mode` even from migrated configs', () => {
    const input = {
      objects: [pathObject()],
      paths: [legacyPath()],
      mode: 'overlay' as const,
    };
    const out = migrateDrawingConfig(input as DrawingConfig);
    expect(out).not.toHaveProperty('paths');
    expect(out).not.toHaveProperty('mode');
    expect(out.pages[0].objects).toHaveLength(1);
  });

  it('wraps legacy paths as PathObjects with fresh UUIDs and sequential z', () => {
    // Test-only narrow type for legacy DrawingConfig docs that only carry
    // `paths` (no `objects`/`pages`) — lets us avoid `as any` casts.
    type LegacyDrawingConfig = { paths?: Path[] };
    const input: LegacyDrawingConfig = {
      paths: [
        legacyPath({ color: '#aaa' }),
        legacyPath({ color: '#bbb' }),
        legacyPath({ color: '#ccc' }),
      ],
    };

    const out = migrateDrawingConfig(input as DrawingConfig);
    const objs = out.pages[0].objects;
    expect(objs).toHaveLength(3);
    objs.forEach((o, i) => {
      expect(o.kind).toBe('path');
      expect(o.z).toBe(i);
      expect(typeof o.id).toBe('string');
      expect(o.id).not.toHaveLength(0);
    });
    const colors = objs.map((o) => (o as PathObject).color);
    expect(colors).toEqual(['#aaa', '#bbb', '#ccc']);
  });

  it('assigns distinct UUIDs to each migrated path', () => {
    const input = {
      paths: [legacyPath(), legacyPath(), legacyPath()],
    } as unknown as DrawingConfig;
    const out = migrateDrawingConfig(input);
    const ids = out.pages[0].objects.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('drops malformed legacy paths rather than throwing', () => {
    const input = {
      paths: [
        legacyPath(),
        { points: [], color: '#000', width: 2 }, // empty points
        { points: [{ x: 0, y: 0 }], color: '#000' }, // missing width
        { color: '#000', width: 2 }, // missing points
        null,
        undefined,
        'not a path',
      ],
    } as unknown as DrawingConfig;
    const out = migrateDrawingConfig(input);
    expect(out.pages[0].objects).toHaveLength(1);
  });

  it('returns a single empty page when neither paths, objects, nor pages exist', () => {
    const input = { color: '#000' } as unknown as DrawingConfig;
    const out = migrateDrawingConfig(input);
    expect(out.pages).toHaveLength(1);
    expect(out.pages[0].objects).toEqual([]);
    expect(out.color).toBe('#000');
  });

  it('is idempotent — migrating twice equals migrating once', () => {
    const input = {
      paths: [legacyPath(), legacyPath()],
      color: '#f0f',
      width: 3,
    } as unknown as DrawingConfig;
    const once = migrateDrawingConfig(input);
    const twice = migrateDrawingConfig(once);
    expect(twice.pages).toEqual(once.pages);
    expect(twice.currentPage).toBe(once.currentPage);
    expect(twice.color).toBe(once.color);
    expect(twice.width).toBe(once.width);
  });

  it('migrates legacy color === "eraser" to activeTool: "eraser" and clears color', () => {
    const input = {
      objects: [pathObject()],
      color: 'eraser',
    } as unknown as DrawingConfig;
    const out = migrateDrawingConfig(input);
    expect(out.activeTool).toBe('eraser');
    expect(out.color).toBeUndefined();
  });

  it('defaults missing activeTool to "pen"', () => {
    const input = {
      objects: [pathObject()],
      color: '#ff0000',
    } as DrawingConfig;
    const out = migrateDrawingConfig(input);
    expect(out.activeTool).toBe('pen');
    expect(out.color).toBe('#ff0000');
  });

  it('defaults invalid activeTool strings to "pen"', () => {
    const input = {
      objects: [pathObject()],
      color: '#0000ff',
      activeTool: 'magic',
    } as unknown as DrawingConfig;
    const out = migrateDrawingConfig(input);
    expect(out.activeTool).toBe('pen');
  });

  it('defaults missing shapeFill to false', () => {
    const input = { objects: [pathObject()] } as DrawingConfig;
    const out = migrateDrawingConfig(input);
    expect(out.shapeFill).toBe(false);
  });

  it('preserves an explicit shapeFill: true', () => {
    const input = {
      objects: [pathObject()],
      shapeFill: true,
    } as DrawingConfig;
    const out = migrateDrawingConfig(input);
    expect(out.shapeFill).toBe(true);
  });

  it('accepts "text" as a valid activeTool (Phase 2 PR 2.1d)', () => {
    const input = {
      objects: [pathObject()],
      activeTool: 'text',
    } as DrawingConfig;
    const out = migrateDrawingConfig(input);
    expect(out.activeTool).toBe('text');
  });

  it('accepts "select" as a valid activeTool (Phase 2 PR 2.1c)', () => {
    const input = {
      objects: [pathObject()],
      activeTool: 'select',
    } as DrawingConfig;
    const out = migrateDrawingConfig(input);
    expect(out.activeTool).toBe('select');
  });

  // ---------------------------------------------------------------------------
  // Phase 2 PR 2.3 — pages + currentPage
  // ---------------------------------------------------------------------------

  it('PR 2.3: legacy `{ objects: [obj] }` migrates to `{ pages: [{ id, objects: [obj] }], currentPage: 0 }`', () => {
    const obj = pathObject();
    const input = { objects: [obj] } as DrawingConfig;
    const out = migrateDrawingConfig(input);
    expect(out.pages).toHaveLength(1);
    expect(out.pages[0].objects).toEqual([obj]);
    expect(typeof out.pages[0].id).toBe('string');
    expect(out.pages[0].id).not.toHaveLength(0);
    expect(out.currentPage).toBe(0);
    expect(out.objects).toBeUndefined();
  });

  it('PR 2.3: already-paged config round-trips unchanged (idempotent)', () => {
    const input: DrawingConfig = {
      pages: [
        page({ id: 'p1', objects: [pathObject({ id: 'a' })] }),
        page({ id: 'p2', objects: [pathObject({ id: 'b' })] }),
      ],
      currentPage: 1,
    };
    const once = migrateDrawingConfig(input);
    const twice = migrateDrawingConfig(once);
    expect(twice.pages).toEqual(once.pages);
    expect(twice.currentPage).toBe(1);
    // Page ids survive migration.
    expect(twice.pages.map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('PR 2.3: missing both `pages` and `objects` produces a single empty page with an id', () => {
    const input = {} as DrawingConfig;
    const out = migrateDrawingConfig(input);
    expect(out.pages).toHaveLength(1);
    expect(out.pages[0].objects).toEqual([]);
    expect(typeof out.pages[0].id).toBe('string');
    expect(out.pages[0].id).not.toHaveLength(0);
    expect(out.currentPage).toBe(0);
  });

  it('PR 2.3: a page missing `id` gets a fresh uuid backfilled', () => {
    const input = {
      pages: [{ objects: [] }, { id: 'has-id', objects: [] }],
    } as unknown as DrawingConfig;
    const out = migrateDrawingConfig(input);
    expect(out.pages).toHaveLength(2);
    expect(typeof out.pages[0].id).toBe('string');
    expect(out.pages[0].id).not.toHaveLength(0);
    expect(out.pages[1].id).toBe('has-id');
  });

  it('PR 2.3: currentPage is clamped into [0, pages.length-1]', () => {
    const input: DrawingConfig = {
      pages: [page({ id: 'a' }), page({ id: 'b' })],
      currentPage: 99,
    };
    const out = migrateDrawingConfig(input);
    expect(out.currentPage).toBe(1);

    const negative: DrawingConfig = {
      pages: [page({ id: 'a' })],
      currentPage: -5,
    };
    expect(migrateDrawingConfig(negative).currentPage).toBe(0);
  });

  it('PR 2.3: paged config preserves per-page `background`', () => {
    const input: DrawingConfig = {
      pages: [
        page({ id: 'p1', background: 'grid' }),
        page({ id: 'p2', background: 'dots' }),
      ],
      currentPage: 0,
    };
    const out = migrateDrawingConfig(input);
    expect(out.pages[0].background).toBe('grid');
    expect(out.pages[1].background).toBe('dots');
  });

  it('PR 2.5: defaults a missing per-page background to "blank"', () => {
    // Pages without an explicit `background` field must materialise as
    // `'blank'` post-migration so the renderer / Settings UI / exporter can
    // read a guaranteed value without per-call fallback logic.
    const input: DrawingConfig = {
      pages: [page({ id: 'p1' }), page({ id: 'p2' })],
      currentPage: 0,
    };
    const out = migrateDrawingConfig(input);
    expect(out.pages[0].background).toBe('blank');
    expect(out.pages[1].background).toBe('blank');
  });

  it('PR 2.5: inherits widget-level `background` onto pages that lack one', () => {
    // The widget-level default (added in PR 2.5) propagates onto any page that
    // doesn't override it, but per-page values still win.
    const input: DrawingConfig = {
      background: 'grid',
      pages: [page({ id: 'p1' }), page({ id: 'p2', background: 'dots' })],
      currentPage: 0,
    };
    const out = migrateDrawingConfig(input);
    expect(out.pages[0].background).toBe('grid');
    expect(out.pages[1].background).toBe('dots');
  });

  it('PR 2.5: legacy single-page migration assigns a "blank" background', () => {
    // Wrapping a legacy `objects[]` into pages[0] must still produce a page
    // with a usable `background` field.
    const input: DrawingConfig = {
      objects: [pathObject()],
    };
    const out = migrateDrawingConfig(input);
    expect(out.pages).toHaveLength(1);
    expect(out.pages[0].background).toBe('blank');
  });

  it('PR 2.5: null/undefined input produces a page with background="blank"', () => {
    expect(migrateDrawingConfig(null).pages[0].background).toBe('blank');
    expect(migrateDrawingConfig(undefined).pages[0].background).toBe('blank');
  });

  it('PR 2.5: emptyDrawingConfig() seeds page background to "blank"', () => {
    expect(emptyDrawingConfig().pages[0].background).toBe('blank');
  });

  it('PR 2.3: `pages` takes precedence over legacy `objects` when both exist', () => {
    const input = {
      pages: [page({ id: 'p1', objects: [pathObject({ id: 'fromPages' })] })],
      objects: [pathObject({ id: 'fromLegacy' })],
    } as unknown as DrawingConfig;
    const out = migrateDrawingConfig(input);
    expect(out.pages).toHaveLength(1);
    expect(out.pages[0].objects).toHaveLength(1);
    expect(out.pages[0].objects[0].id).toBe('fromPages');
    expect(out.objects).toBeUndefined();
  });
});

describe('nextZ', () => {
  it('returns 0 for an empty list', () => {
    expect(nextZ([])).toBe(0);
  });

  it('returns max(z) + 1', () => {
    const objects: DrawableObject[] = [
      pathObject({ z: 0 }),
      pathObject({ id: '2', z: 5 }),
      pathObject({ id: '3', z: 3 }),
    ];
    expect(nextZ(objects)).toBe(6);
  });

  it('handles non-path objects', () => {
    const rect: RectObject = {
      id: 'r',
      kind: 'rect',
      z: 10,
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      stroke: '#000',
      strokeWidth: 2,
    };
    expect(nextZ([rect])).toBe(11);
  });
});

describe('emptyDrawingConfig', () => {
  it('returns a fresh empty single-page config each call', () => {
    const a = emptyDrawingConfig();
    const b = emptyDrawingConfig();
    expect(a.pages).toHaveLength(1);
    expect(a.pages[0].objects).toEqual([]);
    expect(a.currentPage).toBe(0);
    expect(a.activeTool).toBe('pen');
    expect(a.shapeFill).toBe(false);
    // Distinct page ids per call — no shared mutable state.
    expect(a.pages[0].id).not.toBe(b.pages[0].id);
  });
});
