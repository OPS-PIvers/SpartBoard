/**
 * playOnDevice self-heals the "Device not found" (404) case: a freshly-ready
 * Web Playback SDK device often isn't yet a valid Spotify Connect play target,
 * so the first PUT /me/player/play?device_id= returns 404. The function then
 * transfers playback to the device (PUT /me/player) to activate it and retries
 * the play once.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { playOnDevice } from '@/utils/spotifyAuth';

const PLAY_RE = /\/me\/player\/play\?device_id=/;
const TRANSFER_URL = 'https://api.spotify.com/v1/me/player';

const resp = (status: number) =>
  ({ ok: status >= 200 && status < 300, status }) as unknown as Response;

// playOnDevice always calls fetch with a string URL, so reading the first
// argument as a string is accurate (string is part of the RequestInfo union).
const callUrl = (
  calls: [input: RequestInfo | URL, init?: RequestInit][],
  i: number
): string => calls[i][0] as string;

describe('playOnDevice', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('plays in one call when the device is already active (204)', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(resp(204));

    await playOnDevice('tok', 'dev1', { uris: ['spotify:track:t1'] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(callUrl(fetchMock.mock.calls, 0)).toMatch(PLAY_RE);
  });

  it('on 404 transfers playback to the device then retries the play', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(resp(404)) // first play → device not found
      .mockResolvedValueOnce(resp(204)) // transfer
      .mockResolvedValueOnce(resp(204)); // retry play

    const promise = playOnDevice('tok', 'dev1', {
      contextUri: 'spotify:playlist:pl1',
    });
    await vi.advanceTimersByTimeAsync(500);
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(callUrl(fetchMock.mock.calls, 0)).toMatch(PLAY_RE);
    expect(callUrl(fetchMock.mock.calls, 1)).toBe(TRANSFER_URL);
    // Transfer body activates the device without forcing resume.
    const transferInit = fetchMock.mock.calls[1][1];
    const transferBody = JSON.parse(
      (transferInit?.body as string) ?? '{}'
    ) as unknown;
    expect(transferBody).toEqual({ device_ids: ['dev1'], play: false });
    expect(callUrl(fetchMock.mock.calls, 2)).toMatch(PLAY_RE);
  });

  it('throws spotify-premium-required on 403', async () => {
    vi.mocked(fetch).mockResolvedValue(resp(403));

    await expect(
      playOnDevice('tok', 'dev1', { uris: ['spotify:track:t1'] })
    ).rejects.toThrow('spotify-premium-required');
  });

  it('throws on a non-2xx that is not 404/403/204', async () => {
    vi.mocked(fetch).mockResolvedValue(resp(500));

    await expect(
      playOnDevice('tok', 'dev1', { uris: ['spotify:track:t1'] })
    ).rejects.toThrow(/500/);
  });
});
