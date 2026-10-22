import { describe, expect, it } from 'vitest';
import { parseWebTourStart } from './startMessage';

const valid = () => ({
  type: 'web-tour/start',
  startUrl: 'https://orono.schoology.com/home',
  stepIndex: 1,
  tour: {
    setId: 's1',
    version: 3,
    title: 'Post an update',
    steps: [
      {
        id: 'a',
        label: 'Open',
        text: 'Click it',
        web: { urlPattern: 'https://orono.schoology.com/home', action: 'click', locator: { role: 'button', name: 'Open', box: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } } },
        picture: { mime: 'image/png', data: 'AAAA', w: 10, h: 10 },
      },
      {
        id: 'b',
        web: { urlPattern: 'https://orono.schoology.com/course/*', action: 'observe', locator: { text: 'Grades', frames: [{ urlPattern: 'https://x.example/f', index: 0 }] } },
      },
    ],
  },
});

describe('parseWebTourStart', () => {
  it('accepts the hub shape and keeps pictures apart from the steps', () => {
    const p = parseWebTourStart(valid());
    expect(p?.stepIndex).toBe(1);
    expect(p?.tour.steps[0]).toMatchObject({ id: 'a', title: 'Open', hasPicture: true, action: 'click' });
    expect(p?.tour.steps[1].frames).toEqual([{ urlPattern: 'https://x.example/f', index: 0 }]);
    expect(p?.pictures.a.data).toBe('AAAA');
  });

  it('clamps the step index', () => {
    expect(parseWebTourStart({ ...valid(), stepIndex: 99 })?.stepIndex).toBe(1);
    expect(parseWebTourStart({ ...valid(), stepIndex: -3 })?.stepIndex).toBe(0);
  });

  it('opens only https pages', () => {
    for (const startUrl of ['javascript:alert(1)', 'http://a.example/', 'data:text/html,x', 'https://u:p@a.example/']) {
      expect(parseWebTourStart({ ...valid(), startUrl })).toBeNull();
    }
  });

  it('rejects bad steps', () => {
    const bad = [
      (m: ReturnType<typeof valid>) => (m.tour.steps[0].web.action = 'submit'),
      (m: ReturnType<typeof valid>) => (m.tour.steps[1].id = 'a'),
      (m: ReturnType<typeof valid>) => (m.tour.steps[0].web.urlPattern = 'http://a.example/'),
      (m: ReturnType<typeof valid>) => ((m.tour.steps[0].web.locator as Record<string, unknown>).role = 5),
      (m: ReturnType<typeof valid>) => (m.tour.steps[0].picture = { mime: 'image/svg+xml', data: 'AAAA', w: 1, h: 1 }),
      (m: ReturnType<typeof valid>) => (m.tour.steps[0].picture!.data = '<svg>'),
      (m: ReturnType<typeof valid>) => (m.tour.steps = []),
    ];
    for (const breakIt of bad) {
      const m = valid();
      breakIt(m);
      expect(parseWebTourStart(m)).toBeNull();
    }
  });
});
