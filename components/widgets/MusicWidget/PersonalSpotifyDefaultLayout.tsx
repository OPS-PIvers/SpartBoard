/**
 * PersonalSpotifyDefaultLayout — the redesigned Default layout for the
 * personal-Spotify Music widget.
 *
 * Model (driven by the widget's selected/active state, NOT a tab strip):
 *  - At rest (isActive false): show ONLY the player surface
 *    (PersonalSpotifyNowPlayingTab). No tabs, no browse controls.
 *  - Active (isActive true): a tab bar appears above the player —
 *    Songs | Playlists | search-icon — with no tab selected by default
 *    (player still shown). Songs → Recently Played, Playlists → user
 *    playlists, search icon → an expanding search input (X to close) with
 *    recents shown when the query is empty.
 *  - Selecting a track plays it and returns to the player view (tabs stay,
 *    since the widget is still selected). Music never stops on navigation.
 *
 * View + search state lives here; resetting to the player view on
 * (de)activation uses the render-time "adjust state on prop change" pattern,
 * not an effect.
 */

import React, { useState } from 'react';
import { useSpotifyLibrary } from '@/hooks/useSpotifyLibrary';
import { useSpotifySearch } from '@/hooks/useSpotifySearch';
import { SpotifyResultRow } from './SpotifyResultRow';
import {
  PersonalSpotifyNowPlayingTab,
  PersonalSpotifyNowPlayingProps,
} from './PersonalSpotifyNowPlayingTab';
import {
  PersonalSpotifyDefaultTabBar,
  DefaultTabView,
} from './PersonalSpotifyDefaultTabBar';
import {
  SpotifyRowSkeleton,
  SpotifyReconnectBanner,
} from './PersonalSpotifyListState';
import type { SpotifyPlayablePick } from './PersonalSpotifyLibraryTab';

/** Playback props for the player surface (onSwitchToLibrary supplied here). */
export type DefaultLayoutPlaybackProps = Omit<
  PersonalSpotifyNowPlayingProps,
  'onSwitchToLibrary'
>;

interface Props {
  isActive: boolean;
  currentUri: string | null;
  onPlay: (pick: SpotifyPlayablePick) => void;
  onReconnect: () => void;
  playbackProps: DefaultLayoutPlaybackProps;
}

const EmptyHint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="flex flex-col items-center justify-center text-center text-slate-400 h-full"
    style={{ padding: 'min(24px, 6cqmin)', fontSize: 'min(16px, 5cqmin)' }}
  >
    {children}
  </div>
);

export const PersonalSpotifyDefaultLayout: React.FC<Props> = ({
  isActive,
  currentUri,
  onPlay,
  onReconnect,
  playbackProps,
}) => {
  const [activeView, setActiveView] = useState<DefaultTabView>('player');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

  // "Adjust state on prop change" — when the widget becomes active (false→true)
  // reset to the player view with search closed. Done during render (comparing
  // the previous isActive stored in state), NOT via useEffect, to avoid an
  // extra render pass / flash of a stale view.
  const [prevActive, setPrevActive] = useState(isActive);
  if (isActive !== prevActive) {
    setPrevActive(isActive);
    if (isActive) {
      setActiveView('player');
      setSearchOpen(false);
      setQuery('');
    }
  }

  const handleRowPlay = (pick: SpotifyPlayablePick) => {
    onPlay(pick);
    setActiveView('player');
    setSearchOpen(false);
    setQuery('');
  };

  // At rest → only the player. The empty-state "Open library" link routes to
  // Songs even though the tab bar is hidden at rest (it'll be visible once the
  // widget is selected and the user retries).
  const openSongs = () => setActiveView('songs');
  if (!isActive) {
    return (
      <div className="w-full h-full flex flex-col">
        <PersonalSpotifyNowPlayingTab
          {...playbackProps}
          onSwitchToLibrary={openSongs}
        />
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-slate-900/60 backdrop-blur-sm">
      <PersonalSpotifyDefaultTabBar
        activeView={activeView}
        searchOpen={searchOpen}
        query={query}
        onSelectView={setActiveView}
        onToggleSearch={(open) => {
          setSearchOpen(open);
          if (!open) setQuery('');
        }}
        onQueryChange={setQuery}
      />
      {/* flex-1 + min-h-0 lets the content fill the remaining height and scroll
          internally rather than top-clustering. */}
      <div className="flex-1 min-h-0">
        {searchOpen ? (
          <SearchView
            query={query}
            currentUri={currentUri}
            onPlay={handleRowPlay}
          />
        ) : activeView === 'songs' ? (
          <SongsView
            currentUri={currentUri}
            onPlay={handleRowPlay}
            onReconnect={onReconnect}
          />
        ) : activeView === 'playlists' ? (
          <PlaylistsView
            currentUri={currentUri}
            onPlay={handleRowPlay}
            onReconnect={onReconnect}
          />
        ) : (
          <PersonalSpotifyNowPlayingTab
            {...playbackProps}
            onSwitchToLibrary={openSongs}
          />
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Songs (Recently Played)
// ---------------------------------------------------------------------------

const SongsView: React.FC<{
  currentUri: string | null;
  onPlay: (pick: SpotifyPlayablePick) => void;
  onReconnect: () => void;
}> = ({ currentUri, onPlay, onReconnect }) => {
  const { recents, isLoading, error } = useSpotifyLibrary();

  if (error?.kind === 'scope') {
    return <SpotifyReconnectBanner onReconnect={onReconnect} />;
  }
  if (isLoading && recents.length === 0) {
    return (
      <div className="flex flex-col h-full overflow-y-auto">
        <SpotifyRowSkeleton />
        <SpotifyRowSkeleton />
        <SpotifyRowSkeleton />
      </div>
    );
  }
  if (recents.length === 0) {
    return <EmptyHint>No recently played tracks yet.</EmptyHint>;
  }
  return (
    <div
      className="flex flex-col overflow-y-auto h-full"
      style={{ paddingBottom: 'min(12px, 3cqmin)' }}
    >
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
    </div>
  );
};

// ---------------------------------------------------------------------------
// Playlists
// ---------------------------------------------------------------------------

const PlaylistsView: React.FC<{
  currentUri: string | null;
  onPlay: (pick: SpotifyPlayablePick) => void;
  onReconnect: () => void;
}> = ({ currentUri, onPlay, onReconnect }) => {
  const { playlists, isLoading, error } = useSpotifyLibrary();

  if (error?.kind === 'scope') {
    return <SpotifyReconnectBanner onReconnect={onReconnect} />;
  }
  if (isLoading && playlists.length === 0) {
    return (
      <div className="flex flex-col h-full overflow-y-auto">
        <SpotifyRowSkeleton />
        <SpotifyRowSkeleton />
        <SpotifyRowSkeleton />
      </div>
    );
  }
  if (playlists.length === 0) {
    return <EmptyHint>No playlists in your Spotify account yet.</EmptyHint>;
  }
  return (
    <div
      className="flex flex-col overflow-y-auto h-full"
      style={{ paddingBottom: 'min(12px, 3cqmin)' }}
    >
      {playlists.map((p) => (
        <SpotifyResultRow
          key={p.id}
          name={p.name}
          subtitle={`Playlist · ${p.owner}`}
          imageUrl={p.imageUrl}
          isPlaying={p.uri === currentUri}
          onClick={() => onPlay({ type: 'playlist', uri: p.uri })}
        />
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Search results (recents when the query is empty)
// ---------------------------------------------------------------------------

const SearchView: React.FC<{
  query: string;
  currentUri: string | null;
  onPlay: (pick: SpotifyPlayablePick) => void;
}> = ({ query, currentUri, onPlay }) => {
  const { recents } = useSpotifyLibrary();
  const { results, isSearching, searchError } = useSpotifySearch(query);
  const trimmed = query.trim();

  return (
    <div
      className="flex flex-col overflow-y-auto h-full"
      style={{ paddingBottom: 'min(12px, 3cqmin)' }}
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
      {!trimmed && (
        <>
          {recents.length > 0 && (
            <>
              <div
                className="text-slate-500 uppercase tracking-wider font-semibold"
                style={{
                  padding:
                    'min(8px, 2cqmin) min(12px, 3cqmin) min(6px, 1.5cqmin)',
                  fontSize: 'min(13px, 4cqmin)',
                  letterSpacing: '0.05em',
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
          {recents.length === 0 && (
            <EmptyHint>Type to search Spotify.</EmptyHint>
          )}
        </>
      )}
      {!isSearching &&
        trimmed &&
        !searchError &&
        results.map((r) => {
          const t = r.type;
          if (t !== 'track' && t !== 'album' && t !== 'playlist') return null;
          return (
            <SpotifyResultRow
              key={r.id}
              name={r.name}
              subtitle={r.subtitle}
              imageUrl={r.imageUrl}
              isPlaying={r.uri === currentUri}
              onClick={() => onPlay({ type: t, uri: r.uri })}
            />
          );
        })}
    </div>
  );
};
