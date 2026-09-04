import { describe, it, expect } from 'vitest';
import {
  ANNOTATION_HARD_LIMIT_BYTES,
  ANNOTATION_SOFT_LIMIT_BYTES,
  DASHBOARD_DOC_BUDGET_BYTES,
  DASHBOARD_DOC_SOFT_LIMIT_BYTES,
  estimateAnnotationBytes,
  estimateWidgetBytes,
  getAnnotationCapReason,
  getAnnotationSoftWarning,
  getAnnotationWorldRect,
} from '@/utils/annotationSize';
import { ZOOM_MIN } from '@/utils/zoomMapping';
import type { TextObject, WidgetData } from '@/types';

const text = (content: string): TextObject => ({
  id: 't',
  kind: 'text',
  z: 0,
  x: 0,
  y: 0,
  w: 1,
  h: 1,
  content,
  fontFamily: 'sans-serif',
  fontSize: 24,
  color: '#000',
});

describe('estimateAnnotationBytes', () => {
  it('counts UTF-8 bytes, not UTF-16 code units', () => {
    const ascii = estimateAnnotationBytes([text('aaaa')]);
    const accented = estimateAnnotationBytes([text('éééé')]);
    const emoji = estimateAnnotationBytes([text('😀😀😀😀')]);
    expect(accented).toBe(ascii + 4);
    // Each emoji is 2 code units but 4 bytes; JSON keeps them raw.
    expect(emoji).toBe(ascii + 12);
  });
});

describe('getAnnotationWorldRect', () => {
  // Regression: the canvas was sized to the viewport while living inside
  // `#dashboard-zoom-surface`. At ZOOM_MIN the surface renders the whole world
  // inside the viewport, so only the central quarter of the screen accepted
  // ink and the outer band fell through to the widgets underneath.
  it('REGRESSION: covers every visible pixel at ZOOM_MIN', () => {
    const vw = 1024;
    const vh = 768;
    const rect = getAnnotationWorldRect(vw, vh);
    // The zoom surface transform is `scale(zoom)` about its center, so a
    // wrapper-space coordinate maps to half + (coord - half) * zoom.
    const toScreen = (coord: number, size: number) =>
      size / 2 + (coord - size / 2) * ZOOM_MIN;

    expect(toScreen(rect.left, vw)).toBeCloseTo(0);
    expect(toScreen(rect.left + rect.width, vw)).toBeCloseTo(vw);
    expect(toScreen(rect.top, vh)).toBeCloseTo(0);
    expect(toScreen(rect.top + rect.height, vh)).toBeCloseTo(vh);
  });

  it('is centered on the viewport', () => {
    const rect = getAnnotationWorldRect(1000, 500);
    expect(rect.left + rect.width / 2).toBeCloseTo(500);
    expect(rect.top + rect.height / 2).toBeCloseTo(250);
  });
});

describe('getAnnotationCapReason', () => {
  it('allows ink that fits both the ink cap and the shared document budget', () => {
    expect(getAnnotationCapReason(1000, 1000)).toBeNull();
  });

  it('refuses ink past the annotation layer cap', () => {
    expect(getAnnotationCapReason(ANNOTATION_HARD_LIMIT_BYTES + 1, 0)).toBe(
      'ink'
    );
  });

  // Regression: the ink cap ignored the widgets sharing the same 1 MiB doc,
  // so a widget-heavy board could still be pushed over the Firestore limit.
  it('REGRESSION: refuses ink that fits alone but not alongside the widgets', () => {
    const widgetBytes = DASHBOARD_DOC_BUDGET_BYTES - 1000;
    expect(getAnnotationCapReason(1001, widgetBytes)).toBe('document');
    expect(getAnnotationCapReason(999, widgetBytes)).toBeNull();
  });
});

describe('estimateWidgetBytes', () => {
  const widget = (config: Record<string, unknown>): WidgetData => ({
    id: 'w1',
    type: 'random',
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    z: 1,
    flipped: false,
    config: config as WidgetData['config'],
  });

  // Regression: the budget was measured against the in-memory widgets, which
  // still carry the student roster. Firestore only ever receives the scrubbed
  // copy, so a big custom roster shrank the ink allowance for no reason.
  it('REGRESSION: measures the scrubbed widgets, not the in-memory roster', () => {
    const roster = 'Student Name;'.repeat(200);
    const withPii = estimateWidgetBytes([
      widget({ label: 'Picker', firstNames: roster }),
    ]);
    const withoutPii = estimateWidgetBytes([widget({ label: 'Picker' })]);
    expect(withPii).toBe(withoutPii);
    expect(withPii).toBeLessThan(roster.length);
  });
});

describe('getAnnotationSoftWarning', () => {
  // Regression: the ink warning compared ink + widget bytes against the
  // ink-only soft limit, so the first stroke on a widget-heavy board warned
  // that the annotation layer was getting large.
  it('REGRESSION: the first stroke on a widget-heavy board raises no ink warning', () => {
    const widgetBytes = ANNOTATION_SOFT_LIMIT_BYTES + 50_000;
    expect(getAnnotationSoftWarning(0, 500, widgetBytes)).toBeNull();
  });

  it('warns once when the ink alone crosses its own soft limit', () => {
    expect(
      getAnnotationSoftWarning(
        ANNOTATION_SOFT_LIMIT_BYTES - 10,
        ANNOTATION_SOFT_LIMIT_BYTES + 10,
        0
      )
    ).toBe('ink');
    // Already over: no repeat warning on the next stroke.
    expect(
      getAnnotationSoftWarning(
        ANNOTATION_SOFT_LIMIT_BYTES + 10,
        ANNOTATION_SOFT_LIMIT_BYTES + 20,
        0
      )
    ).toBeNull();
  });

  it('warns that the board is near full on the combined threshold', () => {
    const widgetBytes = DASHBOARD_DOC_SOFT_LIMIT_BYTES - 1000;
    expect(getAnnotationSoftWarning(500, 1500, widgetBytes)).toBe('document');
    expect(getAnnotationSoftWarning(400, 500, widgetBytes)).toBeNull();
  });

  it('keeps the combined threshold under the hard document budget', () => {
    expect(DASHBOARD_DOC_SOFT_LIMIT_BYTES).toBeLessThan(
      DASHBOARD_DOC_BUDGET_BYTES
    );
  });
});
