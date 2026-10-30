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
  over: Partial<SendWorkerDeps> & {
    statusReply?: ApiResult<{
      enabled: boolean;
      hasAccount: boolean;
      blockPatterns: string[];
    }>;
    settings?: SendSettings;
    tabUrl?: string;
  } = {}
) {
  const { statusReply, settings: startSettings, tabUrl, ...rest } = over;
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
    tabUrl: () => Promise.resolve(tabUrl ?? ARTICLE),
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
    const { worker, deps } = setup({ tabUrl: GRADEBOOK });
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
