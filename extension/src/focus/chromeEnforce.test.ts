import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FocusActiveSession } from '@/utils/focus/contract';
import type { FocusLocalState } from './focusState';
import {
  createChromeEnforcer,
  FOCUS_ALLOW_RULE_ID,
  FOCUS_BLOCK_RULE_ID,
} from './chromeEnforce';
import { parkedUrl } from './enforce';

const BASE = 'chrome-extension://ext/focus/index.html';

interface FakeTab {
  id: number;
  windowId: number;
  url: string;
  active: boolean;
  lastAccessed: number;
}
interface FakeWindow {
  id: number;
  type: string;
  state: string;
}

function fakeChrome(
  tabs: FakeTab[],
  windows: FakeWindow[],
  own: [number, string][] = [],
  frames: [number, string][] = []
) {
  const session = new Map<string, unknown>();
  let rules: chrome.declarativeNetRequest.Rule[] = [];
  const injected: { tabId: number; kind: unknown }[] = [];
  const updates: { id: number; props: Record<string, unknown> }[] = [];
  const removed: number[] = [];
  const api = {
    runtime: {
      getURL: (p: string) => `chrome-extension://ext/${p}`,
      ContextType: { TAB: 'TAB' },
      getContexts: () =>
        Promise.resolve(
          own.map(([tabId, documentUrl]) => ({ tabId, documentUrl }))
        ),
    },
    tabs: {
      TAB_ID_NONE: -1,
      query: vi.fn((q: { active?: boolean; windowId?: number }) =>
        Promise.resolve(
          tabs.filter(
            (t) =>
              (q.active === undefined || t.active === q.active) &&
              (q.windowId === undefined || t.windowId === q.windowId)
          )
        )
      ),
      get: (id: number) => {
        const t = tabs.find((x) => x.id === id);
        return t ? Promise.resolve(t) : Promise.reject(new Error('gone'));
      },
      update: vi.fn((id: number, props: Record<string, unknown>) => {
        updates.push({ id, props });
        const t = tabs.find((x) => x.id === id);
        if (t && typeof props.url === 'string') t.url = props.url;
        return Promise.resolve(t);
      }),
      remove: vi.fn((id: number) => {
        removed.push(id);
        return Promise.resolve();
      }),
    },
    windows: {
      WindowType: { NORMAL: 'normal' },
      WindowState: {
        NORMAL: 'normal',
        MINIMIZED: 'minimized',
        MAXIMIZED: 'maximized',
        FULLSCREEN: 'fullscreen',
        LOCKED_FULLSCREEN: 'locked-fullscreen',
      },
      get: (id: number) => {
        const w = windows.find((x) => x.id === id);
        return w ? Promise.resolve(w) : Promise.reject(new Error('gone'));
      },
      getLastFocused: () => Promise.resolve(windows[0]),
      update: vi.fn((id: number, props: { state?: string }) => {
        const w = windows.find((x) => x.id === id);
        if (w && props.state) w.state = props.state;
        return Promise.resolve(w);
      }),
    },
    storage: {
      session: {
        get: (key: string | null) =>
          Promise.resolve(
            key === null
              ? Object.fromEntries(session)
              : { [key]: session.get(key) }
          ),
        set: (items: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(items))
            session.set(k, structuredClone(v));
          return Promise.resolve();
        },
        remove: (key: string | string[]) => {
          for (const k of [key].flat()) session.delete(k);
          return Promise.resolve();
        },
      },
    },
    declarativeNetRequest: {
      ResourceType: { MAIN_FRAME: 'main_frame' },
      RuleActionType: { ALLOW: 'allow', BLOCK: 'block' },
      getSessionRules: () => Promise.resolve(structuredClone(rules)),
      updateSessionRules: vi.fn(
        (o: {
          removeRuleIds: number[];
          addRules: chrome.declarativeNetRequest.Rule[];
        }) => {
          rules = [
            ...rules.filter((r) => !o.removeRuleIds.includes(r.id)),
            ...o.addRules,
          ];
          return Promise.resolve();
        }
      ),
    },
    webNavigation: {
      getFrame: (o: { tabId: number }) => {
        if (o.tabId === 99) return Promise.reject(new Error('discarded'));
        const frame = frames.find(([id]) => id === o.tabId);
        return Promise.resolve(frame ? { url: frame[1] } : null);
      },
    },
    scripting: {
      executeScript: vi.fn(
        (o: { target: { tabId: number }; args: unknown[] }) => {
          injected.push({ tabId: o.target.tabId, kind: o.args[0] });
          return Promise.resolve([]);
        }
      ),
    },
  };
  vi.stubGlobal('chrome', api);
  return { api, rules: () => rules, injected, updates, removed, session };
}

const session = (
  over: Partial<FocusActiveSession> = {}
): FocusActiveSession => ({
  sessionId: 's1',
  teacherName: 'Ms. Rivera',
  level: 'redirect',
  sites: [{ host: 'desmos.com', path: '' }],
  endsAt: 10 * 60_000,
  released: false,
  showLiveSite: false,
  ...over,
});

const local = (s: FocusActiveSession): FocusLocalState => ({
  session: s,
  offsetMs: 0,
  reported: null,
  reportedAt: 0,
  reportedHost: null,
  blockedTries: 0,
});

let current: FocusLocalState | undefined;
const enforcer = () =>
  createChromeEnforcer({
    origins: ['https://spartboard.web.app'],
    load: () => Promise.resolve(current),
    now: () => 0,
  });

beforeEach(() => {
  current = undefined;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createChromeEnforcer sync', () => {
  it('parks blocked tabs at Redirect without rules or fullscreen, and restores them at the end', async () => {
    const tabs: FakeTab[] = [
      {
        id: 1,
        windowId: 1,
        url: 'https://desmos.com/',
        active: true,
        lastAccessed: 1,
      },
      {
        id: 2,
        windowId: 1,
        url: 'https://games.example/x',
        active: false,
        lastAccessed: 2,
      },
    ];
    const windows = [{ id: 1, type: 'normal', state: 'maximized' }];
    const c = fakeChrome(tabs, windows);
    const e = enforcer();
    current = local(session());
    await e.sync(current);
    expect(tabs[1].url).toBe(parkedUrl(BASE, 'https://games.example/x'));
    expect(tabs[0].url).toBe('https://desmos.com/');
    expect(c.rules()).toEqual([]);
    expect(windows[0].state).toBe('maximized');

    current = undefined;
    await e.sync(null);
    expect(tabs[1].url).toBe('https://games.example/x');
  });

  it('leaves Monitor alone', async () => {
    const tabs: FakeTab[] = [
      {
        id: 2,
        windowId: 1,
        url: 'https://games.example/x',
        active: true,
        lastAccessed: 2,
      },
    ];
    const c = fakeChrome(tabs, [{ id: 1, type: 'normal', state: 'normal' }]);
    current = local(session({ level: 'monitor' }));
    await enforcer().sync(current);
    expect(tabs[0].url).toBe('https://games.example/x');
    expect(
      c.api.declarativeNetRequest.updateSessionRules
    ).not.toHaveBeenCalled();
  });

  it('Lock blocks other pages, goes fullscreen once and puts everything back at the end', async () => {
    const tabs: FakeTab[] = [
      {
        id: 1,
        windowId: 1,
        url: 'https://desmos.com/',
        active: true,
        lastAccessed: 1,
      },
    ];
    const windows = [{ id: 1, type: 'normal', state: 'maximized' }];
    const c = fakeChrome(tabs, windows);
    const e = enforcer();
    current = local(session({ level: 'lock' }));
    await e.sync(current);
    expect(c.rules().map((r) => [r.id, r.action.type])).toEqual([
      [FOCUS_ALLOW_RULE_ID, 'allow'],
      [FOCUS_BLOCK_RULE_ID, 'block'],
    ]);
    expect(c.rules()[0].condition.requestDomains).toContain('desmos.com');
    expect(windows[0].state).toBe('fullscreen');

    // The student leaves fullscreen: the next sync covers the page instead of forcing it back.
    windows[0].state = 'normal';
    await e.sync(current);
    expect(windows[0].state).toBe('normal');
    expect(c.injected.at(-1)).toEqual({ tabId: 1, kind: 'cover' });
    expect(
      c.api.declarativeNetRequest.updateSessionRules
    ).toHaveBeenCalledTimes(1);

    await e.returnToFullscreen(1);
    expect(windows[0].state).toBe('fullscreen');
    await e.windowChanged();
    expect(c.injected.at(-1)).toEqual({ tabId: 1, kind: 'none' });

    current = undefined;
    await e.sync(null);
    expect(c.rules()).toEqual([]);
    expect(windows[0].state).toBe('maximized');
    expect(c.session.has('focusLock')).toBe(false);
  });

  it('does nothing for the fullscreen button outside Lock', async () => {
    const windows = [{ id: 1, type: 'normal', state: 'normal' }];
    fakeChrome([], windows);
    current = local(session());
    await enforcer().returnToFullscreen(1);
    expect(windows[0].state).toBe('normal');
  });
});

describe('createChromeEnforcer non-web pages', () => {
  const DATA = 'data:text/html,<iframe src="https://games.example/">';

  it('sends a page that can show any site to the focus page, reading addresses Chrome hides', async () => {
    const tabs: FakeTab[] = [
      { id: 1, windowId: 1, url: '', active: true, lastAccessed: 1 },
      { id: 2, windowId: 1, url: '', active: false, lastAccessed: 2 },
      { id: 3, windowId: 1, url: '', active: false, lastAccessed: 3 },
      { id: 4, windowId: 1, url: '', active: false, lastAccessed: 4 },
      { id: 5, windowId: 1, url: '', active: false, lastAccessed: 5 },
      { id: 99, windowId: 1, url: '', active: false, lastAccessed: 6 },
    ];
    const c = fakeChrome(
      tabs,
      [{ id: 1, type: 'normal', state: 'maximized' }],
      [[3, BASE]],
      [
        [1, DATA],
        [2, 'chrome://newtab/'],
        [4, 'file:///home/kid/page.html'],
        [5, 'chrome-error://chromewebdata/'],
      ]
    );
    current = local(session());
    await enforcer().sync(current);
    const sent = c.updates.filter((u) => typeof u.props.url === 'string');
    expect(sent).toEqual([
      { id: 1, props: { url: `${BASE}?notice=blocked` } },
      { id: 4, props: { url: `${BASE}?notice=blocked` } },
    ]);
  });

  it('leaves non-web pages alone at Monitor and once the session ends', async () => {
    const tabs: FakeTab[] = [
      { id: 1, windowId: 1, url: '', active: true, lastAccessed: 1 },
    ];
    const c = fakeChrome(
      tabs,
      [{ id: 1, type: 'normal', state: 'maximized' }],
      [],
      [[1, DATA]]
    );
    current = local(session({ level: 'monitor' }));
    await enforcer().sync(current);
    expect(await enforcer().navigated(1, DATA, undefined, true)).toBe(false);
    current = undefined;
    await enforcer().sync(null);
    expect(c.updates).toEqual([]);
  });

  it('sends a data: navigation back and counts it, but lets our pages and the new tab page through', async () => {
    const tabs: FakeTab[] = [
      {
        id: 1,
        windowId: 1,
        url: 'https://desmos.com/',
        active: true,
        lastAccessed: 1,
      },
    ];
    const c = fakeChrome(tabs, [{ id: 1, type: 'normal', state: 'normal' }]);
    const e = enforcer();
    current = local(session());
    expect(await e.navigated(1, DATA, 'https://desmos.com/', false)).toBe(true);
    expect(c.updates.at(-1)).toEqual({
      id: 1,
      props: { url: 'https://desmos.com/' },
    });
    const before = c.updates.length;
    expect(await e.navigated(1, 'chrome://newtab/', undefined, true)).toBe(
      false
    );
    expect(
      await e.navigated(1, `${BASE}?notice=blocked`, undefined, true)
    ).toBe(false);
    expect(await e.navigated(1, 'about:blank', undefined, true)).toBe(false);
    expect(c.updates.length).toBe(before);
  });
});

describe('createChromeEnforcer navigated', () => {
  it('sends a blocked navigation back once and counts it', async () => {
    const tabs: FakeTab[] = [
      {
        id: 1,
        windowId: 1,
        url: 'https://desmos.com/',
        active: true,
        lastAccessed: 1,
      },
    ];
    const c = fakeChrome(tabs, [{ id: 1, type: 'normal', state: 'normal' }]);
    const e = enforcer();
    current = local(session());
    expect(
      await e.navigated(
        1,
        'https://games.example/',
        'https://desmos.com/',
        true
      )
    ).toBe(true);
    expect(c.updates.at(-1)).toEqual({
      id: 1,
      props: { url: 'https://desmos.com/' },
    });
    // The same address reported again by a later event is the same try.
    expect(
      await e.navigated(1, 'https://games.example/', undefined, true)
    ).toBe(false);
    await e.tabShown(1);
    expect(c.injected.at(-1)).toEqual({ tabId: 1, kind: 'notice' });
  });

  it('closes a blocked new tab and switches to the allowed one', async () => {
    const tabs: FakeTab[] = [
      {
        id: 1,
        windowId: 1,
        url: 'https://desmos.com/',
        active: false,
        lastAccessed: 1,
      },
      { id: 2, windowId: 1, url: '', active: true, lastAccessed: 2 },
    ];
    const c = fakeChrome(tabs, [{ id: 1, type: 'normal', state: 'normal' }]);
    current = local(session());
    expect(
      await enforcer().navigated(2, 'https://games.example/', '', true)
    ).toBe(true);
    expect(c.removed).toEqual([2]);
    expect(c.updates).toContainEqual({ id: 1, props: { active: true } });
    expect(c.injected.at(-1)).toEqual({ tabId: 1, kind: 'notice' });
  });

  it('ignores allowed sites, Monitor and no session', async () => {
    const c = fakeChrome([], []);
    const e = enforcer();
    expect(
      await e.navigated(1, 'https://games.example/', undefined, true)
    ).toBe(false);
    current = local(session({ level: 'monitor' }));
    expect(
      await e.navigated(1, 'https://games.example/', undefined, true)
    ).toBe(false);
    current = local(session());
    expect(
      await e.navigated(1, 'https://www.desmos.com/x', undefined, true)
    ).toBe(false);
    expect(
      await e.navigated(1, 'https://spartboard.web.app/q', undefined, true)
    ).toBe(false);
    expect(c.updates).toEqual([]);
  });

  it('sends the same address back again within the window but counts it once', async () => {
    const tabs: FakeTab[] = [
      {
        id: 1,
        windowId: 1,
        url: 'https://desmos.com/',
        active: true,
        lastAccessed: 1,
      },
    ];
    const c = fakeChrome(tabs, [{ id: 1, type: 'normal', state: 'normal' }]);
    const e = enforcer();
    current = local(session());
    await e.navigated(1, 'https://desmos.com/', undefined, true);
    expect(
      await e.navigated(
        1,
        'https://games.example/',
        'https://desmos.com/',
        true
      )
    ).toBe(true);
    expect(
      await e.navigated(1, 'https://games.example/', undefined, true)
    ).toBe(false);
    expect(
      c.updates.filter((u) => u.props.url === 'https://desmos.com/')
    ).toHaveLength(2);
    expect(c.removed).toEqual([]);
  });

  it('sends a late event back to the last allowed address instead of closing the tab', async () => {
    const tabs: FakeTab[] = [
      {
        id: 1,
        windowId: 1,
        url: 'https://desmos.com/a',
        active: true,
        lastAccessed: 1,
      },
      {
        id: 2,
        windowId: 1,
        url: 'https://desmos.com/b',
        active: false,
        lastAccessed: 2,
      },
    ];
    const c = fakeChrome(tabs, [{ id: 1, type: 'normal', state: 'normal' }]);
    const e = enforcer();
    current = local(session());
    await e.navigated(1, 'https://desmos.com/a', undefined, true);
    expect(
      await e.navigated(1, 'https://sso.example/login', undefined, true)
    ).toBe(true);
    expect(c.removed).toEqual([]);
    expect(c.updates.at(-1)).toEqual({
      id: 1,
      props: { url: 'https://desmos.com/a' },
    });
  });

  it('sends a parked tab back to its own parked page, keeping its address', async () => {
    const parked = parkedUrl(BASE, 'https://games.example/x');
    const tabs: FakeTab[] = [
      { id: 1, windowId: 1, url: '', active: true, lastAccessed: 1 },
      {
        id: 2,
        windowId: 1,
        url: 'https://desmos.com/',
        active: false,
        lastAccessed: 2,
      },
    ];
    const c = fakeChrome(
      tabs,
      [{ id: 1, type: 'normal', state: 'normal' }],
      [[1, parked]]
    );
    current = local(session());
    expect(
      await enforcer().navigated(1, 'https://games.example/x', undefined, true)
    ).toBe(true);
    expect(c.removed).toEqual([]);
    expect(c.updates.at(-1)).toEqual({ id: 1, props: { url: parked } });
  });

  it('leaves restored tabs alone once the session is over', async () => {
    const tabs: FakeTab[] = [
      {
        id: 1,
        windowId: 1,
        url: parkedUrl(BASE, 'https://games.example/x'),
        active: true,
        lastAccessed: 1,
      },
    ];
    const c = fakeChrome(tabs, [{ id: 1, type: 'normal', state: 'normal' }]);
    const e = enforcer();
    current = undefined;
    await e.sync(null);
    expect(tabs[0].url).toBe('https://games.example/x');
    expect(
      await e.navigated(1, 'https://games.example/x', undefined, true)
    ).toBe(false);
    expect(c.removed).toEqual([]);
  });

  it('never makes a redirecting address the way back', async () => {
    const tabs: FakeTab[] = [
      {
        id: 1,
        windowId: 1,
        url: 'https://desmos.com/a',
        active: true,
        lastAccessed: 1,
      },
    ];
    const c = fakeChrome(tabs, [{ id: 1, type: 'normal', state: 'normal' }]);
    const e = enforcer();
    current = local(session());
    await e.navigated(1, 'https://desmos.com/a', undefined, true);
    // Allowed short link seen before it commits, then its blocked target commits.
    await e.navigated(
      1,
      'https://desmos.com/go',
      'https://desmos.com/a',
      false
    );
    expect(
      await e.navigated(1, 'https://games.example/', undefined, true)
    ).toBe(true);
    expect(c.updates.at(-1)).toEqual({
      id: 1,
      props: { url: 'https://desmos.com/a' },
    });
  });
});

describe('createChromeEnforcer restart and locked mode', () => {
  it('keeps parked tabs parked until a check answers', async () => {
    const parked = parkedUrl(BASE, 'https://games.example/x');
    const tabs: FakeTab[] = [
      { id: 1, windowId: 1, url: parked, active: true, lastAccessed: 1 },
    ];
    fakeChrome(tabs, [{ id: 1, type: 'normal', state: 'normal' }]);
    await enforcer().sync(undefined);
    expect(tabs[0].url).toBe(parked);
  });

  it('takes the cover off after the worker restarted', async () => {
    const tabs: FakeTab[] = [
      {
        id: 1,
        windowId: 1,
        url: 'https://desmos.com/',
        active: true,
        lastAccessed: 1,
      },
    ];
    const windows = [{ id: 1, type: 'normal', state: 'normal' }];
    const c = fakeChrome(tabs, windows);
    current = local(session({ level: 'lock' }));
    await enforcer().windowChanged();
    expect(c.injected.at(-1)).toEqual({ tabId: 1, kind: 'cover' });
    windows[0].state = 'fullscreen';
    await enforcer().windowChanged();
    expect(c.injected.at(-1)).toEqual({ tabId: 1, kind: 'none' });
  });

  it('counts ChromeOS locked mode as fullscreen', async () => {
    const tabs: FakeTab[] = [
      {
        id: 1,
        windowId: 1,
        url: 'https://desmos.com/',
        active: true,
        lastAccessed: 1,
      },
    ];
    const c = fakeChrome(tabs, [
      { id: 1, type: 'normal', state: 'locked-fullscreen' },
    ]);
    current = local(session({ level: 'lock' }));
    const e = enforcer();
    await e.windowChanged();
    expect(c.injected).toEqual([]);
    expect(await e.activeFullscreen()).toBe(true);
  });
});
