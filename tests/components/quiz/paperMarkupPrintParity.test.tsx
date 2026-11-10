import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import type { PaperMarkupItem } from '@/types';
import {
  cropViewportMm,
  numberMarkupComments,
  renderPaperMarkup,
} from '@/utils/paperMarkupRender';
import {
  MarkupDisc,
  MarkupShape,
} from '@/components/quiz/paper/markup/MarkupShape';
import { layoutMarkupDiscs } from '@/components/quiz/paper/markup/markupDiscs';

const VIEW = cropViewportMm({ x: 38, y: 70, w: 140, h: 64 });

const items: PaperMarkupItem[] = [
  {
    id: 's',
    kind: 'stamp',
    atMm: { x: 80, y: 90 },
    symbol: 'star',
    comment: 'Yes',
  },
  { id: 'p', kind: 'pin', atMm: { x: 120, y: 110 }, comment: 'Why?' },
  {
    id: 'h',
    kind: 'highlight',
    rectMm: { x: 50, y: 100, w: 30, h: 6 },
    color: 'green',
  },
];

const parse = (svg: string) => {
  const host = document.createElement('div');
  host.innerHTML = svg;
  return host;
};

const editor = () => {
  const numbers = new Map(
    numberMarkupComments(items).map((c) => [c.itemId, c.number])
  );
  const discs = layoutMarkupDiscs(items, numbers, VIEW);
  const { container } = render(
    <svg>
      {items.map((i) => (
        <MarkupShape key={i.id} item={i} />
      ))}
      {items.map((i) => {
        const d = discs.get(i.id);
        return d ? <MarkupDisc key={`d${i.id}`} disc={d} /> : null;
      })}
    </svg>
  );
  return container;
};

describe('editor marks match the print', () => {
  it('centres a stamp on atMm with the same glyph, ink and transform', () => {
    const print = parse(renderPaperMarkup(items, VIEW).svg);
    const mine = editor();
    const printed = print.querySelector('path');
    const drawn = mine.querySelector('path');
    expect(drawn?.getAttribute('d')).toBe(printed?.getAttribute('d'));
    expect(drawn?.getAttribute('fill')).toBe(printed?.getAttribute('fill'));
    const nums = (t: string | null | undefined) =>
      (t ?? '').match(/-?[\d.]+/g)?.map(Number) ?? [];
    const [px, py, ps] = nums(printed?.getAttribute('transform'));
    const [ex, ey, es] = nums(drawn?.getAttribute('transform'));
    expect(ex + es / 2).toBeCloseTo(80, 3);
    expect(ey + es / 2).toBeCloseTo(90, 3);
    expect(ex).toBeCloseTo(px, 3);
    expect(ey).toBeCloseTo(py, 3);
    expect(es).toBeCloseTo(ps, 3);
  });

  it('puts pins and number badges where the print puts them, in the same ink', () => {
    const print = Array.from(
      parse(renderPaperMarkup(items, VIEW).svg).querySelectorAll('circle')
    ).map((c) => [
      c.getAttribute('cx'),
      c.getAttribute('cy'),
      c.getAttribute('fill'),
    ]);
    const mine = Array.from(editor().querySelectorAll('circle')).map((c) => [
      c.getAttribute('cx'),
      c.getAttribute('cy'),
      c.getAttribute('fill'),
    ]);
    expect(
      mine.map(([x, y, f]) => [Number(x).toFixed(2), Number(y).toFixed(2), f])
    ).toEqual(
      print.map(([x, y, f]) => [Number(x).toFixed(2), Number(y).toFixed(2), f])
    );
  });

  it('washes a highlight in the print colour and opacity', () => {
    const printed = parse(renderPaperMarkup(items, VIEW).svg).querySelector(
      'rect'
    );
    const drawn = editor().querySelector('rect');
    expect(drawn?.getAttribute('fill')).toBe(printed?.getAttribute('fill'));
    expect(drawn?.getAttribute('fill-opacity')).toBe(
      printed?.getAttribute('fill-opacity')
    );
  });
});
