import React, { useCallback, useState } from 'react';
import { WidgetData, MusicConfig } from '@/types';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { useDashboard } from '@/context/useDashboard';
import { useSpotifyAuth } from '@/hooks/useSpotifyAuth';
import { playOnDevice } from '@/utils/spotifyAuth';
import { PersonalSpotifyTabs, SpotifyBrowserTab } from './PersonalSpotifyTabs';
import {
  PersonalSpotifyLibraryTab,
  SpotifyPlayablePick,
} from './PersonalSpotifyLibraryTab';
import { PersonalSpotifySearchTab } from './PersonalSpotifySearchTab';
import { PersonalSpotifyNowPlayingTab } from './PersonalSpotifyNowPlayingTab';

interface Props {
  widget: WidgetData;
}

interface SdkState {
  deviceId: string | null;
  isPlaying: boolean;
}

export const PersonalSpotifyBrowser: React.FC<Props> = ({ widget }) => {
  const config = widget.config as MusicConfig;
  const { updateWidget } = useDashboard();
  // Note: useSpotifyAuth exposes `connect` and `disconnect` but no `reconnect`.
  // handleReconnect below calls disconnect() then connect() to achieve a
  // reconnect flow. The `reconnect` name is preserved in the prop passed to
  // PersonalSpotifyLibraryTab for clarity.
  const { isPremium, getAccessToken, disconnect, connect } = useSpotifyAuth();

  const [activeTab, setActiveTab] = useState<SpotifyBrowserTab>('library');
  // sdk state: deviceId and isPlaying wired in Task 11 via onSdkState prop.
  const [sdk, setSdkState] = useState<SdkState>({
    deviceId: null,
    isPlaying: false,
  });
  // Expose setter for Task 11 — kept to avoid removing and re-adding the
  // useState call when the onSdkState callback is wired.
  void setSdkState;

  const currentUri = config.personalSpotifyUrl ?? null;
  const isAudioActive = sdk.isPlaying || (!isPremium && Boolean(currentUri));

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
      if (!token || !sdk.deviceId) return;
      const payload =
        pick.type === 'track' ? { uris: [pick.uri] } : { contextUri: pick.uri };
      try {
        await playOnDevice(token, sdk.deviceId, payload);
      } catch (err) {
        console.warn('[PersonalSpotifyBrowser.handlePlay] play failed', err);
      }
    },
    [updateWidget, widget.id, isPremium, getAccessToken, sdk.deviceId]
  );

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div className="flex flex-col h-full bg-slate-900/60 backdrop-blur-sm">
          <PersonalSpotifyTabs
            active={activeTab}
            isAudioActive={isAudioActive}
            onChange={setActiveTab}
          />
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
              onSwitchToLibrary={() => setActiveTab('library')}
            />
          )}
        </div>
      }
    />
  );
};
