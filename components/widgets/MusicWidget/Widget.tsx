import React, { useState, useEffect, useRef } from 'react';
import { Link, Music, Pause, Play, Radio } from 'lucide-react';
import { WidgetData, MusicConfig, TimeToolConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useMusicStations } from '@/hooks/useMusicStations';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { STANDARD_COLORS } from '@/config/colors';
import {
  loadYouTubeApi,
  extractYouTubeId,
  buildSpotifyEmbedUrl,
  YTPlayer,
} from './utils';

// ---------------------------------------------------------------------------
// MusicWidget — front face
// ---------------------------------------------------------------------------

export const MusicWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { activeDashboard } = useDashboard();
  const config = widget.config as MusicConfig;
  const { bgColor = '#ffffff', textColor = STANDARD_COLORS.slate } = config;
  const { stations } = useMusicStations();
  const [isPlaying, setIsPlaying] = useState(false);
  // isPlayerReady ensures the sync effect only fires after the YT player
  // has initialised, preventing missed play/pause commands.
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const playerRef = useRef<YTPlayer | null>(null);

  // Nexus connection: watch Time Tool running state
  const widgets = activeDashboard?.widgets ?? [];
  const timeToolWidget = widgets.find((w) => w.type === 'time-tool');
  const isTimeToolRunning = (
    timeToolWidget?.config as TimeToolConfig | undefined
  )?.isRunning;

  const activeStation = stations.find((s) => s.id === config.stationId);
  const youtubeId = activeStation ? extractYouTubeId(activeStation.url) : null;

  // Validate the Spotify URL at render time so malicious schemes are rejected.
  const spotifyEmbedUrl = activeStation?.url
    ? buildSpotifyEmbedUrl(activeStation.url)
    : null;
  const isSpotify = spotifyEmbedUrl !== null;

  // YouTube player init / teardown
  useEffect(() => {
    if (!youtubeId) return;

    let destroyed = false;

    loadYouTubeApi(() => {
      if (destroyed || !window.YT) return;
      playerRef.current = new window.YT.Player(`yt-player-${widget.id}`, {
        height: '1',
        width: '1',
        videoId: youtubeId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          origin: window.location.origin,
          enablejsapi: 1,
        },
        events: {
          onReady: () => {
            if (!destroyed) setIsPlayerReady(true);
          },
          onStateChange: (event) => {
            if (!destroyed) setIsPlaying(event.data === 1);
          },
        },
      });
    });

    return () => {
      destroyed = true;
      setIsPlayerReady(false);
      if (playerRef.current?.destroy) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      setIsPlaying(false);
    };
  }, [youtubeId, widget.id]);

  // Nexus sync: play/pause with Time Tool.
  // isPlayerReady is in the dep array so this re-runs once the player is
  // available, applying any state change that arrived before init completed.
  useEffect(() => {
    if (!config.syncWithTimeTool || !youtubeId || !isPlayerReady) return;
    if (typeof playerRef.current?.playVideo !== 'function') return;
    if (isTimeToolRunning) {
      playerRef.current.playVideo();
    } else {
      playerRef.current.pauseVideo();
    }
  }, [isTimeToolRunning, config.syncWithTimeTool, youtubeId, isPlayerReady]);

  const togglePlay = () => {
    if (typeof playerRef.current?.playVideo !== 'function') {
      console.warn('YouTube Player not ready yet.');
      return;
    }
    if (isPlaying) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
    }
  };

  if (!activeStation) {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <ScaledEmptyState
            icon={Radio}
            title="No Station Selected"
            subtitle="Flip this widget to choose a station."
          />
        }
      />
    );
  }

  // Spotify fallback — embed iframe (cannot be API-controlled cross-origin).
  // spotifyEmbedUrl is non-null here because isSpotify === (spotifyEmbedUrl !== null).
  if (isSpotify && spotifyEmbedUrl) {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <div className="w-full h-full overflow-hidden rounded-2xl bg-black">
            <iframe
              src={spotifyEmbedUrl}
              title={`Spotify: ${activeStation.title}`}
              width="100%"
              height="100%"
              allow="encrypted-media; autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              className="border-none w-full h-full"
            />
          </div>
        }
      />
    );
  }

  // Station URL is neither valid Spotify nor a recognised YouTube URL.
  if (!youtubeId) {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <ScaledEmptyState
            icon={Music}
            title="Unsupported URL"
            subtitle="This station's URL is not a valid YouTube or Spotify link."
          />
        }
      />
    );
  }

  const isTransparent = bgColor === 'transparent';

  // YouTube chromeless player
  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          className={`w-full h-full rounded-2xl flex flex-col [@container(orientation:landscape)]:flex-row items-center justify-center text-center [@container(orientation:landscape)]:text-left overflow-hidden relative select-none transition-all duration-500 ${
            !isTransparent ? 'shadow-inner' : ''
          }`}
          style={{
            padding: 'min(12px, 3cqh, 4cqw)',
            gap: 'min(16px, 4cqh, 5cqw)',
            backgroundColor: bgColor,
          }}
        >
          {/* Background Branding Accent */}
          <div
            className="absolute top-0 left-0 w-full h-1 opacity-80"
            style={{ backgroundColor: activeStation.color || '#2d3f89' }}
          />

          {/* Hidden 1×1 iframe mount point */}
          <div className="absolute top-0 left-0 w-px h-px overflow-hidden opacity-0 pointer-events-none">
            <div id={`yt-player-${widget.id}`} />
          </div>

          {/* Album art + Controls */}
          <div
            className="relative shrink-0 group"
            style={{
              width: 'min(160px, 85cqh, 80cqw)',
              height: 'min(160px, 85cqh, 80cqw)',
            }}
          >
            {activeStation.thumbnail ? (
              <img
                src={activeStation.thumbnail}
                alt={activeStation.title}
                className={`w-full h-full rounded-2xl object-cover shadow-2xl transition-all duration-500 group-hover:scale-105 ${isPlaying ? 'animate-pulse-slow' : ''}`}
                style={{
                  border: `min(2px, 0.5cqmin) solid ${activeStation.color || '#e2e8f0'}22`,
                }}
              />
            ) : (
              <div
                className={`w-full h-full rounded-2xl flex items-center justify-center shadow-2xl ${
                  isTransparent ? 'bg-slate-800/50' : 'bg-slate-50'
                }`}
                style={{
                  border: `min(2px, 0.5cqmin) solid ${activeStation.color || '#e2e8f0'}44`,
                }}
              >
                <Music
                  className={
                    isTransparent ? 'text-slate-400' : 'text-slate-300'
                  }
                  style={{
                    width: 'min(48px, 20cqmin)',
                    height: 'min(48px, 20cqmin)',
                  }}
                />
              </div>
            )}

            {/* Play/Pause overlay - Scaled to thumbnail */}
            <div
              className={`absolute inset-0 rounded-2xl flex items-center justify-center transition-all duration-300 cursor-pointer ${
                isPlaying
                  ? 'bg-black/0 hover:bg-black/20 opacity-0 hover:opacity-100'
                  : 'bg-black/10 opacity-100'
              }`}
              onClick={togglePlay}
            >
              {!isPlayerReady ? (
                <div
                  className="bg-white/90 rounded-full shadow-xl backdrop-blur-sm flex items-center justify-center"
                  style={{
                    width: '30%',
                    height: '30%',
                  }}
                >
                  <div
                    className="border-t-indigo-500 rounded-full animate-spin"
                    style={{
                      width: '60%',
                      height: '60%',
                      borderWidth: 'min(3px, 0.8cqmin)',
                      borderColor: '#e2e8f0',
                      borderTopColor: '#6366f1',
                    }}
                  />
                </div>
              ) : (
                <div
                  className="bg-white/90 rounded-full shadow-xl backdrop-blur-sm transform transition-transform active:scale-90 flex items-center justify-center"
                  style={{
                    width: '30%',
                    height: '30%',
                  }}
                >
                  {isPlaying ? (
                    <Pause
                      className="text-slate-900 fill-current"
                      style={{ width: '50%', height: '50%' }}
                    />
                  ) : (
                    <Play
                      className="text-slate-900 fill-current"
                      style={{ width: '50%', height: '50%', marginLeft: '10%' }}
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Station info */}
          <div className="flex-1 flex flex-col items-center [@container(orientation:landscape)]:items-start min-w-0">
            <div
              className="flex items-center justify-center [@container(orientation:landscape)]:justify-start w-full"
              style={{ gap: 'min(8px, 2.5cqmin)' }}
            >
              <h3
                className="font-black truncate max-w-[90%]"
                style={{
                  fontSize: 'min(32px, 35cqh, 12cqw)',
                  lineHeight: 1.1,
                  color: textColor,
                }}
              >
                {activeStation.title}
              </h3>
              {config.syncWithTimeTool && (
                <Link
                  className="shrink-0"
                  style={{
                    width: 'min(20px, 20cqh, 6cqw)',
                    height: 'min(20px, 20cqh, 6cqw)',
                    color: textColor === '#ffffff' ? '#ffffff' : '#6366f1',
                    opacity: textColor === '#ffffff' ? 0.8 : 1,
                  }}
                  aria-label="Synced with Time Tool"
                />
              )}
            </div>
            <p
              className="font-bold truncate max-w-[85%]"
              style={{
                fontSize: 'min(18px, 25cqh, 9cqw)',
                marginTop: 'min(4px, 1cqh, 1cqw)',
                opacity: 0.7,
                color: textColor,
              }}
            >
              {activeStation.channel}
            </p>

            {/* Status indicator for wide view */}
            {isPlayerReady && (
              <div
                className="hidden [@container(orientation:landscape)]:flex items-center gap-2"
                style={{ marginTop: 'min(8px, 2cqh)' }}
              >
                <div
                  className={`rounded-full ${isPlaying ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`}
                  style={{ width: 'min(6px, 8cqh)', height: 'min(6px, 8cqh)' }}
                />
                <span
                  className="font-black uppercase tracking-widest opacity-40"
                  style={{ color: textColor, fontSize: 'min(9px, 12cqh)' }}
                >
                  {isPlaying ? 'Now Playing' : 'Paused'}
                </span>
              </div>
            )}
          </div>
        </div>
      }
    />
  );
};
