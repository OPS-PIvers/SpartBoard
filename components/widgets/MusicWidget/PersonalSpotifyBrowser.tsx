import React, { useCallback, useState } from 'react';
import { WidgetData, MusicConfig } from '@/types';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { useDashboard } from '@/context/useDashboard';
import { useSpotifyAuth } from '@/hooks/useSpotifyAuth';
import { useSpotifyWebPlayback } from '@/hooks/useSpotifyWebPlayback';
import { playOnDevice } from '@/utils/spotifyAuth';
import { PersonalSpotifyTabs, SpotifyBrowserTab } from './PersonalSpotifyTabs';
import {
  PersonalSpotifyLibraryTab,
  SpotifyPlayablePick,
} from './PersonalSpotifyLibraryTab';
import { PersonalSpotifySearchTab } from './PersonalSpotifySearchTab';
import { PersonalSpotifyNowPlayingTab } from './PersonalSpotifyNowPlayingTab';
import { PersonalSpotifyCompactBar } from './PersonalSpotifyCompactBar';
import { PersonalSpotifyMinimalView } from './PersonalSpotifyMinimalView';

interface Props {
  widget: WidgetData;
}

export const PersonalSpotifyBrowser: React.FC<Props> = ({ widget }) => {
  const config = widget.config as MusicConfig;
  const { layout = 'default' } = config;
  const { updateWidget } = useDashboard();
  // Note: useSpotifyAuth exposes `connect` and `disconnect` but no `reconnect`.
  // handleReconnect below calls disconnect() then connect() to achieve a
  // reconnect flow. The `reconnect` name is preserved in the prop passed to
  // PersonalSpotifyLibraryTab for clarity.
  const { isPremium, getAccessToken, disconnect, connect } = useSpotifyAuth();

  const [activeTab, setActiveTab] = useState<SpotifyBrowserTab>('library');

  const currentUri = config.personalSpotifyUrl ?? null;

  // The Web Playback SDK is owned here (above the tabs) so the playback device
  // survives tab switches — a track tapped in Library plays even before the
  // Now Playing tab is opened, and leaving Now Playing doesn't stop the music.
  // Disabled for Free accounts (SDK requires Premium); they get the embed.
  // currentUri is the target the device starts on first play (reload-resume).
  const playback = useSpotifyWebPlayback(isPremium, getAccessToken, currentUri);

  const isAudioActive =
    playback.isPlaying || (!isPremium && Boolean(currentUri));

  const handleReconnect = useCallback(async () => {
    await disconnect();
    await connect();
  }, [disconnect, connect]);

  const handlePlay = useCallback(
    async (pick: SpotifyPlayablePick) => {
      updateWidget(widget.id, {
        config: { personalSpotifyUrl: pick.uri },
      });
      // In the full browse layout, starting a track jumps to the Now Playing
      // surface. The tab strip stays visible, so the user taps Playlists/Search
      // to come back. Compact/minimal layouts have no tabs, so skip the jump.
      if (layout === 'default') setActiveTab('now-playing');
      if (!isPremium) return;
      const token = await getAccessToken();
      if (!token || !playback.deviceId) return;
      const payload =
        pick.type === 'track' ? { uris: [pick.uri] } : { contextUri: pick.uri };
      try {
        await playOnDevice(token, playback.deviceId, payload);
      } catch (err) {
        console.warn('[PersonalSpotifyBrowser.handlePlay] play failed', err);
      }
    },
    [
      updateWidget,
      widget.id,
      layout,
      isPremium,
      getAccessToken,
      playback.deviceId,
    ]
  );

  // Shared playback props handed to the leaf "now playing" surfaces.
  const playbackProps = {
    url: currentUri,
    thumbnail: config.personalSpotifyThumbnail,
    label: config.personalSpotifyLabel,
    isPremium,
    sdkFailed: playback.sdkFailed,
    isReady: playback.isReady,
    currentTrack: playback.currentTrack,
    isPlaying: playback.isPlaying,
    onTogglePlay: () => void playback.togglePlay(),
  };

  // Small layout → single now-playing strip (no tabs).
  if (layout === 'small') {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <div className="w-full h-full">
            <PersonalSpotifyCompactBar {...playbackProps} />
          </div>
        }
      />
    );
  }

  // Minimal layout → full-bleed artwork + centered play (no tabs).
  if (layout === 'minimal') {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <div className="w-full h-full">
            <PersonalSpotifyMinimalView {...playbackProps} />
          </div>
        }
      />
    );
  }

  // Default layout → full 3-tab browse UI.
  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div className="flex flex-col h-full w-full bg-slate-900/60 backdrop-blur-sm">
          <PersonalSpotifyTabs
            active={activeTab}
            isAudioActive={isAudioActive}
            onChange={setActiveTab}
          />
          {/* flex-1 + min-h-0 lets the active tab fill the remaining
              height and scroll internally — without it the content
              top-clusters and leaves a dead gap on tall widgets. */}
          <div className="flex-1 min-h-0">
            {activeTab === 'library' && (
              <PersonalSpotifyLibraryTab
                currentUri={currentUri}
                onPlay={handlePlay}
                onReconnect={handleReconnect}
              />
            )}
            {activeTab === 'search' && (
              <PersonalSpotifySearchTab
                currentUri={currentUri}
                onPlay={handlePlay}
              />
            )}
            {activeTab === 'now-playing' && (
              <PersonalSpotifyNowPlayingTab
                {...playbackProps}
                onSwitchToLibrary={() => setActiveTab('library')}
              />
            )}
          </div>
        </div>
      }
    />
  );
};
