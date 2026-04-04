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
} from '@/utils/youtube';

// ---------------------------------------------------------------------------
// Shared play/pause overlay button
// ---------------------------------------------------------------------------

interface PlayButtonProps {
  isPlayerReady: boolean;
  isPlaying: boolean;
  onClick: () => void;
  /** Size of the button as a CSS dimension string, e.g. "30%" or "min(56px, 18cqmin)" */
  size?: string;
}

const PlayButton: React.FC<PlayButtonProps> = ({
  isPlayerReady,
  isPlaying,
  onClick,
  size = '30%',
}) => {
  const handleClick = (e: React.MouseEvent) => {
    // Stop bubbling so a parent overlay with the same onClick doesn't fire twice.
    e.stopPropagation();
    onClick();
  };

  return (
    <button
      type="button"
      aria-label={isPlaying ? 'Pause' : 'Play'}
      className="rounded-full shadow-xl backdrop-blur-sm bg-white/90 flex items-center justify-center transform transition-transform active:scale-90"
      style={{ width: size, height: size }}
      onClick={handleClick}
    >
      {!isPlayerReady ? (
        <div
          className="rounded-full animate-spin"
          style={{
            width: '60%',
            height: '60%',
            borderWidth: 'min(3px, 0.8cqmin)',
            borderColor: '#e2e8f0',
            borderTopColor: '#6366f1',
            borderStyle: 'solid',
          }}
        />
      ) : isPlaying ? (
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
    </button>
  );
};

// ---------------------------------------------------------------------------
// MusicWidget — front face
// ---------------------------------------------------------------------------

export const MusicWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { activeDashboard } = useDashboard();
  const config = widget.config as MusicConfig;
  const {
    bgColor = '#ffffff',
    textColor = STANDARD_COLORS.slate,
    layout = 'default',
  } = config;
  const { stations } = useMusicStations();
  const [isPlaying, setIsPlaying] = useState(false);
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

  // Nexus sync: play/pause with Time Tool
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

  // ---------- empty / unsupported states ----------

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

  // Hidden YouTube player mount point (shared across all layouts)
  const hiddenPlayer = (
    <div className="absolute top-0 left-0 w-px h-px overflow-hidden opacity-0 pointer-events-none">
      <div id={`yt-player-${widget.id}`} />
    </div>
  );

  const isTransparent = bgColor === 'transparent';

  // ---------- YouTube layouts (Consolidated to ensure DOM stability) ----------
  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          className={`w-full h-full rounded-2xl overflow-hidden relative select-none transition-all duration-500 ${
            layout === 'default' && !isTransparent ? 'shadow-inner' : ''
          }`}
          style={{
            backgroundColor: layout === 'minimal' ? undefined : bgColor,
          }}
        >
          {/* Hidden YouTube player mount point (Keep at top for stability) */}
          {hiddenPlayer}

          {layout === 'minimal' ? (
            <div className="w-full h-full relative overflow-hidden">
              {/* Background thumbnail */}
              {activeStation.thumbnail ? (
                <img
                  src={activeStation.thumbnail}
                  alt={activeStation.title}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ backgroundColor: bgColor }}
                >
                  <Music
                    className="text-slate-300"
                    style={{
                      width: 'min(64px, 25cqmin)',
                      height: 'min(64px, 25cqmin)',
                    }}
                  />
                </div>
              )}

              {/* Darken overlay while playing */}
              <div
                className={`absolute inset-0 transition-opacity duration-500 ${isPlaying ? 'opacity-10' : 'opacity-20'} bg-black`}
              />

              {/* Centered play/pause button */}
              <div className="absolute inset-0 flex items-center justify-center">
                <PlayButton
                  isPlayerReady={isPlayerReady}
                  isPlaying={isPlaying}
                  onClick={togglePlay}
                  size="min(56px, 40cqh)"
                />
              </div>

              {/* Gradient + title overlay at bottom */}
              <div
                className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent"
                style={{
                  padding: 'min(20px, 15cqh) min(12px, 4cqw) min(10px, 8cqh)',
                }}
              >
                <p
                  className="font-black truncate leading-tight text-white"
                  style={{ fontSize: 'min(16px, 12cqh)' }}
                >
                  {activeStation.title}
                </p>
                <p
                  className="truncate text-white/70 font-medium"
                  style={{
                    fontSize: 'min(12px, 9cqh)',
                    marginTop: 'min(2px, 1cqh)',
                  }}
                >
                  {activeStation.channel}
                </p>
              </div>
            </div>
          ) : layout === 'small' ? (
            <div
              className={`w-full h-full flex flex-row items-center px-2 relative ${!isTransparent ? 'shadow-inner' : ''}`}
              style={{
                gap: 'min(10px, 7cqh)',
                padding: 'min(8px, 6cqh)',
              }}
            >
              {/* Top accent bar */}
              <div
                className="absolute top-0 left-0 w-full h-0.5 opacity-80"
                style={{ backgroundColor: activeStation.color || '#2d3f89' }}
              />

              {/* Thumbnail with play button overlay */}
              <div
                className="relative shrink-0 group"
                style={{
                  width: 'min(56px, 70cqh)',
                  height: 'min(56px, 70cqh)',
                }}
              >
                {activeStation.thumbnail ? (
                  <img
                    src={activeStation.thumbnail}
                    alt={activeStation.title}
                    className={`w-full h-full rounded-xl object-cover shadow-lg transition-all duration-500 ${isPlaying ? 'animate-pulse-slow' : ''}`}
                  />
                ) : (
                  <div
                    className={`w-full h-full rounded-xl flex items-center justify-center shadow-lg ${isTransparent ? 'bg-slate-800/50' : 'bg-slate-50'}`}
                  >
                    <Music
                      className={
                        isTransparent ? 'text-slate-400' : 'text-slate-300'
                      }
                      style={{ width: '50%', height: '50%' }}
                    />
                  </div>
                )}
                {/* Play/pause overlay on thumbnail */}
                <div
                  className={`absolute inset-0 rounded-xl flex items-center justify-center transition-all duration-300 ${
                    isPlaying
                      ? 'bg-black/0 opacity-0 hover:bg-black/20 hover:opacity-100'
                      : 'bg-black/10 opacity-100'
                  }`}
                  onClick={togglePlay}
                >
                  <PlayButton
                    isPlayerReady={isPlayerReady}
                    isPlaying={isPlaying}
                    onClick={togglePlay}
                    size="40%"
                  />
                </div>
              </div>

              {/* Station info — scrolling title */}
              <div className="flex-1 flex flex-col justify-center min-w-0 overflow-hidden">
                <div className="overflow-hidden relative">
                  <p
                    className={`font-black whitespace-nowrap ${isPlaying ? 'animate-marquee' : 'truncate'}`}
                    style={{
                      fontSize: 'min(15px, 14cqh)',
                      lineHeight: 1.2,
                      color: textColor,
                    }}
                  >
                    {activeStation.title}
                    {/* Duplicate for seamless scroll */}
                    {isPlaying && (
                      <span aria-hidden className="ml-8">
                        {activeStation.title}
                      </span>
                    )}
                  </p>
                </div>
                <p
                  className="truncate font-bold"
                  style={{
                    fontSize: 'min(11px, 10cqh)',
                    marginTop: 'min(2px, 1.5cqh)',
                    opacity: 0.65,
                    color: textColor,
                  }}
                >
                  {activeStation.channel}
                </p>
                {/* Status dot */}
                {isPlayerReady && (
                  <div
                    className="flex items-center"
                    style={{
                      gap: 'min(4px, 3cqh)',
                      marginTop: 'min(3px, 2.5cqh)',
                    }}
                  >
                    <div
                      className={`rounded-full ${isPlaying ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`}
                      style={{
                        width: 'min(5px, 4cqh)',
                        height: 'min(5px, 4cqh)',
                      }}
                    />
                    <span
                      className="font-black uppercase tracking-widest opacity-40"
                      style={{
                        color: textColor,
                        fontSize: 'min(9px, 8cqh)',
                      }}
                    >
                      {isPlaying ? 'Now Playing' : 'Paused'}
                    </span>
                  </div>
                )}
              </div>

              {/* Sync icon */}
              {config.syncWithTimeTool && (
                <Link
                  className="shrink-0"
                  style={{
                    width: 'min(14px, 11cqh)',
                    height: 'min(14px, 11cqh)',
                    color: textColor === '#ffffff' ? '#ffffff' : '#6366f1',
                    opacity: 0.8,
                  }}
                  aria-label="Synced with Time Tool"
                />
              )}
            </div>
          ) : (
            <div
              className="w-full h-full flex flex-col [@container(orientation:landscape)]:flex-row items-center justify-center text-center [@container(orientation:landscape)]:text-left"
              style={{
                padding: 'min(12px, 3cqh, 4cqw)',
                gap: 'min(16px, 8cqh, 5cqw)',
              }}
            >
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

                {/* Play/Pause overlay */}
                <div
                  className={`absolute inset-0 rounded-2xl flex items-center justify-center transition-all duration-300 cursor-pointer ${
                    isPlaying
                      ? 'bg-black/0 hover:bg-black/20 opacity-0 hover:opacity-100'
                      : 'bg-black/10 opacity-100'
                  }`}
                  onClick={togglePlay}
                >
                  <PlayButton
                    isPlayerReady={isPlayerReady}
                    isPlaying={isPlaying}
                    onClick={togglePlay}
                    size="30%"
                  />
                </div>
              </div>

              {/* Station info */}
              <div className="flex-1 flex flex-col items-center [@container(orientation:landscape)]:items-start min-w-0">
                <div
                  className="flex items-center justify-center [@container(orientation:landscape)]:justify-start w-full overflow-hidden"
                  style={{ gap: 'min(8px, 2.5cqmin)' }}
                >
                  <div className="overflow-hidden min-w-0 flex-1">
                    <h3
                      className={`font-black ${isPlaying ? 'animate-marquee whitespace-nowrap' : 'truncate'}`}
                      style={{
                        fontSize: 'min(32px, 35cqh, 12cqw)',
                        lineHeight: 1.1,
                        color: textColor,
                      }}
                    >
                      {activeStation.title}
                      {isPlaying && (
                        <span aria-hidden className="ml-8">
                          {activeStation.title}
                        </span>
                      )}
                    </h3>
                  </div>
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
                      style={{
                        width: 'min(6px, 8cqh)',
                        height: 'min(6px, 8cqh)',
                      }}
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
          )}
        </div>
      }
    />
  );
};
