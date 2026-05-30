import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
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

  // Holds a tap-to-play pick when the user taps a row BEFORE the SDK device
  // has been confirmed-registered by useSpotifyWebPlayback's polling. The
  // effect below flushes it the moment `playback.deviceId` becomes available.
  // Without this, taps during the 0-15s registration window silently no-op,
  // which reads to the teacher as "nothing happened — let me click again."
  const pendingPickRef = useRef<SpotifyPlayablePick | null>(null);
  // Mirror playback.deviceId into a ref so async paths (handlePlay's
  // post-await check, the flush effect's post-await re-check) always see
  // the current value rather than the closure-captured stale one. Synced
  // via useLayoutEffect to match the codebase pattern (and satisfy the
  // 'no ref access in render' lint rule); useLayoutEffect commits before
  // any callback that the next render queues, so the ref is fresh by the
  // time any user-triggered handler runs.
  const latestDeviceIdRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    latestDeviceIdRef.current = playback.deviceId;
  });

  const startPick = useCallback(
    async (pick: SpotifyPlayablePick, token: string, deviceId: string) => {
      const payload =
        pick.type === 'track' ? { uris: [pick.uri] } : { contextUri: pick.uri };
      try {
        await playOnDevice(token, deviceId, payload);
      } catch (err) {
        console.warn('[PersonalSpotifyBrowser.handlePlay] play failed', err);
      }
    },
    []
  );

  const handlePlay = useCallback(
    async (pick: SpotifyPlayablePick) => {
      updateWidget(widget.id, {
        config: { personalSpotifyUrl: pick.uri },
      });
      // The adaptive layout owns its own view state (returns to the player
      // after a row tap), so nothing to do here for navigation.
      if (!isPremium) return;
      const token = await getAccessToken();
      if (!token) return;
      // Read through the ref AFTER the await — playback.deviceId may have
      // flipped (not_ready cleared it, or registration just finished)
      // between callback creation and now. Captured-by-closure would be
      // stale.
      const currentDeviceId = latestDeviceIdRef.current;
      if (!currentDeviceId) {
        // Device not yet confirmed by Spotify Connect — queue the pick and
        // let the effect flush it as soon as deviceId arrives.
        pendingPickRef.current = pick;
        return;
      }
      await startPick(pick, token, currentDeviceId);
    },
    // playback.deviceId is intentionally omitted: we read it through
    // latestDeviceIdRef.current, which is always fresh. Including it would
    // recreate the callback on every device change for no benefit.
    [updateWidget, widget.id, isPremium, getAccessToken, startPick]
  );

  // Flush a queued tap when the SDK device finally registers. Only fires
  // when there's something to flush — no-op on every other render.
  useEffect(() => {
    if (!playback.deviceId) return;
    const queued = pendingPickRef.current;
    if (!queued) return;
    pendingPickRef.current = null;
    void (async () => {
      const token = await getAccessToken();
      if (!token) return;
      // Re-check via the ref — playback.deviceId may have been cleared
      // (not_ready, sign-out) while we were resolving the token.
      const id = latestDeviceIdRef.current;
      if (!id) {
        pendingPickRef.current = queued;
        return;
      }
      await startPick(queued, token, id);
    })();
  }, [playback.deviceId, getAccessToken, startPick]);

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
