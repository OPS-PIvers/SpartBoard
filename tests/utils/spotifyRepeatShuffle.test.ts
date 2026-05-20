/**
 * setRepeatMode / setShuffle issue PUT requests to the Spotify player REST
 * endpoints with the right state + device_id query params. They mirror
 * playOnDevice's error handling: 204 success, 403 → premium-required, any
 * other non-2xx throws.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setRepeatMode, setShuffle } from '@/utils/spotifyAuth';

const resp = (status: number) =>
  ({ ok: status >= 200 && status < 300, status }) as unknown as Response;

const callUrl = (
  calls: [input: RequestInfo | URL, init?: RequestInit][],
  i: number
): string => calls[i][0] as string;

describe('setRepeatMode', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('PUTs the repeat endpoint with state + device_id (track)', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(resp(204));

    await setRepeatMode('tok', 'dev1', 'track');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(callUrl(fetchMock.mock.calls, 0)).toBe(
      'https://api.spotify.com/v1/me/player/repeat?state=track&device_id=dev1'
    );
    expect(fetchMock.mock.calls[0][1]?.method).toBe('PUT');
  });

  it('PUTs the repeat endpoint for context and off states', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(resp(204));

    await setRepeatMode('tok', 'dev1', 'context');
    await setRepeatMode('tok', 'dev1', 'off');

    expect(callUrl(fetchMock.mock.calls, 0)).toContain('state=context');
    expect(callUrl(fetchMock.mock.calls, 1)).toContain('state=off');
  });

  it('throws spotify-premium-required on 403', async () => {
    vi.mocked(fetch).mockResolvedValue(resp(403));
    await expect(setRepeatMode('tok', 'dev1', 'off')).rejects.toThrow(
      'spotify-premium-required'
    );
  });

  it('throws on a non-2xx that is not 403/204', async () => {
    vi.mocked(fetch).mockResolvedValue(resp(404));
    await expect(setRepeatMode('tok', 'dev1', 'off')).rejects.toThrow(/404/);
  });
});

describe('setShuffle', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('PUTs the shuffle endpoint with state=true + device_id', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(resp(204));

    await setShuffle('tok', 'dev1', true);

    expect(callUrl(fetchMock.mock.calls, 0)).toBe(
      'https://api.spotify.com/v1/me/player/shuffle?state=true&device_id=dev1'
    );
    expect(fetchMock.mock.calls[0][1]?.method).toBe('PUT');
  });

  it('PUTs state=false when turning shuffle off', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(resp(204));

    await setShuffle('tok', 'dev1', false);

    expect(callUrl(fetchMock.mock.calls, 0)).toContain('state=false');
  });

  it('throws spotify-premium-required on 403', async () => {
    vi.mocked(fetch).mockResolvedValue(resp(403));
    await expect(setShuffle('tok', 'dev1', true)).rejects.toThrow(
      'spotify-premium-required'
    );
  });
});
