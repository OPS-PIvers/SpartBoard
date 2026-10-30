import { describe, expect, it, vi } from 'vitest';
import type { ImportSendRequest } from '@/utils/import/contract';
import { DEFAULT_SEND_BLOCK_PATTERNS } from '@/utils/import/sendBlockList';
import type { ApiResult } from '../spartboardApi';
import {
  createSendWorker,
  type SendStatusCache,
  type SendWorkerDeps,
} from './worker';
import { DEFAULT_SEND_SETTINGS, type SendSettings } from './settings';

const ORIGIN = 'https://spartboard.web.app';
const ARTICLE = 'https://news.example.org/story';
const GRADEBOOK = 'https://orono.schoology.com/course/123/gradebook';

const request = (url = ARTICLE): ImportSendRequest => ({
  url,
  title: 'Story',
  platform: 'generic',
  selectionOnly: false,
  blocks: [{ type: 'paragraph', text: 'Hello' }],
  images: [],
});

function setup(
  over: Partial<Omit<SendWorkerDeps, 'tabUrl'>> & {
    statusReply?: ApiResult<{
      enabled: boolean;
      hasAccount: boolean;
      blockPatterns: string[];
    }>;
    settings?: SendSettings;
    pageUrl?: string;
  } = {}
) {
  const { statusReply, settings: startSettings, pageUrl, ...rest } = over;
  let cache: SendStatusCache | undefined;
  let settings = startSettings ?? DEFAULT_SEND_SETTINGS;
  const deps: SendWorkerDeps = {
    origins: [ORIGIN],
    isStaff: () => Promise.resolve(true),
    status: vi.fn(() =>
      Promise.resolve(
        statusReply ?? {
          ok: true as const,
          value: {
            enabled: true,
            hasAccount: true,
            blockPatterns: [...DEFAULT_SEND_BLOCK_PATTERNS],
          },
        }
      )
    ),
    send: vi.fn(() =>
      Promise.resolve({
        ok: true as const,
        value: { id: 'x', blocks: 1, images: 0 },
      })
    ),
    loadStatus: () => Promise.resolve(cache),
    saveStatus: (s) => {
      cache = s;
      return Promise.resolve();
    },
    loadSettings: () => Promise.resolve(settings),
    saveSettings: vi.fn((s: SendSettings) => {
      settings = s;
      return Promise.resolve();
    }),
    inject: vi.fn(() => Promise.resolve(true)),
    tell: vi.fn(() => Promise.resolve(undefined)),
    tabUrl: () => Promise.resolve(pageUrl ?? ARTICLE),
    schoologyEnabled: () => Promise.resolve(true),
    syncMenu: vi.fn(() => Promise.resolve(undefined)),
    boardTabs: () => Promise.resolve([]),
    focus: () => Promise.resolve(undefined),
    navigate: vi.fn(() => Promise.resolve(undefined)),
    openTab: vi.fn(() => Promise.resolve(undefined)),
    now: () => 1_000_000,
    ...rest,
  };
  return { worker: createSendWorker(deps), deps, settings: () => settings };
}

describe('send worker', () => {
  it('injects the edge tab on an ordinary page and adds the right-click item', async () => {
    const { worker, deps } = setup();
    await worker.navigated(7, 0, ARTICLE);
    expect(deps.inject).toHaveBeenCalledWith(7);
    expect(deps.syncMenu).toHaveBeenCalledWith(true);
  });

  it('does nothing for a profile that is not staff, and never asks SpartBoard', async () => {
    const { worker, deps } = setup({ isStaff: () => Promise.resolve(false) });
    await worker.navigated(7, 0, ARTICLE);
    expect(deps.inject).not.toHaveBeenCalled();
    expect(deps.status).not.toHaveBeenCalled();
    expect(deps.syncMenu).toHaveBeenCalledWith(false);
  });

  it('does nothing without the flag, and keeps that answer for 30 minutes', async () => {
    const { worker, deps } = setup({
      statusReply: {
        ok: true,
        value: { enabled: false, hasAccount: true, blockPatterns: [] },
      },
    });
    await worker.navigated(7, 0, ARTICLE);
    await worker.navigated(7, 0, ARTICLE);
    expect(deps.inject).not.toHaveBeenCalled();
    expect(deps.status).toHaveBeenCalledTimes(1);
  });

  it('asks again after 5 minutes when SpartBoard could not be reached', async () => {
    let now = 0;
    const { worker, deps } = setup({
      statusReply: { ok: false, why: 'offline' },
      now: () => now,
    });
    await worker.status();
    now = 4 * 60_000;
    await worker.status();
    now = 6 * 60_000;
    await worker.status();
    expect(deps.status).toHaveBeenCalledTimes(2);
  });

  it('hides the button and refuses to send on a block-listed page', async () => {
    const { worker, deps } = setup();
    await worker.navigated(7, 0, GRADEBOOK);
    expect(deps.inject).not.toHaveBeenCalled();
    expect(await worker.message({ type: 'send/state' }, GRADEBOOK)).toEqual({
      enabled: true,
      blocked: true,
      show: false,
      schoology: false,
    });
    expect(
      await worker.message(
        { type: 'send/page', request: request(GRADEBOOK) },
        GRADEBOOK
      )
    ).toEqual({ ok: false, why: 'blocked' });
    expect(deps.send).not.toHaveBeenCalled();
  });

  it('refuses a page that claims an allowed address from a blocked one', async () => {
    const { worker, deps } = setup();
    expect(
      await worker.message(
        { type: 'send/page', request: request(ARTICLE) },
        GRADEBOOK
      )
    ).toEqual({ ok: false, why: 'blocked' });
    expect(
      await worker.message(
        { type: 'send/page', request: request(GRADEBOOK) },
        ARTICLE
      )
    ).toEqual({ ok: false, why: 'blocked' });
    expect(deps.send).not.toHaveBeenCalled();
  });

  it('sends an allowed page to the inbox', async () => {
    const { worker, deps } = setup();
    expect(
      await worker.message({ type: 'send/page', request: request() }, ARTICLE)
    ).toEqual({ ok: true, blocks: 1, images: 0 });
    expect(deps.send).toHaveBeenCalledWith(request());
  });

  it('refuses to send without the flag', async () => {
    const { worker, deps } = setup({
      statusReply: {
        ok: true,
        value: { enabled: false, hasAccount: true, blockPatterns: [] },
      },
    });
    expect(
      await worker.message({ type: 'send/page', request: request() }, ARTICLE)
    ).toEqual({ ok: false, why: 'no-access' });
    expect(deps.send).not.toHaveBeenCalled();
  });

  it('never shows on SpartBoard itself', async () => {
    const { worker, deps } = setup();
    await worker.navigated(7, 0, `${ORIGIN}/`);
    expect(deps.inject).not.toHaveBeenCalled();
  });

  it('respects Hide on this site and the global switch for the edge tab only', async () => {
    const { worker, deps } = setup({
      settings: { showOnPages: true, hiddenHosts: ['news.example.org'] },
    });
    await worker.navigated(7, 0, ARTICLE);
    expect(deps.inject).not.toHaveBeenCalled();
    // The toolbar and right-click still send.
    expect(await worker.sendFromBrowser(7)).toBe(true);
    expect(deps.tell).toHaveBeenCalledWith(7, {
      type: 'send/now',
      blocked: false,
    });

    const off = setup({
      settings: { showOnPages: false, hiddenHosts: [] },
    });
    await off.worker.navigated(7, 0, ARTICLE);
    expect(off.deps.inject).not.toHaveBeenCalled();
  });

  it('tells the page to show the refusal when the right-click item is used on a blocked page', async () => {
    const { worker, deps } = setup({ pageUrl: GRADEBOOK });
    expect(await worker.sendFromBrowser(3)).toBe(true);
    expect(deps.tell).toHaveBeenCalledWith(3, {
      type: 'send/now',
      blocked: true,
    });
  });

  it('saves the side panel switches and reports them back', async () => {
    const { worker, settings } = setup();
    await worker.panel({
      type: 'send/panel',
      action: 'set',
      host: 'News.Example.org',
      hidden: true,
    });
    await worker.panel({
      type: 'send/panel',
      action: 'set',
      showOnPages: false,
    });
    expect(settings()).toEqual({
      showOnPages: false,
      hiddenHosts: ['news.example.org'],
    });
    expect(
      await worker.panel({ type: 'send/panel', action: 'state', tabId: 1 })
    ).toEqual({
      enabled: true,
      showOnPages: false,
      host: 'news.example.org',
      hiddenHere: true,
      blocked: false,
    });
  });

  it('offers the Schoology reader only on Schoology pages with that import on', async () => {
    const QUIZ = 'https://orono.schoology.com/assignment/5';
    const on = setup();
    expect(await on.worker.stateFor(QUIZ)).toMatchObject({ schoology: true });
    expect(await on.worker.stateFor(ARTICLE)).toMatchObject({
      schoology: false,
    });
    const off = setup({ schoologyEnabled: () => Promise.resolve(false) });
    expect(await off.worker.stateFor(QUIZ)).toMatchObject({
      show: true,
      schoology: false,
    });
  });

  it('asks SpartBoard once for many tabs loading together', async () => {
    const { worker, deps } = setup();
    await Promise.all([1, 2, 3].map((t) => worker.navigated(t, 0, ARTICLE)));
    expect(deps.status).toHaveBeenCalledTimes(1);
  });

  it('keeps the block list when SpartBoard stops answering', async () => {
    let now = 0;
    let reachable = true;
    const { worker } = setup({
      now: () => now,
      status: () =>
        Promise.resolve(
          reachable
            ? {
                ok: true as const,
                value: {
                  enabled: true,
                  hasAccount: true,
                  blockPatterns: [...DEFAULT_SEND_BLOCK_PATTERNS],
                },
              }
            : { ok: false as const, why: 'offline' as const }
        ),
    });
    await worker.status();
    reachable = false;
    now = 31 * 60_000;
    expect(await worker.stateFor(GRADEBOOK)).toMatchObject({
      enabled: true,
      blocked: true,
    });
  });

  it('adds the button to a tab whose address changed in place to an allowed page', async () => {
    const { worker, deps } = setup({
      tell: vi.fn(() => Promise.reject(new Error('no script'))),
    });
    await worker.changedInPlace(4, 0, ARTICLE);
    expect(deps.inject).toHaveBeenCalledWith(4);
    const has = setup();
    await has.worker.changedInPlace(4, 0, ARTICLE);
    expect(has.deps.tell).toHaveBeenCalledWith(4, { type: 'send/recheck' });
    expect(has.deps.inject).not.toHaveBeenCalled();
  });

  it('turns Send off when SpartBoard refuses, but keeps it offline', async () => {
    let now = 0;
    let why: 'offline' | 'no-access' = 'offline';
    const { worker } = setup({
      now: () => now,
      status: vi.fn(() =>
        Promise.resolve(
          now === 0
            ? {
                ok: true as const,
                value: { enabled: true, hasAccount: true, blockPatterns: [] },
              }
            : { ok: false as const, why }
        )
      ),
    });
    await worker.status();
    now = 31 * 60_000;
    expect((await worker.status()).enabled).toBe(true);
    why = 'no-access';
    now = 37 * 60_000;
    expect((await worker.status()).enabled).toBe(false);
  });

  it("shows the button at once in the panel's tab when the teacher turns it back on", async () => {
    const { worker, deps } = setup({
      settings: { showOnPages: false, hiddenHosts: [] },
    });
    await worker.panel({
      type: 'send/panel',
      action: 'set',
      tabId: 2,
      showOnPages: true,
    });
    expect(deps.inject).toHaveBeenCalledWith(2);
  });

  it('ignores messages that are not its own', () => {
    const { worker } = setup();
    expect(worker.message({ type: 'schoology/open' }, ARTICLE)).toBeNull();
    expect(worker.panel({ type: 'tours/list' })).toBeNull();
  });

  it('opens the Import inbox in a new tab when no board is open', async () => {
    const { worker, deps } = setup();
    await worker.message({ type: 'send/open' }, ARTICLE);
    expect(deps.openTab).toHaveBeenCalledWith(`${ORIGIN}/?importInbox=1`);
  });
});
