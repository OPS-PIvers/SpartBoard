import { useCallback, useEffect, useState } from 'react';
import { useSpotifyAuth } from '@/hooks/useSpotifyAuth';
import {
  fetchRecentlyPlayed,
  fetchUserPlaylists,
  SpotifyPlaylist,
  SpotifyScopeError,
  SpotifyTrack,
} from '@/utils/spotifyAuth';

const TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  playlists: SpotifyPlaylist[];
  recents: SpotifyTrack[];
  fetchedAt: number;
}

let cache: CacheEntry | null = null;
let inflight: Promise<CacheEntry> | null = null;
const subscribers = new Set<() => void>();

function notifySubscribers() {
  subscribers.forEach((fn) => fn());
}

/** Test-only helper. Do not call in production code. */
export function __resetCacheForTests() {
  cache = null;
  inflight = null;
  subscribers.clear();
}

/** Map a thrown fetch error to the hook's public error shape. */
function toLibraryError(err: unknown): SpotifyLibraryError {
  if (err instanceof SpotifyScopeError) return { kind: 'scope' };
  return {
    kind: 'generic',
    message: err instanceof Error ? err.message : 'Unknown error',
  };
}

export type SpotifyLibraryError =
  | { kind: 'scope' }
  | { kind: 'generic'; message: string };

export interface UseSpotifyLibraryReturn {
  playlists: SpotifyPlaylist[];
  recents: SpotifyTrack[];
  isLoading: boolean;
  error: SpotifyLibraryError | null;
  refresh: () => void;
}

export function useSpotifyLibrary(): UseSpotifyLibraryReturn {
  const { getAccessToken, isConnected } = useSpotifyAuth();
  const hasFresh = cache !== null && Date.now() - cache.fetchedAt < TTL_MS;
  const [isLoading, setIsLoading] = useState(!hasFresh);
  const [, forceTick] = useState(0);
  const [error, setError] = useState<SpotifyLibraryError | null>(null);

  const fresh = hasFresh ? cache : null;

  const load = useCallback(async () => {
    if (!isConnected) return;
    setError(null);
    setIsLoading(true);
    if (inflight) {
      // Piggyback on another mounted instance's in-flight fetch (e.g. two
      // Music-widget sub-components mounting on the same render pass) rather
      // than issuing a duplicate network round trip. This instance did NOT
      // create `inflight`, so it must still settle ITS OWN isLoading/error
      // state when the shared promise resolves — the leader's `finally`
      // block below only resets the leader's own state. Without this
      // try/finally, a follower's `isLoading` would stay `true` forever,
      // even after `fresh` data is available.
      try {
        await inflight;
      } catch (err) {
        setError(toLibraryError(err));
      } finally {
        setIsLoading(false);
      }
      return;
    }
    inflight = (async () => {
      const token = await getAccessToken();
      if (!token) throw new Error('No Spotify access token available');
      const [playlists, recents] = await Promise.all([
        fetchUserPlaylists(token),
        fetchRecentlyPlayed(token),
      ]);
      const entry: CacheEntry = {
        playlists,
        recents,
        fetchedAt: Date.now(),
      };
      cache = entry;
      return entry;
    })();
    try {
      await inflight;
      notifySubscribers();
    } catch (err) {
      setError(toLibraryError(err));
    } finally {
      inflight = null;
      setIsLoading(false);
    }
  }, [getAccessToken, isConnected]);

  useEffect(() => {
    const rerender = () => forceTick((n) => n + 1);
    subscribers.add(rerender);
    if (!fresh) {
      void load();
    }
    return () => {
      subscribers.delete(rerender);
    };
  }, [fresh, load]);

  const refresh = useCallback(() => {
    cache = null;
    void load();
  }, [load]);

  return {
    playlists: fresh?.playlists ?? [],
    recents: fresh?.recents ?? [],
    isLoading,
    error,
    refresh,
  };
}
