import { describe, expect, it } from 'vitest';
import { inflateSync } from 'zlib';
import {
  fitText,
  renderBoardWireframe,
  WIREFRAME_WIDTH,
  type WireframeInput,
  type WireframeRect,
} from './boardWireframe';

const decode = (png: Buffer) => {
  expect(png.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  );
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    }
    if (type === 'IDAT') idat.push(data);
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 3 + 1;
  expect(raw.length).toBe(stride * height);
  const at = (x: number, y: number) => {
    const i = y * stride + 1 + x * 3;
    return [raw[i], raw[i + 1], raw[i + 2]];
  };
  return { width, height, at };
};

const DOCK_BANDS = [
  { label: 'App buttons', x: 0, y: 0, w: 78, h: 78 },
  { label: 'Dock', x: 0, y: 1000, w: 1920, h: 80 },
];

const grid = (count: number): WireframeRect[] =>
  Array.from({ length: count }, (_, i) => ({
    label: `Widget ${i + 1}`,
    x: 100 + (i % 5) * 360,
    y: 100 + Math.floor(i / 5) * 220,
    w: 340,
    h: 200,
  }));

describe('renderBoardWireframe', () => {
  it('renders an empty board at a fixed width with height from the screen shape', () => {
    const img = renderBoardWireframe({
      name: 'Empty',
      screen: { w: 1920, h: 1080 },
      rects: [],
    });
    const png = decode(img.png);
    expect(png.width).toBe(WIREFRAME_WIDTH);
    expect(png.height).toBe(img.height);
    expect(img.width).toBe(WIREFRAME_WIDTH);
    expect(img.height).toBe(40 + Math.round(1080 * (1168 / 1920)) + 36);
    expect(img.overlapCount).toBe(0);
  });

  it('keeps the size fixed for a screen shape whatever the widgets', () => {
    const a = renderBoardWireframe({
      name: 'A',
      screen: { w: 1440, h: 900 },
      rects: [],
    });
    const b = renderBoardWireframe({
      name: 'B',
      screen: { w: 1440, h: 900 },
      rects: grid(20),
      bands: DOCK_BANDS,
    });
    expect(decode(a.png).height).toBe(decode(b.png).height);
  });

  it('is byte-for-byte deterministic', () => {
    const input: WireframeInput = {
      name: 'Stations',
      screen: { w: 1920, h: 1080 },
      rects: grid(8),
      bands: DOCK_BANDS,
    };
    expect(
      renderBoardWireframe(input).png.equals(renderBoardWireframe(input).png)
    ).toBe(true);
  });

  it('renders 20 widgets with bands in under 300 ms', () => {
    const input: WireframeInput = {
      name: 'Full board',
      screen: { w: 1920, h: 1080 },
      rects: grid(20),
      bands: DOCK_BANDS,
    };
    renderBoardWireframe(input);
    const start = performance.now();
    const img = renderBoardWireframe(input);
    expect(performance.now() - start).toBeLessThan(300);
    expect(decode(img.png).width).toBe(WIREFRAME_WIDTH);
  });

  it('counts and hatches overlaps and chrome collisions', () => {
    const img = renderBoardWireframe({
      name: 'Overlap',
      screen: { w: 1920, h: 1080 },
      rects: [
        { label: 'A', x: 100, y: 100, w: 600, h: 600 },
        { label: 'B', x: 400, y: 400, w: 600, h: 500 },
        { label: 'C', x: 1200, y: 900, w: 400, h: 150 },
      ],
      bands: DOCK_BANDS,
    });
    expect(img.overlapCount).toBe(1);
    expect(img.chromeCollisionCount).toBe(1);
    const png = decode(img.png);
    const scale = 1168 / 1920;
    let red = 0;
    for (let y = 600; y < 700; y++) {
      for (let x = 600; x < 700; x++) {
        const [r, g, b] = png.at(
          16 + Math.round(x * scale),
          40 + Math.round(y * scale)
        );
        if (r === 220 && g === 38 && b === 38) red++;
      }
    }
    expect(red).toBeGreaterThan(0);
  });

  it('keeps a long label inside its box', () => {
    const box = { x: 960, y: 300, w: 200, h: 120 };
    const img = renderBoardWireframe({
      name: 'Long label',
      screen: { w: 1920, h: 1080 },
      rects: [
        {
          label:
            'A very long widget label that would run far past the right edge of its box',
          ...box,
        },
      ],
    });
    const png = decode(img.png);
    const scale = 1168 / 1920;
    const right = 16 + Math.round((box.x + box.w) * scale);
    const top = 40 + Math.round(box.y * scale);
    const bottom = 40 + Math.round((box.y + box.h) * scale);
    for (let y = top; y < bottom; y++) {
      for (let x = right; x < 1183; x++) {
        expect(png.at(x, y)).toEqual([255, 255, 255]);
      }
    }
  });

  it('ignores invalid rects and survives a bad screen', () => {
    const img = renderBoardWireframe({
      name: '',
      screen: { w: Number.NaN, h: 0 },
      rects: [
        { label: 'NaN', x: Number.NaN, y: 0, w: 10, h: 10 },
        { label: 'Zero', x: 0, y: 0, w: 0, h: 10 },
        { label: 'Off board', x: 5000, y: 5000, w: 10, h: 10 },
      ],
    });
    expect(img.overlapCount).toBe(0);
    expect(decode(img.png).width).toBe(WIREFRAME_WIDTH);
  });

  it('caps very tall screens so the image stays bounded', () => {
    const img = renderBoardWireframe({
      name: 'Tall',
      screen: { w: 400, h: 100000 },
      rects: [],
    });
    expect(img.height).toBeLessThanOrEqual(40 + 1168 * 2.5 + 36);
  });
});

describe('fitText', () => {
  it('returns short text unchanged', () => {
    expect(fitText('Timer', 500)).toBe('Timer');
  });

  it('truncates with an ellipsis', () => {
    const fitted = fitText('Checklist for the whole class period', 80);
    expect(fitted.endsWith('…')).toBe(true);
    expect(fitted.length).toBeLessThan(20);
  });

  it('strips accents and replaces characters the font lacks', () => {
    expect(fitText('Café — \u{1F600}', 500)).toBe('Cafe - ?');
  });

  it('returns nothing when even the ellipsis will not fit', () => {
    expect(fitText('Timer', 2)).toBe('');
  });
});

describe('renderBoardWireframe with hostile input', () => {
  const stacked = (count: number): WireframeRect[] =>
    Array.from({ length: count }, (_, i) => ({
      label: `Stacked ${i}`,
      x: 0,
      y: 0,
      w: 1920,
      h: 1080,
    }));

  it('stays fast when every widget covers the whole board', () => {
    renderBoardWireframe({
      name: 'Warm',
      screen: { w: 1920, h: 1080 },
      rects: stacked(2),
    });
    const start = performance.now();
    const img = renderBoardWireframe({
      name: 'Stacked',
      screen: { w: 1920, h: 1080 },
      rects: stacked(150),
      bands: DOCK_BANDS,
    });
    expect(performance.now() - start).toBeLessThan(1000);
    expect(img.overlapCount).toBe((100 * 99) / 2);
    expect(img.omittedCount).toBe(50);
  });

  it('skips null, non-object and malformed entries', () => {
    const img = renderBoardWireframe({
      name: 'Garbage',
      screen: { w: 1920, h: 1080 },
      rects: [
        null,
        7,
        'x',
        { label: 1, x: 10, y: 10, w: 100, h: 100 },
      ] as unknown as WireframeRect[],
      bands: {} as unknown as WireframeRect[],
    });
    expect(img.overlapCount).toBe(0);
    expect(img.omittedCount).toBe(0);
    expect(decode(img.png).width).toBe(WIREFRAME_WIDTH);
  });

  it('bounds the work for huge labels and names', () => {
    const huge = 'W'.repeat(2_000_000);
    const start = performance.now();
    renderBoardWireframe({
      name: huge,
      screen: { w: 1920, h: 1080 },
      rects: grid(20).map((r) => ({ ...r, label: huge })),
    });
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it('counts overlaps, chrome collisions and off-board widgets in screen pixels', () => {
    const img = renderBoardWireframe({
      name: 'Sub-pixel',
      screen: { w: 1920, h: 1080 },
      rects: [
        { label: 'A', x: 100, y: 100, w: 300, h: 300 },
        { label: 'B', x: 399, y: 100, w: 300, h: 300 },
        { label: 'Off', x: -100, y: 500, w: 300, h: 200 },
      ],
      bands: [{ label: 'Dock', x: 0, y: 1000, w: 1920, h: 80 }],
    });
    expect(img.overlapCount).toBe(1);
    expect(img.chromeCollisionCount).toBe(0);
    expect(img.offBoardCount).toBe(1);
  });

  it('labels a widget too small for its own label just outside it', () => {
    const box = { x: 900, y: 300, w: 30, h: 30 };
    const img = renderBoardWireframe({
      name: 'Small',
      screen: { w: 1920, h: 1080 },
      rects: [{ label: 'Launcher', ...box }],
    });
    const png = decode(img.png);
    const scale = 1168 / 1920;
    const below = 40 + Math.round((box.y + box.h) * scale) + 2;
    const left = 16 + Math.round(box.x * scale);
    let dark = 0;
    for (let y = below; y < below + 20; y++) {
      for (let x = left; x < left + 80; x++) {
        const [r, g, b] = png.at(x, y);
        if (r < 100 && g < 100 && b < 100) dark++;
      }
    }
    expect(dark).toBeGreaterThan(20);
  });

  it('draws dashed empty slots', () => {
    const img = renderBoardWireframe({
      name: 'Slot',
      screen: { w: 1920, h: 1080 },
      rects: [
        { label: 'Empty: Poll', x: 100, y: 100, w: 600, h: 400, kind: 'slot' },
      ],
    });
    expect(decode(img.png).width).toBe(WIREFRAME_WIDTH);
    expect(img.overlapCount).toBe(0);
  });
});

describe('fitText with non-Latin text', () => {
  it('replaces each unsupported character once and drops zero-width ones', () => {
    expect(fitText('한국어​!', 500)).toBe('???!');
  });
});

describe('fitText edge cases', () => {
  it('counts an emoji with a variation selector as one character', () => {
    expect(fitText('✏️ Math', 500)).toBe('? Math');
  });

  it('never returns a bare ellipsis', () => {
    expect(fitText('Calendar', 15)).toBe('');
  });
});

describe('renderBoardWireframe screen edges', () => {
  it('judges off-board widgets against the real screen on a tall phone', () => {
    const img = renderBoardWireframe({
      name: 'Phone',
      screen: { w: 390, h: 844 },
      rects: [{ label: 'Low', x: 10, y: 790, w: 100, h: 50 }],
    });
    expect(img.offBoardCount).toBe(0);
  });
});
