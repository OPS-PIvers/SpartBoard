import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  useChangelog,
  writeLastSeenVersion,
  readLastSeenVersion,
  WHATSNEW_SEEN_EVENT_NAME,
  __resetChangelogCacheForTests,
} from '../../hooks/useChangelog';

const SAMPLE = {
  entries: [
    {
      version: '2026.06.01',
      date: '2026-06-01',
      title: 'Latest',
      details: [{ type: 'feature' as const, text: 'A' }],
    },
    {
      version: '2026.05.20',
      date: '2026-05-20',
      title: 'Middle',
      details: [{ type: 'fix' as const, text: 'B' }],
    },
    {
      version: '2026.05.10',
      date: '2026-05-10',
      title: 'Older',
      details: [{ type: 'improvement' as const, text: 'C' }],
    },
  ],
};

describe('useChangelog', () => {
  let globalFetch: Mock;

  beforeEach(() => {
    __resetChangelogCacheForTests();
    globalFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(SAMPLE),
    });
    globalThis.fetch = globalFetch;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads entries and exposes latestVersion', async () => {
    const { result } = renderHook(() => useChangelog());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries).toHaveLength(3);
    expect(result.current.latestVersion).toBe('2026.06.01');
  });

  it('entriesSinceCurrent returns empty when user is on latest', async () => {
    const { result } = renderHook(() => useChangelog());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entriesSinceCurrent('2026.06.01')).toEqual([]);
  });

  it('entriesSinceCurrent returns only newer entries when user is on a middle version', async () => {
    const { result } = renderHook(() => useChangelog());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const newer = result.current.entriesSinceCurrent('2026.05.20');
    expect(newer.map((e) => e.version)).toEqual(['2026.06.01']);
  });

  it('entriesSinceCurrent returns all entries when current version is unknown', async () => {
    const { result } = renderHook(() => useChangelog());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const all = result.current.entriesSinceCurrent('2020.01.01');
    expect(all).toHaveLength(3);
  });

  it('entriesSinceCurrent returns empty when changelog is empty', async () => {
    globalFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ entries: [] }),
    });
    const { result } = renderHook(() => useChangelog());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries).toEqual([]);
    expect(result.current.latestVersion).toBeNull();
    expect(result.current.entriesSinceCurrent('anything')).toEqual([]);
  });

  it('captures error state on fetch failure', async () => {
    globalFetch.mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useChangelog());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.entries).toEqual([]);
  });

  it('dedupes concurrent fetches across hook instances', async () => {
    const { result: r1 } = renderHook(() => useChangelog());
    const { result: r2 } = renderHook(() => useChangelog());
    await waitFor(() => {
      expect(r1.current.loading).toBe(false);
      expect(r2.current.loading).toBe(false);
    });
    expect(globalFetch).toHaveBeenCalledTimes(1);
    expect(r1.current.entries).toHaveLength(3);
    expect(r2.current.entries).toHaveLength(3);
  });

  it('round-trips entries with overview and nested bullets unchanged', async () => {
    globalFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          entries: [
            {
              version: '2026.07.01',
              date: '2026-07-01',
              title: 'Themed release',
              overview: [
                {
                  type: 'feature' as const,
                  subtitle: 'Collections',
                  items: [
                    { text: 'Top-level bullet' },
                    {
                      text: 'Parent with nested',
                      items: [{ text: 'Sub one' }, { text: 'Sub two' }],
                    },
                  ],
                },
                {
                  type: 'fix' as const,
                  // No subtitle — theme-less Fixes section.
                  items: [{ text: 'Flat fix bullet' }],
                },
              ],
              details: [{ type: 'feature' as const, text: 'D' }],
            },
          ],
        }),
    });
    const { result } = renderHook(() => useChangelog());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const entry = result.current.entries[0];
    expect(entry.overview).toHaveLength(2);
    expect(entry.overview?.[0].subtitle).toBe('Collections');
    expect(entry.overview?.[0].items[1].items).toHaveLength(2);
    expect(entry.overview?.[0].items[1].items?.[0].text).toBe('Sub one');
    expect(entry.overview?.[1].subtitle).toBeUndefined();
  });

  describe('normalization', () => {
    const warnSpy = vi.fn();
    const originalWarn = console.warn;

    beforeEach(() => {
      warnSpy.mockReset();
      console.warn = warnSpy;
    });

    afterEach(() => {
      console.warn = originalWarn;
    });

    it('drops entries with empty details and warns', async () => {
      globalFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            entries: [
              {
                version: '2026.07.01',
                date: '2026-07-01',
                title: 'Good entry',
                details: [{ type: 'feature' as const, text: 'A' }],
              },
              {
                version: '2026.06.30',
                date: '2026-06-30',
                title: 'Empty-details entry',
                details: [],
              },
            ],
          }),
      });
      const { result } = renderHook(() => useChangelog());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.entries).toHaveLength(1);
      expect(result.current.entries[0].version).toBe('2026.07.01');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('"2026.06.30" has no details')
      );
    });

    it('treats empty overview array as no overview and warns', async () => {
      globalFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            entries: [
              {
                version: '2026.07.01',
                date: '2026-07-01',
                title: 'Entry',
                overview: [],
                details: [{ type: 'feature' as const, text: 'A' }],
              },
            ],
          }),
      });
      const { result } = renderHook(() => useChangelog());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.entries[0].overview).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('"2026.07.01" has an empty overview array')
      );
    });

    it('drops overview sections with empty items and warns; whole overview goes away if no sections survive', async () => {
      globalFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            entries: [
              {
                version: '2026.07.01',
                date: '2026-07-01',
                title: 'Mixed',
                overview: [
                  {
                    type: 'feature' as const,
                    subtitle: 'Keep me',
                    items: [{ text: 'survives' }],
                  },
                  {
                    type: 'fix' as const,
                    subtitle: 'Drop me',
                    items: [],
                  },
                ],
                details: [{ type: 'feature' as const, text: 'A' }],
              },
              {
                version: '2026.06.30',
                date: '2026-06-30',
                title: 'All sections empty',
                overview: [
                  { type: 'feature' as const, items: [] },
                  { type: 'fix' as const, items: [] },
                ],
                details: [{ type: 'feature' as const, text: 'B' }],
              },
            ],
          }),
      });
      const { result } = renderHook(() => useChangelog());
      await waitFor(() => expect(result.current.loading).toBe(false));
      // First entry: one section survives.
      expect(result.current.entries[0].overview).toHaveLength(1);
      expect(result.current.entries[0].overview?.[0].subtitle).toBe('Keep me');
      // Second entry: all sections dropped → overview becomes undefined.
      expect(result.current.entries[1].overview).toBeUndefined();
      // Two warns for the dropped sections in the second entry.
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('"2026.07.01" has an empty overview section')
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('"2026.06.30" has an empty overview section')
      );
    });
  });
});

describe('writeLastSeenVersion', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists the version to localStorage', () => {
    writeLastSeenVersion('2026.06.01');
    expect(readLastSeenVersion()).toBe('2026.06.01');
  });

  it('dispatches a same-tab event with the new version in detail', () => {
    const listener = vi.fn();
    window.addEventListener(WHATSNEW_SEEN_EVENT_NAME, listener);
    writeLastSeenVersion('2026.06.01');
    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0] as CustomEvent<string>;
    expect(event.detail).toBe('2026.06.01');
    window.removeEventListener(WHATSNEW_SEEN_EVENT_NAME, listener);
  });

  it('no-ops on null version', () => {
    const listener = vi.fn();
    window.addEventListener(WHATSNEW_SEEN_EVENT_NAME, listener);
    writeLastSeenVersion(null);
    expect(listener).not.toHaveBeenCalled();
    expect(readLastSeenVersion()).toBeNull();
    window.removeEventListener(WHATSNEW_SEEN_EVENT_NAME, listener);
  });

  it('does not throw when localStorage.setItem throws (private mode)', () => {
    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceeded');
      });
    expect(() => writeLastSeenVersion('2026.06.01')).not.toThrow();
    setItemSpy.mockRestore();
  });

  it('returns null when localStorage.getItem throws (private mode)', () => {
    const getItemSpy = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('SecurityError');
      });
    expect(readLastSeenVersion()).toBeNull();
    getItemSpy.mockRestore();
  });
});
