import { describe, expect, it, vi } from 'vitest';
import type { WhiteboardStartingPage } from '@/types';
import {
  WHITEBOARD_PAGE_HEIGHT,
  WHITEBOARD_PAGE_WIDTH,
  drawStartingPage,
  fitImageToPage,
  niceStep,
  placedImages,
  renderStartingPageCanvas,
  startingImageSrc,
  startingPageId,
  startingPageIssues,
} from '@/utils/whiteboard/startingPage';

type Call = [string, ...unknown[]];

// Records every method call and property write so tests can assert on what was painted.
const makeRecorder = () => {
  const calls: Call[] = [];
  const state: Record<string | symbol, unknown> = {};
  const ctx = new Proxy(state, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        calls.push([String(prop), ...args]);
      };
    },
    set(target, prop, value) {
      target[prop] = value;
      calls.push([`set:${String(prop)}`, value]);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  const named = (name: string) => calls.filter((c) => c[0] === name);
  return { ctx, calls, named };
};

const page = (
  pattern: WhiteboardStartingPage['pattern']
): WhiteboardStartingPage => ({ pattern });

const IMG = {
  driveFileId: 'f1',
  url: 'https://lh3.googleusercontent.com/d/f1',
  mimeType: 'image/png',
  width: 400,
  height: 300,
};

const W = WHITEBOARD_PAGE_WIDTH;
const H = WHITEBOARD_PAGE_HEIGHT;

describe('drawStartingPage', () => {
  it('fills the whole page white and paints nothing else for blank', () => {
    const r = makeRecorder();
    drawStartingPage(r.ctx, page({ kind: 'blank' }));
    expect(r.named('fillRect')).toEqual([['fillRect', 0, 0, W, H]]);
    expect(r.named('stroke')).toHaveLength(0);
    expect(r.named('save')).toHaveLength(r.named('restore').length);
  });

  it('reuses the Drawing widget grid across the full page', () => {
    const r = makeRecorder();
    drawStartingPage(r.ctx, page({ kind: 'grid' }));
    const rects = r.named('fillRect').slice(1);
    expect(rects).toContainEqual(['fillRect', 0, 0, 1, H]);
    expect(rects).toContainEqual(['fillRect', 0, 0, W, 1]);
    expect(rects.length).toBeGreaterThan(100);
  });

  it('paints lines and dots', () => {
    const lines = makeRecorder();
    drawStartingPage(lines.ctx, page({ kind: 'lines' }));
    expect(lines.named('fillRect').length).toBeGreaterThan(30);
    const dots = makeRecorder();
    drawStartingPage(dots.ctx, page({ kind: 'dots' }));
    expect(dots.named('arc').length).toBeGreaterThan(1000);
  });

  it('draws a coordinate plane with axes through zero and labelled ticks', () => {
    const r = makeRecorder();
    drawStartingPage(
      r.ctx,
      page({ kind: 'coordinate-plane', xMin: -10, xMax: 10, yMin: -5, yMax: 5 })
    );
    const labels = r.named('fillText').map((c) => c[1]);
    expect(labels).toContain('-10');
    expect(labels).toContain('10');
    expect(labels).toContain('-5');
    expect(labels).toContain('5');
    expect(labels.filter((l) => l === '0')).toHaveLength(1);
    // The x axis crosses the y axis at the page centre for a symmetric range.
    expect(r.named('moveTo')).toContainEqual(['moveTo', W / 2, H - 72 + 24]);
  });

  it('thins coordinate plane labels for wide ranges', () => {
    const r = makeRecorder();
    drawStartingPage(
      r.ctx,
      page({ kind: 'coordinate-plane', xMin: 0, xMax: 100, yMin: 0, yMax: 50 })
    );
    const labels = r.named('fillText').map((c) => c[1]);
    expect(labels).toContain('100');
    expect(labels).not.toContain('1');
    expect(labels.length).toBeLessThanOrEqual(42);
  });

  it('keeps whole-unit grid lines for small whole-number ranges', () => {
    const r = makeRecorder();
    drawStartingPage(
      r.ctx,
      page({ kind: 'coordinate-plane', xMin: -5, xMax: 5, yMin: -5, yMax: 5 })
    );
    const labels = r.named('fillText').map((c) => c[1]);
    expect(labels).not.toContain('0.5');
    expect(labels).toHaveLength(21);
  });

  it('puts axes on the edge when zero is out of range', () => {
    const r = makeRecorder();
    drawStartingPage(
      r.ctx,
      page({ kind: 'coordinate-plane', xMin: 2, xMax: 12, yMin: 3, yMax: 9 })
    );
    const labels = r.named('fillText').map((c) => c[1]);
    expect(labels).not.toContain('0');
    expect(labels).toContain('2');
    expect(labels).toContain('3');
  });

  it('draws a number line with a tick per step and clean decimal labels', () => {
    const r = makeRecorder();
    drawStartingPage(
      r.ctx,
      page({ kind: 'number-line', min: 0, max: 1, step: 0.1 })
    );
    const labels = r.named('fillText').map((c) => c[1]);
    expect(labels).toEqual([
      '0',
      '0.1',
      '0.2',
      '0.3',
      '0.4',
      '0.5',
      '0.6',
      '0.7',
      '0.8',
      '0.9',
      '1',
    ]);
  });

  it('labels every other tick once a number line has more than 20', () => {
    const r = makeRecorder();
    drawStartingPage(
      r.ctx,
      page({ kind: 'number-line', min: -20, max: 20, step: 1 })
    );
    const labels = r.named('fillText').map((c) => c[1]);
    expect(labels).toHaveLength(21);
    expect(labels[0]).toBe('-20');
    expect(labels[20]).toBe('20');
  });

  it('draws each shape large and centred', () => {
    const circle = makeRecorder();
    drawStartingPage(circle.ctx, page({ kind: 'shape', shape: 'circle' }));
    const [, cx, cy, radius] = circle.named('arc')[0] as [
      string,
      number,
      number,
      number,
    ];
    expect([cx, cy]).toEqual([W / 2, H / 2]);
    expect(radius).toBeGreaterThan(H / 3);

    const rect = makeRecorder();
    drawStartingPage(rect.ctx, page({ kind: 'shape', shape: 'rectangle' }));
    const [, x, y, w, h] = rect.named('strokeRect')[0] as [
      string,
      number,
      number,
      number,
      number,
    ];
    expect(x + w / 2).toBe(W / 2);
    expect(y + h / 2).toBe(H / 2);

    const tri = makeRecorder();
    drawStartingPage(tri.ctx, page({ kind: 'shape', shape: 'triangle' }));
    const pts = [...tri.named('moveTo'), ...tri.named('lineTo')].map(
      (c) => [c[1], c[2]] as [number, number]
    );
    expect(pts).toHaveLength(3);
    const ys = pts.map((p) => p[1]);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(H / 2, 5);

    const hex = makeRecorder();
    drawStartingPage(
      hex.ctx,
      page({ kind: 'shape', shape: 'polygon', sides: 6 })
    );
    expect(hex.named('lineTo')).toHaveLength(5);
    expect(hex.named('closePath')).toHaveLength(1);
  });

  it('fits a legacy image whole and centred before painting the pattern on top', () => {
    const r = makeRecorder();
    const img = { width: 400, height: 400 } as unknown as CanvasImageSource;
    drawStartingPage(
      r.ctx,
      {
        pattern: { kind: 'shape', shape: 'circle' },
        image: {
          driveFileId: 'f1',
          url: 'https://lh3.googleusercontent.com/d/f1',
          mimeType: 'image/png',
          width: 400,
          height: 400,
        },
      },
      new Map([['f1', img]])
    );
    const draw = r.named('drawImage')[0];
    expect(draw.slice(2)).toEqual([200, 0, 1200, 1200]);
    const order = r.calls.map((c) => c[0]);
    expect(order.indexOf('drawImage')).toBeLessThan(order.indexOf('arc'));
  });

  it('paints white, then each placed image, then the pattern, then teacher ink', () => {
    const r = makeRecorder();
    const a = { id: 'a' } as unknown as CanvasImageSource;
    const b = { id: 'b' } as unknown as CanvasImageSource;
    drawStartingPage(
      r.ctx,
      {
        pattern: { kind: 'shape', shape: 'circle' },
        images: [
          { ...IMG, driveFileId: 'a', x: 10, y: 20, w: 300, h: 200 },
          { ...IMG, driveFileId: 'b', x: 500, y: 600, w: 100, h: 50 },
        ],
        ink: [{ color: '#0f172a', size: 4, points: [1, 2, 30, 40, 50, 60] }],
      },
      new Map([
        ['a', a],
        ['b', b],
      ])
    );
    const draws = r.named('drawImage');
    expect(draws.map((d) => d[1])).toEqual([a, b]);
    expect(draws[0].slice(2)).toEqual([10, 20, 300, 200]);
    expect(draws[1].slice(2)).toEqual([500, 600, 100, 50]);
    const order = r.calls.map((c) => c[0]);
    const lastDraw = order.lastIndexOf('drawImage');
    expect(order.indexOf('fillRect')).toBeLessThan(order.indexOf('drawImage'));
    expect(lastDraw).toBeLessThan(order.indexOf('arc'));
    const inkMove = r.calls.findIndex(
      (c) => c[0] === 'moveTo' && c[1] === 1 && c[2] === 2
    );
    expect(inkMove).toBeGreaterThan(order.lastIndexOf('arc'));
    expect(r.named('lineTo').slice(-2)).toEqual([
      ['lineTo', 30, 40],
      ['lineTo', 50, 60],
    ]);
  });

  it('skips an image that has not loaded and still paints the ink', () => {
    const r = makeRecorder();
    drawStartingPage(
      r.ctx,
      {
        pattern: { kind: 'blank' },
        images: [{ ...IMG, driveFileId: 'a', x: 0, y: 0, w: 10, h: 10 }],
        ink: [{ color: '#0f172a', size: 4, points: [5, 5] }],
      },
      new Map()
    );
    expect(r.named('drawImage')).toHaveLength(0);
    expect(r.named('arc')).toHaveLength(1);
  });

  it('paints only the white page when the spec is invalid', () => {
    const r = makeRecorder();
    drawStartingPage(
      r.ctx,
      page({ kind: 'number-line', min: 5, max: 5, step: 1 })
    );
    expect(r.named('fillText')).toHaveLength(0);
    expect(r.named('fillRect')).toHaveLength(1);
  });
});

describe('fitImageToPage', () => {
  it('letterboxes a wide image and pillarboxes a tall one', () => {
    expect(fitImageToPage(3200, 1200)).toEqual({
      x: 0,
      y: 300,
      w: 1600,
      h: 600,
    });
    expect(fitImageToPage(600, 1200)).toEqual({
      x: 500,
      y: 0,
      w: 600,
      h: 1200,
    });
  });

  it('returns null for an empty image', () => {
    expect(fitImageToPage(0, 100)).toBeNull();
  });
});

describe('startingPageIssues', () => {
  it('accepts valid specs', () => {
    expect(startingPageIssues(page({ kind: 'grid' }))).toEqual([]);
    expect(
      startingPageIssues(
        page({
          kind: 'coordinate-plane',
          xMin: -10,
          xMax: 10,
          yMin: -10,
          yMax: 10,
        })
      )
    ).toEqual([]);
    expect(
      startingPageIssues(
        page({ kind: 'number-line', min: 0, max: 10, step: 0.5 })
      )
    ).toEqual([]);
  });

  it('rejects reversed, empty and non-finite axis ranges', () => {
    expect(
      startingPageIssues(
        page({
          kind: 'coordinate-plane',
          xMin: 5,
          xMax: -5,
          yMin: 0,
          yMax: Number.NaN,
        })
      )
    ).toEqual(['x-range', 'y-range']);
  });

  it('accepts wide ranges and thins their labels instead', () => {
    expect(
      startingPageIssues(
        page({
          kind: 'coordinate-plane',
          xMin: 0,
          xMax: 500,
          yMin: 0,
          yMax: 10,
        })
      )
    ).toEqual([]);
  });

  it('rejects bad number line steps and too many ticks', () => {
    expect(
      startingPageIssues(
        page({ kind: 'number-line', min: 0, max: 10, step: 0 })
      )
    ).toEqual(['number-line-step']);
    expect(
      startingPageIssues(
        page({ kind: 'number-line', min: 0, max: 1000, step: 1 })
      )
    ).toEqual(['too-many-ticks']);
    expect(
      startingPageIssues(
        page({ kind: 'number-line', min: 0, max: 10, step: 0.1 })
      )
    ).toEqual([]);
  });

  it('rejects polygons outside 3 to 12 sides', () => {
    expect(
      startingPageIssues(page({ kind: 'shape', shape: 'polygon', sides: 2 }))
    ).toEqual(['shape-sides']);
    expect(
      startingPageIssues(page({ kind: 'shape', shape: 'polygon', sides: 4.5 }))
    ).toEqual(['shape-sides']);
  });
});

describe('startingPageId', () => {
  it('is stable regardless of key order', () => {
    const a = startingPageId(
      page({ kind: 'coordinate-plane', xMin: -1, xMax: 1, yMin: -2, yMax: 2 })
    );
    const b = startingPageId({
      pattern: {
        yMax: 2,
        yMin: -2,
        xMax: 1,
        xMin: -1,
        kind: 'coordinate-plane',
      },
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^sp1_[0-9a-f]{8}$/);
  });

  it('changes when the page changes', () => {
    const ids = new Set([
      startingPageId(page({ kind: 'blank' })),
      startingPageId(page({ kind: 'grid' })),
      startingPageId(page({ kind: 'number-line', min: 0, max: 10, step: 1 })),
      startingPageId(page({ kind: 'number-line', min: 0, max: 10, step: 2 })),
    ]);
    expect(ids.size).toBe(4);
  });
});

describe('niceStep', () => {
  it('picks 1, 2 or 5 times a power of ten', () => {
    expect(niceStep(20, 20)).toBe(1);
    expect(niceStep(40, 20)).toBe(2);
    expect(niceStep(100, 20)).toBe(5);
    expect(niceStep(2, 20)).toBeCloseTo(0.1);
  });
});

describe('renderStartingPageCanvas', () => {
  it('allocates a 3200x2400 bitmap and paints at 2x', () => {
    const r = makeRecorder();
    const spy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => r.ctx);
    const canvas = renderStartingPageCanvas(page({ kind: 'blank' }));
    spy.mockRestore();
    expect([canvas.width, canvas.height]).toEqual([3200, 2400]);
    expect(r.calls[0]).toEqual(['setTransform', 2, 0, 0, 2, 0, 0]);
    expect(r.named('fillRect')).toEqual([['fillRect', 0, 0, W, H]]);
  });
});

describe('placedImages', () => {
  it('turns a legacy image into one fitted placement', () => {
    expect(placedImages({ pattern: { kind: 'blank' }, image: IMG })).toEqual([
      { ...IMG, x: 0, y: 0, w: 1600, h: 1200 },
    ]);
  });

  it('prefers images over the legacy image and caps them at six', () => {
    const one = { ...IMG, x: 1, y: 2, w: 3, h: 4 };
    const spec: WhiteboardStartingPage = {
      pattern: { kind: 'blank' },
      image: IMG,
      images: Array.from({ length: 8 }, () => one),
    };
    expect(placedImages(spec)).toHaveLength(6);
    expect(
      placedImages({ pattern: { kind: 'blank' }, image: IMG, images: [] })
    ).toEqual([]);
  });

  it('returns nothing for no spec or no image', () => {
    expect(placedImages(undefined)).toEqual([]);
    expect(placedImages(page({ kind: 'grid' }))).toEqual([]);
  });
});

describe('startingImageSrc', () => {
  it('loads Drive images from lh3 and a dev data URL as is', () => {
    expect(startingImageSrc(IMG)).toBe(
      'https://lh3.googleusercontent.com/d/f1'
    );
    expect(startingImageSrc({ ...IMG, url: 'data:image/png;base64,AA' })).toBe(
      'data:image/png;base64,AA'
    );
  });
});

describe('startingPageId with images and ink', () => {
  it('changes when an image moves or ink is added', () => {
    const base: WhiteboardStartingPage = {
      pattern: { kind: 'grid' },
      images: [{ ...IMG, x: 0, y: 0, w: 400, h: 300 }],
    };
    const moved: WhiteboardStartingPage = {
      ...base,
      images: [{ ...IMG, x: 10, y: 0, w: 400, h: 300 }],
    };
    const inked: WhiteboardStartingPage = {
      ...base,
      ink: [{ color: '#0f172a', size: 4, points: [0, 0, 5, 5] }],
    };
    const ids = new Set([base, moved, inked].map(startingPageId));
    expect(ids.size).toBe(3);
    expect(startingPageId(page({ kind: 'grid' }))).not.toBe(
      startingPageId(base)
    );
  });
});
