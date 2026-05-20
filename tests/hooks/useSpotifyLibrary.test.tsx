/**
 * useSpotifyLibrary cache + refresh behavior. The cache is module-level
 * (intentional — multiple Music widgets on one dashboard share one fetch),
 * so we reset it between tests via the exported __resetCacheForTests helper.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import {
  useSpotifyLibrary,
  __resetCacheForTests,
} from '@/hooks/useSpotifyLibrary';

const mockGetAccessToken = vi.fn();
vi.mock('@/hooks/useSpotifyAuth', () => ({
  useSpotifyAuth: () => ({
    getAccessToken: mockGetAccessToken,
    isConnected: true,
  }),
}));

const mockFetchPlaylists = vi.fn();
const mockFetchRecents = vi.fn();
vi.mock('@/utils/spotifyAuth', async () => {
  const actual = await vi.importActual<typeof import('@/utils/spotifyAuth')>(
    '@/utils/spotifyAuth'
  );
  return {
    ...actual,
    fetchUserPlaylists: (_token: string) =>
      mockFetchPlaylists(_token) as ReturnType<
        typeof actual.fetchUserPlaylists
      >,
    fetchRecentlyPlayed: (_token: string) =>
      mockFetchRecents(_token) as ReturnType<typeof actual.fetchRecentlyPlayed>,
  };
});

describe('useSpotifyLibrary', () => {
  beforeEach(() => {
    __resetCacheForTests();
    mockGetAccessToken.mockResolvedValue('tok');
    mockFetchPlaylists.mockResolvedValue([
      { id: 'pl1', name: 'M', uri: 'u', owner: 'o' },
    ]);
    mockFetchRecents.mockResolvedValue([
      { id: 't1', name: 'T', uri: 'u', artist: 'a' },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fetches playlists and recents in parallel on first mount', async () => {
    const { result } = renderHook(() => useSpotifyLibrary());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.playlists).toHaveLength(1);
    expect(result.current.recents).toHaveLength(1);
    expect(mockFetchPlaylists).toHaveBeenCalledTimes(1);
    expect(mockFetchRecents).toHaveBeenCalledTimes(1);
  });

  it('cache hit returns data immediately without re-fetching', async () => {
    const first = renderHook(() => useSpotifyLibrary());
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));

    mockFetchPlaylists.mockClear();
    mockFetchRecents.mockClear();

    const second = renderHook(() => useSpotifyLibrary());

    expect(second.result.current.isLoading).toBe(false);
    expect(second.result.current.playlists).toHaveLength(1);
    expect(mockFetchPlaylists).not.toHaveBeenCalled();
    expect(mockFetchRecents).not.toHaveBeenCalled();
  });

  it('refresh() invalidates the cache and refetches', async () => {
    const { result } = renderHook(() => useSpotifyLibrary());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockFetchPlaylists.mockClear();
    mockFetchRecents.mockClear();

    act(() => result.current.refresh());

    await waitFor(() => {
      expect(mockFetchPlaylists).toHaveBeenCalledTimes(1);
      expect(mockFetchRecents).toHaveBeenCalledTimes(1);
    });
  });

  it('captures SpotifyScopeError as error.kind === "scope"', async () => {
    const { SpotifyScopeError } = await import('@/utils/spotifyAuth');
    mockFetchPlaylists.mockRejectedValueOnce(
      new SpotifyScopeError('insufficient scope')
    );

    const { result } = renderHook(() => useSpotifyLibrary());

    await waitFor(() => {
      expect(result.current.error).toEqual({ kind: 'scope' });
    });
  });

  it('captures generic errors as error.kind === "generic"', async () => {
    mockFetchPlaylists.mockRejectedValueOnce(new Error('500'));

    const { result } = renderHook(() => useSpotifyLibrary());

    await waitFor(() => {
      expect(result.current.error).toEqual({ kind: 'generic', message: '500' });
    });
  });

  it('refetches after TTL expiry (cache-reset proxy)', async () => {
    // First mount — populates the cache.
    const first = renderHook(() => useSpotifyLibrary());
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    expect(mockFetchPlaylists).toHaveBeenCalledTimes(1);

    first.unmount();
    mockFetchPlaylists.mockClear();
    mockFetchRecents.mockClear();

    // Simulate TTL expiry by resetting the module-level cache.
    __resetCacheForTests();

    // Re-mount the hook — cache miss should trigger a new fetch.
    const second = renderHook(() => useSpotifyLibrary());

    expect(second.result.current.isLoading).toBe(true);

    await waitFor(() => expect(second.result.current.isLoading).toBe(false));

    expect(mockFetchPlaylists).toHaveBeenCalledTimes(1);
    expect(mockFetchRecents).toHaveBeenCalledTimes(1);
    expect(second.result.current.playlists).toHaveLength(1);
  });
});
