import { describe, expect, it } from 'vitest';
import type { FocusActiveSession } from '@/utils/focus/contract';
import {
  badgeText,
  isEnforcing,
  isDistrictEmail,
  liveHostFor,
  minutesLeft,
  parseStatusReply,
  siteUrl,
  statusFor,
  type FocusLocalState,
} from './focusState';

const session: FocusActiveSession = {
  sessionId: 's1',
  teacherName: 'Ms. Rivera',
  level: 'monitor',
  sites: [{ host: 'desmos.com', path: '' }],
  endsAt: 1_000_000,
  released: false,
  showLiveSite: false,
};

const local = (over: Partial<FocusLocalState> = {}): FocusLocalState => ({
  session,
  offsetMs: 0,
  reported: null,
  reportedAt: 0,
  reportedHost: null,
  blockedTries: 0,
  ...over,
});

describe('parseStatusReply', () => {
  it('accepts no session and a full session', () => {
    expect(parseStatusReply({ session: null, serverNow: 5 })).toEqual({
      session: null,
      serverNow: 5,
    });
    expect(parseStatusReply({ session, serverNow: 5 })).toEqual({
      session,
      serverNow: 5,
    });
  });

  it('rejects malformed replies', () => {
    expect(parseStatusReply(null)).toBeNull();
    expect(parseStatusReply({ session: null })).toBeNull();
    expect(
      parseStatusReply({
        session: { ...session, level: 'kiosk' },
        serverNow: 1,
      })
    ).toBeNull();
    expect(
      parseStatusReply({ session: { ...session, sessionId: '' }, serverNow: 1 })
    ).toBeNull();
    expect(
      parseStatusReply({ session: { ...session, endsAt: NaN }, serverNow: 1 })
    ).toBeNull();
  });

  it('drops sites that are not well formed', () => {
    const reply = parseStatusReply({
      session: {
        ...session,
        sites: [{ host: 'desmos.com', path: '' }, 'x', {}],
      },
      serverNow: 1,
    });
    expect(reply?.session?.sites).toEqual([{ host: 'desmos.com', path: '' }]);
  });
});

describe('isDistrictEmail', () => {
  it('matches the district domain only', () => {
    expect(isDistrictEmail('Kid@Orono.k12.mn.us')).toBe(true);
    expect(isDistrictEmail('kid@orono.k12.mn.us.evil.example')).toBe(false);
    expect(isDistrictEmail('@orono.k12.mn.us')).toBe(false);
    expect(isDistrictEmail('kid@gmail.com')).toBe(false);
    expect(isDistrictEmail(undefined)).toBe(false);
  });
});

describe('time left', () => {
  it('counts on the server clock and rounds minutes up', () => {
    // The device runs 60s behind the server.
    const s = local({ offsetMs: 60_000 });
    expect(minutesLeft(s, 1_000_000 - 60_000 - 61_000)).toBe(2);
    expect(minutesLeft(s, 1_000_000 - 60_000 - 1)).toBe(1);
    expect(isEnforcing(s, 1_000_000 - 60_000)).toBe(false);
    expect(badgeText(s, 1_000_000 - 60_000 - 120_000)).toBe('2m');
  });

  it('stops for a released student or no session', () => {
    const released = local({ session: { ...session, released: true } });
    expect(isEnforcing(released, 0)).toBe(false);
    expect(badgeText(released, 0)).toBe('');
    expect(badgeText(null, 0)).toBe('');
  });
});

describe('statusFor', () => {
  const origins = ['https://spartboard.web.app'];
  const OWN = 'chrome-extension://abc/';
  it('is away only on a web page outside the allowlist', () => {
    expect(
      statusFor('https://www.desmos.com/calculator', session, origins, OWN)
    ).toBe('on-task');
    expect(
      statusFor('https://desmos.com.evil.example/', session, origins, OWN)
    ).toBe('away');
    expect(
      statusFor('https://spartboard.web.app/quiz', session, origins, OWN)
    ).toBe('on-task');
    expect(
      statusFor('https://accounts.google.com/', session, origins, OWN)
    ).toBe('on-task');
    expect(
      statusFor(
        'chrome-extension://abc/focus/index.html',
        session,
        origins,
        OWN
      )
    ).toBe('on-task');
    expect(statusFor(undefined, session, origins, OWN)).toBe('on-task');
  });

  it('is away on a page that can show any site, and on task on browser screens', () => {
    for (const url of [
      'data:text/html,<iframe src="https://games.example/">',
      'DATA:text/html,x',
      'file:///home/kid/page.html',
      'view-source:https://games.example/',
      'chrome-extension://other/proxy.html',
      'chrome-extension://abcd/page.html',
      'chrome-untrusted://terminal/',
      'about:srcdoc',
      'javascript:void(0)',
      'blob:https://games.example/uuid',
      'blob:null/uuid',
      'filesystem:https://games.example/temporary/x.html',
      'not a url',
    ])
      expect(statusFor(url, session, origins, OWN), url).toBe('away');
    for (const url of [
      'chrome-extension://abc/focus/index.html?notice=blocked',
      'chrome://newtab/',
      'chrome://new-tab-page/',
      'chrome-search://local-ntp/local-ntp.html',
      'about:blank',
      'chrome-error://chromewebdata/',
      'blob:https://www.desmos.com/uuid',
      'blob:https://spartboard.web.app/uuid',
      'filesystem:https://desmos.com/temporary/x',
    ])
      expect(statusFor(url, session, origins, OWN), url).toBe('on-task');
  });
});

describe('liveHostFor', () => {
  it('sends a domain only while the live-site switch is on', () => {
    expect(liveHostFor('https://Example.com/a?b', session)).toBeNull();
    const on = { ...session, showLiveSite: true };
    expect(liveHostFor('https://Example.com/a?b', on)).toBe('example.com');
    expect(liveHostFor('chrome://newtab/', on)).toBeNull();
    expect(liveHostFor('not a url', on)).toBeNull();
  });
});

it('builds a site button address', () => {
  expect(siteUrl({ host: 'docs.google.com', path: '/document/d/x' })).toBe(
    'https://docs.google.com/document/d/x'
  );
});
