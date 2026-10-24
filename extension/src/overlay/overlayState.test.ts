import { describe, expect, it } from 'vitest';
import { parseOverlayState } from './overlayState';

const valid = {
  title: 'Open Grades',
  text: 'Click Grades.',
  current: 1,
  total: 3,
  status: 'shown',
  role: 'top',
  targetHere: true,
  observe: false,
  picture: null,
};

describe('parseOverlayState', () => {
  it('accepts a valid state, with or without a picture', () => {
    expect(parseOverlayState(valid)).toEqual(valid);
    const picture = { mime: 'image/png', data: 'AAAA', w: 10, h: 10 };
    expect(
      parseOverlayState({ ...valid, status: 'fallback', picture })
    ).toEqual({
      ...valid,
      status: 'fallback',
      picture,
    });
  });

  it('accepts a check result in check mode', () => {
    for (const check of ['found', 'weak', 'ambiguous', 'none', 'pending']) {
      expect(parseOverlayState({ ...valid, check })).toEqual({
        ...valid,
        check,
      });
    }
  });

  it.each([
    ['an unknown check result', { ...valid, check: 'role' }],
    ['an extra key', { ...valid, html: '<b>x</b>' }],
    ['a missing key', { title: 'x', text: 'y', current: 1, total: 1 }],
    ['a step past the end', { ...valid, current: 4 }],
    ['step zero', { ...valid, current: 0 }],
    ['a fractional step', { ...valid, current: 1.5 }],
    ['a non-string title', { ...valid, title: 3 }],
    ['an oversized text', { ...valid, text: 'x'.repeat(4001) }],
    ['an unknown status', { ...valid, status: 'exited' }],
    ['an unknown role', { ...valid, role: 'side' }],
    [
      'an svg picture',
      {
        ...valid,
        picture: { mime: 'image/svg+xml', data: 'AAAA', w: 1, h: 1 },
      },
    ],
    [
      'picture data that is not base64',
      { ...valid, picture: { mime: 'image/png', data: '"><img>', w: 1, h: 1 } },
    ],
  ])('refuses %s', (_, raw) => {
    expect(parseOverlayState(raw)).toBeNull();
  });

  it('accepts the notice states, and "Go to the start" only while armed', () => {
    for (const status of ['armed', 'moved', 'stopped'] as const) {
      expect(parseOverlayState({ ...valid, status })?.status).toBe(status);
    }
    expect(
      parseOverlayState({ ...valid, status: 'armed', goStart: true })?.goStart
    ).toBe(true);
    expect(
      parseOverlayState({ ...valid, status: 'seeking', goStart: true })
    ).toBeNull();
    expect(
      parseOverlayState({ ...valid, status: 'armed', goStart: 'yes' })
    ).toBeNull();
  });

  it('refuses non-objects', () => {
    expect(parseOverlayState(null)).toBeNull();
    expect(parseOverlayState('state')).toBeNull();
  });
});
