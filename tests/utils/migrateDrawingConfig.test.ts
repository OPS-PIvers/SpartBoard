import { describe, it, expect } from 'vitest';
import {
  emptyDrawingConfig,
  migrateDrawingConfig,
  nextZ,
} from '@/utils/migrateDrawingConfig';
import type {
  DrawableObject,
  DrawingConfig,
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

describe('migrateDrawingConfig', () => {
  it('returns an empty config when input is null or undefined', () => {
    expect(migrateDrawingConfig(null)).toEqual({ objects: [] });
    expect(migrateDrawingConfig(undefined)).toEqual({ objects: [] });
  });

  it('passes through an already-migrated config unchanged', () => {
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
    expect(out.objects).toBe(existing);
    expect(out.color).toBe('#ff0000');
    expect(out.width).toBe(6);
    expect(out.customColors).toEqual(['#111', '#222']);
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
    expect(out.objects).toHaveLength(1);
  });

  it('wraps legacy paths as PathObjects with fresh UUIDs and sequential z', () => {
    const input: DrawingConfig = {
      objects: [] as DrawableObject[],
      // Intentionally set objects undefined via cast — simulating a legacy
      // document that only has `paths`.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    delete (input as unknown as { objects?: unknown }).objects;
    (input as unknown as { paths: Path[] }).paths = [
      legacyPath({ color: '#aaa' }),
      legacyPath({ color: '#bbb' }),
      legacyPath({ color: '#ccc' }),
    ];

    const out = migrateDrawingConfig(input);
    expect(out.objects).toHaveLength(3);
    out.objects.forEach((o, i) => {
      expect(o.kind).toBe('path');
      expect(o.z).toBe(i);
      expect(typeof o.id).toBe('string');
      expect(o.id).not.toHaveLength(0);
    });
    const colors = out.objects.map((o) => (o as PathObject).color);
    expect(colors).toEqual(['#aaa', '#bbb', '#ccc']);
  });

  it('assigns distinct UUIDs to each migrated path', () => {
    const input = {
      paths: [legacyPath(), legacyPath(), legacyPath()],
    } as unknown as DrawingConfig;
    const out = migrateDrawingConfig(input);
    const ids = out.objects.map((o) => o.id);
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
    expect(out.objects).toHaveLength(1);
  });

  it('returns an empty objects array when neither paths nor objects exist', () => {
    const input = { color: '#000' } as unknown as DrawingConfig;
    const out = migrateDrawingConfig(input);
    expect(out.objects).toEqual([]);
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
    expect(twice.objects).toEqual(once.objects);
    expect(twice.color).toBe(once.color);
    expect(twice.width).toBe(once.width);
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
  it('returns a fresh empty config each call', () => {
    const a = emptyDrawingConfig();
    const b = emptyDrawingConfig();
    expect(a).toEqual({ objects: [] });
    expect(a).not.toBe(b);
  });
});
