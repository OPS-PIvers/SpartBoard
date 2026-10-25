import { describe, expect, it } from 'vitest';
import {
  parseExtensionMessage,
  type WebTourCheckStartMessage,
  type WebTourStartMessage,
} from '@/components/tours/web/extensionProtocol';
import { toPlayback } from './startMessage';

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
        web: {
          urlPattern: 'https://orono.schoology.com/home',
          action: 'click',
          locator: {
            role: 'button',
            name: 'Open',
            box: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 },
          },
        },
        picture: { mime: 'image/png', data: 'AAAA', w: 10, h: 10 },
      },
      {
        id: 'b',
        web: {
          urlPattern: 'https://orono.schoology.com/course/*',
          action: 'observe',
          locator: {
            text: 'Grades',
            frames: [{ urlPattern: 'https://x.example/f', index: 0 }],
          },
        },
      },
    ],
  },
});

type Msg = ReturnType<typeof valid>;
const parse = (m: unknown) => parseExtensionMessage(m);

describe('web-tour/start', () => {
  it('is staff only and turns into playback steps with pictures kept apart', () => {
    const parsed = parse(valid());
    expect(parsed.kind).toBe('ok');
    if (parsed.kind !== 'ok') return;
    expect(parsed.staffOnly).toBe(true);
    const p = toPlayback(parsed.message as WebTourStartMessage);
    expect(p.stepIndex).toBe(1);
    expect(p.tour.steps[0]).toMatchObject({
      id: 'a',
      title: 'Open',
      hasPicture: true,
      action: 'click',
      frames: [],
    });
    expect(p.tour.steps[1]).toMatchObject({
      frames: [{ urlPattern: 'https://x.example/f', index: 0 }],
      clues: { text: 'Grades' },
    });
    expect(p.pictures.a.data).toBe('AAAA');
  });

  it('takes the same tour as web-tour/check and marks it a check run', () => {
    const parsed = parse({ ...valid(), type: 'web-tour/check', runId: 'r-1' });
    expect(parsed.kind).toBe('ok');
    if (parsed.kind !== 'ok') return;
    expect(parsed.staffOnly).toBe(true);
    expect(
      toPlayback(parsed.message as WebTourCheckStartMessage)
    ).toMatchObject({ check: true, runId: 'r-1' });
    // A check needs its run id, and only a plain one.
    expect(parse({ ...valid(), type: 'web-tour/check' }).kind).toBe('invalid');
    expect(
      parse({ ...valid(), type: 'web-tour/check', runId: '<b>' }).kind
    ).toBe('invalid');
    expect(toPlayback(valid() as WebTourStartMessage).check).toBeUndefined();
    expect(
      parse({ ...valid(), type: 'web-tour/check', runId: 'r', extra: 1 }).kind
    ).toBe('invalid');
  });

  it('clamps the step index to the tour', () => {
    const p = toPlayback({
      ...(valid() as WebTourStartMessage),
      stepIndex: 99,
    });
    expect(p.stepIndex).toBe(1);
  });

  it('drops pictures past the session store room', () => {
    const m = valid() as WebTourStartMessage;
    const big = 'A'.repeat(2_000_000);
    m.tour.steps = Array.from({ length: 6 }, (_, i) => ({
      ...m.tour.steps[0],
      id: `p${i}`,
      picture: { mime: 'image/png' as const, data: big, w: 1, h: 1 },
    }));
    const p = toPlayback(m);
    expect(Object.keys(p.pictures)).toHaveLength(4);
    expect(p.tour.steps[5].hasPicture).toBe(false);
  });

  it('opens only https pages', () => {
    for (const startUrl of [
      'javascript:alert(1)',
      'http://a.example/',
      'data:text/html,x',
      'https://u:p@a.example/',
    ]) {
      expect(parse({ ...valid(), startUrl }).kind).toBe('invalid');
    }
  });

  it.each<[string, (m: Msg) => void]>([
    [
      'an action the extension would perform',
      (m) => (m.tour.steps[0].web.action = 'submit'),
    ],
    ['a repeated step id', (m) => (m.tour.steps[1].id = 'a')],
    [
      'an http pattern',
      (m) => (m.tour.steps[0].web.urlPattern = 'http://a.example/'),
    ],
    [
      'a non-string clue',
      (m) =>
        ((m.tour.steps[0].web.locator as Record<string, unknown>).role = 5),
    ],
    [
      'an unknown locator key',
      (m) =>
        ((m.tour.steps[0].web.locator as Record<string, unknown>).xpath =
          '//a'),
    ],
    [
      'an svg picture',
      (m) =>
        (m.tour.steps[0].picture = {
          mime: 'image/svg+xml',
          data: 'AAAA',
          w: 1,
          h: 1,
        }),
    ],
    [
      'picture data that is not base64',
      (m) => (m.tour.steps[0].picture!.data = '<svg>'),
    ],
    ['no steps', (m) => (m.tour.steps = [])],
    [
      'an extra step key',
      (m) => ((m.tour.steps[0] as Record<string, unknown>).html = '<b>'),
    ],
    ['a negative step index', (m) => (m.stepIndex = -1)],
  ])('refuses %s', (_, breakIt) => {
    const m = valid();
    breakIt(m);
    expect(parse(m).kind).toBe('invalid');
  });
});
