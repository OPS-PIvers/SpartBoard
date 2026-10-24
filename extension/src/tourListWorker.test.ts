import { describe, expect, it } from 'vitest';
import type { ApiResult } from './spartboardApi';
import type { TourListCache } from './tourList';
import { createTourListWorker } from './tourListWorker';

const listed = {
  admin: false,
  tours: [
    { id: 'a', title: 'Grades', host: 'a.example', steps: 2, version: 1 },
  ],
};

function setup(result: ApiResult<unknown>, cached?: TourListCache) {
  let stored: TourListCache | null = cached ?? null;
  const badges = new Map<number, string>();
  const worker = createTourListWorker({
    list: () => Promise.resolve(result),
    load: () => Promise.resolve(stored ?? undefined),
    save: (list) => {
      stored = list;
      return Promise.resolve();
    },
    tabs: () =>
      Promise.resolve([
        { id: 1, url: 'https://a.example/x' },
        { id: 2, url: 'https://b.example/' },
        { url: 'https://a.example/' },
      ]),
    setBadge: (tabId, text) => {
      badges.set(tabId, text);
      return Promise.resolve();
    },
    now: () => 9,
  });
  return { worker, badges, stored: () => stored };
}

describe('tour list worker', () => {
  it('caches the list and badges every open tab', async () => {
    const s = setup({ ok: true, value: listed });
    expect(await s.worker.refresh()).toEqual({
      ok: true,
      list: { at: 9, admin: false, tours: listed.tours },
    });
    expect(s.stored()?.tours).toHaveLength(1);
    expect([...s.badges]).toEqual([
      [1, '1'],
      [2, ''],
    ]);
  });

  it('clears the cache and badges when access is refused', async () => {
    const s = setup(
      { ok: false, why: 'no-access' },
      { at: 1, admin: false, tours: listed.tours }
    );
    expect(await s.worker.refresh()).toEqual({ ok: false, why: 'no-access' });
    expect(s.stored()).toBeNull();
    expect(s.badges.get(1)).toBe('');
  });

  it('keeps the cache while offline', async () => {
    const cached = { at: 1, admin: false, tours: listed.tours };
    const s = setup({ ok: false, why: 'offline' }, cached);
    await s.worker.refresh();
    expect(s.stored()).toEqual(cached);
    expect(s.badges.size).toBe(0);
  });

  it('badges one tab from the cache after it navigates', async () => {
    const s = setup(
      { ok: false, why: 'offline' },
      { at: 1, admin: false, tours: listed.tours }
    );
    await s.worker.badge(5, 'https://a.example/page');
    await s.worker.badge(6, 'chrome://newtab');
    expect(s.badges.get(5)).toBe('1');
    expect(s.badges.get(6)).toBe('');
  });
});
