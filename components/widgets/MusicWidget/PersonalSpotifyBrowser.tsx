import React, { useCallback, useEffect, useRef, useState } from 'react';
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

interface Props {
  widget: WidgetData;
}

// Below either threshold the full 3-tab browse UI (tab strip + scrollable
// lists) is too cramped to use, so we collapse to the compact now-playing
// bar. Tuned so a teacher who shrinks the widget out of the way still gets a
// usable mini player, while any comfortably-sized widget keeps the full UI.
const COMPACT_MAX_WIDTH = 220;
const COMPACT_MAX_HEIGHT = 220;

export const PersonalSpotifyBrowser: React.FC<Props> = ({ widget }) => {
  const config = widget.config as MusicConfig;
  const { updateWidget } = useDashboard();
  // Note: useSpotifyAuth exposes `connect` and `disconnect` but no `reconnect`.
  // handleReconnect below calls disconnect() then connect() to achieve a
  // reconnect flow. The `reconnect` name is preserved in the prop passed to
  // PersonalSpotifyLibraryTab for clarity.
  const { isPremium, getAccessToken, disconnect, connect } = useSpotifyAuth();

  const [activeTab, setActiveTab] = useState<SpotifyBrowserTab>('library');

  // Measure the widget content box so we can collapse to the compact bar when
  // it's shrunk. ResizeObserver is the right tool — the widget is freely
  // resizable and there's no viewport breakpoint that maps to its size.
  const rootRef = useRef<HTMLDivElement>(null);
  const [isCompact, setIsCompact] = useState(false);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      setIsCompact(
        box.width <= COMPACT_MAX_WIDTH || box.height <= COMPACT_MAX_HEIGHT
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          ref={rootRef}
          className="flex flex-col h-full bg-slate-900/60 backdrop-blur-sm"
        >
          {isCompact ? (
            <PersonalSpotifyCompactBar
              url={currentUri}
              thumbnail={config.personalSpotifyThumbnail}
              label={config.personalSpotifyLabel}
              isPremium={isPremium}
              sdkFailed={playback.sdkFailed}
              isReady={playback.isReady}
              currentTrack={playback.currentTrack}
              isPlaying={playback.isPlaying}
              onTogglePlay={() => void playback.togglePlay()}
            />
          ) : (
            <>
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
                    url={currentUri}
                    thumbnail={config.personalSpotifyThumbnail}
                    label={config.personalSpotifyLabel}
                    isPremium={isPremium}
                    sdkFailed={playback.sdkFailed}
                    isReady={playback.isReady}
                    currentTrack={playback.currentTrack}
                    isPlaying={playback.isPlaying}
                    onTogglePlay={() => void playback.togglePlay()}
                    onSwitchToLibrary={() => setActiveTab('library')}
                  />
                )}
              </div>
            </>
          )}
        </div>
      }
    />
  );
};
