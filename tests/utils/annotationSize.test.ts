import { describe, it, expect } from 'vitest';
import {
  ANNOTATION_HARD_LIMIT_BYTES,
  DASHBOARD_DOC_BUDGET_BYTES,
  estimateAnnotationBytes,
  getAnnotationCapReason,
  getAnnotationWorldRect,
} from '@/utils/annotationSize';
import { ZOOM_MIN } from '@/utils/zoomMapping';
import type { TextObject } from '@/types';

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
