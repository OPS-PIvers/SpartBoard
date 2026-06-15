import { describe, it, expect } from 'vitest';
import {
  widgetNeedsProportionalMigration,
  migrateWidgetToProportional,
  migrateDashboardWidgets,
  hydrateWidgetPixels,
} from '@/utils/migrateProportionalLayout';
import {
  REFERENCE_VIEWPORT,
  getSafeViewport,
} from '@/utils/proportionalLayout';
import { SNAP_LAYOUT_CONSTANTS } from '@/utils/layoutMath';
import type { WidgetData } from '@/types';

const PADDING = SNAP_LAYOUT_CONSTANTS.PADDING;

const baseWidget = (overrides: Partial<WidgetData> = {}): WidgetData => ({
  id: 'w1',
  type: 'clock',
  x: 100,
  y: 100,
  w: 200,
  h: 200,
  z: 1,
  flipped: false,
  config: { format24: true, showSeconds: true },
  ...overrides,
});

describe('widgetNeedsProportionalMigration', () => {
  it('flags legacy widgets (no proportional fields)', () => {
    expect(widgetNeedsProportionalMigration(baseWidget())).toBe(true);
  });

  it('passes through fully migrated widgets', () => {
    const migrated = baseWidget({
      x: 50,
      y: 50,
      w: 200,
      h: 200,
      xProp: 0.1,
      yProp: 0.1,
      wProp: 0.2,
      hProp: 0.2,
      aspectRatio: 1,
    });
    expect(widgetNeedsProportionalMigration(migrated)).toBe(false);
  });

  it('flags widgets whose w/h still look like pixels even if proportional fields exist', () => {
    const stale = baseWidget({
      w: 200, // pixel
      h: 200,
      xProp: 0.1,
      yProp: 0.1,
      wProp: 200, // also pixel — clearly stale
      hProp: 200,
      aspectRatio: 1,
    });
    expect(widgetNeedsProportionalMigration(stale)).toBe(true);
  });

  it('flags widgets whose x/y positions still look like pixels even when w/h are proportional', () => {
    // Regression: the guard previously only checked wProp/hProp for pixel-sized
    // values, so a widget with pixel-valued xProp/yProp (e.g. from a partial
    // migration) would pass the check and render at the wrong on-screen position.
    const stalePosition = baseWidget({
      x: 300,
      y: 150,
      w: 200,
      h: 200,
      xProp: 300, // clearly a pixel value, not a proportion
      yProp: 150, // clearly a pixel value, not a proportion
      wProp: 0.15, // looks like a valid proportion
      hProp: 0.18, // looks like a valid proportion
      aspectRatio: 1,
    });
    expect(widgetNeedsProportionalMigration(stalePosition)).toBe(true);
  });

  it('flags widgets with negative pixel-valued xProp/yProp (drag-past-edge case)', () => {
    // A widget dragged past the top/left edge can have legitimately negative
    // pixel coordinates. If those leaked into xProp/yProp, a plain `> 1.5`
    // check would miss them (since -150 > 1.5 is false). Math.abs() catches
    // both signs.
    const negativeStale = baseWidget({
      x: -150,
      y: -120,
      w: 200,
      h: 200,
      xProp: -150,
      yProp: -120,
      wProp: 0.15,
      hProp: 0.18,
      aspectRatio: 1,
    });
    expect(widgetNeedsProportionalMigration(negativeStale)).toBe(true);
  });

  it('flags widgets with non-finite proportional fields (NaN / Infinity)', () => {
    // NaN and Infinity are `typeof === 'number'`, so the typeof guards above
    // would not catch them. They must be re-migrated rather than propagating
    // corrupted values into the layout calculation.
    const nanWidget = baseWidget({
      x: 100,
      y: 100,
      w: 200,
      h: 200,
      xProp: Number.NaN,
      yProp: 0.1,
      wProp: 0.15,
      hProp: 0.18,
      aspectRatio: 1,
    });
    expect(widgetNeedsProportionalMigration(nanWidget)).toBe(true);

    const infinityWidget = baseWidget({
      x: 100,
      y: 100,
      w: 200,
      h: 200,
      xProp: 0.1,
      yProp: 0.1,
      wProp: Number.POSITIVE_INFINITY,
      hProp: 0.18,
      aspectRatio: 1,
    });
    expect(widgetNeedsProportionalMigration(infinityWidget)).toBe(true);
  });

  it('flags widgets with a non-finite or non-positive aspectRatio even when proportional fields are valid', () => {
    // aspectRatio is `typeof === 'number'` for NaN/Infinity/0/negative, so the
    // existing typeof guard passes them through. Without an explicit isFinite+positive
    // check, these widgets skip re-migration and then computeWidgetPixelRect silently
    // falls back to 'fill' behaviour (because fitAspectInside rejects invalid ratios),
    // making preserve-aspect widgets appear distorted on viewport-aspect-ratio changes.
    const validProps = {
      xProp: 0.1,
      yProp: 0.1,
      wProp: 0.3,
      hProp: 0.3,
    };

    // NaN aspectRatio
    expect(
      widgetNeedsProportionalMigration(
        baseWidget({ ...validProps, aspectRatio: Number.NaN })
      )
    ).toBe(true);

    // Infinity aspectRatio
    expect(
      widgetNeedsProportionalMigration(
        baseWidget({ ...validProps, aspectRatio: Number.POSITIVE_INFINITY })
      )
    ).toBe(true);

    // Zero aspectRatio (invalid — would divide by zero in aspect math)
    expect(
      widgetNeedsProportionalMigration(
        baseWidget({ ...validProps, aspectRatio: 0 })
      )
    ).toBe(true);

    // Negative aspectRatio
    expect(
      widgetNeedsProportionalMigration(
        baseWidget({ ...validProps, aspectRatio: -1 })
      )
    ).toBe(true);
  });

  it('re-migration of a widget with NaN aspectRatio produces a finite, positive aspectRatio', () => {
    // After the guard flags the widget, migrateWidgetToProportional should
    // re-derive a valid aspectRatio from the widget's pixel w/h.
    const widget = baseWidget({
      x: 100,
      y: 100,
      w: 280,
      h: 140,
      xProp: 0.1,
      yProp: 0.1,
      wProp: 0.3,
      hProp: 0.3,
      aspectRatio: Number.NaN,
    });
    const out = migrateWidgetToProportional(widget, 1920, 1080);
    expect(Number.isFinite(out.aspectRatio as number)).toBe(true);
    expect((out.aspectRatio as number) > 0).toBe(true);
    // The re-derived aspectRatio should match pixelW / pixelH = 280 / 140 = 2
    expect(out.aspectRatio).toBeCloseTo(280 / 140, 6);
    // Regression guard for layout corruption: when aspectRatio is the only
    // corrupt field, the already-valid proportions must survive unchanged. If
    // the function recomputed them from pixel values against a fallback
    // viewport, these would drift away from the originals (0.1 / 0.3).
    expect(out.xProp).toBeCloseTo(0.1, 6);
    expect(out.yProp).toBeCloseTo(0.1, 6);
    expect(out.wProp).toBeCloseTo(0.3, 6);
    expect(out.hProp).toBeCloseTo(0.3, 6);
  });
});

describe('migrateWidgetToProportional', () => {
  it('uses the saved viewport when valid', () => {
    const w = baseWidget({ x: 0, y: 0, w: 480, h: 270 });
    const out = migrateWidgetToProportional(w, 1920, 1080);
    const { safeW, safeH } = getSafeViewport(1920, 1080);
    expect(out.wProp).toBeCloseTo(480 / safeW, 6);
    expect(out.hProp).toBeCloseTo(270 / safeH, 6);
    expect(out.aspectRatio).toBeCloseTo(480 / 270, 6);
  });

  it('falls back to REFERENCE_VIEWPORT when saved viewport is missing', () => {
    const w = baseWidget({ x: 0, y: 0, w: 200, h: 200 });
    const out = migrateWidgetToProportional(w, undefined, undefined);
    const { safeW, safeH } = getSafeViewport(
      REFERENCE_VIEWPORT.w,
      REFERENCE_VIEWPORT.h
    );
    expect(out.wProp).toBeCloseTo(200 / safeW, 6);
    expect(out.hProp).toBeCloseTo(200 / safeH, 6);
  });

  it('falls back to REFERENCE_VIEWPORT when saved viewport is corrupted (<300px)', () => {
    const w = baseWidget({ x: 0, y: 0, w: 200, h: 200 });
    const out = migrateWidgetToProportional(w, 100, 100);
    const { safeW } = getSafeViewport(
      REFERENCE_VIEWPORT.w,
      REFERENCE_VIEWPORT.h
    );
    expect(out.wProp).toBeCloseTo(200 / safeW, 6);
  });

  it('handles zero-height widgets without producing NaN', () => {
    const w = baseWidget({ w: 200, h: 0 });
    const out = migrateWidgetToProportional(w, 1920, 1080);
    expect(Number.isFinite(out.aspectRatio as number)).toBe(true);
    expect(Number.isFinite(out.wProp as number)).toBe(true);
    expect(Number.isFinite(out.hProp as number)).toBe(true);
  });

  it('handles NaN/Infinity inputs without producing NaN proportions', () => {
    const w = baseWidget({ x: NaN, y: NaN, w: NaN, h: NaN });
    const out = migrateWidgetToProportional(w, 1920, 1080);
    expect(Number.isFinite(out.xProp as number)).toBe(true);
    expect(Number.isFinite(out.yProp as number)).toBe(true);
    expect(Number.isFinite(out.wProp as number)).toBe(true);
    expect(Number.isFinite(out.hProp as number)).toBe(true);
  });

  it('preserves all non-positional widget fields', () => {
    const w = baseWidget({
      flipped: true,
      isLocked: true,
      isPinned: true,
      groupId: 'g1',
      version: 5,
    });
    const out = migrateWidgetToProportional(w, 1920, 1080);
    expect(out.flipped).toBe(true);
    expect(out.isLocked).toBe(true);
    expect(out.isPinned).toBe(true);
    expect(out.groupId).toBe('g1');
    expect(out.version).toBe(5);
    expect(out.config).toBe(w.config); // structural identity preserved
  });

  // Happy-path arithmetic tests: verify known pixel → proportional values.
  it('converts known pixel coordinates to correct proportional values on 1920×1080', () => {
    const vpW = 1920;
    const vpH = 1080;
    const { safeW, safeH } = getSafeViewport(vpW, vpH);
    const w = baseWidget({ x: 200, y: 100, w: 400, h: 300 });
    const out = migrateWidgetToProportional(w, vpW, vpH);
    expect(out.xProp).toBeCloseTo((200 - PADDING) / safeW, 6);
    expect(out.yProp).toBeCloseTo((100 - PADDING) / safeH, 6);
    expect(out.wProp).toBeCloseTo(400 / safeW, 6);
    expect(out.hProp).toBeCloseTo(300 / safeH, 6);
    expect(out.aspectRatio).toBeCloseTo(400 / 300, 6);
  });

  it('round-trips pixel → proportion → pixel correctly (same viewport)', () => {
    // Verifies that migrateWidgetToProportional + hydrateWidgetPixels
    // (fill mode, same viewport) recovers the original pixel coordinates
    // exactly (within rounding).
    const vpW = 1920;
    const vpH = 1080;
    const pixelX = 200;
    const pixelY = 100;
    const pixelW = 400;
    const pixelH = 300;
    const w = baseWidget({ x: pixelX, y: pixelY, w: pixelW, h: pixelH });
    const migrated = migrateWidgetToProportional(w, vpW, vpH);
    const hydrated = hydrateWidgetPixels(migrated, vpW, vpH, 'fill');
    expect(hydrated.x).toBe(pixelX);
    expect(hydrated.y).toBe(pixelY);
    expect(hydrated.w).toBe(pixelW);
    expect(hydrated.h).toBe(pixelH);
  });

  // Regression test for the proportionsValid early-return bug:
  // When xProp/yProp contain pixel values (e.g. from a partial migration)
  // and wProp/hProp are valid proportions, widgetNeedsProportionalMigration
  // correctly flags the widget (Math.abs(300) > 1.5). However, the old
  // migrateWidgetToProportional only checked Number.isFinite on all four
  // fields — pixel values like 300 are finite, so the early-return path
  // would skip re-deriving xProp/yProp and leave the widget at the wrong
  // on-screen position.
  it('fixes pixel-valued xProp/yProp even when wProp/hProp are already valid proportions', () => {
    const vpW = 1920;
    const vpH = 1080;
    const { safeW, safeH } = getSafeViewport(vpW, vpH);
    // Simulate a partial migration: position props are still pixel values,
    // but size props look like valid proportions. This state is reachable
    // when a migration was interrupted or applied only partially.
    const w = baseWidget({
      x: 300,
      y: 150,
      w: 400,
      h: 200,
      xProp: 300, // pixel value masquerading as proportion
      yProp: 150, // pixel value masquerading as proportion
      wProp: 0.15, // already a valid proportion
      hProp: 0.18, // already a valid proportion
      // aspectRatio intentionally absent to force full re-migration path
    });
    // The guard must have flagged this widget first:
    expect(widgetNeedsProportionalMigration(w)).toBe(true);

    const out = migrateWidgetToProportional(w, vpW, vpH);

    // After migration, all proportional fields must be in proportion range
    expect(Math.abs(out.xProp as number)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(out.yProp as number)).toBeLessThanOrEqual(1.5);
    expect((out.wProp as number) <= 1.5).toBe(true);
    expect((out.hProp as number) <= 1.5).toBe(true);

    // The corrected position props must reflect the pixel x/y, not the
    // stale pixel-valued xProp/yProp.
    expect(out.xProp).toBeCloseTo((300 - PADDING) / safeW, 6);
    expect(out.yProp).toBeCloseTo((150 - PADDING) / safeH, 6);

    // The widget must no longer need migration:
    expect(widgetNeedsProportionalMigration(out)).toBe(false);
  });

  it('fixes pixel-valued wProp/hProp even when xProp/yProp are already valid proportions', () => {
    const vpW = 1920;
    const vpH = 1080;
    const { safeW, safeH } = getSafeViewport(vpW, vpH);
    const w = baseWidget({
      x: 100,
      y: 100,
      w: 400,
      h: 300,
      xProp: 0.05, // valid proportion
      yProp: 0.09, // valid proportion
      wProp: 400, // pixel value masquerading as proportion
      hProp: 300, // pixel value masquerading as proportion
    });
    expect(widgetNeedsProportionalMigration(w)).toBe(true);

    const out = migrateWidgetToProportional(w, vpW, vpH);

    expect((out.wProp as number) <= 1.5).toBe(true);
    expect((out.hProp as number) <= 1.5).toBe(true);
    expect(out.wProp).toBeCloseTo(400 / safeW, 6);
    expect(out.hProp).toBeCloseTo(300 / safeH, 6);
    expect(widgetNeedsProportionalMigration(out)).toBe(false);
  });
});

describe('migrateDashboardWidgets idempotency', () => {
  it('returns the same array reference when no widgets need migration', () => {
    const widgets = [
      baseWidget({
        id: 'a',
        x: 0,
        y: 0,
        w: 0.2,
        h: 0.2,
        xProp: 0.0,
        yProp: 0.0,
        wProp: 0.2,
        hProp: 0.2,
        aspectRatio: 1,
      }),
    ];
    expect(migrateDashboardWidgets(widgets, 1920, 1080)).toBe(widgets);
  });

  it('migrates only widgets that need it; new array returned when something changed', () => {
    const widgets = [
      baseWidget({ id: 'a' }), // legacy
      baseWidget({
        id: 'b',
        x: 0,
        y: 0,
        w: 0.2,
        h: 0.2,
        xProp: 0,
        yProp: 0,
        wProp: 0.2,
        hProp: 0.2,
        aspectRatio: 1,
      }),
    ];
    const out = migrateDashboardWidgets(widgets, 1920, 1080);
    expect(out).not.toBe(widgets);
    expect(out[0].xProp).toBeDefined();
    expect(out[1]).toBe(widgets[1]); // unchanged reference for already-migrated
  });

  it('a second migration pass is a no-op (idempotent)', () => {
    const once = migrateDashboardWidgets([baseWidget()], 1920, 1080);
    // After hydration of pixel x/y/w/h to match the proportions, migration
    // should leave it alone. Simulate by hydrating first.
    const hydrated = once.map((w) =>
      hydrateWidgetPixels(w, 1920, 1080, 'fill')
    );
    const twice = migrateDashboardWidgets(hydrated, 1920, 1080);
    expect(twice).toBe(hydrated);
  });
});

describe('hydrateWidgetPixels', () => {
  it('computes pixel x/y/w/h from proportions', () => {
    const widget = baseWidget({
      xProp: 0.1,
      yProp: 0.1,
      wProp: 0.3,
      hProp: 0.3,
      aspectRatio: 1,
    });
    const out = hydrateWidgetPixels(widget, 1920, 1080, 'fill');
    const { safeW, safeH } = getSafeViewport(1920, 1080);
    expect(out.x).toBe(Math.round(PADDING + 0.1 * safeW));
    expect(out.y).toBe(Math.round(PADDING + 0.1 * safeH));
    expect(out.w).toBe(Math.round(0.3 * safeW));
    expect(out.h).toBe(Math.round(0.3 * safeH));
  });

  it('preserves aspect ratio when stretchBehavior is preserve-aspect', () => {
    const widget = baseWidget({
      xProp: 0,
      yProp: 0,
      wProp: 0.5,
      hProp: 0.5,
      aspectRatio: 1,
    });
    const out = hydrateWidgetPixels(widget, 2000, 500, 'preserve-aspect');
    expect(out.w).toBe(out.h); // square preserved
  });

  it('returns the same widget reference when nothing would change', () => {
    const widget = baseWidget({
      xProp: 0.1,
      yProp: 0.1,
      wProp: 0.3,
      hProp: 0.3,
      aspectRatio: 1,
    });
    const once = hydrateWidgetPixels(widget, 1920, 1080, 'fill');
    const twice = hydrateWidgetPixels(once, 1920, 1080, 'fill');
    expect(twice).toBe(once);
  });

  it('passes through unmigrated widgets unchanged', () => {
    const widget = baseWidget(); // no proportional fields
    const out = hydrateWidgetPixels(widget, 1920, 1080, 'fill');
    expect(out).toBe(widget);
  });
});
