/**
 * setRepeatMode / setShuffle issue PUT requests to the Spotify player REST
 * endpoints with the right state + device_id query params. They mirror
 * playOnDevice's behavior: 204 success, 403 → premium-required, any other
 * non-2xx throws, AND self-heal the "Device not found" (404) case by
 * transferring playback to the device (PUT /me/player) then retrying once —
 * a freshly-`ready` SDK device otherwise silently 404s and the toggle no-ops.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setRepeatMode, setShuffle } from '@/utils/spotifyAuth';

const TRANSFER_URL = 'https://api.spotify.com/v1/me/player';

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
    vi.useRealTimers();
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

  it('on 404 transfers playback to the device then retries the repeat PUT', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(resp(404)) // first repeat PUT → device not found
      .mockResolvedValueOnce(resp(204)) // transfer
      .mockResolvedValueOnce(resp(204)); // retry repeat PUT

    const promise = setRepeatMode('tok', 'dev1', 'track');
    await vi.advanceTimersByTimeAsync(500);
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(callUrl(fetchMock.mock.calls, 0)).toContain('/me/player/repeat');
    expect(callUrl(fetchMock.mock.calls, 1)).toBe(TRANSFER_URL);
    const transferBody = JSON.parse(
      (fetchMock.mock.calls[1][1]?.body as string) ?? '{}'
    ) as unknown;
    expect(transferBody).toEqual({ device_ids: ['dev1'], play: false });
    expect(callUrl(fetchMock.mock.calls, 2)).toContain('/me/player/repeat');
  });

  it('throws spotify-premium-required on 403', async () => {
    vi.mocked(fetch).mockResolvedValue(resp(403));
    await expect(setRepeatMode('tok', 'dev1', 'off')).rejects.toThrow(
      'spotify-premium-required'
    );
  });

  it('throws on a non-2xx that is not 404/403/204', async () => {
    vi.mocked(fetch).mockResolvedValue(resp(500));
    await expect(setRepeatMode('tok', 'dev1', 'off')).rejects.toThrow(/500/);
  });

  it('throws if the retry after a 404 transfer still fails', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(resp(404)) // first PUT
      .mockResolvedValueOnce(resp(204)) // transfer
      .mockResolvedValueOnce(resp(404)); // retry still 404

    const promise = setRepeatMode('tok', 'dev1', 'off');
    const assertion = expect(promise).rejects.toThrow(/404/);
    await vi.advanceTimersByTimeAsync(500);
    await assertion;
  });

  it('still retries the original PUT when transfer itself returns a transient non-2xx', async () => {
    // Registration polling in useSpotifyWebPlayback now eliminates the
    // "device-not-yet-registered" race upstream, so transfer rarely fails
    // by the time this self-heal path is reached. When it does (a transient
    // 5xx CDN blip mid-play), the caller's retry of the original endpoint
    // is what surfaces the real, actionable error — so transfer's non-2xx
    // responses (except 403) are deliberately silent here. This preserves
    // the pre-PR recovery path where a flaky transfer didn't permanently
    // block the retry.
    vi.useFakeTimers();
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(resp(404)) // first repeat PUT
      .mockResolvedValueOnce(resp(502)) // transfer transient 5xx (swallowed)
      .mockResolvedValueOnce(resp(204)); // retry succeeds

    const promise = setRepeatMode('tok', 'dev1', 'track');
    await vi.advanceTimersByTimeAsync(500);
    await promise;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('translates transfer 403 to spotify-premium-required', async () => {
    // Transfer 403 means the same thing as a 403 on the play endpoint:
    // the account isn't Premium. Without this mapping, the caller would
    // see a generic 'transfer returned 403' that misses the exact-string
    // check in useSpotifyWebPlayback.togglePlay (line 290) — and the UI
    // would never swap to the embed-iframe fallback for non-Premium users
    // who reach the transfer path.
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(resp(404)) // first repeat PUT
      .mockResolvedValueOnce(resp(403)); // transfer → premium required

    await expect(setRepeatMode('tok', 'dev1', 'off')).rejects.toThrow(
      'spotify-premium-required'
    );
    // No retry should have run — there's no point retrying a Premium issue.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('setShuffle', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
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

  it('on 404 transfers playback to the device then retries the shuffle PUT', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(resp(404)) // first shuffle PUT → device not found
      .mockResolvedValueOnce(resp(204)) // transfer
      .mockResolvedValueOnce(resp(204)); // retry shuffle PUT

    const promise = setShuffle('tok', 'dev1', true);
    await vi.advanceTimersByTimeAsync(500);
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(callUrl(fetchMock.mock.calls, 0)).toContain('/me/player/shuffle');
    expect(callUrl(fetchMock.mock.calls, 1)).toBe(TRANSFER_URL);
    expect(callUrl(fetchMock.mock.calls, 2)).toContain('/me/player/shuffle');
  });

  it('throws spotify-premium-required on 403', async () => {
    vi.mocked(fetch).mockResolvedValue(resp(403));
    await expect(setShuffle('tok', 'dev1', true)).rejects.toThrow(
      'spotify-premium-required'
    );
  });
});
