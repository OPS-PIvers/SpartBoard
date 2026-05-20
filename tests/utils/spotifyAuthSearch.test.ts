/**
 * Regression coverage for `searchSpotify`'s tolerance of null entries in the
 * `items[]` arrays returned by Spotify's `/v1/search` endpoint.
 *
 * Spotify's search API frequently returns literal `null` placeholders inside
 * `playlists.items` (most commonly for deleted/private playlists), and the
 * same pattern has been observed in tracks/albums. Before the fix, the loops
 * in `searchSpotify` read `.uri` directly on each entry, throwing
 * `Cannot read properties of null (reading 'uri')` whenever Spotify shipped
 * a null — bubbling up to the Music widget's search box as a red error.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchSpotify } from '@/utils/spotifyAuth';

describe('searchSpotify — null entries in items[]', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const respond = (body: unknown) =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    } as Response);

  it('skips null entries in playlists.items without throwing', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      respond({
        playlists: {
          items: [
            null,
            {
              id: 'pl1',
              name: 'Jack Johnson Radio',
              uri: 'spotify:playlist:pl1',
              owner: { display_name: 'Spotify' },
              images: [{ url: 'https://img/pl1.jpg' }],
            },
            null,
          ],
        },
      })
    );

    const out = await searchSpotify('tok', 'jack johnson radio');

    expect(out).toHaveLength(1);
    expect(out[0].uri).toBe('spotify:playlist:pl1');
    expect(out[0].type).toBe('playlist');
  });

  it('skips null entries in tracks.items and albums.items too', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      respond({
        tracks: {
          items: [
            null,
            {
              id: 't1',
              name: 'Banana Pancakes',
              uri: 'spotify:track:t1',
              artists: [{ name: 'Jack Johnson' }],
              album: { images: [{ url: 'https://img/t1.jpg' }] },
            },
          ],
        },
        albums: {
          items: [
            {
              id: 'al1',
              name: 'In Between Dreams',
              uri: 'spotify:album:al1',
              artists: [{ name: 'Jack Johnson' }],
              images: [{ url: 'https://img/al1.jpg' }],
            },
            null,
          ],
        },
      })
    );

    const out = await searchSpotify('tok', 'jack johnson');

    expect(out.map((r) => r.uri)).toEqual([
      'spotify:track:t1',
      'spotify:album:al1',
    ]);
  });

  it('returns an empty array when every entry is null', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      respond({
        tracks: { items: [null, null] },
        playlists: { items: [null] },
      })
    );

    const out = await searchSpotify('tok', 'anything');

    expect(out).toEqual([]);
  });
});
