import React, { useCallback, useState } from 'react';
import { WidgetData, MusicConfig } from '@/types';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { useDashboard } from '@/context/useDashboard';
import { useSpotifyAuth } from '@/hooks/useSpotifyAuth';
import { useSpotifyWebPlayback } from '@/hooks/useSpotifyWebPlayback';
import { playOnDevice } from '@/utils/spotifyAuth';
import { SpotifyBrowserTab } from './PersonalSpotifyTabs';
import { SpotifyPlayablePick } from './PersonalSpotifyLibraryTab';
import { PersonalSpotifyBrowsePanel } from './PersonalSpotifyBrowsePanel';
import { PersonalSpotifyCompactBar } from './PersonalSpotifyCompactBar';
import { PersonalSpotifyMinimalView } from './PersonalSpotifyMinimalView';
import { PersonalSpotifyDefaultLayout } from './PersonalSpotifyDefaultLayout';

interface Props {
  widget: WidgetData;
}

export const PersonalSpotifyBrowser: React.FC<Props> = ({ widget }) => {
  const config = widget.config as MusicConfig;
  const { layout = 'default' } = config;
  const { updateWidget, selectedWidgetId } = useDashboard();
  // The Default layout reveals its tab strip only while the widget is the
  // selected one — the same flag that drives the widget toolbar's visibility.
  const isActive = selectedWidgetId === widget.id;
  // Note: useSpotifyAuth exposes `connect` and `disconnect` but no `reconnect`.
  // handleReconnect below calls disconnect() then connect() to achieve a
  // reconnect flow. The `reconnect` name is preserved in the prop passed to
  // PersonalSpotifyLibraryTab for clarity.
  const { isPremium, getAccessToken, disconnect, connect } = useSpotifyAuth();

  const [activeTab, setActiveTab] = useState<SpotifyBrowserTab>('library');
  // Small/minimal layouts have no inline tabs, so tapping the surface opens
  // the full browse UI as a temporary full-cover overlay.
  const [browseOpen, setBrowseOpen] = useState(false);

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
      // The Default layout owns its own view state (PersonalSpotifyDefaultLayout
      // returns to the player after a row tap), so nothing to do here for it.
      // Compact/minimal layouts have no tabs — selecting a track in their browse
      // overlay closes it.
      if (layout !== 'default') setBrowseOpen(false);
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
    repeatMode: playback.repeatMode,
    shuffle: playback.shuffle,
    onTogglePlay: () => void playback.togglePlay(),
    onNext: () => void playback.next(),
    onPrevious: () => void playback.previous(),
    onCycleRepeat: () => void playback.cycleRepeat(),
    onToggleShuffle: () => void playback.toggleShuffle(),
  };

  // The browse panel (tab strip + active-tab body), shared between the inline
  // default layout and the small/minimal overlay. `onClose` is only passed in
  // overlay mode (renders the X button).
  const renderBrowsePanel = (onClose?: () => void) => (
    <PersonalSpotifyBrowsePanel
      activeTab={activeTab}
      onTabChange={setActiveTab}
      isAudioActive={isAudioActive}
      currentUri={currentUri}
      onPlay={handlePlay}
      onReconnect={handleReconnect}
      onSwitchToLibrary={() => setActiveTab('library')}
      playbackProps={playbackProps}
      onClose={onClose}
    />
  );

  // Small layout → single now-playing strip (no tabs). Tapping the art/title
  // opens the browse overlay so a new track can be picked.
  if (layout === 'small') {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <div className="w-full h-full relative">
            <PersonalSpotifyCompactBar
              {...playbackProps}
              onOpenBrowse={() => setBrowseOpen(true)}
            />
            {browseOpen && (
              <div className="absolute inset-0 z-20 bg-slate-900">
                {renderBrowsePanel(() => setBrowseOpen(false))}
              </div>
            )}
          </div>
        }
      />
    );
  }

  // Minimal layout → full-bleed artwork + centered play (no tabs). Tapping the
  // artwork opens the browse overlay.
  if (layout === 'minimal') {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <div className="w-full h-full relative">
            <PersonalSpotifyMinimalView
              {...playbackProps}
              onOpenBrowse={() => setBrowseOpen(true)}
            />
            {browseOpen && (
              <div className="absolute inset-0 z-20 bg-slate-900">
                {renderBrowsePanel(() => setBrowseOpen(false))}
              </div>
            )}
          </div>
        }
      />
    );
  }

  // Default layout → player at rest; reveals Songs/Playlists/search tabs only
  // while the widget is selected. View state is owned by the layout component.
  return (
    <WidgetLayout
      padding="p-0"
      content={
        <PersonalSpotifyDefaultLayout
          isActive={isActive}
          currentUri={currentUri}
          onPlay={handlePlay}
          onReconnect={handleReconnect}
          playbackProps={playbackProps}
        />
      }
    />
  );
};
