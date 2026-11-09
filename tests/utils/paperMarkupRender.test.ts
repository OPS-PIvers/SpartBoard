import { describe, expect, it } from 'vitest';
import type { PaperMarkupItem } from '@/types';
import {
  FULL_PAGE_VIEWPORT_MM,
  cropPxToSheetMm,
  cropRectPxToSheetMm,
  cropViewportMm,
  numberMarkupComments,
  renderPaperMarkup,
  sheetMmToCropPx,
  sheetRectMmToCropPx,
} from '@/utils/paperMarkupRender';

const box = { x: 38, y: 70, w: 140, h: 64 };
// A crop at 150 dpi: (140 + 4) mm and (64 + 4) mm wide and tall.
const image = {
  width: Math.round((144 * 150) / 25.4),
  height: Math.round((68 * 150) / 25.4),
};

describe('crop pixel and sheet millimetre conversion', () => {
  it('pads the box by the 2 mm crop margin', () => {
    expect(cropViewportMm(box)).toEqual({ x: 36, y: 68, w: 144, h: 68 });
  });

  it('maps the crop corners to the margin-padded box corners', () => {
    expect(cropPxToSheetMm({ x: 0, y: 0 }, box, image)).toEqual({
      x: 36,
      y: 68,
    });
    const far = cropPxToSheetMm(
      { x: image.width, y: image.height },
      box,
      image
    );
    expect(far.x).toBeCloseTo(180, 6);
    expect(far.y).toBeCloseTo(136, 6);
  });

  it('round-trips points and rects', () => {
    const mm = { x: 100.25, y: 90.5 };
    const back = cropPxToSheetMm(sheetMmToCropPx(mm, box, image), box, image);
    expect(back.x).toBeCloseTo(mm.x, 9);
    expect(back.y).toBeCloseTo(mm.y, 9);
    const rect = { x: 50, y: 80, w: 20, h: 6 };
    const r = cropRectPxToSheetMm(
      sheetRectMmToCropPx(rect, box, image),
      box,
      image
    );
    expect(r.x).toBeCloseTo(rect.x, 9);
    expect(r.w).toBeCloseTo(rect.w, 9);
    expect(r.h).toBeCloseTo(rect.h, 9);
  });

  it('still maps a crop the encoder halved', () => {
    const half = {
      width: Math.floor(image.width / 2),
      height: Math.floor(image.height / 2),
    };
    const p = cropPxToSheetMm({ x: half.width, y: half.height }, box, half);
    expect(p.x).toBeCloseTo(180, 6);
    expect(p.y).toBeCloseTo(136, 6);
  });
});

describe('numberMarkupComments', () => {
  it('numbers commented items per answer in item order, skipping blanks', () => {
    const items: PaperMarkupItem[] = [
      { id: 'a', kind: 'rect', rectMm: { x: 1, y: 1, w: 2, h: 2 } },
      { id: 'b', kind: 'pin', atMm: { x: 3, y: 3 }, comment: 'Cite it' },
      {
        id: 'c',
        kind: 'stamp',
        atMm: { x: 4, y: 4 },
        symbol: 'star',
        comment: '  ',
      },
      {
        id: 'd',
        kind: 'highlight',
        rectMm: { x: 5, y: 5, w: 9, h: 3 },
        comment: ' Good ',
      },
    ];
    expect(numberMarkupComments(items)).toEqual([
      { number: 1, itemId: 'b', text: 'Cite it' },
      { number: 2, itemId: 'd', text: 'Good' },
    ]);
  });
});

describe('renderPaperMarkup', () => {
  it('draws in the viewport millimetres and returns the comment list', () => {
    const out = renderPaperMarkup(
      [{ id: 'p', kind: 'pin', atMm: { x: 3, y: 3 }, comment: 'Why?' }],
      FULL_PAGE_VIEWPORT_MM,
      { className: 'mk' }
    );
    expect(out.svg).toContain('viewBox="0 0 215.9 279.4"');
    expect(out.svg).toContain('class="mk"');
    expect(out.comments).toEqual([{ number: 1, itemId: 'p', text: 'Why?' }]);
  });
});
