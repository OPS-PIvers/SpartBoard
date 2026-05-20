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

// ── Fake Spotify.Player ───────────────────────────────────────────────────────
type Listener = (payload: unknown) => void;

class FakePlayer {
  listeners = new Map<string, Listener>();
  connect = vi.fn().mockResolvedValue(true);
  disconnect = vi.fn();
  togglePlay = vi.fn().mockResolvedValue(undefined);
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
});

afterEach(() => {
  delete (window as unknown as { Spotify?: unknown }).Spotify;
});

describe('useSpotifyWebPlayback', () => {
  it('is inert when enabled=false (no SDK load, deviceId null, sdkFailed false)', () => {
    const { result } = renderHook(() => useSpotifyWebPlayback(false, getToken));
    expect(loadSpotifySdkMock).not.toHaveBeenCalled();
    expect(result.current.deviceId).toBeNull();
    expect(result.current.isReady).toBe(false);
    expect(result.current.sdkFailed).toBe(false);
    expect(result.current.currentTrack).toBeNull();
    expect(result.current.isPlaying).toBe(false);
  });

  it('loads the SDK and sets deviceId when the ready event fires', async () => {
    installFakeSdk();
    const { result } = renderHook(() => useSpotifyWebPlayback(true, getToken));

    expect(loadSpotifySdkMock).toHaveBeenCalled();
    // connect() resolves async; wait for the player to be wired up.
    await waitFor(() => expect(fakePlayer.connect).toHaveBeenCalled());

    act(() => {
      fakePlayer.emit('ready', { device_id: 'device-123' });
    });
    expect(result.current.deviceId).toBe('device-123');
    expect(result.current.isReady).toBe(true);
  });

  it('updates currentTrack and isPlaying on player_state_changed', async () => {
    installFakeSdk();
    const { result } = renderHook(() => useSpotifyWebPlayback(true, getToken));
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
    const { result } = renderHook(() => useSpotifyWebPlayback(true, getToken));
    await waitFor(() => expect(fakePlayer.connect).toHaveBeenCalled());

    act(() => {
      fakePlayer.emit('account_error', { message: 'Premium required' });
    });
    expect(result.current.sdkFailed).toBe(true);
  });

  it('disconnects the player on unmount', async () => {
    installFakeSdk();
    const { unmount } = renderHook(() => useSpotifyWebPlayback(true, getToken));
    await waitFor(() => expect(fakePlayer.connect).toHaveBeenCalled());

    unmount();
    expect(fakePlayer.disconnect).toHaveBeenCalled();
  });

  it('forwards togglePlay to the player', async () => {
    installFakeSdk();
    const { result } = renderHook(() => useSpotifyWebPlayback(true, getToken));
    await waitFor(() => expect(fakePlayer.connect).toHaveBeenCalled());

    await act(async () => {
      await result.current.togglePlay();
    });
    expect(fakePlayer.togglePlay).toHaveBeenCalled();
  });
});
