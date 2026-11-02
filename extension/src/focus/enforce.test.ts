import { describe, expect, it } from 'vitest';
import type { FocusActiveSession } from '@/utils/focus/contract';
import type { FocusLocalState } from './focusState';
import {
  focusPageUrl,
  isBlocking,
  isLocking,
  lockAllowedHosts,
  parkedOriginal,
  parkedUrl,
  returnPlan,
  tabsToPark,
  tabsToRestore,
  type TabInfo,
} from './enforce';

const BASE = 'chrome-extension://abc/focus/index.html';
const ORIGINS = ['https://spartboard.web.app'];
const OWN = 'chrome-extension://abc/';

const state = (over: Partial<FocusActiveSession> = {}): FocusLocalState => ({
  session: {
    sessionId: 's1',
    teacherName: 'Ms. Rivera',
    level: 'redirect',
    sites: [
      { host: 'desmos.com', path: '' },
      { host: 'docs.google.com', path: '/document/d/abc' },
    ],
    endsAt: 10 * 60_000,
    released: false,
    showLiveSite: false,
    ...over,
  },
  offsetMs: 0,
  reported: null,
  reportedAt: 0,
  reportedHost: null,
  blockedTries: 0,
});

const tab = (
  id: number,
  url: string,
  over: Partial<TabInfo> = {}
): TabInfo => ({
  id,
  windowId: 1,
  url,
  active: false,
  lastAccessed: id,
  ...over,
});

describe('levels', () => {
  it('blocks at Redirect and Lock only, while the session holds the student', () => {
    expect(isBlocking(state({ level: 'monitor' }), 0)).toBe(false);
    expect(isBlocking(state(), 0)).toBe(true);
    expect(isBlocking(state({ released: true }), 0)).toBe(false);
    expect(isBlocking(state(), 10 * 60_000)).toBe(false);
    expect(isBlocking(null, 0)).toBe(false);
    expect(isLocking(state(), 0)).toBe(false);
    expect(isLocking(state({ level: 'lock' }), 0)).toBe(true);
  });
});

describe('parked pages', () => {
  it('carries the original address in its own URL and gives it back', () => {
    const original = 'https://games.example/play?level=2#top';
    const url = parkedUrl(BASE, original);
    expect(url.startsWith(`${BASE}?parked=`)).toBe(true);
    expect(parkedOriginal(url, BASE)).toBe(original);
  });

  it('restores only web addresses from our own page', () => {
    expect(parkedOriginal(parkedUrl(BASE, 'javascript:alert(1)'), BASE)).toBe(
      null
    );
    expect(parkedOriginal(parkedUrl(BASE, 'chrome://settings'), BASE)).toBe(
      null
    );
    expect(
      parkedOriginal(
        parkedUrl('chrome-extension://other/x.html', 'https://a.example'),
        BASE
      )
    ).toBe(null);
    expect(parkedOriginal(focusPageUrl(BASE, true), BASE)).toBe(null);
    expect(parkedOriginal(BASE, BASE)).toBe(null);
  });

  it('parks tabs on blocked sites and leaves allowed, SpartBoard and browser pages', () => {
    const tabs = [
      tab(1, 'https://www.desmos.com/calculator'),
      tab(2, 'https://games.example/'),
      tab(3, 'https://spartboard.web.app/quiz'),
      tab(4, 'chrome://newtab/'),
      tab(5, 'https://docs.google.com/document/d/xyz/edit'),
      tab(6, 'https://docs.google.com/document/u/1/d/abc/edit'),
      tab(7, 'data:text/html,<iframe src="https://games.example/">'),
      tab(8, BASE),
      tab(9, 'file:///home/kid/page.html'),
      tab(10, ''),
    ];
    expect(tabsToPark(tabs, state(), ORIGINS, OWN).map((t) => t.id)).toEqual([
      2, 5, 7, 9,
    ]);
  });

  it('restores every parked tab once nothing blocks, else only newly allowed ones', () => {
    const tabs = [
      tab(1, parkedUrl(BASE, 'https://games.example/')),
      tab(2, parkedUrl(BASE, 'https://news.example/today')),
      tab(3, 'https://games.example/'),
      tab(4, BASE),
    ];
    expect(tabsToRestore(tabs, null, ORIGINS, BASE, OWN)).toEqual([
      { id: 1, url: 'https://games.example/' },
      { id: 2, url: 'https://news.example/today' },
    ]);
    const added = state({
      sites: [{ host: 'news.example', path: '' }],
    });
    expect(tabsToRestore(tabs, added, ORIGINS, BASE, OWN)).toEqual([
      { id: 2, url: 'https://news.example/today' },
    ]);
  });
});

describe('returnPlan', () => {
  it('sends the tab back to the allowed page it was leaving', () => {
    expect(
      returnPlan(
        1,
        'https://www.desmos.com/calculator',
        [tab(1, 'https://www.desmos.com/calculator')],
        state(),
        ORIGINS,
        BASE
      )
    ).toEqual({
      kind: 'reload',
      tabId: 1,
      url: 'https://www.desmos.com/calculator',
    });
  });

  it('switches to the most recent allowed tab, preferring the same window, and closes the blocked one', () => {
    const tabs = [
      tab(1, 'chrome://newtab/', { lastAccessed: 50 }),
      tab(2, 'https://desmos.com/', { lastAccessed: 10 }),
      tab(3, 'https://desmos.com/other', { lastAccessed: 30 }),
      tab(4, 'https://desmos.com/far', { lastAccessed: 40, windowId: 2 }),
      tab(5, parkedUrl(BASE, 'https://games.example/'), { lastAccessed: 45 }),
      tab(6, 'https://games.example/', { lastAccessed: 46 }),
    ];
    expect(
      returnPlan(1, 'chrome://newtab/', tabs, state(), ORIGINS, BASE)
    ).toEqual({ kind: 'switch', closeTabId: 1, toTabId: 3, toWindowId: 1 });
  });

  it('counts the focus page as a place to go back to', () => {
    const tabs = [
      tab(1, 'https://games.example/'),
      tab(2, BASE, { windowId: 2 }),
    ];
    expect(returnPlan(1, undefined, tabs, state(), ORIGINS, BASE)).toEqual({
      kind: 'switch',
      closeTabId: 1,
      toTabId: 2,
      toWindowId: 2,
    });
  });

  it('turns the tab into the focus page when nothing allowed is open', () => {
    expect(
      returnPlan(
        1,
        'https://games.example/',
        [tab(1, 'https://games.example/'), tab(2, 'chrome://settings')],
        state(),
        ORIGINS,
        BASE
      )
    ).toEqual({ kind: 'focus-page', tabId: 1 });
  });
});

describe('lockAllowedHosts', () => {
  it('lets through the sites, sign-in and this listing’s SpartBoard hosts', () => {
    expect(
      lockAllowedHosts(state(), [...ORIGINS, 'http://localhost:3000'])
    ).toEqual([
      'accounts.google.com',
      'desmos.com',
      'docs.google.com',
      'launchpad.classlink.com',
      'localhost',
      'spartboard.web.app',
    ]);
  });
});
