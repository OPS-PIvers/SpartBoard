import { describe, expect, it, vi } from 'vitest';
import type { GuidedLearningStep } from '@/types';
import { parseTourPath, tourShortLinkCode } from './tourLinks';
import {
  canPlayWebTours,
  parsePing,
  parseWebTourPortEvent as parsePortEvent,
} from './extensionClient';
import { parseWebTourStartTour } from './extensionProtocol';
import {
  buildHandoff,
  eventFitsTour,
  hubStepsOf,
  pageUrlOf,
  loadPictures,
  reducePlay,
  startUrlOf,
  toBase64,
  type HubStep,
  type LoadedPicture,
} from './webTourHub';
import {
  parseWeak,
  webFieldStatsOf,
  webStepState,
  worstWebState,
} from './webTourHealth';

vi.mock('@/config/firebase', () => ({
  storage: {},
  db: {},
  isConfigured: false,
}));

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const step = (id: string, urlPattern: string, picture?: string): HubStep =>
  ({
    id,
    label: `Step ${id}`,
    text: 'Click it',
    web: {
      urlPattern,
      locator: { role: 'button', name: 'Save' },
      action: 'click',
      ...(picture ? { picture: { path: picture, w: 10, h: 5 } } : {}),
    },
  }) as unknown as HubStep;

describe('tour links', () => {
  it('reads the set id from a tour path', () => {
    expect(parseTourPath('/tour/abc-123')).toBe('abc-123');
    expect(parseTourPath('/tour/abc/extra')).toBe('abc');
    expect(parseTourPath('/tour/')).toBeNull();
    expect(parseTourPath('/tour/a.b')).toBeNull();
    expect(parseTourPath('/help/abc')).toBeNull();
  });

  it('makes one short code per tour, within the slug limit', () => {
    const code = tourShortLinkCode('3F2504E0-4F89-11D3-9A0C-0305E82C3301');
    expect(code.startsWith('tour-3f2504e0-4f89')).toBe(true);
    expect(code.length).toBeLessThanOrEqual(32);
    expect(tourShortLinkCode('3F2504E0-4F89-11D3-9A0C-0305E82C3301')).toBe(
      code
    );
  });
});

describe('extension client', () => {
  it('treats malformed ping replies as no extension', () => {
    expect(parsePing(null)).toEqual({ kind: 'none' });
    expect(parsePing({ ok: false, error: 'refused' })).toEqual({
      kind: 'none',
    });
    expect(parsePing({ ok: true, protocol: '2', version: '1' })).toEqual({
      kind: 'none',
    });
    expect(
      parsePing({ ok: true, protocol: 2, version: '0.2.0', profile: 'weird' })
    ).toEqual({
      kind: 'ready',
      protocol: 2,
      version: '0.2.0',
      profile: 'none',
    });
  });

  it('plays only on protocol 2 or later in a staff profile', () => {
    const ready = (protocol: number, profile: 'staff' | 'other' | 'none') =>
      ({ kind: 'ready', protocol, version: 'x', profile }) as const;
    expect(canPlayWebTours(ready(2, 'staff'))).toBe(true);
    expect(canPlayWebTours(ready(1, 'staff'))).toBe(false);
    expect(canPlayWebTours(ready(2, 'other'))).toBe(false);
    expect(canPlayWebTours(ready(2, 'none'))).toBe(false);
    expect(canPlayWebTours({ kind: 'none' })).toBe(false);
  });

  it('accepts only well-formed port events for this tour', () => {
    expect(
      parsePortEvent(
        {
          type: 'web-tour/step',
          setId: 's',
          stepIndex: 1,
          stepId: 'a',
          match: 'text',
        },
        's'
      )
    ).toEqual({
      type: 'web-tour/step',
      setId: 's',
      stepIndex: 1,
      stepId: 'a',
      match: 'text',
    });
    expect(
      parsePortEvent(
        {
          type: 'web-tour/step',
          setId: 'other',
          stepIndex: 1,
          stepId: 'a',
          match: 'text',
        },
        's'
      )
    ).toBeNull();
    expect(
      parsePortEvent(
        {
          type: 'web-tour/step',
          setId: 's',
          stepIndex: -1,
          stepId: 'a',
          match: 'text',
        },
        's'
      )
    ).toBeNull();
    expect(
      parsePortEvent(
        {
          type: 'web-tour/step',
          setId: 's',
          stepIndex: 0,
          stepId: 'a',
          match: 'xpath',
        },
        's'
      )
    ).toBeNull();
    expect(
      parsePortEvent({ type: 'web-tour/closed', setId: 's', stepIndex: 2 }, 's')
    ).toEqual({
      type: 'web-tour/closed',
      setId: 's',
      stepIndex: 2,
    });
    expect(
      parsePortEvent({ type: 'web-tour/exit', setId: 's' }, 's')
    ).toBeNull();
    expect(
      parsePortEvent({ type: 'web-tour/click', setId: 's' }, 's')
    ).toBeNull();
  });
});

describe('hub', () => {
  it('keeps only web steps', () => {
    const steps = [
      step('a', 'https://x.test/'),
      { id: 'b' } as GuidedLearningStep,
    ];
    expect(hubStepsOf(steps).map((s) => s.id)).toEqual(['a']);
  });

  it('opens the first step page, or its site when the address has wildcards', () => {
    expect(startUrlOf([step('a', 'https://app.schoology.com/home')])).toBe(
      'https://app.schoology.com/home'
    );
    expect(
      startUrlOf([step('a', 'https://app.schoology.com/course/*/materials')])
    ).toBe('https://app.schoology.com/');
    expect(startUrlOf([step('a', 'http://insecure.test/')])).toBeNull();
    expect(startUrlOf([step('a', 'javascript:alert(1)')])).toBeNull();
    expect(startUrlOf([])).toBeNull();
    expect(startUrlOf([step('a', 'https://app*.example.com/x')])).toBeNull();
    expect(startUrlOf([step('a', 'https://user:pw@example.com/x')])).toBeNull();
    expect(
      pageUrlOf(
        [step('a', 'https://x.test/a'), step('b', 'https://y.test/b')],
        1
      )
    ).toBe('https://y.test/b');
  });

  it('drops events naming a step the tour does not have', () => {
    const steps = [step('a', 'https://x.test/'), step('b', 'https://x.test/')];
    const ev = (stepIndex: number, stepId: string) =>
      ({
        type: 'web-tour/step',
        setId: 's',
        stepIndex,
        stepId,
        match: 'role',
      }) as const;
    expect(eventFitsTour(ev(1, 'b'), steps)).toBe(true);
    expect(eventFitsTour(ev(1, 'a'), steps)).toBe(false);
    expect(eventFitsTour(ev(2, 'b'), steps)).toBe(false);
    expect(
      eventFitsTour(
        { type: 'web-tour/closed', setId: 's', stepIndex: 5 },
        steps
      )
    ).toBe(false);
    expect(eventFitsTour({ type: 'web-tour/done', setId: 's' }, steps)).toBe(
      true
    );
  });

  it("reads pictures only from the tour's own folder, and only images", async () => {
    const read = vi.fn((path: string) =>
      Promise.resolve(
        new Uint8Array(path.endsWith('bad.png') ? [1, 2, 3] : PNG).buffer
      )
    );
    const pictures = await loadPictures(
      's1',
      [
        step('a', 'https://x.test/', 'web_tour_pictures/s1/a.png'),
        step('b', 'https://x.test/', 'web_tour_pictures/s2/b.png'),
        step('c', 'https://x.test/', 'web_tour_pictures/s1/../s2/c.png'),
        step('d', 'https://x.test/', 'web_tour_pictures/s1/bad.png'),
        step('e', 'https://x.test/'),
      ],
      read
    );
    expect([...pictures.keys()]).toEqual(['a']);
    expect(pictures.get('a')?.mime).toBe('image/png');
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('leaves pictures out of the hand-off past the caps, and passes the extension check', () => {
    const big = (n: number): LoadedPicture => ({
      mime: 'image/png',
      bytes: new Uint8Array(n),
      w: 1,
      h: 1,
    });
    const steps = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) =>
      step(id, 'https://x.test/')
    );
    const mb = 1024 * 1024;
    const handoff = buildHandoff(
      's',
      5,
      'T',
      steps,
      new Map([
        ['a', big(1.6 * mb)],
        ['b', big(6 * mb)],
        ['c', big(1.6 * mb)],
        ['d', big(1.6 * mb)],
        ['e', big(1.6 * mb)],
        ['f', big(10)],
      ])
    );
    expect(handoff.steps.map((s) => !!s.picture)).toEqual([
      true,
      false,
      true,
      true,
      false,
      true,
    ]);
    expect(parseWebTourStartTour(handoff)).not.toBeNull();
    expect(handoff.steps[0].web).not.toHaveProperty('picture');
    expect(handoff).toMatchObject({ setId: 's', version: 5, title: 'T' });
  });

  it('encodes bytes as base64', () => {
    expect(toBase64(new Uint8Array([104, 105]))).toBe('aGk=');
  });

  it('tracks progress and keeps the latest match per step', () => {
    let play = reducePlay(
      { kind: 'idle' },
      {
        type: 'web-tour/step',
        setId: 's',
        stepIndex: 0,
        stepId: 'a',
        match: 'none',
      }
    );
    play = reducePlay(play, {
      type: 'web-tour/step',
      setId: 's',
      stepIndex: 0,
      stepId: 'a',
      match: 'role',
    });
    play = reducePlay(play, {
      type: 'web-tour/step',
      setId: 's',
      stepIndex: 1,
      stepId: 'b',
      match: 'css',
    });
    expect(play).toEqual({
      kind: 'playing',
      index: 1,
      furthest: 1,
      matches: { a: 'role', b: 'css' },
    });
    play = reducePlay(play, {
      type: 'web-tour/closed',
      setId: 's',
      stepIndex: 1,
    });
    expect(play).toMatchObject({ kind: 'closed', index: 1, furthest: 1 });
    play = reducePlay(play, { type: 'web-tour/done', setId: 's' });
    expect(play).toMatchObject({ kind: 'done', furthest: 1 });
  });
});

describe('web tour health', () => {
  const run = (over: object) => ({
    v: 2,
    startedAt: 0,
    furthest: 1,
    done: false,
    misses: [],
    surface: 'web' as const,
    weak: [],
    ...over,
  });

  it('splits weak entries', () => {
    expect(parseWeak('a:b:text')).toEqual({ stepId: 'a:b', clue: 'text' });
    expect(parseWeak('a:role')).toBeNull();
    expect(parseWeak(':css')).toBeNull();
  });

  it('counts only web runs of the current version', () => {
    const stats = webFieldStatsOf(
      [
        run({ misses: ['a'], done: true }),
        run({ weak: ['b:text', 'b:text'] }),
        run({ v: 1, misses: ['b'] }),
        { ...run({ misses: ['b'] }), surface: undefined },
      ],
      2
    );
    expect(stats.runs).toBe(2);
    expect(stats.done).toBe(1);
    expect(stats.misses.get('a')).toBe(1);
    expect(stats.misses.has('b')).toBe(false);
    expect(stats.weak.get('b')).toEqual({ text: 1, css: 0 });
    expect(webStepState('a', stats)).toBe('missed');
    expect(webStepState('b', stats)).toBe('weak');
    expect(webStepState('c', stats)).toBe('ok');
    expect(webStepState('a', null)).toBe('ok');
    expect(worstWebState(['ok', 'weak'])).toBe('weak');
    expect(worstWebState(['weak', 'missed', 'ok'])).toBe('missed');
  });
});
