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
        remove: (key: string) => {
          delete store[key];
          return Promise.resolve();
        },
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
      sendMessage: vi.fn(() => Promise.resolve()),
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
  return { worker, chromeFake, store, send, panelMessages };
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
