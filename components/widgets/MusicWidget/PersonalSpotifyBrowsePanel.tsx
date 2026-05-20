/**
 * PersonalSpotifyBrowsePanel — the tab strip + active-tab body of the
 * personal-Spotify browse UI, factored out of PersonalSpotifyBrowser so it can
 * be rendered two ways from a single source of truth:
 *
 *  - inline, as the whole front face of the `default` layout (no onClose); and
 *  - as a full-cover overlay in the `small` / `minimal` layouts (with onClose),
 *    so a teacher can pick a new track even when there are no inline tabs.
 *
 * Presentation/wiring only — playback state and the play/reconnect handlers are
 * owned by PersonalSpotifyBrowser (which owns the SDK hook) and threaded in.
 */

import React from 'react';
import { X } from 'lucide-react';
import { PersonalSpotifyTabs, SpotifyBrowserTab } from './PersonalSpotifyTabs';
import {
  PersonalSpotifyLibraryTab,
  SpotifyPlayablePick,
} from './PersonalSpotifyLibraryTab';
import { PersonalSpotifySearchTab } from './PersonalSpotifySearchTab';
import {
  PersonalSpotifyNowPlayingTab,
  PersonalSpotifyNowPlayingProps,
} from './PersonalSpotifyNowPlayingTab';

/** Playback props shared with the Now Playing surface (no onSwitchToLibrary —
 * that's supplied internally so the panel owns its own tab navigation). */
export type BrowsePanelPlaybackProps = Omit<
  PersonalSpotifyNowPlayingProps,
  'onSwitchToLibrary'
>;

interface Props {
  activeTab: SpotifyBrowserTab;
  onTabChange: (next: SpotifyBrowserTab) => void;
  isAudioActive: boolean;
  currentUri: string | null;
  onPlay: (pick: SpotifyPlayablePick) => void;
  onReconnect: () => void;
  /** Switch the Now Playing empty-state's "Open library" link to the library tab. */
  onSwitchToLibrary: () => void;
  playbackProps: BrowsePanelPlaybackProps;
  /** When provided, renders a close (X) button top-right (overlay mode). */
  onClose?: () => void;
}

export const PersonalSpotifyBrowsePanel: React.FC<Props> = ({
  activeTab,
  onTabChange,
  isAudioActive,
  currentUri,
  onPlay,
  onReconnect,
  onSwitchToLibrary,
  playbackProps,
  onClose,
}) => (
  <div className="flex flex-col h-full w-full bg-slate-900/60 backdrop-blur-sm">
    <div className="relative">
      <PersonalSpotifyTabs
        active={activeTab}
        isAudioActive={isAudioActive}
        onChange={onTabChange}
      />
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close browse"
          className="absolute top-0 right-0 text-slate-400 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/70 rounded-full"
          style={{
            margin: 'min(8px, 2cqmin) min(10px, 2.5cqmin)',
            padding: 'min(4px, 1cqmin)',
          }}
        >
          <X
            style={{
              width: 'min(20px, 5cqmin)',
              height: 'min(20px, 5cqmin)',
            }}
          />
        </button>
      )}
    </div>
    {/* flex-1 + min-h-0 lets the active tab fill the remaining height and
        scroll internally — without it the content top-clusters and leaves a
        dead gap on tall widgets. */}
    <div className="flex-1 min-h-0">
      {activeTab === 'library' && (
        <PersonalSpotifyLibraryTab
          currentUri={currentUri}
          onPlay={onPlay}
          onReconnect={onReconnect}
        />
      )}
      {activeTab === 'search' && (
        <PersonalSpotifySearchTab currentUri={currentUri} onPlay={onPlay} />
      )}
      {activeTab === 'now-playing' && (
        <PersonalSpotifyNowPlayingTab
          {...playbackProps}
          onSwitchToLibrary={onSwitchToLibrary}
        />
      )}
    </div>
  </div>
);
