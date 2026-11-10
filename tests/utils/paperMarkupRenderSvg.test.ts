import { describe, expect, it } from 'vitest';
import type { PaperMarkupColor, PaperMarkupItem } from '@/types';
import { PAPER_MARKUP_MAX_ITEMS } from '@/types';
import {
  FULL_PAGE_VIEWPORT_MM,
  PAPER_MARKUP_STYLE,
  PAPER_STAMP_GLYPHS,
  cropViewportMm,
  markupCommentListHtml,
  numberMarkupComments,
  renderPaperMarkup,
  renderPaperMarkupAnswers,
} from '@/utils/paperMarkupRender';

const view = cropViewportMm({ x: 38, y: 70, w: 140, h: 64 });
const COLORS = Object.keys(PAPER_MARKUP_STYLE.palette) as PaperMarkupColor[];

const parse = (svg: string) => {
  const div = document.createElement('div');
  div.innerHTML = svg;
  return div;
};
const num = (el: Element | null, attr: string) =>
  parseFloat(el?.getAttribute(attr) ?? 'NaN');

/** Rec. 601 luma of a hex colour, 0..255: what a black-and-white printer's gray conversion uses. */
const luma = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b;
};
const channels = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const relLum = (gray: number): number => {
  const c = gray / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const contrast = (a: number, b: number): number => {
  const [hi, lo] = [Math.max(a, b), Math.min(a, b)];
  return (relLum(hi) + 0.05) / (relLum(lo) + 0.05);
};

describe('renderPaperMarkup shapes', () => {
  it('draws a highlight at 35% multiply, filled, with no stroke, yellow by default', () => {
    const { svg } = renderPaperMarkup(
      [{ id: 'h', kind: 'highlight', rectMm: { x: 40, y: 80, w: 60, h: 5 } }],
      view
    );
    const rect = parse(svg).querySelector('rect');
    expect(rect?.getAttribute('fill')).toBe(
      PAPER_MARKUP_STYLE.palette.yellow.wash
    );
    expect(rect?.getAttribute('fill-opacity')).toBe('0.35');
    expect(rect?.getAttribute('style')).toContain('mix-blend-mode:multiply');
    expect(rect?.getAttribute('stroke')).toBeNull();
    expect(num(rect, 'x')).toBe(40);
    expect(num(rect, 'width')).toBe(60);
  });

  it('draws a box and a circle as 0.5 mm unfilled red strokes by default', () => {
    const items: PaperMarkupItem[] = [
      { id: 'r', kind: 'rect', rectMm: { x: 50, y: 90, w: 40, h: 12 } },
      { id: 'e', kind: 'ellipse', rectMm: { x: 60, y: 100, w: 20, h: 10 } },
    ];
    const root = parse(renderPaperMarkup(items, view).svg);
    const rect = root.querySelector('rect');
    const ellipse = root.querySelector('ellipse');
    for (const el of [rect, ellipse]) {
      expect(el?.getAttribute('fill')).toBe('none');
      expect(el?.getAttribute('stroke')).toBe(
        PAPER_MARKUP_STYLE.palette.red.ink
      );
      expect(el?.getAttribute('stroke-width')).toBe('0.5');
    }
    expect(num(ellipse, 'cx')).toBe(70);
    expect(num(ellipse, 'cy')).toBe(105);
    expect(num(ellipse, 'rx')).toBe(10);
    expect(num(ellipse, 'ry')).toBe(5);
  });

  it('draws each stamp as a 6 mm glyph with a 0.7 mm stroke, centred on its point', () => {
    for (const symbol of ['check', 'x', 'question', 'star'] as const) {
      const { svg } = renderPaperMarkup(
        [{ id: 's', kind: 'stamp', symbol, atMm: { x: 100, y: 90 } }],
        view
      );
      const path = parse(svg).querySelector('path');
      expect(path?.getAttribute('d')).toBe(PAPER_STAMP_GLYPHS[symbol].d);
      expect(path?.getAttribute('transform')).toBe('translate(97 87) scale(6)');
      expect(num(path, 'stroke-width') * 6).toBeCloseTo(0.7, 3);
      expect(path?.getAttribute('stroke')).toBe(
        PAPER_MARKUP_STYLE.palette.red.ink
      );
    }
  });

  it('gives each stamp its own shape, so they read without colour', () => {
    const shapes = Object.values(PAPER_STAMP_GLYPHS).map((g) => g.d);
    expect(new Set(shapes).size).toBe(4);
  });

  it('draws a pin as a 5 mm disc with its white number', () => {
    const { svg } = renderPaperMarkup(
      [{ id: 'p', kind: 'pin', atMm: { x: 100, y: 100 }, comment: 'Why?' }],
      view
    );
    const root = parse(svg);
    const disc = root.querySelectorAll('circle')[1];
    expect(num(disc, 'r')).toBe(2.5);
    expect(disc.getAttribute('fill')).toBe(PAPER_MARKUP_STYLE.palette.red.ink);
    const text = root.querySelector('text');
    expect(text?.textContent).toBe('1');
    expect(text?.getAttribute('fill')).toBe('#fff');
  });

  it('maps every colour to its palette entry', () => {
    for (const color of COLORS) {
      const items: PaperMarkupItem[] = [
        {
          id: 'h',
          kind: 'highlight',
          color,
          rectMm: { x: 40, y: 80, w: 20, h: 5 },
        },
        { id: 'r', kind: 'rect', color, rectMm: { x: 40, y: 90, w: 20, h: 5 } },
      ];
      const root = parse(renderPaperMarkup(items, view).svg);
      expect(root.querySelector('rect')?.getAttribute('fill')).toBe(
        PAPER_MARKUP_STYLE.palette[color].wash
      );
      expect(root.querySelectorAll('rect')[1].getAttribute('stroke')).toBe(
        PAPER_MARKUP_STYLE.palette[color].ink
      );
    }
  });

  it('draws highlights under the shapes and the numbers on top', () => {
    const items: PaperMarkupItem[] = [
      {
        id: 'p',
        kind: 'pin',
        atMm: { x: 50, y: 90 },
        comment: 'First',
      },
      { id: 'r', kind: 'rect', rectMm: { x: 50, y: 90, w: 10, h: 5 } },
      { id: 'h', kind: 'highlight', rectMm: { x: 50, y: 90, w: 10, h: 5 } },
    ];
    const { svg } = renderPaperMarkup(items, view);
    expect(svg.indexOf('fill-opacity')).toBeLessThan(
      svg.indexOf('stroke-linejoin')
    );
    expect(svg.indexOf('stroke-linejoin')).toBeLessThan(svg.indexOf('<text'));
  });

  it('puts the viewport in the viewBox and clips to it', () => {
    const { svg } = renderPaperMarkup([], FULL_PAGE_VIEWPORT_MM);
    expect(svg).toContain('viewBox="0 0 215.9 279.4"');
    expect(svg).toContain('overflow="hidden"');
    expect(svg).toContain('print-color-adjust:exact');
    const crop = renderPaperMarkup([], view).svg;
    expect(crop).toContain('viewBox="36 68 144 68"');
  });

  it('can stretch over a positioned parent', () => {
    const { svg } = renderPaperMarkup([], view, { overlay: true });
    expect(svg).toContain('position:absolute');
    expect(svg).toContain('width:100%');
  });

  it('grows strokes, stamps and numbers when the viewport prints smaller than life', () => {
    const items: PaperMarkupItem[] = [
      { id: 'r', kind: 'rect', rectMm: { x: 50, y: 90, w: 10, h: 5 } },
      { id: 'p', kind: 'pin', atMm: { x: 100, y: 100 }, comment: 'Hi' },
    ];
    const life = parse(renderPaperMarkup(items, view).svg);
    const half = parse(renderPaperMarkup(items, view, { scale: 0.5 }).svg);
    expect(num(half.querySelector('rect'), 'stroke-width')).toBeCloseTo(
      0.5 * 1.4,
      3
    );
    expect(num(half.querySelectorAll('circle')[1], 'r')).toBeCloseTo(
      2.5 * 1.4,
      3
    );
    expect(num(life.querySelectorAll('circle')[1], 'r')).toBe(2.5);
    const big = parse(renderPaperMarkup(items, view, { scale: 2 }).svg);
    expect(num(big.querySelectorAll('circle')[1], 'r')).toBe(2.5);
  });
});

describe('numbers on the work', () => {
  const items: PaperMarkupItem[] = [
    { id: 'a', kind: 'rect', rectMm: { x: 50, y: 90, w: 40, h: 12 } },
    {
      id: 'b',
      kind: 'rect',
      rectMm: { x: 50, y: 110, w: 40, h: 12 },
      comment: 'Cite it',
    },
    { id: 'c', kind: 'pin', atMm: { x: 120, y: 100 }, comment: 'Why?' },
    {
      id: 'd',
      kind: 'highlight',
      rectMm: { x: 60, y: 125, w: 30, h: 5 },
      comment: ' ',
    },
    {
      id: 'e',
      kind: 'stamp',
      symbol: 'star',
      atMm: { x: 150, y: 100 },
      comment: 'Nice',
    },
  ];

  it('numbers commented items in item order, matching numberMarkupComments', () => {
    const out = renderPaperMarkup(items, view);
    expect(out.comments).toEqual(numberMarkupComments(items));
    expect(out.comments.map((c) => [c.number, c.itemId])).toEqual([
      [1, 'b'],
      [2, 'c'],
      [3, 'e'],
    ]);
    const labels = [...parse(out.svg).querySelectorAll('text')].map(
      (t) => t.textContent
    );
    expect(labels.sort()).toEqual(['1', '2', '3']);
  });

  it('hangs a non-pin item’s badge off its top right corner', () => {
    const out = parse(renderPaperMarkup([items[1]], view).svg).querySelectorAll(
      'circle'
    );
    const disc = out[1];
    // The rect's top right corner is (90, 110); the badge is 4.2 mm across.
    expect(num(disc, 'r')).toBeCloseTo(2.1, 3);
    expect(num(disc, 'cx')).toBeGreaterThan(88);
    expect(num(disc, 'cx')).toBeLessThan(93);
    expect(num(disc, 'cy')).toBeLessThan(110);
  });

  it('draws no number for an item without a comment', () => {
    const out = parse(renderPaperMarkup([items[0]], view).svg);
    expect(out.querySelector('text')).toBeNull();
    expect(out.querySelectorAll('circle')).toHaveLength(0);
  });

  it('keeps the numbers of clipped items inside the viewport', () => {
    const far: PaperMarkupItem[] = [
      {
        id: 'o1',
        kind: 'rect',
        rectMm: { x: 500, y: -40, w: 10, h: 10 },
        comment: 'Off the right and top',
      },
      {
        id: 'o2',
        kind: 'pin',
        atMm: { x: -30, y: 900 },
        comment: 'Off the left and bottom',
      },
      {
        id: 'o3',
        kind: 'highlight',
        rectMm: { x: 150, y: 120, w: 90, h: 40 },
        comment: 'Runs past the corner',
      },
    ];
    const root = parse(renderPaperMarkup(far, view).svg);
    for (const disc of root.querySelectorAll('circle')) {
      if (disc.getAttribute('fill') === '#fff') continue;
      const r = num(disc, 'r');
      expect(num(disc, 'cx')).toBeGreaterThanOrEqual(view.x + r - 1e-6);
      expect(num(disc, 'cx')).toBeLessThanOrEqual(view.x + view.w - r + 1e-6);
      expect(num(disc, 'cy')).toBeGreaterThanOrEqual(view.y + r - 1e-6);
      expect(num(disc, 'cy')).toBeLessThanOrEqual(view.y + view.h - r + 1e-6);
    }
    expect(root.querySelectorAll('text')).toHaveLength(3);
  });

  it('does not stack two numbers on one spot', () => {
    const same: PaperMarkupItem[] = [1, 2, 3, 4].map((n) => ({
      id: `s${n}`,
      kind: 'rect',
      rectMm: { x: 50, y: 90, w: 40, h: 12 },
      comment: `c${n}`,
    }));
    const discs = [
      ...parse(renderPaperMarkup(same, view).svg).querySelectorAll('circle'),
    ].filter((c) => c.getAttribute('fill') !== '#fff');
    const centres = discs.map((d) => [num(d, 'cx'), num(d, 'cy')]);
    for (let i = 0; i < centres.length; i += 1) {
      for (let j = i + 1; j < centres.length; j += 1) {
        const d = Math.hypot(
          centres[i][0] - centres[j][0],
          centres[i][1] - centres[j][1]
        );
        expect(d).toBeGreaterThanOrEqual(4.19);
      }
    }
  });
});

describe('several answers in one svg', () => {
  it('draws every answer over one viewport and restarts numbering per answer', () => {
    const a: PaperMarkupItem[] = [
      { id: 'a1', kind: 'pin', atMm: { x: 30, y: 60 }, comment: 'A one' },
      { id: 'a2', kind: 'pin', atMm: { x: 60, y: 60 }, comment: 'A two' },
    ];
    const b: PaperMarkupItem[] = [
      { id: 'b1', kind: 'pin', atMm: { x: 30, y: 160 }, comment: 'B one' },
    ];
    const out = renderPaperMarkupAnswers([a, b], FULL_PAGE_VIEWPORT_MM, {
      className: 'page-markup',
    });
    expect(out.comments.map((c) => c.map((x) => x.number))).toEqual([
      [1, 2],
      [1],
    ]);
    expect(out.svg).toContain('viewBox="0 0 215.9 279.4"');
    expect(out.svg).toContain('class="page-markup"');
    expect(
      [...parse(out.svg).querySelectorAll('text')].map((t) => t.textContent)
    ).toEqual(['1', '2', '1']);
  });

  it('matches stacking one svg per answer for the comment lists', () => {
    const a: PaperMarkupItem[] = [
      { id: 'a1', kind: 'pin', atMm: { x: 30, y: 60 }, comment: 'A' },
    ];
    expect(renderPaperMarkupAnswers([a], view).comments[0]).toEqual(
      renderPaperMarkup(a, view).comments
    );
  });
});

describe('comment text and stored data are never trusted', () => {
  const evil =
    '<script>alert(1)</script> "quoted" & <img src=x onerror=alert(2)>';

  it('escapes comment text in the list', () => {
    const html = markupCommentListHtml([
      { id: 'p', kind: 'pin', atMm: { x: 1, y: 1 }, comment: evil },
    ]);
    const root = parse(html);
    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('li')?.textContent).toContain(evil);
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;quoted&quot;');
    expect(html).toContain('&amp;');
  });

  it('keeps comment text out of the svg entirely', () => {
    const { svg } = renderPaperMarkup(
      [{ id: 'p', kind: 'pin', atMm: { x: 60, y: 90 }, comment: evil }],
      view
    );
    expect(svg).not.toContain('script');
    expect(svg).not.toContain('quoted');
  });

  it('drops anything but letters, digits, dash and underscore from the class', () => {
    const { svg } = renderPaperMarkup([], view, {
      className: 'mk" onload="alert(1)" x="<',
    });
    const el = parse(svg).querySelector('svg');
    expect(el?.getAttribute('onload')).toBeNull();
    expect(el?.getAttribute('class')).toBe('mk onloadalert1 x');
    expect(
      renderPaperMarkup([], view, { className: '"><script>' }).svg
    ).not.toContain('<script');
  });

  it('maps colours and symbols through closed lookups', () => {
    const items = [
      {
        id: 'h',
        kind: 'highlight',
        color: 'red" onload="alert(1)',
        rectMm: { x: 40, y: 80, w: 20, h: 5 },
      },
      {
        id: 's',
        kind: 'stamp',
        symbol: 'star"/><script>',
        atMm: { x: 60, y: 90 },
      },
      {
        id: 'e',
        kind: 'ellipse',
        color: '<b>',
        rectMm: { x: 40, y: 90, w: 20, h: 5 },
      },
    ] as unknown as PaperMarkupItem[];
    const { svg } = renderPaperMarkup(items, view);
    expect(svg).not.toContain('onload');
    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('<b>');
    const root = parse(svg);
    // The unknown colour falls back to the kind's default; the unknown stamp is not drawn.
    expect(root.querySelector('rect')?.getAttribute('fill')).toBe(
      PAPER_MARKUP_STYLE.palette.yellow.wash
    );
    expect(root.querySelector('path')).toBeNull();
    expect(root.querySelector('ellipse')?.getAttribute('stroke')).toBe(
      PAPER_MARKUP_STYLE.palette.red.ink
    );
  });

  it('skips malformed items without throwing and keeps the good ones', () => {
    const items = [
      null,
      'text',
      42,
      { id: 'k', kind: 'arrow', rectMm: { x: 1, y: 1, w: 5, h: 5 } },
      { id: 'nan', kind: 'rect', rectMm: { x: NaN, y: 1, w: 5, h: 5 } },
      { id: 'inf', kind: 'rect', rectMm: { x: 1, y: 1, w: Infinity, h: 5 } },
      { id: 'flat', kind: 'highlight', rectMm: { x: 1, y: 1, w: 0, h: 5 } },
      { id: 'none', kind: 'rect' },
      { id: 'str', kind: 'pin', atMm: { x: '4', y: 4 }, comment: 'x' },
      { id: 'no-at', kind: 'stamp', symbol: 'check' },
      { id: 'ok', kind: 'rect', rectMm: { x: 50, y: 90, w: 10, h: 5 } },
      { id: 'neg', kind: 'rect', rectMm: { x: 70, y: 100, w: -10, h: -5 } },
    ] as unknown as PaperMarkupItem[];
    const out = renderPaperMarkup(items, view);
    const rects = parse(out.svg).querySelectorAll('rect');
    expect(rects).toHaveLength(2);
    // A box drawn right to left still draws, from its far corner.
    expect(num(rects[1], 'x')).toBe(60);
    expect(num(rects[1], 'width')).toBe(10);
    expect(num(rects[1], 'y')).toBe(95);
    expect(out.svg).not.toContain('NaN');
    expect(out.svg).not.toContain('Infinity');
    // The pin with a bad point is still listed, so its comment is never lost.
    expect(out.comments.map((c) => c.itemId)).toEqual(['str']);
  });

  it('survives something that is not a list at all', () => {
    for (const bad of [undefined, null, 'x', {}, 5]) {
      const items = bad as PaperMarkupItem[];
      expect(() => renderPaperMarkup(items, view)).not.toThrow();
      expect(() => numberMarkupComments(items)).not.toThrow();
      expect(markupCommentListHtml(items)).toBe('');
    }
  });

  it('draws no more than the editor’s item limit', () => {
    const many: PaperMarkupItem[] = Array.from(
      { length: PAPER_MARKUP_MAX_ITEMS + 25 },
      (_, i) => ({
        id: `i${i}`,
        kind: 'rect',
        rectMm: { x: 40, y: 80, w: 5, h: 5 },
        comment: `c${i}`,
      })
    );
    const out = renderPaperMarkup(many, view);
    expect(out.comments).toHaveLength(PAPER_MARKUP_MAX_ITEMS);
    expect(parse(out.svg).querySelectorAll('rect')).toHaveLength(
      PAPER_MARKUP_MAX_ITEMS
    );
  });
});

describe('black-and-white printing', () => {
  it('keeps every highlight visibly tinted, and the pencil under it readable', () => {
    const pencil = '#555555';
    const o = PAPER_MARKUP_STYLE.highlight.opacity;
    for (const color of COLORS) {
      const wash = PAPER_MARKUP_STYLE.palette[color].wash;
      // Multiply at 35% over white, then over pencil.
      const overWhite = channels(wash).map((c) => 255 - o * (255 - c));
      const gray =
        0.299 * overWhite[0] + 0.587 * overWhite[1] + 0.114 * overWhite[2];
      expect(gray).toBeLessThanOrEqual(232);
      expect(gray).toBeGreaterThanOrEqual(190);
      const factor = overWhite.map((c) => c / 255);
      const under = channels(pencil).map((c, i) => c * factor[i]);
      const pencilGray = 0.299 * under[0] + 0.587 * under[1] + 0.114 * under[2];
      expect(pencilGray).toBeLessThanOrEqual(luma(pencil));
      expect(contrast(gray, pencilGray)).toBeGreaterThanOrEqual(3.5);
    }
  });

  it('keeps every stroke and number fill dark, with a white number on it legible', () => {
    for (const color of COLORS) {
      const { ink } = PAPER_MARKUP_STYLE.palette[color];
      expect(luma(ink)).toBeLessThanOrEqual(90);
      expect(contrast(255, luma(ink))).toBeGreaterThanOrEqual(5.5);
    }
  });

  it('draws strokes at least as thick as the spec', () => {
    expect(PAPER_MARKUP_STYLE.shape.strokeMm).toBeGreaterThanOrEqual(0.5);
    expect(PAPER_MARKUP_STYLE.stamp.strokeMm).toBeGreaterThanOrEqual(0.7);
  });
});
