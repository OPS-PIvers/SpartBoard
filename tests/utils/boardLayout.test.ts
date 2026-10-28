import { describe, expect, it } from 'vitest';
import { BOARD_TEMPLATES, getBoardTemplate } from '@/config/boardTemplates';
import { SNAP_ZONE_LAYOUTS } from '@/config/snapZones';
import { SNAP_LAYOUTS } from '@/config/snapLayouts';
import { TOOLS } from '@/config/tools';
import {
  analyze,
  applyTemplate,
  chromeBands,
  contentArea,
  DEFAULT_SCREEN,
  placeInZone,
  tidy,
  widgetRect,
  type LayoutWidget,
  type ScreenShape,
} from '@/utils/boardLayout';

const SCREENS: Record<string, ScreenShape> = {
  '16:9': { w: 1920, h: 1080 },
  '16:10': { w: 1920, h: 1200 },
  '4:3': { w: 1024, h: 768 },
  '21:9': { w: 2560, h: 1080 },
  'laptop 16:9': { w: 1366, h: 768 },
};

const WIDGET_TYPES = new Set(TOOLS.map((tool) => String(tool.type)));

// Small deterministic generator so failures replay.
const random = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const randomBoard = (count: number, seed: number): LayoutWidget[] => {
  const next = random(seed);
  return Array.from({ length: count }, (_, i) => {
    const wProp = 0.1 + next() * 0.5;
    const hProp = 0.1 + next() * 0.5;
    return {
      id: `w${i}`,
      type: 'text',
      xProp: next() * (1 - wProp),
      yProp: next() * (1 - hProp),
      wProp,
      hProp,
    };
  });
};

const geometry = (widgets: LayoutWidget[]) =>
  widgets.map(({ id, xProp, yProp, wProp, hProp, aspectRatio }) => ({
    id,
    xProp,
    yProp,
    wProp,
    hProp,
    aspectRatio,
  }));

describe('snap zone data', () => {
  it('is the data the snap menu shows, icons aside', () => {
    expect(
      SNAP_LAYOUTS.map(({ id, nameKey, zones }) => ({ id, nameKey, zones }))
    ).toEqual(SNAP_ZONE_LAYOUTS);
    expect(SNAP_LAYOUTS.every((layout) => Boolean(layout.icon))).toBe(true);
  });
});

describe('board templates', () => {
  it('has 10 to 12 templates with unique ids', () => {
    expect(BOARD_TEMPLATES.length).toBeGreaterThanOrEqual(10);
    expect(BOARD_TEMPLATES.length).toBeLessThanOrEqual(12);
    const ids = BOARD_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(getBoardTemplate('launch')?.name).toBe('Launch / Do Now');
    expect(getBoardTemplate('nope')).toBeUndefined();
  });

  it.each(BOARD_TEMPLATES.map((t) => [t.id, t] as const))(
    '%s lands on snap zones, with one slot per zone',
    (_id, template) => {
      const layout = SNAP_ZONE_LAYOUTS.find((l) => l.id === template.layoutId);
      expect(layout).toBeDefined();
      expect(template.zones).toEqual(layout?.zones);
      expect(template.slots.map((s) => s.zoneId).sort()).toEqual(
        template.zones.map((z) => z.id).sort()
      );
      expect(template.name.trim()).not.toBe('');
      expect(template.whenToUse.trim()).not.toBe('');
      for (const slot of template.slots) {
        expect(slot.role.trim()).not.toBe('');
        expect(slot.suggestedWidgets.length).toBeGreaterThan(0);
        for (const type of slot.suggestedWidgets)
          expect(WIDGET_TYPES.has(type)).toBe(true);
      }
    }
  );

  describe.each(Object.entries(SCREENS))('on %s', (_name, screen) => {
    it.each(BOARD_TEMPLATES.map((t) => [t.id, t] as const))(
      '%s clears the app buttons, dock, board buttons and drawers without overlaps',
      (_id, template) => {
        const applied = applyTemplate(
          template,
          template.slots.map((slot) => ({ zoneId: slot.zoneId })),
          screen
        );
        expect(applied.issues).toEqual([]);
        expect(applied.emptyZones).toEqual([]);
        // Each slot is checked once per suggested widget, so drawer clearance covers Need/Do/Put/Then.
        for (const slot of template.slots) {
          const placement = applied.placements.find(
            (p) => p.zoneId === slot.zoneId
          );
          expect(placement).toBeDefined();
          if (!placement) continue;
          for (const type of slot.suggestedWidgets) {
            const widgets: LayoutWidget[] = [
              { id: slot.zoneId, type, ...placement.rect },
            ];
            expect(analyze(widgets, screen).chromeCollisions).toEqual([]);
          }
        }
        const widgets = applied.placements.map((p) => ({
          id: p.zoneId,
          ...p.rect,
        }));
        const result = analyze(widgets, screen);
        expect(result.overlaps).toEqual([]);
        expect(result.chromeCollisions).toEqual([]);
        expect(result.gaps).toEqual([]);
      }
    );
  });
});

describe('placeInZone', () => {
  const half = { id: 'left-half', x: 0, y: 0, w: 0.5, h: 1 };

  it('fills the zone inside the chrome-free area with the snap gap between zones', () => {
    const area = contentArea(DEFAULT_SCREEN);
    const left = placeInZone(half, DEFAULT_SCREEN);
    const right = placeInZone(
      { id: 'right-half', x: 0.5, y: 0, w: 0.5, h: 1 },
      DEFAULT_SCREEN
    );
    expect(left.x).toBe(area.x);
    expect(left.y).toBe(area.y);
    expect(left.h).toBe(area.h);
    expect(right.x - (left.x + left.w)).toBe(12);
    expect(right.x + right.w).toBe(area.x + area.w);
  });

  it('tunes the aspect ratio to the target screen shape', () => {
    for (const screen of Object.values(SCREENS)) {
      const rect = placeInZone(half, screen);
      const safeRatio = (screen.w - 32) / (screen.h - 32);
      expect(rect.aspectRatio).toBeCloseTo(
        (rect.wProp / rect.hProp) * safeRatio,
        9
      );
      // Stored proportions map back to the exact pixel rect on that screen.
      const back = widgetRect({ id: 'x', ...rect }, screen);
      expect(back?.x).toBeCloseTo(rect.x, 0);
      expect(back?.w).toBeCloseTo(rect.w, 0);
    }
  });

  it('defaults to 16:9 and survives a missing or tiny screen', () => {
    expect(placeInZone(half)).toEqual(placeInZone(half, DEFAULT_SCREEN));
    const tiny = placeInZone(half, { w: 10, h: Number.NaN });
    expect(tiny.w).toBeGreaterThan(0);
    expect(tiny.h).toBeGreaterThan(0);
  });
});

describe('applyTemplate', () => {
  it('reports unknown and repeated zones and leaves out empty ones', () => {
    const template = getBoardTemplate('launch');
    expect(template).toBeDefined();
    if (!template) return;
    const applied = applyTemplate(template, [
      { zoneId: 'main', widgetType: 'text' },
      { zoneId: 'main', widgetType: 'poll' },
      { zoneId: 'middle', widgetType: 'clock' },
    ]);
    expect(applied.placements).toHaveLength(1);
    expect(applied.placements[0]).toMatchObject({
      zoneId: 'main',
      widgetType: 'text',
      role: 'Do Now prompt',
    });
    expect(applied.issues).toEqual([
      { zoneId: 'main', problem: 'zone-already-filled' },
      { zoneId: 'middle', problem: 'unknown-zone' },
    ]);
    expect(applied.emptyZones).toEqual(['top-side', 'bottom-side']);
  });
});

describe('analyze', () => {
  it('sees an empty board as one big gap', () => {
    const area = contentArea(DEFAULT_SCREEN);
    const { gaps, overlaps, chromeCollisions } = analyze([]);
    expect(overlaps).toEqual([]);
    expect(chromeCollisions).toEqual([]);
    expect(gaps).toEqual([{ ...area, share: 1 }]);
  });

  it('finds the empty half next to a single half-width widget', () => {
    const widget = {
      id: 'a',
      ...placeInZone({ id: 'left-half', x: 0, y: 0, w: 0.5, h: 1 }),
    };
    const { gaps } = analyze([widget]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].share).toBeGreaterThan(0.45);
    expect(gaps[0].x).toBeGreaterThanOrEqual(widget.x + widget.w - 1);
  });

  it('reports overlaps but not widgets that only touch', () => {
    const a = { id: 'a', x: 100, y: 100, w: 400, h: 300 };
    const b = { id: 'b', x: 300, y: 200, w: 400, h: 300 };
    const c = { id: 'c', x: 500, y: 100, w: 200, h: 100 };
    const { overlaps } = analyze([a, b, c]);
    expect(overlaps).toEqual([
      { a: 'a', b: 'b', rect: { x: 300, y: 200, w: 200, h: 200 } },
    ]);
  });

  it('flags widgets under the app buttons, dock, board buttons or off the screen', () => {
    const { h, w } = DEFAULT_SCREEN;
    const widgets = [
      { id: 'top', x: 20, y: 20, w: 300, h: 200 },
      { id: 'dock', x: 700, y: h - 200, w: 400, h: 180 },
      { id: 'corner', x: 10, y: h - 120, w: 200, h: 110 },
      { id: 'off', x: w - 100, y: 400, w: 300, h: 200 },
    ];
    const kinds = analyze(widgets).chromeCollisions.map(
      (c) => `${c.widgetId}:${c.kind}`
    );
    expect(kinds).toEqual([
      'top:app-buttons',
      'dock:dock',
      'corner:dock',
      'off:off-screen',
    ]);
    const corner = { id: 'c', x: w - 150, y: h - 50, w: 140, h: 40 };
    expect(analyze([corner]).chromeCollisions.map((c) => c.kind)).toEqual([
      'dock',
    ]);
    expect(chromeBands().map((band) => band.id)).toEqual([
      'app-buttons',
      'dock',
      'board-buttons-left',
      'board-buttons-right',
    ]);
  });

  it('flags Need/Do/Put/Then drawers that would open off the screen', () => {
    const rect = placeInZone({ id: 'left-half', x: 0, y: 0, w: 0.5, h: 1 });
    const hits = analyze([
      { id: 'n', type: 'need-do-put-then', ...rect },
    ]).chromeCollisions;
    expect(hits.map((c) => (c.kind === 'drawer' ? c.side : c.kind))).toEqual([
      'left',
      'bottom',
    ]);
    expect(
      analyze([{ id: 't', type: 'text', ...rect }]).chromeCollisions
    ).toEqual([]);
  });

  it('finds a real gap beside a thin empty strip', () => {
    const { gaps } = analyze([
      { id: 'b', x: 16, y: 84, w: 1788, h: 316 },
      { id: 'c', x: 16, y: 650, w: 1788, h: 344 },
      { id: 'd', x: 16, y: 400, w: 484, h: 250 },
      { id: 'e', x: 750, y: 400, w: 1054, h: 250 },
    ]);
    expect(gaps).toEqual([
      { x: 500, y: 400, w: 250, h: 250, share: expect.any(Number) },
    ]);
  });

  it('ignores minimized and maximized widgets', () => {
    const a = { id: 'a', x: 100, y: 100, w: 400, h: 300 };
    const b = { id: 'b', x: 300, y: 200, w: 400, h: 300, minimized: true };
    const c = { id: 'c', x: 300, y: 200, w: 400, h: 300, maximized: true };
    expect(analyze([a, b, c]).overlaps).toEqual([]);
  });

  it('reads out-of-range proportions as the pixel rect, like the app', () => {
    const widget = {
      id: 'a',
      xProp: 0.1,
      yProp: 0.1,
      wProp: 400,
      hProp: 300,
      x: 100,
      y: 120,
      w: 400,
      h: 300,
    };
    expect(widgetRect(widget)).toEqual({ x: 100, y: 120, w: 400, h: 300 });
    expect(widgetRect({ ...widget, wProp: 0 })).toEqual({
      x: 100,
      y: 120,
      w: 400,
      h: 300,
    });
  });

  it('skips widgets with no geometry', () => {
    expect(analyze([{ id: 'none' }]).overlaps).toEqual([]);
  });
});

describe('tidy', () => {
  it('snaps two rough halves onto the split layout and keeps content', () => {
    const config = { text: 'hello' };
    const widgets = [
      {
        id: 'a',
        type: 'text',
        config,
        xProp: 0.02,
        yProp: 0.1,
        wProp: 0.45,
        hProp: 0.8,
      },
      {
        id: 'b',
        type: 'clock',
        xProp: 0.55,
        yProp: 0.05,
        wProp: 0.4,
        hProp: 0.85,
      },
    ];
    const result = tidy(widgets);
    expect(result.layoutId).toBe('split-half');
    expect(result.zones).toEqual({ a: 'left-half', b: 'right-half' });
    expect(result.widgets[0].config).toBe(config);
    expect(result.widgets[0]).toMatchObject({ id: 'a', type: 'text' });
    expect(analyze(result.widgets).overlaps).toEqual([]);
  });

  it('gives a lone board-sized widget the whole board', () => {
    const result = tidy([
      { id: 'a', xProp: 0.05, yProp: 0.1, wProp: 0.85, hProp: 0.75 },
    ]);
    expect(result.layoutId).toBe('full');
    expect(result.widgets[0].wProp).toBeCloseTo(contentArea().w / 1888, 9);
  });

  it('returns nothing for an empty board', () => {
    expect(tidy([])).toEqual({
      layoutId: null,
      widgets: [],
      zones: {},
      unplaced: [],
    });
  });

  it('leaves locked, pinned, minimized and maximized widgets alone and works around locked ones', () => {
    const locked = {
      id: 'locked',
      isLocked: true,
      ...placeInZone({ id: 'left-half', x: 0, y: 0, w: 0.5, h: 1 }),
    };
    const pinned = {
      id: 'pinned',
      isPinned: true,
      xProp: 0.6,
      yProp: 0.05,
      wProp: 0.1,
      hProp: 0.1,
    };
    const hidden = {
      id: 'hidden',
      minimized: true,
      xProp: 0.2,
      yProp: 0.2,
      wProp: 0.3,
      hProp: 0.3,
    };
    const loose = {
      id: 'loose',
      xProp: 0.1,
      yProp: 0.1,
      wProp: 0.3,
      hProp: 0.3,
    };
    const result = tidy([locked, pinned, hidden, loose]);
    expect(result.widgets[0]).toMatchObject(locked);
    expect(result.widgets[1]).toMatchObject(pinned);
    expect(result.widgets[2]).toMatchObject(hidden);
    expect(result.widgets[3].id).toBe('loose');
    expect(analyze(result.widgets).overlaps).toEqual([]);
    expect(Object.keys(result.zones)).toEqual(['loose']);
  });

  it('survives absurd numbers', () => {
    const widgets: LayoutWidget[] = [
      { id: 'a', xProp: 1e308, yProp: -1e308, wProp: 1e308, hProp: 1e308 },
      { id: 'b', x: 10, y: 10, w: 0, h: 0 },
    ];
    const result = tidy(widgets);
    expect(result.widgets).toHaveLength(2);
    for (const w of result.widgets) expect(Number.isFinite(w.xProp)).toBe(true);
  });

  it('names the widgets that found no free zone on a crowded board', () => {
    const result = tidy(randomBoard(12, 5));
    expect(Object.keys(result.zones)).toHaveLength(12 - result.unplaced.length);
    expect(result.unplaced.length).toBeGreaterThan(0);
    for (const id of result.unplaced) expect(result.zones[id]).toBeUndefined();
  });

  describe.each(Object.entries(SCREENS))('on %s', (_name, screen) => {
    it('is idempotent and overlap-free up to nine widgets', () => {
      for (let count = 1; count <= 9; count++)
        for (let seed = 1; seed <= 6; seed++) {
          const once = tidy(randomBoard(count, seed * 31 + count), screen);
          const twice = tidy(once.widgets, screen);
          expect(geometry(twice.widgets)).toEqual(geometry(once.widgets));
          const result = analyze(once.widgets, screen);
          expect(result.overlaps).toEqual([]);
          expect(result.chromeCollisions).toEqual([]);
        }
    });

    it('is idempotent on crowded boards', () => {
      for (let count = 10; count <= 20; count++) {
        const once = tidy(randomBoard(count, count * 7), screen);
        const twice = tidy(once.widgets, screen);
        expect(geometry(twice.widgets)).toEqual(geometry(once.widgets));
        expect(once.widgets.map((w) => w.id)).toEqual(
          randomBoard(count, 1).map((w) => w.id)
        );
      }
    });
  });

  it('keeps a 20-widget board inside the time budget', () => {
    const board = randomBoard(20, 99);
    const start = performance.now();
    const tidied = tidy(board);
    analyze(tidied.widgets);
    analyze(board);
    expect(performance.now() - start).toBeLessThan(250);
  });
});
