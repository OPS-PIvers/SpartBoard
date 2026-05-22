/**
 * PersonalSpotifyDefaultTabBar — the tab strip shown above the player in the
 * Default layout, but only while the widget is selected/active.
 *
 * Two visual states:
 *  - default: [ Songs ] [ Playlists ] [ Search ]  — three left-aligned
 *    icon+text pills, in that order. (Search is no longer a floating icon in
 *    the top-right corner, which used to collide with the draggable-window
 *    drag/resize zone and was nearly unclickable.)
 *  - search open: the bar morphs into a full-width search input + an X to
 *    close, animating via a CSS width/opacity transition (the "expands left to
 *    fill the top" effect from the mockup).
 *
 * Responsive labels: a ResizeObserver measures the bar width and collapses the
 * pills to icon-only when narrow so all three fit; aria-labels keep them
 * accessible in either mode.
 *
 * Presentation/wiring only — view + query state lives in the parent
 * PersonalSpotifyAdaptiveLayout (shared by all three layout variants). The
 * "player" view leaves both nav pills unselected.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Disc3, ListMusic, Search, X } from 'lucide-react';

export type DefaultTabView = 'player' | 'songs' | 'playlists';

interface Props {
  activeView: DefaultTabView;
  searchOpen: boolean;
  query: string;
  onSelectView: (view: DefaultTabView) => void;
  onToggleSearch: (open: boolean) => void;
  onQueryChange: (query: string) => void;
}

const NAV_PILLS: {
  view: Exclude<DefaultTabView, 'player'>;
  label: string;
  Icon: typeof Disc3;
}[] = [
  { view: 'songs', label: 'Songs', Icon: Disc3 },
  { view: 'playlists', label: 'Playlists', Icon: ListMusic },
];

// Below this *inner* bar width the three full-width pills can't fit their text
// labels without truncating ("Playlists" ~110px/pill × 3 + gaps ≈ 340px), so we
// drop to icon-only BEFORE the text clips. Set to the measured fit threshold so
// narrow widgets show three clean icon circles rather than "So… / Pl… / Se…",
// and labels return only when there's genuine room.
const LABEL_COLLAPSE_WIDTH = 340;

const PILL_BASE =
  'rounded-full transition-colors whitespace-nowrap flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/70';

export const PersonalSpotifyDefaultTabBar: React.FC<Props> = ({
  activeView,
  searchOpen,
  query,
  onSelectView,
  onToggleSearch,
  onQueryChange,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [showLabels, setShowLabels] = useState(true);

  // Autofocus the search field when the bar morphs into search mode. This is a
  // genuine DOM side-effect (focus), so an effect is the right tool.
  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  // Responsive labels — observe the bar's own width and collapse the text
  // labels to icon-only when narrow. A ResizeObserver is the right tool for
  // syncing with an element's measured size (an external system).
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? el.clientWidth;
      setShowLabels(width >= LABEL_COLLAPSE_WIDTH);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pillStyle: React.CSSProperties = {
    // Equal-width segments that stretch to fill the row (span the space).
    flex: '1 1 0',
    // Floor the segment width so the pills never shrink below a tappable
    // target — in icon-only mode this keeps each grip comfortably clickable.
    minWidth: showLabels ? 0 : 'clamp(34px, 11cqmin, 44px)',
    // clamp() (not min()) so font/padding/height keep a usable floor as the
    // widget shrinks instead of scaling all the way toward zero.
    minHeight: 'clamp(30px, 9cqmin, 40px)',
    gap: showLabels ? 'clamp(4px, 2cqmin, 8px)' : 0,
    padding: showLabels
      ? 'clamp(6px, 2cqmin, 8px) clamp(8px, 3cqmin, 12px)'
      : 'clamp(6px, 2cqmin, 8px)',
    fontSize: 'clamp(12px, 5cqmin, 16px)',
  };
  const iconStyle: React.CSSProperties = {
    width: 'clamp(15px, 5cqmin, 18px)',
    height: 'clamp(15px, 5cqmin, 18px)',
    flexShrink: 0,
  };

  return (
    <div
      ref={rootRef}
      className="flex items-center"
      style={{
        gap: 'min(8px, 2cqmin)',
        // Full-bleed: the pills span the bar with only small breathing-room
        // padding (no dead corner inset). DraggableWindow resize is
        // corners-only and its resize-passthrough lets these button/role=tab
        // pills win taps except inside the ~16px corner priority zones — so
        // only the extreme outer corners of the end pills act as resize grips.
        padding: 'min(8px, 2cqmin)',
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
        {NAV_PILLS.map(({ view, label, Icon }) => {
          const isOn = activeView === view && !searchOpen;
          return (
            <button
              key={view}
              type="button"
              tabIndex={searchOpen ? -1 : 0}
              onClick={() => onSelectView(isOn ? 'player' : view)}
              aria-pressed={isOn}
              aria-label={label}
              className={`${PILL_BASE} ${
                isOn
                  ? 'bg-green-500 text-slate-950 font-semibold shadow-md'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
              style={pillStyle}
            >
              <Icon style={iconStyle} aria-hidden="true" />
              {showLabels && <span className="truncate">{label}</span>}
            </button>
          );
        })}
        {/* Search pill — same shape as the nav pills; tapping it opens the
            expanding search input below. */}
        <button
          type="button"
          tabIndex={searchOpen ? -1 : 0}
          onClick={() => onToggleSearch(true)}
          aria-label="Search"
          aria-expanded={searchOpen}
          className={`${PILL_BASE} bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white`}
          style={pillStyle}
        >
          <Search style={iconStyle} aria-hidden="true" />
          {showLabels && <span className="truncate">Search</span>}
        </button>
      </div>

      {/* Search input — expands to fill the row when open. */}
      <div
        className="relative overflow-hidden transition-all duration-200 ease-out"
        style={{
          flex: searchOpen ? '1 1 auto' : '0 0 auto',
          width: searchOpen ? '100%' : 0,
          maxWidth: searchOpen ? '100%' : 0,
        }}
        aria-hidden={!searchOpen}
      >
        {searchOpen && (
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
        )}
      </div>
    </div>
  );
};
