/**
 * useSpotifySearch — debounced, abortable Spotify search.
 *
 * Extracted from PersonalSpotifySearchTab so both the Search tab (small/minimal
 * overlay) and the Default layout's expanding search bar share one source of
 * truth for the debounce/abort/error behavior. An empty query resets to no
 * results (the caller decides what to show instead, e.g. recents).
 */

import { useEffect, useState } from 'react';
import { searchSpotify, SpotifySearchResult } from '@/utils/spotifyAuth';
import { useSpotifyAuth } from '@/hooks/useSpotifyAuth';

const DEBOUNCE_MS = 300;

export interface UseSpotifySearchReturn {
  results: SpotifySearchResult[];
  isSearching: boolean;
  searchError: string | null;
}

export function useSpotifySearch(query: string): UseSpotifySearchReturn {
  const { getAccessToken } = useSpotifyAuth();
  const [results, setResults] = useState<SpotifySearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setSearchError(null);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    setSearchError(null);
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const token = await getAccessToken();
        if (cancelled) return;
        if (!token) {
          setSearchError('Spotify session expired — reconnect.');
          setResults([]);
          return;
        }
        const out = await searchSpotify(token, trimmed, controller.signal);
        if (cancelled) return;
        setResults(out);
      } catch (err) {
        if (cancelled) return;
        if ((err as { name?: string }).name === 'AbortError') return;
        setSearchError(err instanceof Error ? err.message : 'Search failed.');
        setResults([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, getAccessToken]);

  return { results, isSearching, searchError };
}
