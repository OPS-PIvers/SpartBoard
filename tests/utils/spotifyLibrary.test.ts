/**
 * Coverage for the personal-Spotify Library API helpers. Mirrors the
 * defensive patterns in `searchSpotify` — Spotify's API has a documented
 * null-item quirk, and our utilities must tolerate it without throwing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchUserPlaylists, fetchRecentlyPlayed } from '@/utils/spotifyAuth';

describe('fetchUserPlaylists', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const respond = (body: unknown, ok = true, status = 200) =>
    Promise.resolve({
      ok,
      status,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    } as Response);

  it('returns playlists with normalized shape', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      respond({
        items: [
          {
            id: 'pl1',
            name: 'Morning Mix',
            uri: 'spotify:playlist:pl1',
            owner: { display_name: 'Paul Ivers' },
            images: [{ url: 'https://img/pl1.jpg' }],
          },
        ],
      })
    );

    const out = await fetchUserPlaylists('tok');

    expect(out).toEqual([
      {
        id: 'pl1',
        name: 'Morning Mix',
        uri: 'spotify:playlist:pl1',
        owner: 'Paul Ivers',
        imageUrl: 'https://img/pl1.jpg',
      },
    ]);
  });

  it('tolerates null entries in items[]', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      respond({
        items: [
          null,
          {
            id: 'pl1',
            name: 'Morning Mix',
            uri: 'spotify:playlist:pl1',
            owner: { display_name: 'Paul' },
            images: [],
          },
          null,
        ],
      })
    );

    const out = await fetchUserPlaylists('tok');

    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('pl1');
  });

  it('throws SpotifyScopeError on 403 with insufficient_scope', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      respond(
        { error: { status: 403, message: 'Insufficient client scope' } },
        false,
        403
      )
    );

    await expect(fetchUserPlaylists('tok')).rejects.toMatchObject({
      name: 'SpotifyScopeError',
    });
  });

  it('throws a generic error on 5xx', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      respond({ error: { message: 'oops' } }, false, 500)
    );

    await expect(fetchUserPlaylists('tok')).rejects.toThrow(/500/);
  });
});

describe('fetchRecentlyPlayed', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const respond = (body: unknown, ok = true, status = 200) =>
    Promise.resolve({
      ok,
      status,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    } as Response);

  it('flattens items[].track and normalizes shape', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      respond({
        items: [
          {
            track: {
              id: 't1',
              name: 'Banana Pancakes',
              uri: 'spotify:track:t1',
              artists: [{ name: 'Jack Johnson' }],
              album: { images: [{ url: 'https://img/t1.jpg' }] },
            },
          },
        ],
      })
    );

    const out = await fetchRecentlyPlayed('tok');

    expect(out).toEqual([
      {
        id: 't1',
        name: 'Banana Pancakes',
        uri: 'spotify:track:t1',
        artist: 'Jack Johnson',
        imageUrl: 'https://img/t1.jpg',
      },
    ]);
  });

  it('tolerates null items and null nested track', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      respond({
        items: [
          null,
          { track: null },
          {
            track: {
              id: 't1',
              name: 'Song',
              uri: 'spotify:track:t1',
              artists: [{ name: 'Artist' }],
              album: { images: [] },
            },
          },
        ],
      })
    );

    const out = await fetchRecentlyPlayed('tok');

    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('t1');
  });

  it('de-duplicates tracks played more than once, keeping the most recent', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      respond({
        items: [
          {
            track: {
              id: 't1',
              name: 'Song A',
              uri: 'spotify:track:t1',
              artists: [{ name: 'X' }],
              album: { images: [] },
            },
          },
          {
            track: {
              id: 't2',
              name: 'Song B',
              uri: 'spotify:track:t2',
              artists: [{ name: 'Y' }],
              album: { images: [] },
            },
          },
          {
            track: {
              id: 't1',
              name: 'Song A',
              uri: 'spotify:track:t1',
              artists: [{ name: 'X' }],
              album: { images: [] },
            },
          },
        ],
      })
    );

    const out = await fetchRecentlyPlayed('tok');

    expect(out.map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('throws SpotifyScopeError on 403/scope', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      respond({ error: { message: 'Insufficient client scope' } }, false, 403)
    );

    await expect(fetchRecentlyPlayed('tok')).rejects.toMatchObject({
      name: 'SpotifyScopeError',
    });
  });
});
