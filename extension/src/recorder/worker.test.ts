import { beforeEach, describe, expect, it, vi } from 'vitest';

const TAB_URL = 'https://orono.schoology.com/course/123456/materials';

const profile = vi.hoisted(() => ({ value: 'staff' }));
const panel = vi.hoisted(() => ({ open: true }));
vi.mock('../profile', () => ({
  getChromeProfile: () => Promise.resolve(profile.value),
}));

type Listener = (...args: unknown[]) => unknown;

const ID = 'ext-id';
const PANEL_URL = `chrome-extension://${ID}/sidepanel/index.html`;

const setup = async () => {
  vi.resetModules();
  const store: Record<string, unknown> = {};
  const local: Record<string, unknown> = {};
  const onMessage: Listener[] = [];
  const panelMessages: unknown[] = [];
  const chromeFake = {
    runtime: {
      id: ID,
      getURL: (p: string) => `chrome-extension://${ID}/${p}`,
      onMessage: { addListener: (fn: Listener) => onMessage.push(fn) },
      onConnect: { addListener: vi.fn() },
      ContextType: { SIDE_PANEL: 'SIDE_PANEL' },
      getContexts: () => Promise.resolve(panel.open ? [{}] : []),
      sendMessage: vi.fn((msg: unknown) => {
        panelMessages.push(msg);
        return Promise.resolve();
      }),
    },
    storage: {
      session: {
        get: (key: string) => Promise.resolve({ [key]: store[key] }),
        set: (o: Record<string, unknown>) => {
          Object.assign(store, o);
          return Promise.resolve();
        },
        remove: (key: string | string[]) => {
          for (const k of [key].flat()) delete store[k];
          return Promise.resolve();
        },
      },
      local: {
        get: (key: string) => Promise.resolve({ [key]: local[key] }),
      },
    },
    sidePanel: { setPanelBehavior: () => Promise.resolve() },
    tabs: {
      get: vi.fn(() =>
        Promise.resolve({
          id: 7,
          windowId: 1,
          active: true,
          url: TAB_URL,
        })
      ),
      // Frames confirm each blur, as the content script does.
      sendMessage: vi.fn((..._args: unknown[]) =>
        Promise.resolve<unknown>(true)
      ),
      captureVisibleTab: vi.fn(() =>
        Promise.resolve('data:image/png;base64,AAAA')
      ),
      onRemoved: { addListener: vi.fn() },
    },
    scripting: { executeScript: vi.fn(() => Promise.resolve([])) },
    webNavigation: {
      getAllFrames: () => Promise.resolve([]),
      onDOMContentLoaded: { addListener: vi.fn() },
    },
  };
  (globalThis as { chrome?: unknown }).chrome = chromeFake;
  const worker = await import('./worker');
  worker.installRecorder();
  const send = (msg: unknown, sender: Record<string, unknown>) =>
    new Promise((resolve) => {
      const handled = onMessage[0](msg, { id: ID, ...sender }, resolve);
      if (handled !== true) setTimeout(() => resolve('no reply'), 0);
    });
  return { worker, chromeFake, store, local, send, panelMessages };
};

const click = {
  type: 'rec/click',
  target: {
    action: 'click',
    locator: { role: 'link', name: 'Materials' },
    rect: { x: 10, y: 10, width: 50, height: 20 },
    viewport: { w: 1000, h: 800 },
  },
};

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  profile.value = 'staff';
  panel.open = true;
});

describe('recorder worker', () => {
  it('starts recording only from the side panel', async () => {
    const { send, chromeFake } = await setup();
    // A content script (any page) asking to start is ignored.
    expect(
      await send(
        { type: 'rec/start', tabId: 7 },
        { tab: { id: 7, url: TAB_URL }, frameId: 0 }
      )
    ).toBe('no reply');
    // Another extension page that isn't the panel is ignored too.
    expect(
      await send(
        { type: 'rec/start', tabId: 7 },
        { url: `chrome-extension://${ID}/other.html` }
      )
    ).toBe('no reply');
    expect(chromeFake.scripting.executeScript).not.toHaveBeenCalled();
    expect(
      await send({ type: 'rec/start', tabId: 7 }, { url: PANEL_URL })
    ).toBe(true);
    expect(chromeFake.scripting.executeScript).toHaveBeenCalledOnce();
  });

  it('refuses to record on a profile that is not staff', async () => {
    profile.value = 'other';
    const { send, chromeFake } = await setup();
    expect(
      await send({ type: 'rec/start', tabId: 7 }, { url: PANEL_URL })
    ).toBe(false);
    expect(chromeFake.scripting.executeScript).not.toHaveBeenCalled();
  });

  it('captures clicks only from the tab being recorded', async () => {
    const { send, chromeFake, panelMessages } = await setup();
    await send(click, { tab: { id: 7, url: TAB_URL }, frameId: 0 });
    await flush();
    expect(chromeFake.tabs.captureVisibleTab).not.toHaveBeenCalled();
    await send({ type: 'rec/start', tabId: 7 }, { url: PANEL_URL });
    await send(click, { tab: { id: 8, url: TAB_URL }, frameId: 0 });
    await flush();
    expect(chromeFake.tabs.captureVisibleTab).not.toHaveBeenCalled();
    await send(click, { tab: { id: 7, url: TAB_URL }, frameId: 0 });
    await vi.waitFor(() =>
      expect(
        panelMessages.some(
          (m) => (m as { type: string }).type === 'rec/captured'
        )
      ).toBe(true)
    );
    const captured = panelMessages.find(
      (m) => (m as { type: string }).type === 'rec/captured'
    ) as { capture: { urlPattern: string } };
    expect(captured.capture.urlPattern).toBe(
      'https://orono.schoology.com/course/*/materials'
    );
  });

  it('stops recording when no side panel is open', async () => {
    const { send, chromeFake, store } = await setup();
    await send({ type: 'rec/start', tabId: 7 }, { url: PANEL_URL });
    panel.open = false;
    await send(click, { tab: { id: 7, url: TAB_URL }, frameId: 0 });
    await vi.waitFor(() => expect(store['recorder.tabId']).toBeUndefined());
    expect(chromeFake.tabs.captureVisibleTab).not.toHaveBeenCalled();
  });

  it('keeps the clicked page and takes no picture once the tab has moved on', async () => {
    const { send, chromeFake, panelMessages } = await setup();
    await send({ type: 'rec/start', tabId: 7 }, { url: PANEL_URL });
    chromeFake.tabs.get.mockResolvedValue({
      id: 7,
      windowId: 1,
      active: true,
      url: 'https://orono.schoology.com/home',
    });
    await send(click, { tab: { id: 7, url: TAB_URL }, frameId: 0 });
    await vi.waitFor(() => expect(panelMessages.length).toBeGreaterThan(1));
    expect(chromeFake.tabs.captureVisibleTab).not.toHaveBeenCalled();
    const captured = panelMessages.find(
      (m) => (m as { type: string }).type === 'rec/captured'
    ) as { capture: { screenshot: unknown; urlPattern: string } };
    expect(captured.capture.screenshot).toBeNull();
    expect(captured.capture.urlPattern).toBe(
      'https://orono.schoology.com/course/*/materials'
    );
  });

  it('takes no picture of a tab that is not showing', async () => {
    const { send, chromeFake, panelMessages } = await setup();
    await send({ type: 'rec/start', tabId: 7 }, { url: PANEL_URL });
    chromeFake.tabs.get.mockResolvedValue({
      id: 7,
      windowId: 1,
      active: false,
      url: 'https://orono.schoology.com/home',
    });
    await send(click, { tab: { id: 7, url: TAB_URL }, frameId: 0 });
    await vi.waitFor(() => expect(panelMessages.length).toBeGreaterThan(1));
    expect(chromeFake.tabs.captureVisibleTab).not.toHaveBeenCalled();
    const captured = panelMessages.find(
      (m) => (m as { type: string }).type === 'rec/captured'
    ) as { capture: { screenshot: unknown } };
    expect(captured.capture.screenshot).toBeNull();
  });

  it('drops malformed clicks', async () => {
    const { send, chromeFake } = await setup();
    await send({ type: 'rec/start', tabId: 7 }, { url: PANEL_URL });
    await send(
      {
        ...click,
        target: { ...click.target, locator: { name: 'x'.repeat(500) } },
      },
      { tab: { id: 7, url: TAB_URL }, frameId: 0 }
    );
    await flush();
    expect(chromeFake.tabs.captureVisibleTab).not.toHaveBeenCalled();
  });

  it('sends steps only to an attached tour and keeps them until acknowledged', async () => {
    const { worker, send, store } = await setup();
    const step = {
      id: 'step-1',
      urlPattern: 'https://orono.schoology.com/home',
      action: 'click',
      locator: { name: 'Courses' },
    };
    expect(
      await send(
        { type: 'rec/send', setId: 't1', steps: [step] },
        { url: PANEL_URL }
      )
    ).toBe(false);

    const handlers: Listener[] = [];
    const posted: unknown[] = [];
    const port = {
      postMessage: (m: unknown) => posted.push(m),
      disconnect: vi.fn(),
      onMessage: { addListener: (fn: Listener) => handlers.push(fn) },
      onDisconnect: { addListener: vi.fn() },
    };
    worker.handleRecorderPort(port as unknown as chrome.runtime.Port);
    handlers[0]({
      type: 'recorder/attach',
      setId: 't1',
      title: 'Tour',
      extra: 1,
    });
    await flush();
    expect(posted).toEqual([]);
    handlers[0]({ type: 'recorder/attach', setId: 't1', title: 'Tour' });
    await vi.waitFor(() => expect(posted).toHaveLength(1));
    expect(
      await send(
        { type: 'rec/send', setId: 't1', steps: [step] },
        { url: PANEL_URL }
      )
    ).toBe(true);
    expect(posted[1]).toEqual({ type: 'recorder/step', setId: 't1', step });
    expect(
      (store['recorder.outbox'] as Record<string, unknown[]>).t1
    ).toHaveLength(1);
    handlers[0]({ type: 'recorder/ack', setId: 't1', stepId: 'step-1' });
    await vi.waitFor(() => expect(store['recorder.outbox']).toEqual({}));
  });

  it('fixes a step SpartBoard asked about with one click, under the step id', async () => {
    const { worker, send, store } = await setup();
    const handlers: Listener[] = [];
    const posted: unknown[] = [];
    const port = {
      postMessage: (m: unknown) => posted.push(m),
      disconnect: vi.fn(),
      onMessage: { addListener: (fn: Listener) => handlers.push(fn) },
      onDisconnect: { addListener: vi.fn() },
    };
    worker.handleRecorderPort(port as unknown as chrome.runtime.Port);
    handlers[0]({ type: 'recorder/attach', setId: 't1', title: 'Tour' });
    await vi.waitFor(() => expect(posted).toHaveLength(1));
    handlers[0]({ type: 'recorder/repick', setId: 't1', stepId: 's2' });
    await vi.waitFor(() =>
      expect(store['recorder.pick']).toEqual({ setId: 't1', stepId: 's2' })
    );
    expect(
      (
        (await send({ type: 'rec/status' }, { url: PANEL_URL })) as {
          pick: unknown;
        }
      ).pick
    ).toEqual({ setId: 't1', stepId: 's2', title: 'Tour' });

    await send({ type: 'rec/start', tabId: 7 }, { url: PANEL_URL });
    await send(click, { tab: { id: 7, url: TAB_URL }, frameId: 0 });
    await vi.waitFor(() => expect(store['recorder.tabId']).toBeUndefined());

    const step = {
      id: 'new-capture',
      urlPattern: 'https://orono.schoology.com/home',
      action: 'click',
      locator: { role: 'link', name: 'Courses' },
      tip: 'dropped',
    };
    // A click picked for another step is refused.
    expect(
      await send(
        { type: 'rec/sendFix', setId: 't1', stepId: 's9', step },
        { url: PANEL_URL }
      )
    ).toBe(false);
    expect(
      await send(
        { type: 'rec/sendFix', setId: 't1', stepId: 's2', step },
        { url: PANEL_URL }
      )
    ).toBe(true);
    const { tip: _tip, ...fixed } = { ...step, id: 's2' };
    expect(posted.at(-1)).toEqual({
      type: 'recorder/repicked',
      setId: 't1',
      step: fixed,
    });
    expect(store['recorder.pick']).toBeUndefined();
    handlers[0]({ type: 'recorder/ack', setId: 't1', stepId: 's2' });
    await vi.waitFor(() => expect(store['recorder.fixes']).toEqual({}));
  });

  it('drops a fix request when its tour closes, so later recording keeps going', async () => {
    const { worker, send, store, chromeFake } = await setup();
    const handlers: Listener[] = [];
    const closers: Listener[] = [];
    const port = {
      postMessage: vi.fn(),
      disconnect: vi.fn(),
      onMessage: { addListener: (fn: Listener) => handlers.push(fn) },
      onDisconnect: { addListener: (fn: Listener) => closers.push(fn) },
    };
    worker.handleRecorderPort(port as unknown as chrome.runtime.Port);
    handlers[0]({ type: 'recorder/attach', setId: 't1', title: 'Tour' });
    await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalled());
    handlers[0]({ type: 'recorder/repick', setId: 't1', stepId: 's2' });
    await vi.waitFor(() => expect(store['recorder.pick']).toBeDefined());
    closers[0]();
    await vi.waitFor(() => expect(store['recorder.pick']).toBeUndefined());
    await send({ type: 'rec/start', tabId: 7 }, { url: PANEL_URL });
    await send(click, { tab: { id: 7, url: TAB_URL }, frameId: 0 });
    await send(click, { tab: { id: 7, url: TAB_URL }, frameId: 0 });
    await vi.waitFor(() =>
      expect(chromeFake.tabs.captureVisibleTab).toHaveBeenCalledTimes(2)
    );
    await flush();
    expect(store['recorder.tabId']).toBe(7);
  });

  it('blurs the page with the saved settings before the picture and lifts it after', async () => {
    const { send, chromeFake, local } = await setup();
    local['recorder.blur'] = { emails: false, tableRows: true };
    const order: string[] = [];
    const shoots: unknown[] = [];
    chromeFake.tabs.sendMessage.mockImplementation(
      (_tab: unknown, m: unknown) => {
        const msg = m as { type: string };
        order.push(msg.type);
        if (msg.type === 'rec/shoot') shoots.push(m);
        return Promise.resolve(true);
      }
    );
    chromeFake.tabs.captureVisibleTab.mockImplementation(() => {
      order.push('capture');
      return Promise.resolve('data:image/png;base64,AAAA');
    });
    await send({ type: 'rec/start', tabId: 7 }, { url: PANEL_URL });
    await send(click, { tab: { id: 7, url: TAB_URL }, frameId: 0 });
    await vi.waitFor(() => expect(order).toContain('rec/shot'));
    expect(order).toEqual(['rec/shoot', 'capture', 'rec/shot']);
    expect(shoots[0]).toEqual({
      type: 'rec/shoot',
      blur: {
        emails: false,
        ids: true,
        lastFirst: true,
        fields: true,
        tableRows: true,
        images: false,
      },
      picks: [],
    });
  });

  it('takes no picture when the page could not be blurred', async () => {
    const { send, chromeFake, panelMessages } = await setup();
    chromeFake.tabs.sendMessage.mockImplementation(() =>
      Promise.reject(new Error('no receiver'))
    );
    await send({ type: 'rec/start', tabId: 7 }, { url: PANEL_URL });
    await send(click, { tab: { id: 7, url: TAB_URL }, frameId: 0 });
    await vi.waitFor(() =>
      expect(
        panelMessages.some(
          (m) => (m as { type: string }).type === 'rec/captured'
        )
      ).toBe(true)
    );
    expect(chromeFake.tabs.captureVisibleTab).not.toHaveBeenCalled();
    const captured = panelMessages.find(
      (m) => (m as { type: string }).type === 'rec/captured'
    ) as { capture: { screenshot: unknown } };
    expect(captured.capture.screenshot).toBeNull();
  });

  it('remembers Click to blur picks for the page during one recording only', async () => {
    const { send, chromeFake, store } = await setup();
    const frameSender = {
      tab: { id: 7, url: TAB_URL },
      frameId: 0,
      url: TAB_URL,
    };
    const pick = { type: 'rec/blurPick', selector: '#grades', on: true };
    expect(
      await send({ type: 'rec/setBlurPicking', on: true }, { url: PANEL_URL })
    ).toBe(false);
    await send({ type: 'rec/start', tabId: 7 }, { url: PANEL_URL });
    // A pick while Click to blur is off is ignored.
    await send(pick, frameSender);
    await flush();
    expect(store['recorder.blurPicks']).toBeUndefined();
    expect(
      await send({ type: 'rec/setBlurPicking', on: true }, { url: PANEL_URL })
    ).toBe(true);
    expect(
      (
        (await send({ type: 'rec/status' }, { url: PANEL_URL })) as {
          blurPicking: boolean;
        }
      ).blurPicking
    ).toBe(true);
    await send(pick, frameSender);
    await vi.waitFor(() =>
      expect(store['recorder.blurPicks']).toEqual({
        'https://orono.schoology.com/course/*/materials': ['#grades'],
      })
    );
    const shoots: unknown[] = [];
    chromeFake.tabs.sendMessage.mockImplementation(
      (_tab: unknown, m: unknown) => {
        if ((m as { type: string }).type === 'rec/shoot') shoots.push(m);
        return Promise.resolve(true);
      }
    );
    await send(click, { tab: { id: 7, url: TAB_URL }, frameId: 0 });
    await vi.waitFor(() => expect(shoots).toHaveLength(1));
    expect((shoots[0] as { picks: string[] }).picks).toEqual(['#grades']);
    await send({ type: 'rec/stop' }, { url: PANEL_URL });
    expect(store['recorder.blurPicks']).toBeUndefined();
    expect(store['recorder.blurPicking']).toBeUndefined();
  });

  it('closes a recorder port when the profile is not staff', async () => {
    profile.value = 'other';
    const { worker } = await setup();
    const handlers: Listener[] = [];
    const port = {
      postMessage: vi.fn(),
      disconnect: vi.fn(),
      onMessage: { addListener: (fn: Listener) => handlers.push(fn) },
      onDisconnect: { addListener: vi.fn() },
    };
    worker.handleRecorderPort(port as unknown as chrome.runtime.Port);
    handlers[0]({ type: 'recorder/attach', setId: 't1', title: 'Tour' });
    await vi.waitFor(() => expect(port.disconnect).toHaveBeenCalled());
    expect(port.postMessage).not.toHaveBeenCalled();
  });
});
