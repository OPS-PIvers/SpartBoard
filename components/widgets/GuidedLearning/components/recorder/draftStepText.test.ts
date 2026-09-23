import { describe, expect, it } from 'vitest';
import { anchorLabelOf, cropBox } from './draftStepText';

describe('cropBox', () => {
  it('adds 20% context on each side of the region', () => {
    expect(
      cropBox(
        { xPct: 50, yPct: 50, region: { shape: 'rect', wPct: 10, hPct: 10 } },
        { w: 1000, h: 500 }
      )
    ).toEqual({ sx: 430, sy: 215, sw: 140, sh: 70, dw: 140, dh: 70 });
  });

  it('stays inside the frame and scales down to 800px', () => {
    const box = cropBox(
      { xPct: 2, yPct: 50, region: { shape: 'rect', wPct: 80, hPct: 50 } },
      { w: 2000, h: 1000 }
    );
    expect(box.sx).toBe(0);
    expect(box.sw).toBe(2000);
    expect(Math.max(box.dw, box.dh)).toBe(800);
  });
});

describe('anchorLabelOf', () => {
  it('describes registered anchors and leaves others blank', () => {
    expect(anchorLabelOf('dock.item:clock')).toBe('Widget button in the dock');
    expect(anchorLabelOf('')).toBe('');
  });
});
