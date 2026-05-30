/**
 * useSpotifyWebPlayback — owns the Web Playback SDK connection.
 *
 * loadSpotifySdk is mocked: instead of injecting the real CDN script it
 * invokes the onReady callback synchronously with a fake window.Spotify.Player
 * we control, so we can assert event-handler wiring (ready → deviceId,
 * player_state_changed → currentTrack/isPlaying, account_error → sdkFailed)
 * without a browser.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSpotifyWebPlayback } from '@/hooks/useSpotifyWebPlayback';
import type { SpotifyPlayerState } from '@/utils/spotifyPlaybackSdk';

// ── loadSpotifySdk mock ───────────────────────────────────────────────────────
const loadSpotifySdkMock = vi.fn();
vi.mock('@/utils/spotifyPlaybackSdk', async () => {
  const actual = await vi.importActual<
    typeof import('@/utils/spotifyPlaybackSdk')
  >('@/utils/spotifyPlaybackSdk');
  return {
    ...actual,
    loadSpotifySdk: (onReady: () => void, onError?: (e: Error) => void) =>
      loadSpotifySdkMock(onReady, onError) as void,
  };
});

// ── spotifyAuth mock ──────────────────────────────────────────────────────────
// The hook now starts the saved URI on first play via playOnDevice; keep the
// real parseSpotifyResource (so payload selection is exercised) and stub the
// network calls. waitForDeviceRegistration is also stubbed because the real
// implementation polls /v1/me/player/devices over real timers — every test
// that emits 'ready' would otherwise hit real fetch.
const playOnDeviceMock = vi.fn().mockResolvedValue(undefined);
const setRepeatModeMock = vi.fn().mockResolvedValue(undefined);
const setShuffleMock = vi.fn().mockResolvedValue(undefined);
const waitForDeviceRegistrationMock = vi.fn().mockResolvedValue(true);
vi.mock('@/utils/spotifyAuth', async () => {
  const actual = await vi.importActual<typeof import('@/utils/spotifyAuth')>(
    '@/utils/spotifyAuth'
  );
  return {
    ...actual,
    playOnDevice: (...args: unknown[]): Promise<void> =>
      playOnDeviceMock(...args) as Promise<void>,
    setRepeatMode: (...args: unknown[]): Promise<void> =>
      setRepeatModeMock(...args) as Promise<void>,
    setShuffle: (...args: unknown[]): Promise<void> =>
      setShuffleMock(...args) as Promise<void>,
    waitForDeviceRegistration: (...args: unknown[]): Promise<boolean> =>
      waitForDeviceRegistrationMock(...args) as Promise<boolean>,
  };
});

// ── Fake Spotify.Player ───────────────────────────────────────────────────────
type Listener = (payload: unknown) => void;

class FakePlayer {
  listeners = new Map<string, Listener>();
  connect = vi.fn().mockResolvedValue(true);
  disconnect = vi.fn();
  togglePlay = vi.fn().mockResolvedValue(undefined);
  nextTrack = vi.fn().mockResolvedValue(undefined);
  previousTrack = vi.fn().mockResolvedValue(undefined);
  addListener = vi.fn((event: string, cb: Listener) => {
    this.listeners.set(event, cb);
  });
  emit(event: string, payload?: unknown) {
    this.listeners.get(event)?.(payload);
  }
}

let fakePlayer: FakePlayer;

function installFakeSdk() {
  fakePlayer = new FakePlayer();
  // The hook does `new window.Spotify.Player(...)`, so Player must be a real
  // constructor. Return the shared fakePlayer instance from the constructor
  // so the test can drive its listeners.
  function PlayerCtor(this: unknown) {
    return fakePlayer as unknown as object;
  }
  (window as unknown as { Spotify: unknown }).Spotify = {
    Player: PlayerCtor as unknown,
  };
  // loadSpotifySdk invokes onReady immediately with the fake SDK present.
  loadSpotifySdkMock.mockImplementation((onReady: () => void) => {
    void onReady();
  });
}

const getToken = vi.fn().mockResolvedValue('tok');

beforeEach(() => {
  loadSpotifySdkMock.mockReset();
  getToken.mockClear();
  playOnDeviceMock.mockClear();
  setRepeatModeMock.mockClear();
  setShuffleMock.mockClear();
  // mockReset (not mockClear) is required here because individual tests
  // override with mockImplementation/mockRejectedValue/mockResolvedValue(false).
  // Without resetting, the override would leak into the next test. The
  // mockResolvedValue(true) re-establishes the happy-path default.
  waitForDeviceRegistrationMock.mockReset();
  waitForDeviceRegistrationMock.mockResolvedValue(true);
});

afterEach(() => {
  delete (window as unknown as { Spotify?: unknown }).Spotify;
});

describe('useSpotifyWebPlayback', () => {
  it('is inert when enabled=false (no SDK load, deviceId null, sdkFailed false)', () => {
    const { result } = renderHook(() =>
      useSpotifyWebPlayback(false, getToken, null)
    );
    expect(loadSpotifySdkMock).not.toHaveBeenCalled();
    expect(result.current.deviceId).toBeNull();
    expect(result.current.isReady).toBe(false);
    expect(result.current.sdkFailed).toBe(false);
    expect(result.current.currentTrack).toBeNull();
    expect(result.current.isPlaying).toBe(false);
  });

  it('loads the SDK and sets deviceId once Spotify Connect registers it', async () => {
    installFakeSdk();
    const { result } = renderHook(() =>
      useSpotifyWebPlayback(true, getToken, null)
    );

    expect(loadSpotifySdkMock).toHaveBeenCalled();
    // connect() resolves async; wait for the player to be wired up.
    await waitFor(() => expect(fakePlayer.connect).toHaveBeenCalled());

    act(() => {
      fakePlayer.emit('ready', { device_id: 'device-123' });
    });
    // waitForDeviceRegistration is mocked to resolve(true) — the .then()
    // callback still has to flush before deviceId is exposed.
    await waitFor(() => expect(result.current.deviceId).toBe('device-123'));
    expect(result.current.isReady).toBe(true);
    expect(waitForDeviceRegistrationMock).toHaveBeenCalledWith(
      expect.any(Function),
      'device-123',
      expect.any(Function)
    );
  });

  it('falls back to sdkFailed AND disconnects the orphan player when device registration times out', async () => {
    installFakeSdk();
    waitForDeviceRegistrationMock.mockResolvedValue(false);
    const { result } = renderHook(() =>
      useSpotifyWebPlayback(true, getToken, null)
    );
    await waitFor(() => expect(fakePlayer.connect).toHaveBeenCalled());

    act(() => {
      fakePlayer.emit('ready', { device_id: 'device-zzz' });
    });
    // Registration never confirmed → caller is told the SDK is unusable so it
    // can swap in the embed iframe instead of leaving play permanently broken.
    await waitFor(() => expect(result.current.sdkFailed).toBe(true));
    expect(result.current.deviceId).toBeNull();
    // Crucially, the orphan SDK player must be disconnected too — otherwise
    // it keeps a Spotify Connect device slot and can steal playback from
    // the embed-iframe fallback when it eventually registers late.
    expect(fakePlayer.disconnect).toHaveBeenCalled();
  });

  it('falls back to sdkFailed when waitForDeviceRegistration itself rejects', async () => {
    installFakeSdk();
    waitForDeviceRegistrationMock.mockRejectedValue(
      new Error('unexpected fetch rejection')
    );
    const { result } = renderHook(() =>
      useSpotifyWebPlayback(true, getToken, null)
    );
    await waitFor(() => expect(fakePlayer.connect).toHaveBeenCalled());

    act(() => {
      fakePlayer.emit('ready', { device_id: 'device-err' });
    });
    // Belt-and-suspenders .catch must engage so the hook doesn't end up
    // with deviceId=null AND sdkFailed=false (the silent-broken state).
    await waitFor(() => expect(result.current.sdkFailed).toBe(true));
    expect(result.current.deviceId).toBeNull();
  });

  it("cancels an in-flight registration poll when 'not_ready' fires before it resolves", async () => {
    installFakeSdk();
    // Hold the registration mock open so we can race not_ready against its
    // resolution.
    let resolveRegistration: ((v: boolean) => void) | null = null;
    waitForDeviceRegistrationMock.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveRegistration = resolve;
        })
    );
    const { result } = renderHook(() =>
      useSpotifyWebPlayback(true, getToken, null)
    );
    await waitFor(() => expect(fakePlayer.connect).toHaveBeenCalled());

    act(() => {
      fakePlayer.emit('ready', { device_id: 'device-A' });
    });
    // Simulate the SDK losing the device mid-poll.
    act(() => {
      fakePlayer.emit('not_ready', { device_id: 'device-A' });
    });
    // Now the racing poll finally resolves "registered". The bumped poll
    // generation must make the .then() callback bail — otherwise it would
    // resurrect device-A over the now-correct null state.
    act(() => {
      resolveRegistration?.(true);
    });
    await Promise.resolve();
    expect(result.current.deviceId).toBeNull();
    expect(result.current.sdkFailed).toBe(false);
  });

  it("cancels an in-flight registration poll when a second 'ready' fires for a new device", async () => {
    installFakeSdk();
    const resolvers: Array<(v: boolean) => void> = [];
    waitForDeviceRegistrationMock.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolvers.push(resolve);
        })
    );
    const { result } = renderHook(() =>
      useSpotifyWebPlayback(true, getToken, null)
    );
    await waitFor(() => expect(fakePlayer.connect).toHaveBeenCalled());

    // Two ready emissions: SDK reconnected with a new device_id.
    act(() => {
      fakePlayer.emit('ready', { device_id: 'device-A' });
      fakePlayer.emit('ready', { device_id: 'device-B' });
    });
    // Poll-B resolves first with true — UI should show device-B.
    act(() => {
      resolvers[1]?.(true);
    });
    await waitFor(() => expect(result.current.deviceId).toBe('device-B'));
    // Now poll-A (stale) finally resolves true. The generation bump from
    // the second 'ready' must make it bail; otherwise the dead device-A
    // would overwrite device-B and subsequent /play calls would 404.
    act(() => {
      resolvers[0]?.(true);
    });
    await Promise.resolve();
    expect(result.current.deviceId).toBe('device-B');
  });

  it('updates currentTrack and isPlaying on player_state_changed', async () => {
    installFakeSdk();
    const { result } = renderHook(() =>
      useSpotifyWebPlayback(true, getToken, null)
    );
    await waitFor(() => expect(fakePlayer.connect).toHaveBeenCalled());

    const state: SpotifyPlayerState = {
      paused: false,
      track_window: {
        current_track: {
          name: 'Song A',
          uri: 'spotify:track:a',
          artists: [{ name: 'Artist A' }, { name: 'Artist B' }],
          album: { images: [{ url: 'http://img/a.png' }] },
        },
      },
    };
    act(() => {
      fakePlayer.emit('player_state_changed', state);
    });

    expect(result.current.isPlaying).toBe(true);
    expect(result.current.currentTrack).toEqual({
      name: 'Song A',
      artist: 'Artist A, Artist B',
      image: 'http://img/a.png',
    });
  });

  it('sets sdkFailed on account_error', async () => {
    installFakeSdk();
    const { result } = renderHook(() =>
      useSpotifyWebPlayback(true, getToken, null)
    );
    await waitFor(() => expect(fakePlayer.connect).toHaveBeenCalled());

    act(() => {
      fakePlayer.emit('account_error', { message: 'Premium required' });
    });
    expect(result.current.sdkFailed).toBe(true);
  });

  it('disconnects the player on unmount', async () => {
    installFakeSdk();
    const { unmount } = renderHook(() =>
      useSpotifyWebPlayback(true, getToken, null)
    );
    await waitFor(() => expect(fakePlayer.connect).toHaveBeenCalled());

    unmount();
    expect(fakePlayer.disconnect).toHaveBeenCalled();
  });

  it('forwards togglePlay to the player when content is already loaded', async () => {
    installFakeSdk();
    const { result } = renderHook(() =>
      useSpotifyWebPlayback(true, getToken, 'spotify:track:loaded')
    );
    await waitFor(() => expect(fakePlayer.connect).toHaveBeenCalled());

    // Device ready AND a track is loaded → togglePlay() should pause/resume,
    // not re-start the saved URI.
    act(() => {
      fakePlayer.emit('ready', { device_id: 'device-123' });
      fakePlayer.emit('player_state_changed', {
        paused: false,
        track_window: {
          current_track: {
            name: 'Loaded',
            uri: 'spotify:track:loaded',
            artists: [{ name: 'A' }],
          },
        },
      });
    });

    await act(async () => {
      await result.current.togglePlay();
    });
    expect(fakePlayer.togglePlay).toHaveBeenCalled();
    expect(playOnDeviceMock).not.toHaveBeenCalled();
  });

  it('starts the saved URI on first play when nothing is loaded', async () => {
    installFakeSdk();
    const { result } = renderHook(() =>
      useSpotifyWebPlayback(true, getToken, 'spotify:track:t1')
    );
    await waitFor(() => expect(fakePlayer.connect).toHaveBeenCalled());

    // Device connected, but no player_state_changed yet → currentTrack stays
    // null. First togglePlay() must start the target URI on the device.
    act(() => {
      fakePlayer.emit('ready', { device_id: 'device-123' });
    });
    await waitFor(() => expect(result.current.deviceId).toBe('device-123'));
    expect(result.current.currentTrack).toBeNull();

    await act(async () => {
      await result.current.togglePlay();
    });

    expect(playOnDeviceMock).toHaveBeenCalledWith('tok', 'device-123', {
      uris: ['spotify:track:t1'],
    });
    expect(fakePlayer.togglePlay).not.toHaveBeenCalled();
  });

  it('uses contextUri for a playlist target on first play', async () => {
    installFakeSdk();
    const { result } = renderHook(() =>
      useSpotifyWebPlayback(true, getToken, 'spotify:playlist:p1')
    );
    await waitFor(() => expect(fakePlayer.connect).toHaveBeenCalled());
    act(() => {
      fakePlayer.emit('ready', { device_id: 'device-123' });
    });
    await waitFor(() => expect(result.current.deviceId).toBe('device-123'));

    await act(async () => {
      await result.current.togglePlay();
    });

    expect(playOnDeviceMock).toHaveBeenCalledWith('tok', 'device-123', {
      contextUri: 'spotify:playlist:p1',
    });
  });

  it('next() calls the player nextTrack', async () => {
    installFakeSdk();
    const { result } = renderHook(() =>
      useSpotifyWebPlayback(true, getToken, null)
    );
    await waitFor(() => expect(fakePlayer.connect).toHaveBeenCalled());

    await act(async () => {
      await result.current.next();
    });
    expect(fakePlayer.nextTrack).toHaveBeenCalledTimes(1);
  });

  it('previous() calls the player previousTrack', async () => {
    installFakeSdk();
    const { result } = renderHook(() =>
      useSpotifyWebPlayback(true, getToken, null)
    );
    await waitFor(() => expect(fakePlayer.connect).toHaveBeenCalled());

    await act(async () => {
      await result.current.previous();
    });
    expect(fakePlayer.previousTrack).toHaveBeenCalledTimes(1);
  });

  it('next()/previous() are no-ops when there is no player (disabled)', async () => {
    const { result } = renderHook(() =>
      useSpotifyWebPlayback(false, getToken, null)
    );
    // No player ever connected → calling these must not throw.
    await act(async () => {
      await result.current.next();
      await result.current.previous();
    });
    expect(result.current.deviceId).toBeNull();
  });

  it('does NOT set sdkFailed on playback_error (transient)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    installFakeSdk();
    const { result } = renderHook(() =>
      useSpotifyWebPlayback(true, getToken, null)
    );
    await waitFor(() => expect(fakePlayer.connect).toHaveBeenCalled());

    act(() => {
      fakePlayer.emit('playback_error', { message: 'blip' });
    });
    expect(result.current.sdkFailed).toBe(false);
    warn.mockRestore();
  });

  it('reflects repeat_mode and shuffle from player_state_changed', async () => {
    installFakeSdk();
    const { result } = renderHook(() =>
      useSpotifyWebPlayback(true, getToken, null)
    );
    await waitFor(() => expect(fakePlayer.connect).toHaveBeenCalled());

    expect(result.current.repeatMode).toBe(0);
    expect(result.current.shuffle).toBe(false);

    act(() => {
      fakePlayer.emit('player_state_changed', {
        paused: false,
        repeat_mode: 2,
        shuffle: true,
        track_window: {
          current_track: {
            name: 'S',
            uri: 'spotify:track:s',
            artists: [{ name: 'A' }],
          },
        },
      });
    });

    expect(result.current.repeatMode).toBe(2);
    expect(result.current.shuffle).toBe(true);
  });

  it('cycleRepeat cycles off → track → context → off via setRepeatMode', async () => {
    installFakeSdk();
    const { result } = renderHook(() =>
      useSpotifyWebPlayback(true, getToken, null)
    );
    await waitFor(() => expect(fakePlayer.connect).toHaveBeenCalled());
    act(() => {
      fakePlayer.emit('ready', { device_id: 'device-123' });
    });
    await waitFor(() => expect(result.current.deviceId).toBe('device-123'));

    // Starts at off(0) → first cycle should request 'track'.
    await act(async () => {
      await result.current.cycleRepeat();
    });
    expect(setRepeatModeMock).toHaveBeenLastCalledWith(
      'tok',
      'device-123',
      'track'
    );

    // SDK reports the new mode (2 = track) → next cycle requests 'context'.
    act(() => {
      fakePlayer.emit('player_state_changed', {
        paused: false,
        repeat_mode: 2,
        shuffle: false,
      });
    });
    await act(async () => {
      await result.current.cycleRepeat();
    });
    expect(setRepeatModeMock).toHaveBeenLastCalledWith(
      'tok',
      'device-123',
      'context'
    );

    // SDK reports context (1) → next cycle requests 'off'.
    act(() => {
      fakePlayer.emit('player_state_changed', {
        paused: false,
        repeat_mode: 1,
        shuffle: false,
      });
    });
    await act(async () => {
      await result.current.cycleRepeat();
    });
    expect(setRepeatModeMock).toHaveBeenLastCalledWith(
      'tok',
      'device-123',
      'off'
    );
  });

  it('toggleShuffle calls setShuffle with the inverse of the current state', async () => {
    installFakeSdk();
    const { result } = renderHook(() =>
      useSpotifyWebPlayback(true, getToken, null)
    );
    await waitFor(() => expect(fakePlayer.connect).toHaveBeenCalled());
    act(() => {
      fakePlayer.emit('ready', { device_id: 'device-123' });
    });
    await waitFor(() => expect(result.current.deviceId).toBe('device-123'));

    // Default shuffle off → toggle requests true.
    await act(async () => {
      await result.current.toggleShuffle();
    });
    expect(setShuffleMock).toHaveBeenLastCalledWith('tok', 'device-123', true);

    // SDK reports shuffle on → toggle requests false.
    act(() => {
      fakePlayer.emit('player_state_changed', {
        paused: false,
        repeat_mode: 0,
        shuffle: true,
      });
    });
    await act(async () => {
      await result.current.toggleShuffle();
    });
    expect(setShuffleMock).toHaveBeenLastCalledWith('tok', 'device-123', false);
  });

  it('cycleRepeat/toggleShuffle are no-ops without a device', async () => {
    installFakeSdk();
    const { result } = renderHook(() =>
      useSpotifyWebPlayback(true, getToken, null)
    );
    await waitFor(() => expect(fakePlayer.connect).toHaveBeenCalled());
    // No 'ready' event → deviceIdRef stays null.
    await act(async () => {
      await result.current.cycleRepeat();
      await result.current.toggleShuffle();
    });
    expect(setRepeatModeMock).not.toHaveBeenCalled();
    expect(setShuffleMock).not.toHaveBeenCalled();
  });

  it('resets sdkFailed when re-enabled after a prior failure', async () => {
    installFakeSdk();
    const { result, rerender } = renderHook(
      ({ enabled }) => useSpotifyWebPlayback(enabled, getToken, null),
      { initialProps: { enabled: true } }
    );
    await waitFor(() => expect(fakePlayer.connect).toHaveBeenCalled());

    // Fatal error → sdkFailed flips true.
    act(() => {
      fakePlayer.emit('account_error', { message: 'Premium required' });
    });
    expect(result.current.sdkFailed).toBe(true);

    // Disable, then re-enable → init effect must clear the stale failure.
    rerender({ enabled: false });
    expect(result.current.sdkFailed).toBe(true);
    rerender({ enabled: true });
    expect(result.current.sdkFailed).toBe(false);
  });
});
