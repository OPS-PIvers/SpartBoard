import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildNameMatcher,
  collectRedactionRects,
  scrubFallback,
  toFrameRedactions,
  type NameMatcher,
} from './redaction';

const matcherFor = (...people: Parameters<typeof buildNameMatcher>[0]) => {
  const m = buildNameMatcher(people);
  if (!m) throw new Error('expected a matcher');
  return m;
};

const found = (m: NameMatcher, text: string) =>
  m.ranges(text).map(([s, e]) => text.slice(s, e));

describe('buildNameMatcher', () => {
  const m = matcherFor(
    { firstName: 'Alice', lastName: 'Nguyen' },
    { firstName: 'Al', lastName: 'Ortiz' },
    { firstName: 'Bo', lastName: 'Li', otherNames: ['Bobby'] },
    { firstName: 'José', lastName: "O'Neil" }
  );

  it('matches a full name as one range, whatever its case or spacing', () => {
    expect(found(m, 'Well done, alice  NGUYEN!')).toEqual(['alice  NGUYEN']);
    expect(found(m, 'Nguyen, Alice')).toEqual(['Nguyen, Alice']);
  });

  it('matches a first or last name on its own', () => {
    expect(found(m, 'Alice is next')).toEqual(['Alice']);
    expect(found(m, 'Ortiz: 4 points')).toEqual(['Ortiz']);
  });

  it('matches on word boundaries only', () => {
    expect(m.test('Alicez and Nguyens')).toBe(false);
    expect(found(m, "José and O'Neil")).toEqual(['José', "O'Neil"]);
  });

  it('ignores short names unless they are part of a full name', () => {
    expect(m.test('Al')).toBe(false);
    expect(m.test('Alice')).toBe(true);
    expect(found(m, 'Al Ortiz won')).toEqual(['Al Ortiz']);
    expect(found(m, 'Bo Li')).toEqual(['Bo Li']);
    expect(m.test('Bo')).toBe(false);
  });

  it('matches nicknames', () => {
    expect(found(m, 'Thanks Bobby')).toEqual(['Bobby']);
  });

  it('treats names as text, not patterns', () => {
    const odd = matcherFor({ firstName: 'A.J.', lastName: 'Kim (He)' });
    expect(odd.test('AxJx')).toBe(false);
    expect(found(odd, 'A.J. Kim (He)')).toEqual(['A.J. Kim (He)']);
  });

  it('is null when no roster has a usable name', () => {
    expect(buildNameMatcher([])).toBeNull();
    expect(buildNameMatcher([{ firstName: 'Jo', lastName: '' }])).toBeNull();
  });
});

const viewport = { w: 1000, h: 500 };
const rect = (x: number, y: number, width = 50, height = 20) =>
  ({
    x,
    y,
    width,
    height,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
  }) as DOMRect;

const fixture = (html: string) => {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
};

// jsdom has no layout, so Range has no getClientRects to spy on.
const stubRangeRects = (impl: (range: Range) => DOMRect[]) => {
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: function (this: Range) {
      return impl(this);
    },
  });
};

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  delete (Range.prototype as Partial<Range>).getClientRects;
});

describe('collectRedactionRects', () => {
  const m = matcherFor({ firstName: 'Alice', lastName: 'Nguyen' });

  it('collects name text, data-pii elements and fields whose value is a name', () => {
    const root = fixture(`
      <p>Up next: <b>Alice Nguyen</b> and friends</p>
      <video data-pii></video>
      <input value="alice" />
      <input value="Timer" />
      <select><option>Nobody</option><option selected>Nguyen</option></select>
    `);
    const ranges: string[] = [];
    stubRangeRects((range) => {
      ranges.push(range.toString());
      return [rect(100, 10)];
    });
    const boxes = new Map<Element, DOMRect>([
      [root.querySelector('video') as Element, rect(0, 100, 320, 180)],
      [root.querySelectorAll('input')[0], rect(400, 10)],
      [root.querySelectorAll('input')[1], rect(500, 10)],
      [root.querySelector('select') as Element, rect(600, 10)],
    ]);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: Element) {
        return boxes.get(this) ?? rect(0, 0, 0, 0);
      }
    );

    const rects = collectRedactionRects(document.body, m, viewport);
    expect(ranges).toEqual(['Alice Nguyen']);
    expect(rects.map((r) => r.x).sort((a, b) => a - b)).toEqual([
      0, 100, 400, 600,
    ]);
  });

  it("skips the recorder's own UI and anything off screen", () => {
    fixture(`
      <div data-tour-ignore><span>Alice</span><img data-pii /></div>
      <p>Alice</p>
    `);
    stubRangeRects(() => [rect(1200, 10)]);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      rect(10, 10)
    );
    expect(collectRedactionRects(document.body, m, viewport)).toEqual([]);
  });

  it('still blurs data-pii elements when no roster has names', () => {
    fixture('<canvas data-pii></canvas><p>Alice</p>');
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      rect(10, 10)
    );
    expect(collectRedactionRects(document.body, null, viewport)).toHaveLength(
      1
    );
  });
});

describe('toFrameRedactions', () => {
  it('pads each rect, maps it onto the frame and drops duplicates', () => {
    const boxes = toFrameRedactions(
      [rect(96, 46, 200, 100), rect(96, 46, 200, 100)],
      viewport,
      { w: 2000, h: 1000 }
    );
    expect(boxes).toHaveLength(1);
    expect(boxes[0].xPct).toBeCloseTo(9.2);
    expect(boxes[0].yPct).toBeCloseTo(8.4);
    expect(boxes[0].wPct).toBeCloseTo(20.8);
    expect(boxes[0].hPct).toBeCloseTo(21.6);
  });
});

describe('scrubFallback', () => {
  const m = matcherFor({ firstName: 'Alice', lastName: 'Nguyen' });

  it('drops a fallback named after a student and keeps the rest', () => {
    expect(scrubFallback({ role: 'button', name: 'alice nguyen' }, m)).toBe(
      undefined
    );
    expect(scrubFallback({ role: 'button', name: 'add a class' }, m)).toEqual({
      role: 'button',
      name: 'add a class',
    });
  });
});
