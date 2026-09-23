// Fixtures for the gl-author validator's v3 rules (GL Studio plan P1-7).
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  readTourAnchorIds,
  validateGlSet,
} from '../.claude/skills/gl-author/scripts/validate_gl_json.mjs';

// 1×1 transparent PNG.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const step = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  xPct: 50,
  yPct: 50,
  imageIndex: 0,
  label: 'Save button',
  interactionType: 'spotlight',
  text: 'Click Save.',
  ...over,
});

const set = (steps: unknown[], over: Record<string, unknown> = {}) => ({
  id: 'x',
  title: 'Test',
  mode: 'structured',
  schemaVersion: 3,
  imageUrls: [PNG],
  steps,
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

const ok = (s: unknown, opts?: { tourAnchorIds: Set<string> | null }) =>
  expect(() => validateGlSet(s, opts)).not.toThrow();
const bad = (s: unknown, match: RegExp) =>
  expect(() => validateGlSet(s)).toThrow(match);

describe('validateGlSet schema versions', () => {
  it('accepts 2 and 3 and rejects anything else', () => {
    ok(set([step()], { schemaVersion: 2 }));
    ok(set([step()]));
    bad(set([step()], { schemaVersion: 4 }), /schemaVersion must be 2 or 3/);
    bad(set([step()], { schemaVersion: undefined }), /schemaVersion/);
  });

  it('checks watchPace', () => {
    ok(set([step()], { watchPace: 'calm' }));
    bad(set([step()], { watchPace: 'fast' }), /watchPace/);
  });
});

describe('validateGlSet regions', () => {
  it('accepts a rect, an ellipse and a polygon that fit the image', () => {
    ok(
      set([
        step({
          region: { shape: 'rect', wPct: 10, hPct: 6, cornerPct: 20 },
        }),
        step({ id: 's2', region: { shape: 'ellipse', wPct: 100, hPct: 100 } }),
        step({
          id: 's3',
          xPct: 30,
          yPct: 25,
          region: {
            shape: 'polygon',
            wPct: 20,
            hPct: 10,
            points: [
              { x: 20, y: 20 },
              { x: 40, y: 20 },
              { x: 30, y: 30 },
            ],
          },
        }),
      ])
    );
  });

  it('rejects an unknown shape, a zero size and an oversize box', () => {
    bad(
      set([step({ region: { shape: 'star', wPct: 5, hPct: 5 } })]),
      /region\.shape/
    );
    bad(
      set([step({ region: { shape: 'rect', wPct: 0, hPct: 5 } })]),
      /region\.wPct/
    );
    bad(
      set([step({ region: { shape: 'rect', wPct: 101, hPct: 5 } })]),
      /region\.wPct/
    );
  });

  it('rejects a region that spills past an edge', () => {
    bad(
      set([step({ xPct: 97, region: { shape: 'rect', wPct: 10, hPct: 5 } })]),
      /outside the image/
    );
  });

  it('rejects a corner radius outside 0 to 50', () => {
    bad(
      set([
        step({ region: { shape: 'rect', wPct: 5, hPct: 5, cornerPct: 60 } }),
      ]),
      /cornerPct/
    );
  });

  it('rejects a polygon with too few vertices, a vertex off the image, or a box that does not match', () => {
    const poly = (points: unknown, box = { xPct: 30, yPct: 25 }) =>
      set([
        step({
          ...box,
          region: { shape: 'polygon', wPct: 20, hPct: 10, points },
        }),
      ]);
    bad(
      poly([
        { x: 20, y: 20 },
        { x: 40, y: 30 },
      ]),
      /3 to 24 vertices/
    );
    bad(
      poly([
        { x: 20, y: 20 },
        { x: 40, y: 20 },
        { x: 30, y: 130 },
      ]),
      /points\[2\]/
    );
    bad(
      poly(
        [
          { x: 20, y: 20 },
          { x: 40, y: 20 },
          { x: 30, y: 30 },
        ],
        { xPct: 60, yPct: 25 }
      ),
      /match its polygon points/
    );
  });

  it('rejects points on a non-polygon region', () => {
    bad(
      set([
        step({
          region: { shape: 'rect', wPct: 5, hPct: 5, points: [] },
        }),
      ]),
      /only allowed on a polygon/
    );
  });
});

describe('validateGlSet callouts, narration and tours', () => {
  it('checks calloutPin and cursor ranges', () => {
    ok(
      set([
        step({ calloutPin: { xPct: 0, yPct: 100 }, cursor: { hide: true } }),
      ])
    );
    bad(set([step({ calloutPin: { xPct: -1, yPct: 5 } })]), /calloutPin\.xPct/);
    bad(set([step({ cursor: { hide: 'yes' } })]), /cursor/);
  });

  it('rejects narration, which lives in Storage', () => {
    bad(
      set([
        step({
          narration: {
            source: 'generated',
            url: 'https://x',
            storagePath: 'p',
            durationMs: 1,
          },
        }),
      ]),
      /narration is not importable/
    );
  });

  it('rejects any tour before the anchor registry exists', () => {
    bad(
      set([step({ tour: { anchor: 'dock.open-tools', action: 'click' } })]),
      /tour anchor registry does not exist/
    );
  });

  it('accepts only registered anchors once the registry exists', () => {
    const ids = new Set(['dock.open-tools']);
    ok(set([step({ tour: { anchor: 'dock.open-tools', action: 'click' } })]), {
      tourAnchorIds: ids,
    });
    expect(() =>
      validateGlSet(
        set([step({ tour: { anchor: 'dock.nope', action: 'click' } })]),
        { tourAnchorIds: ids }
      )
    ).toThrow(/registered tour anchor/);
  });
});

describe('readTourAnchorIds', () => {
  it('reads the real registry in config/tourAnchors.ts', () => {
    const ids = readTourAnchorIds(join(process.cwd(), 'config/tourAnchors.ts'));
    expect(ids?.has('dock.open-tools')).toBe(true);
    expect(ids?.has('widget.settings-opener')).toBe(true);
  });

  it('returns null without a registry and the keys of TOUR_ANCHORS with one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gl-anchors-'));
    expect(readTourAnchorIds(join(dir, 'missing.ts'))).toBeNull();
    const file = join(dir, 'tourAnchors.ts');
    writeFileSync(
      file,
      [
        'export const TOUR_ANCHORS = {',
        "  'dock.open-tools': { label: 'Open Tools' },",
        "  'widget.settings-opener': {",
        "    label: 'Widget settings',",
        '    perWidget: true,',
        '  },',
        '} as const;',
      ].join('\n')
    );
    expect(readTourAnchorIds(file)).toEqual(
      new Set(['dock.open-tools', 'widget.settings-opener'])
    );
  });
});
