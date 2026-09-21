import { describe, expect, it } from 'vitest';
import type { PaperSheetTemplate } from '@/types';
import {
  GRAPH_SQUARE_MM,
  LINE_RULE_MM,
  renderTemplateSvg,
  templateLabel,
} from './paperSheetTemplateSvg';

const W = 94;
const H = 80;

const lines = (svg: string): Array<Record<string, number>> =>
  [...svg.matchAll(/<line ([^/]*)\/>/g)].map((m) => {
    const attrs: Record<string, number> = {};
    for (const [, key, value] of m[1].matchAll(/(\w+[\w-]*)="([^"]*)"/g)) {
      const n = Number(value);
      if (Number.isFinite(n)) attrs[key] = n;
    }
    return attrs;
  });

/** Every drawn coordinate, so a template can be proved to stay in its box. */
const coords = (svg: string): { xs: number[]; ys: number[] } => {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const l of lines(svg)) {
    xs.push(l.x1, l.x2);
    ys.push(l.y1, l.y2);
  }
  for (const [, x, y] of svg.matchAll(/<text x="([-\d.]+)" y="([-\d.]+)"/g)) {
    xs.push(Number(x));
    ys.push(Number(y));
  }
  return { xs, ys };
};

const horizontals = (svg: string) => lines(svg).filter((l) => l.y1 === l.y2);
const verticals = (svg: string) => lines(svg).filter((l) => l.x1 === l.x2);

describe('renderTemplateSvg', () => {
  it('is sized in the millimetres it was asked for', () => {
    const svg = renderTemplateSvg({ kind: 'blank-box', heightMm: H }, W, H);
    expect(svg).toContain(`viewBox="0 0 ${W} ${H}"`);
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
  });

  it('rules graph paper in 5 mm squares', () => {
    const svg = renderTemplateSvg(
      { kind: 'graph-paper', heightMm: 50 },
      40,
      50
    );
    expect(verticals(svg).filter((l) => l.y1 !== l.y2)).toHaveLength(
      40 / GRAPH_SQUARE_MM + 1
    );
    expect(horizontals(svg).filter((l) => l.x1 !== l.x2)).toHaveLength(
      50 / GRAPH_SQUARE_MM + 1
    );
  });

  it('rules a writing area at 8 mm, and draws no verticals', () => {
    const svg = renderTemplateSvg({ kind: 'lined', heightMm: 64 }, W, 64);
    expect(horizontals(svg).filter((l) => l.x1 !== l.x2)).toHaveLength(
      64 / LINE_RULE_MM
    );
    expect(verticals(svg).filter((l) => l.y1 !== l.y2)).toHaveLength(0);
  });

  it('draws a blank box as one rectangle and nothing else', () => {
    const svg = renderTemplateSvg({ kind: 'blank-box', heightMm: H }, W, H);
    expect([...svg.matchAll(/<rect /g)]).toHaveLength(1);
    expect(lines(svg)).toHaveLength(0);
    expect(svg).not.toContain('<text');
  });

  it('ticks and numbers a number line at every step', () => {
    const svg = renderTemplateSvg(
      { kind: 'number-line', min: 0, max: 10, step: 2 },
      W,
      26
    );
    // Six ticks for 0, 2, 4, 6, 8, 10, plus the axis itself.
    expect(verticals(svg)).toHaveLength(6);
    const labels = [...svg.matchAll(/<text[^>]*>([^<]*)</g)].map((m) => m[1]);
    expect(labels).toEqual(['0', '2', '4', '6', '8', '10']);
    // Arrowheads, so the line reads as going on past what is shown.
    expect([...svg.matchAll(/<path /g)]).toHaveLength(2);
  });

  it('puts a four-quadrant grid origin in the middle and a first-quadrant one at the corner', () => {
    const four = renderTemplateSvg(
      {
        kind: 'coordinate-grid',
        quadrants: 4,
        min: -10,
        max: 10,
        step: 5,
        showNumbers: false,
      },
      W,
      W
    );
    const one = renderTemplateSvg(
      {
        kind: 'coordinate-grid',
        quadrants: 1,
        min: 0,
        max: 10,
        step: 5,
        showNumbers: false,
      },
      W,
      W
    );
    // The heavier pair is the axes; where they cross is the origin.
    const axisOf = (svg: string) => {
      const axes = lines(svg).filter((l) => l['stroke-width'] > 0.3);
      const horizontal = axes.find((l) => l.y1 === l.y2);
      const vertical = axes.find((l) => l.x1 === l.x2);
      return { x: vertical?.x1 ?? NaN, y: horizontal?.y1 ?? NaN };
    };
    const fourAxis = axisOf(four);
    expect(fourAxis.x).toBeCloseTo(W / 2, 1);
    expect(fourAxis.y).toBeCloseTo(W / 2, 1);

    const oneAxis = axisOf(one);
    expect(oneAxis.x).toBeLessThan(W / 4);
    expect(oneAxis.y).toBeGreaterThan((W * 3) / 4);
  });

  it('numbers a grid only when asked, and never labels the origin twice', () => {
    const base = {
      kind: 'coordinate-grid' as const,
      quadrants: 4 as const,
      min: -2,
      max: 2,
      step: 1,
    };
    expect(
      renderTemplateSvg({ ...base, showNumbers: false }, W, W)
    ).not.toContain('<text');
    const numbered = renderTemplateSvg({ ...base, showNumbers: true }, W, W);
    const labels = [...numbered.matchAll(/<text[^>]*>([^<]*)</g)].map(
      (m) => m[1]
    );
    // -2, -1, 1, 2 on each axis; zero is left to the axes themselves.
    expect(labels.filter((l) => l === '0')).toHaveLength(0);
    expect(labels).toHaveLength(8);
  });

  it('never draws outside the box it was given', () => {
    const cases: PaperSheetTemplate[] = [
      { kind: 'graph-paper', heightMm: H },
      { kind: 'lined', heightMm: H },
      { kind: 'blank-box', heightMm: H },
      { kind: 'number-line', min: -5, max: 5, step: 1 },
      {
        kind: 'coordinate-grid',
        quadrants: 4,
        min: -10,
        max: 10,
        step: 2,
        showNumbers: true,
      },
      {
        kind: 'coordinate-grid',
        quadrants: 1,
        min: 0,
        max: 10,
        step: 1,
        showNumbers: true,
      },
    ];
    for (const template of cases) {
      const { xs, ys } = coords(renderTemplateSvg(template, W, H));
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...xs)).toBeLessThanOrEqual(W);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...ys)).toBeLessThanOrEqual(H);
    }
  });

  it('survives a step nobody meant to type', () => {
    for (const step of [0, -1, 0.0000001]) {
      const svg = renderTemplateSvg(
        { kind: 'number-line', min: 0, max: 10, step },
        W,
        26
      );
      expect(verticals(svg).length).toBeLessThanOrEqual(201);
    }
  });
});

describe('templateLabel', () => {
  it('names each kind the way a teacher would', () => {
    expect(
      templateLabel({
        kind: 'coordinate-grid',
        quadrants: 1,
        min: 0,
        max: 10,
        step: 1,
        showNumbers: true,
      })
    ).toBe('Coordinate grid (first quadrant)');
    expect(
      templateLabel({ kind: 'number-line', min: -5, max: 5, step: 1 })
    ).toBe('Number line -5 to 5');
    expect(templateLabel({ kind: 'lined', heightMm: 64 })).toBe(
      'Lined writing area'
    );
  });
});
