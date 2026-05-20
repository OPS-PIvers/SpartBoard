import React, { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { searchSpotify, SpotifySearchResult } from '@/utils/spotifyAuth';
import { useSpotifyAuth } from '@/hooks/useSpotifyAuth';
import { useSpotifyLibrary } from '@/hooks/useSpotifyLibrary';
import { SpotifyResultRow } from './SpotifyResultRow';
import type { SpotifyPlayablePick } from './PersonalSpotifyLibraryTab';

interface Props {
  currentUri: string | null;
  onPlay: (pick: SpotifyPlayablePick) => void;
}

const DEBOUNCE_MS = 300;

export const PersonalSpotifySearchTab: React.FC<Props> = ({
  currentUri,
  onPlay,
}) => {
  const { getAccessToken } = useSpotifyAuth();
  const { recents } = useSpotifyLibrary();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SpotifySearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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

  const handlePlay = (r: SpotifySearchResult) => {
    if (r.type !== 'track' && r.type !== 'album' && r.type !== 'playlist')
      return;
    onPlay({ type: r.type, uri: r.uri });
  };

  return (
    <div className="flex flex-col h-full">
      <div
        className="relative"
        style={{ padding: 'min(12px, 3cqmin) min(12px, 3cqmin) 0' }}
      >
        <Search
          className="absolute text-slate-500 pointer-events-none"
          style={{
            left: 'min(24px, 6cqmin)',
            top: '50%',
            transform: 'translateY(-10%)',
            width: 'min(18px, 4.5cqmin)',
            height: 'min(18px, 4.5cqmin)',
          }}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Spotify…"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/70"
          style={{
            paddingLeft: 'min(40px, 10cqmin)',
            paddingRight: 'min(12px, 3cqmin)',
            paddingTop: 'min(10px, 2.5cqmin)',
            paddingBottom: 'min(10px, 2.5cqmin)',
            fontSize: 'min(16px, 5cqmin)',
          }}
        />
      </div>

      <div
        className="flex-1 overflow-y-auto"
        style={{
          marginTop: 'min(8px, 2cqmin)',
          paddingBottom: 'min(12px, 3cqmin)',
        }}
      >
        {searchError && (
          <div
            className="text-red-400"
            style={{
              padding: 'min(12px, 3cqmin) min(16px, 4cqmin)',
              fontSize: 'min(15px, 4.5cqmin)',
            }}
          >
            {searchError}
          </div>
        )}
        {!query.trim() && (
          <>
            <div
              className="text-slate-400 text-center"
              style={{
                padding: 'min(16px, 4cqmin) min(16px, 4cqmin)',
                fontSize: 'min(16px, 5cqmin)',
              }}
            >
              Type to search Spotify
            </div>
            {recents.length > 0 && (
              <>
                <div
                  className="text-slate-500 uppercase tracking-wider font-semibold"
                  style={{
                    padding: '0 min(12px, 3cqmin)',
                    fontSize: 'min(13px, 4cqmin)',
                    letterSpacing: '0.05em',
                    marginBottom: 'min(6px, 1.5cqmin)',
                  }}
                >
                  Recently played
                </div>
                {recents.map((t) => (
                  <SpotifyResultRow
                    key={t.id}
                    name={t.name}
                    subtitle={t.artist}
                    imageUrl={t.imageUrl}
                    isPlaying={t.uri === currentUri}
                    onClick={() => onPlay({ type: 'track', uri: t.uri })}
                  />
                ))}
              </>
            )}
          </>
        )}
        {!isSearching &&
          query.trim() &&
          !searchError &&
          results.map((r) => (
            <SpotifyResultRow
              key={r.id}
              name={r.name}
              subtitle={r.subtitle}
              imageUrl={r.imageUrl}
              isPlaying={r.uri === currentUri}
              onClick={() => handlePlay(r)}
            />
          ))}
      </div>
    </div>
  );
};
