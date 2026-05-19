/**
 * Coverage for the personal-Spotify Library API helpers. Mirrors the
 * defensive patterns in `searchSpotify` — Spotify's API has a documented
 * null-item quirk, and our utilities must tolerate it without throwing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchUserPlaylists } from '@/utils/spotifyAuth';

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
