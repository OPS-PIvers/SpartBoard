/**
 * PersonalSpotifyAdaptiveLayout — the shared layout for ALL THREE personal-
 * Spotify variants (default / minimal / small). Generalizes the old
 * "tabs-on-active" model so every variant behaves consistently; the ONLY
 * per-variant difference is the player surface rendered in the player view
 * (and at rest):
 *   - default → PersonalSpotifyNowPlayingTab (centered card)
 *   - minimal → PersonalSpotifyMinimalView   (full-bleed art)
 *   - small   → PersonalSpotifyCompactBar    (horizontal bar)
 *
 * Model (driven by the widget's selected/active state, NOT a separate tab
 * strip per variant):
 *  - At rest (isActive false): show ONLY the player surface. No tabs.
 *  - Active (isActive true): a tab bar appears — Songs | Playlists | search —
 *    with no tab selected by default (player still shown). Songs → Recently
 *    Played, Playlists → user playlists, search icon → an expanding search
 *    input (X to close) with recents shown when the query is empty.
 *  - Selecting a track plays it and returns to the player view (tabs stay,
 *    since the widget is still selected). Music never stops on navigation.
 *
 * Tab-bar placement (matches the two mockups):
 *  - list/search view active → ALL variants: tab bar as a top strip (shrink-0)
 *    with the list filling below (flex-1 min-h-0). The player surface is hidden
 *    while browsing.
 *  - player view active (no tab selected):
 *     - default & small → tab bar as a top strip + the player surface below.
 *     - minimal → the full-bleed art player fills the widget and the tab bar
 *       OVERLAYS the top (absolutely positioned, with a top scrim for
 *       legibility), so the pills float over the art.
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
import { PersonalSpotifyMinimalView } from './PersonalSpotifyMinimalView';
import { PersonalSpotifyCompactBar } from './PersonalSpotifyCompactBar';
import {
  PersonalSpotifyDefaultTabBar,
  DefaultTabView,
} from './PersonalSpotifyDefaultTabBar';
import {
  SpotifyRowSkeleton,
  SpotifyReconnectBanner,
} from './PersonalSpotifyListState';
import type { SpotifyPlayablePick } from './PersonalSpotifyLibraryTab';
import type { MusicLayout } from '@/types';

/**
 * Playback props for the player surfaces. The Now Playing card adds
 * onSwitchToLibrary internally; the minimal/compact surfaces ignore the extra
 * fields they don't render (repeat/shuffle), so a single shared shape works.
 */
export type AdaptiveLayoutPlaybackProps = Omit<
  PersonalSpotifyNowPlayingProps,
  'onSwitchToLibrary'
>;

interface Props {
  variant: MusicLayout;
  isActive: boolean;
  currentUri: string | null;
  onPlay: (pick: SpotifyPlayablePick) => void;
  onReconnect: () => void;
  playbackProps: AdaptiveLayoutPlaybackProps;
}

const EmptyHint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="flex flex-col items-center justify-center text-center text-slate-400 h-full"
    style={{ padding: 'min(24px, 6cqmin)', fontSize: 'min(16px, 5cqmin)' }}
  >
    {children}
  </div>
);

export const PersonalSpotifyAdaptiveLayout: React.FC<Props> = ({
  variant,
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

  const openSongs = () => setActiveView('songs');

  const handleRowPlay = (pick: SpotifyPlayablePick) => {
    onPlay(pick);
    setActiveView('player');
    setSearchOpen(false);
    setQuery('');
  };

  // The player surface for this variant — used both at rest and in the player
  // view. Minimal/compact surfaces no longer take onOpenBrowse (the tab bar now
  // owns browsing), so they render as pure player surfaces.
  const renderPlayer = () => {
    if (variant === 'minimal') {
      return <PersonalSpotifyMinimalView {...playbackProps} />;
    }
    if (variant === 'small') {
      return <PersonalSpotifyCompactBar {...playbackProps} />;
    }
    return (
      <PersonalSpotifyNowPlayingTab
        {...playbackProps}
        onSwitchToLibrary={openSongs}
      />
    );
  };

  // At rest → only the player surface, no tab bar (all variants).
  if (!isActive) {
    return <div className="w-full h-full">{renderPlayer()}</div>;
  }

  const tabBar = (
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
  );

  const isBrowsing = searchOpen || activeView !== 'player';

  // List/search body. flex-1 + min-h-0 lets it fill the remaining height and
  // scroll internally rather than top-clustering.
  const listBody = (
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
      ) : (
        <PlaylistsView
          currentUri={currentUri}
          onPlay={handleRowPlay}
          onReconnect={onReconnect}
        />
      )}
    </div>
  );

  // Browsing (a list/search view is open) → top strip + list, for ALL variants.
  // The player surface is hidden while browsing.
  if (isBrowsing) {
    return (
      <div className="w-full h-full flex flex-col bg-slate-900/60 backdrop-blur-sm">
        <div className="shrink-0">{tabBar}</div>
        {listBody}
      </div>
    );
  }

  // Player view (no tab selected). Minimal overlays the pills over the
  // full-bleed art; default & small put the strip on top of the player.
  if (variant === 'minimal') {
    return (
      <div className="w-full h-full relative">
        {renderPlayer()}
        {/* Pills float over the art with a subtle top scrim for legibility. */}
        <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
          <div className="absolute inset-x-0 top-0 h-full bg-gradient-to-b from-black/50 to-transparent" />
          <div className="relative pointer-events-auto">{tabBar}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-slate-900/60 backdrop-blur-sm">
      <div className="shrink-0">{tabBar}</div>
      <div className="flex-1 min-h-0">{renderPlayer()}</div>
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
