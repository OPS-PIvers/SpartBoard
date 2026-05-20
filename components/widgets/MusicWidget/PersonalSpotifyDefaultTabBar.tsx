/**
 * PersonalSpotifyDefaultTabBar — the tab strip shown above the player in the
 * Default layout, but only while the widget is selected/active.
 *
 * Two visual states:
 *  - default: [ Songs ] [ Playlists ]  …………………………  ( search-icon )
 *  - search open: the bar morphs into a full-width search input + an X to
 *    close, animating via a CSS width/opacity transition (the "expands left to
 *    fill the top" effect from the mockup).
 *
 * Presentation/wiring only — view + query state lives in the parent
 * PersonalSpotifyDefaultLayout. The "player" view leaves both pills unselected.
 */

import React, { useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';

export type DefaultTabView = 'player' | 'songs' | 'playlists';

interface Props {
  activeView: DefaultTabView;
  searchOpen: boolean;
  query: string;
  onSelectView: (view: DefaultTabView) => void;
  onToggleSearch: (open: boolean) => void;
  onQueryChange: (query: string) => void;
}

const PILLS: { view: Exclude<DefaultTabView, 'player'>; label: string }[] = [
  { view: 'songs', label: 'Songs' },
  { view: 'playlists', label: 'Playlists' },
];

export const PersonalSpotifyDefaultTabBar: React.FC<Props> = ({
  activeView,
  searchOpen,
  query,
  onSelectView,
  onToggleSearch,
  onQueryChange,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // Autofocus the search field when the bar morphs into search mode. This is a
  // genuine DOM side-effect (focus), so an effect is the right tool.
  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  return (
    <div
      className="flex items-center"
      style={{
        gap: 'min(8px, 2cqmin)',
        padding: 'min(8px, 2cqmin) min(12px, 3cqmin)',
      }}
    >
      {/* Pills — collapse (width/opacity → 0) when the search bar expands. */}
      <div
        className="flex items-center overflow-hidden transition-all duration-200 ease-out"
        aria-hidden={searchOpen}
        style={{
          gap: 'min(8px, 2cqmin)',
          maxWidth: searchOpen ? 0 : '100%',
          opacity: searchOpen ? 0 : 1,
          flex: searchOpen ? '0 0 auto' : '1 1 auto',
        }}
      >
        {PILLS.map(({ view, label }) => {
          const isOn = activeView === view && !searchOpen;
          return (
            <button
              key={view}
              type="button"
              tabIndex={searchOpen ? -1 : 0}
              onClick={() => onSelectView(isOn ? 'player' : view)}
              aria-pressed={isOn}
              className={`rounded-full transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/70 ${
                isOn
                  ? 'bg-green-500 text-slate-950 font-semibold shadow-md'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
              style={{
                padding: 'min(8px, 2cqmin) min(16px, 4cqmin)',
                fontSize: 'min(16px, 5cqmin)',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Search input — expands to fill the row when open. */}
      <div
        className="relative overflow-hidden transition-all duration-200 ease-out"
        style={{
          flex: searchOpen ? '1 1 auto' : '0 0 auto',
          width: searchOpen ? '100%' : 'auto',
        }}
      >
        {searchOpen ? (
          <>
            <Search
              className="absolute text-slate-500 pointer-events-none"
              style={{
                left: 'min(12px, 3cqmin)',
                top: '50%',
                transform: 'translateY(-50%)',
                width: 'min(18px, 4.5cqmin)',
                height: 'min(18px, 4.5cqmin)',
              }}
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search Spotify…"
              aria-label="Search Spotify"
              className="w-full bg-slate-800 border border-slate-700 rounded-full text-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/70"
              style={{
                paddingLeft: 'min(38px, 9.5cqmin)',
                paddingRight: 'min(38px, 9.5cqmin)',
                paddingTop: 'min(8px, 2cqmin)',
                paddingBottom: 'min(8px, 2cqmin)',
                fontSize: 'min(16px, 5cqmin)',
              }}
            />
            <button
              type="button"
              onClick={() => onToggleSearch(false)}
              aria-label="Close search"
              className="absolute text-slate-400 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/70 rounded-full flex items-center justify-center"
              style={{
                right: 'min(6px, 1.5cqmin)',
                top: '50%',
                transform: 'translateY(-50%)',
                width: 'min(28px, 8cqmin)',
                height: 'min(28px, 8cqmin)',
              }}
            >
              <X style={{ width: '60%', height: '60%' }} />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => onToggleSearch(true)}
            aria-label="Search"
            className="rounded-full bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/70"
            style={{
              width: 'min(36px, 10cqmin)',
              height: 'min(36px, 10cqmin)',
            }}
          >
            <Search
              style={{
                width: 'min(18px, 5cqmin)',
                height: 'min(18px, 5cqmin)',
              }}
            />
          </button>
        )}
      </div>
    </div>
  );
};
