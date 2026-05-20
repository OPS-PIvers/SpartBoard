import React, { useCallback } from 'react';
import { WidgetData, MusicConfig } from '@/types';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { useDashboard } from '@/context/useDashboard';
import { useSpotifyAuth } from '@/hooks/useSpotifyAuth';
import { useSpotifyWebPlayback } from '@/hooks/useSpotifyWebPlayback';
import { playOnDevice } from '@/utils/spotifyAuth';
import { SpotifyPlayablePick } from './PersonalSpotifyLibraryTab';
import { PersonalSpotifyAdaptiveLayout } from './PersonalSpotifyAdaptiveLayout';

interface Props {
  widget: WidgetData;
}

export const PersonalSpotifyBrowser: React.FC<Props> = ({ widget }) => {
  const config = widget.config as MusicConfig;
  const { layout = 'default' } = config;
  const { updateWidget, selectedWidgetId } = useDashboard();
  // The tab strip is revealed only while the widget is the selected one — the
  // same flag that drives the widget toolbar's visibility. This now applies to
  // ALL THREE layouts (default / minimal / small) via the shared adaptive
  // layout below.
  const isActive = selectedWidgetId === widget.id;
  // Note: useSpotifyAuth exposes `connect` and `disconnect` but no `reconnect`.
  // handleReconnect below calls disconnect() then connect() to achieve a
  // reconnect flow.
  const { isPremium, getAccessToken, disconnect, connect } = useSpotifyAuth();

  const currentUri = config.personalSpotifyUrl ?? null;

  // The Web Playback SDK is owned here (above the tabs) so the playback device
  // survives view switches — a track tapped in a list plays even before the
  // player view is shown, and leaving the player doesn't stop the music.
  // Disabled for Free accounts (SDK requires Premium); they get the embed.
  // currentUri is the target the device starts on first play (reload-resume).
  const playback = useSpotifyWebPlayback(isPremium, getAccessToken, currentUri);

  const handleReconnect = useCallback(async () => {
    await disconnect();
    await connect();
  }, [disconnect, connect]);

  const handlePlay = useCallback(
    async (pick: SpotifyPlayablePick) => {
      updateWidget(widget.id, {
        config: { personalSpotifyUrl: pick.uri },
      });
      // The adaptive layout owns its own view state (returns to the player
      // after a row tap), so nothing to do here for navigation.
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
    [updateWidget, widget.id, isPremium, getAccessToken, playback.deviceId]
  );

  // Shared playback props handed to the leaf player surfaces.
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

  // All three layouts route through the shared adaptive layout. At rest it
  // shows only the variant's player surface; when the widget is selected the
  // Songs/Playlists/search tab bar appears (overlaid on minimal, top strip on
  // default/small).
  return (
    <WidgetLayout
      padding="p-0"
      content={
        <PersonalSpotifyAdaptiveLayout
          variant={layout}
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
