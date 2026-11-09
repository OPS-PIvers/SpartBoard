import { describe, expect, it } from 'vitest';
import { buildStartTour, type HandoffStep } from './handoff';
import { parseWebTourStartTour, parseMarkupShapes } from './extensionProtocol';

const box = { id: 'm1', kind: 'box' as const, x: 0.1, y: 0.2, w: 0.3, h: 0.2 };

const step = (id: string, markup?: unknown[]): HandoffStep => ({
  id,
  label: id,
  text: '',
  web: {
    urlPattern: 'https://a.example/home',
    action: 'click',
    locator: { role: 'button', name: id },
    ...(markup ? { picture: { markup: markup as never } } : {}),
  },
});

const pictures = new Map([
  ['a', { mime: 'image/png' as const, data: 'AAAA', w: 10, h: 10 }],
]);

describe('picture markup in the handoff (TOURS_10X.md E5)', () => {
  it('goes to an extension at protocol 12, only for pictures it sends', () => {
    const tour = buildStartTour(
      'set',
      1,
      'T',
      [step('a', [box]), step('b', [box])],
      pictures,
      true,
      true
    );
    expect(tour.markup).toEqual({ a: [box] });
    expect(parseWebTourStartTour(tour)?.markup).toEqual({ a: [box] });
  });

  it('never goes to an older extension', () => {
    const tour = buildStartTour('set', 1, 'T', [step('a', [box])], pictures);
    expect(tour).not.toHaveProperty('markup');
  });

  it('is checked shape by shape', () => {
    expect(parseMarkupShapes([box])).toEqual([box]);
    expect(parseMarkupShapes([{ ...box, x: 9 }])).toBeNull();
    expect(parseMarkupShapes([{ ...box, extra: 1 }])).toBeNull();
    expect(
      parseMarkupShapes([{ id: 'n', kind: 'number', x: 0, y: 0, n: 0 }])
    ).toBeNull();
    expect(
      parseWebTourStartTour({
        ...buildStartTour('set', 1, 'T', [step('a')], pictures),
        markup: { zz: [box] },
      })
    ).toBeNull();
  });
});
