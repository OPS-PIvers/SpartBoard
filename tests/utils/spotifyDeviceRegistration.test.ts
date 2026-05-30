/**
 * fetchSpotifyDevices + waitForDeviceRegistration — the registration probe
 * that lets useSpotifyWebPlayback hold back the device id until Spotify
 * Connect has actually registered the SDK device.
 *
 * Why this matters
 * ----------------
 * The Web Playback SDK's `ready` event fires the instant the local device
 * object exists, but server-side propagation lags 1-3 seconds. During that
 * window every REST call targeting the device returns 404 — including the
 * transfer call the existing self-heal uses, so retries 404 identically.
 * The fix is to poll /v1/me/player/devices until the id appears, and only
 * then expose deviceId to the UI. These tests lock in that contract.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchSpotifyDevices,
  waitForDeviceRegistration,
  DEVICE_REGISTRATION_POLL_DELAYS_MS,
} from '@/utils/spotifyAuth';

const DEVICES_URL = 'https://api.spotify.com/v1/me/player/devices';

const okJson = (body: unknown) =>
  ({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  }) as unknown as Response;

const failStatus = (status: number) =>
  ({
    ok: false,
    status,
    json: () => Promise.resolve({}),
  }) as unknown as Response;

describe('fetchSpotifyDevices', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('GETs the devices endpoint with a bearer token and returns the parsed list', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      okJson({
        devices: [
          { id: 'dev-1', name: 'SpartBoard' },
          { id: 'dev-2', name: 'Phone' },
        ],
      })
    );

    const devices = await fetchSpotifyDevices('tok');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(DEVICES_URL);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init?.headers).toEqual({ Authorization: 'Bearer tok' });
    expect(devices).toEqual([
      { id: 'dev-1', name: 'SpartBoard' },
      { id: 'dev-2', name: 'Phone' },
    ]);
  });

  it('returns an empty list when the body has no devices field', async () => {
    vi.mocked(fetch).mockResolvedValue(okJson({}));
    await expect(fetchSpotifyDevices('tok')).resolves.toEqual([]);
  });

  it('returns an empty list on a non-2xx response (transient errors are caller-retry territory)', async () => {
    vi.mocked(fetch).mockResolvedValue(failStatus(500));
    // The waitForDeviceRegistration loop is what retries — fetchSpotifyDevices
    // itself just reports "no devices visible right now."
    await expect(fetchSpotifyDevices('tok')).resolves.toEqual([]);
  });

  it('returns an empty list when fetch itself rejects (offline / DNS / CORS)', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    // Without this resilience the polling loop's await throws and the
    // hook's .then() chain rejects unhandled — leaving deviceId null AND
    // sdkFailed false. Resolving to [] keeps the loop polling.
    await expect(fetchSpotifyDevices('tok')).resolves.toEqual([]);
  });

  it('returns an empty list when Spotify serves a 200 with a non-JSON body', async () => {
    // Captive portals and CDN error pages routinely serve HTML with 200 OK.
    // Pre-fix this would reject with SyntaxError and bubble through
    // waitForDeviceRegistration as an unhandled rejection.
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected token <')),
    } as unknown as Response);
    await expect(fetchSpotifyDevices('tok')).resolves.toEqual([]);
  });
});

describe('waitForDeviceRegistration', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const tokenProvider = (token: string | null) =>
    vi.fn<() => Promise<string | null>>().mockResolvedValue(token);

  it('resolves true on the first attempt when the device is already registered', async () => {
    vi.mocked(fetch).mockResolvedValue(
      okJson({ devices: [{ id: 'dev-1', name: 'SpartBoard' }] })
    );

    const registered = await waitForDeviceRegistration(
      tokenProvider('tok'),
      'dev-1',
      () => false
    );

    expect(registered).toBe(true);
  });

  it('keeps polling until the device shows up, then resolves true', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch)
      .mockResolvedValueOnce(okJson({ devices: [] }))
      .mockResolvedValueOnce(okJson({ devices: [{ id: 'other', name: 'x' }] }))
      .mockResolvedValueOnce(
        okJson({ devices: [{ id: 'dev-1', name: 'SpartBoard' }] })
      );

    const promise = waitForDeviceRegistration(
      tokenProvider('tok'),
      'dev-1',
      () => false
    );
    // Advance past enough of the backoff schedule for three attempts.
    await vi.advanceTimersByTimeAsync(DEVICE_REGISTRATION_POLL_DELAYS_MS[1]);
    await vi.advanceTimersByTimeAsync(DEVICE_REGISTRATION_POLL_DELAYS_MS[2]);
    await expect(promise).resolves.toBe(true);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
  });

  it('resolves false when the device never appears within the backoff schedule', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValue(okJson({ devices: [] }));

    const promise = waitForDeviceRegistration(
      tokenProvider('tok'),
      'dev-1',
      () => false
    );
    // Run through the full delay budget.
    const total = DEVICE_REGISTRATION_POLL_DELAYS_MS.reduce(
      (sum, d) => sum + d,
      0
    );
    await vi.advanceTimersByTimeAsync(total + 100);
    await expect(promise).resolves.toBe(false);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(
      DEVICE_REGISTRATION_POLL_DELAYS_MS.length
    );
  });

  it('bails out early when isCancelled flips true (hook teardown)', async () => {
    vi.useFakeTimers();
    let cancelled = false;
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(okJson({ devices: [] }));

    const promise = waitForDeviceRegistration(
      tokenProvider('tok'),
      'dev-1',
      () => cancelled
    );
    cancelled = true;
    // Even before any await microtasks settle, the first cancel check after
    // the no-op initial delay must abort. Verify both the resolved value AND
    // that fetch was never reached — without the latter, a future change to
    // DEVICE_REGISTRATION_POLL_DELAYS_MS[0] (from 0 to e.g. 100ms) could let
    // this test pass via setTimeout yielding alone, hiding a regression in
    // pre-first-iteration cancellation.
    await vi.advanceTimersByTimeAsync(0);
    await expect(promise).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips fetching when the token provider returns null but keeps polling', async () => {
    vi.useFakeTimers();
    // First attempt: no token → no fetch. Second attempt: token + device.
    const getToken = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('tok');
    vi.mocked(fetch).mockResolvedValue(
      okJson({ devices: [{ id: 'dev-1', name: 'SpartBoard' }] })
    );

    const promise = waitForDeviceRegistration(getToken, 'dev-1', () => false);
    await vi.advanceTimersByTimeAsync(DEVICE_REGISTRATION_POLL_DELAYS_MS[1]);
    await expect(promise).resolves.toBe(true);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(getToken).toHaveBeenCalledTimes(2);
  });
});
