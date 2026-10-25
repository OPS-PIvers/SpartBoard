import { describe, expect, it } from 'vitest';
import { openedTour } from './openTour';

const reply = (over: Record<string, unknown> = {}) => ({
  setId: 'set1',
  version: 1700,
  title: 'Post a grade',
  steps: [
    {
      id: 'a',
      label: 'Open Gradebook',
      text: 'Click it.',
      web: {
        urlPattern: 'https://app.example.com/course/*/home',
        action: 'click',
        locator: { role: 'link', name: 'Gradebook', heading: 'Course' },
      },
    },
    {
      id: 'b',
      label: 'Read',
      text: '',
      web: {
        urlPattern: 'https://app.example.com/course/*/grades',
        action: 'observe',
        locator: { text: 'Grades' },
      },
    },
  ],
  pictures: { b: { mime: 'image/png', data: 'AAAA', w: 10, h: 10 } },
  ...over,
});

describe('openedTour', () => {
  it('builds the tour to play from step 1, with pictures and scored clues', () => {
    const opened = openedTour('set1', reply());
    expect(opened?.start).toMatchObject({
      version: 1700,
      stepIndex: 0,
      tour: {
        id: 'set1',
        title: 'Post a grade',
        startUrl: 'https://app.example.com/',
      },
    });
    expect(opened?.start.tour.steps.map((s) => s.hasPicture)).toEqual([
      false,
      true,
    ]);
    expect(opened?.start.tour.steps[0].clues).toMatchObject({
      heading: 'Course',
    });
    expect(opened?.locators.a).toMatchObject({ role: 'link' });
  });

  it("opens a step's own address when it has no wildcard", () => {
    const r = reply();
    (r.steps[0].web as { urlPattern: string }).urlPattern =
      'https://app.example.com/home';
    expect(openedTour('set1', r)?.start.tour.startUrl).toBe(
      'https://app.example.com/home'
    );
  });

  it('refuses a reply it would refuse from a page', () => {
    expect(openedTour('set1', null)).toBeNull();
    expect(openedTour('set1', reply({ steps: [] }))).toBeNull();
    expect(openedTour('set1', reply({ version: 'x' }))).toBeNull();
    const bad = reply();
    (bad.steps[0].web as { urlPattern: string }).urlPattern =
      'http://app.example.com/';
    expect(openedTour('set1', bad)).toBeNull();
  });

  it('skips a malformed picture and keeps the tour', () => {
    const opened = openedTour(
      'set1',
      reply({ pictures: { b: { mime: 'image/gif', data: 'A', w: 1, h: 1 } } })
    );
    expect(opened?.start.pictures).toEqual({});
  });
});
