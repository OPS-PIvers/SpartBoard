import React, { useState, useEffect, useRef } from 'react';
import { Link, Music, Palette, Pause, Play, Radio } from 'lucide-react';
import { WidgetData, MusicConfig, TimeToolConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useMusicStations } from '@/hooks/useMusicStations';
import { ScaledEmptyState } from '../common/ScaledEmptyState';
import { Toggle } from '../common/Toggle';
import { WidgetLayout } from './WidgetLayout';
import { WIDGET_PALETTE, STANDARD_COLORS } from '@/config/colors';
import { SettingsLabel } from '../common/SettingsLabel';

// ---------------------------------------------------------------------------
// YouTube IFrame API singleton
// Prevents collision when multiple MusicWidgets are mounted simultaneously.
// ---------------------------------------------------------------------------

// Use window.YT?.Player as the source of truth so the widget initialises
// correctly if the API script was already loaded before this module ran.
const ytPendingCallbacks: (() => void)[] = [];

const loadYouTubeApi = (callback: () => void) => {
  if (window.YT?.Player) {
    callback();
    return;
  }
  ytPendingCallbacks.push(callback);
  if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
    const previousHandler = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previousHandler === 'function') previousHandler();
      ytPendingCallbacks.splice(0).forEach((cb) => cb());
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  }
};

const extractYouTubeId = (url: string): string | null => {
  const m = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&]{11})/
  );
  return m ? m[1] : null;
};

// Returns the Spotify embed URL, or null if the URL is not a valid https
// Spotify URL. This prevents javascript: and other scheme injection into
// the iframe src.
const buildSpotifyEmbedUrl = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (
      parsed.protocol !== 'https:' ||
      (hostname !== 'spotify.com' && !hostname.endsWith('.spotify.com'))
    ) {
      return null;
    }
    if (parsed.pathname.startsWith('/embed/')) return parsed.toString();
    parsed.pathname = `/embed${parsed.pathname}`;
    return parsed.toString();
  } catch {
    return null;
  }
};

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
          className={`w-full h-full rounded-2xl flex flex-col items-center justify-center text-center overflow-hidden relative select-none ${
            !isTransparent ? 'shadow-inner' : ''
          }`}
          style={{
            padding: 'min(24px, 7cqmin)',
            gap: 'min(16px, 5cqmin)',
            backgroundColor: bgColor,
          }}
        >
          {/* Background Branding Accent */}
          <div
            className="absolute top-0 left-0 w-full h-1.5 opacity-80"
            style={{ backgroundColor: activeStation.color || '#2d3f89' }}
          />

          {/* Hidden 1×1 iframe mount point */}
          <div className="absolute top-0 left-0 w-px h-px overflow-hidden opacity-0 pointer-events-none">
            <div id={`yt-player-${widget.id}`} />
          </div>

          {/* Album art */}
          <div className="relative shrink-0 group">
            {activeStation.thumbnail ? (
              <img
                src={activeStation.thumbnail}
                alt={activeStation.title}
                className="rounded-3xl object-cover shadow-2xl transition-all duration-500 group-hover:scale-105 group-hover:rotate-1"
                style={{
                  width: 'min(160px, 48cqmin)',
                  height: 'min(160px, 48cqmin)',
                  border: `min(4px, 1cqmin) solid ${activeStation.color || '#e2e8f0'}22`,
                }}
              />
            ) : (
              <div
                className={`rounded-3xl flex items-center justify-center shadow-2xl ${
                  isTransparent ? 'bg-slate-800/50' : 'bg-slate-50'
                }`}
                style={{
                  width: 'min(160px, 48cqmin)',
                  height: 'min(160px, 48cqmin)',
                  border: `min(4px, 1cqmin) solid ${activeStation.color || '#e2e8f0'}44`,
                }}
              >
                <Music
                  className={
                    isTransparent ? 'text-slate-400' : 'text-slate-300'
                  }
                  style={{
                    width: 'min(64px, 20cqmin)',
                    height: 'min(64px, 20cqmin)',
                  }}
                />
              </div>
            )}

            {/* Play overlay on image */}
            {!isPlaying && isPlayerReady && (
              <div
                className="absolute inset-0 bg-black/10 rounded-3xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                onClick={togglePlay}
              >
                <div className="bg-white/90 rounded-full p-4 shadow-xl backdrop-blur-sm">
                  <Play className="text-slate-900 fill-current w-8 h-8 ml-1" />
                </div>
              </div>
            )}
          </div>

          {/* Station info */}
          <div className="w-full flex flex-col items-center min-w-0">
            <div
              className="flex items-center justify-center w-full"
              style={{ gap: 'min(10px, 2.5cqmin)' }}
            >
              <h3
                className="font-black truncate max-w-[90%]"
                style={{
                  fontSize: 'min(36px, 11cqmin)',
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
                    width: 'min(24px, 6cqmin)',
                    height: 'min(24px, 6cqmin)',
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
                fontSize: 'min(22px, 6.5cqmin)',
                marginTop: 'min(4px, 1cqmin)',
                opacity: 0.7,
                color: textColor,
              }}
            >
              {activeStation.channel}
            </p>
          </div>

          {/* Play / Pause / Loading */}
          <div
            className="flex items-center justify-center shrink-0 w-full"
            style={{ marginTop: 'min(8px, 1cqmin)' }}
          >
            {!isPlayerReady ? (
              <div
                className="animate-pulse font-black uppercase tracking-[0.2em]"
                style={{
                  fontSize: 'min(12px, 3.5cqmin)',
                  color: textColor,
                  opacity: 0.5,
                }}
              >
                Initialising...
              </div>
            ) : (
              <button
                onClick={togglePlay}
                className="rounded-full flex items-center justify-center transition-all active:scale-90 shadow-xl group/btn"
                style={{
                  width: 'min(80px, 24cqmin)',
                  height: 'min(80px, 24cqmin)',
                  backgroundColor: isPlaying
                    ? isTransparent
                      ? '#ffffff22'
                      : '#f1f5f9'
                    : activeStation.color || '#2d3f89',
                  color: isPlaying
                    ? isTransparent
                      ? '#ffffff'
                      : '#475569'
                    : 'white',
                  border:
                    isTransparent && isPlaying ? '1px solid #ffffff44' : 'none',
                }}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <Pause
                    className="fill-current transition-transform group-hover/btn:scale-110"
                    style={{
                      width: 'min(36px, 11cqmin)',
                      height: 'min(36px, 11cqmin)',
                    }}
                  />
                ) : (
                  <Play
                    className="fill-current transition-transform group-hover/btn:scale-110"
                    style={{
                      width: 'min(36px, 11cqmin)',
                      height: 'min(36px, 11cqmin)',
                      marginLeft: 'min(6px, 1.5cqmin)',
                    }}
                  />
                )}
              </button>
            )}
          </div>
        </div>
      }
    />
  );
};

// ---------------------------------------------------------------------------
// MusicSettings — back face
// ---------------------------------------------------------------------------

export const MusicSettings: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as MusicConfig;
  const { stations, isLoading } = useMusicStations();

  const { bgColor = '#ffffff', textColor = STANDARD_COLORS.slate } = config;

  const activeStation = stations.find((s) => s.id === config.stationId);
  const isSpotify = activeStation?.url
    ? buildSpotifyEmbedUrl(activeStation.url) !== null
    : false;

  const bgColors = [
    { hex: '#ffffff', label: 'White' },
    { hex: '#f8fafc', label: 'Slate' },
    { hex: '#1e293b', label: 'Dark' },
    { hex: 'transparent', label: 'Transparent' },
  ];

  const textColors = [...WIDGET_PALETTE, '#ffffff'];

  return (
    <div className="space-y-5">
      {/* Station selector */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Select a Station
        </p>

        {isLoading ? (
          <p className="text-xs text-slate-400 animate-pulse">
            Loading stations...
          </p>
        ) : stations.length === 0 ? (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <p className="text-xs text-slate-500">
              No stations available. An admin needs to add them in Admin
              Settings.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
            {stations.map((station) => {
              const isActive = config.stationId === station.id;
              return (
                <button
                  key={station.id}
                  onClick={() => {
                    const selectedIsSpotify =
                      buildSpotifyEmbedUrl(station.url) !== null;
                    updateWidget(widget.id, {
                      config: {
                        ...config,
                        stationId: station.id,
                        ...(selectedIsSpotify && config.syncWithTimeTool
                          ? { syncWithTimeTool: false }
                          : {}),
                      },
                    });
                  }}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center ${
                    isActive
                      ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                      : 'border-slate-100 hover:border-slate-300 bg-white'
                  }`}
                >
                  {station.thumbnail ? (
                    <div
                      className="w-10 h-10 rounded-full bg-cover bg-center shadow-sm"
                      style={{ backgroundImage: `url(${station.thumbnail})` }}
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                      <Music className="w-4 h-4 text-slate-400" />
                    </div>
                  )}
                  <span className="text-xxs font-bold block w-full truncate text-slate-800">
                    {station.title}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Colors */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <SettingsLabel icon={Palette}>Background</SettingsLabel>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {bgColors.map((c) => (
              <button
                key={c.hex}
                onClick={() =>
                  updateWidget(widget.id, {
                    config: { ...config, bgColor: c.hex },
                  })
                }
                className={`w-6 h-6 rounded-full border-2 transition-all ${
                  bgColor === c.hex
                    ? 'border-indigo-500 scale-110 shadow-md'
                    : 'border-slate-200'
                } ${c.hex === 'transparent' ? 'bg-[url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAAXNSR0IArs4c6QAAACVJREFUGF5jYACC/wwMIAYDAwMIAIn///8DAxgDCAKEMDAwgAgABswNCv79YRAAAAAASUVORK5CYII=")]' : ''}`}
                style={{
                  backgroundColor: c.hex !== 'transparent' ? c.hex : undefined,
                }}
                title={c.label}
              />
            ))}
          </div>
        </div>
        <div>
          <SettingsLabel icon={Palette}>Text Color</SettingsLabel>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {textColors.map((c) => (
              <button
                key={c}
                onClick={() =>
                  updateWidget(widget.id, {
                    config: { ...config, textColor: c },
                  })
                }
                className={`w-6 h-6 rounded-full border-2 transition-all ${
                  textColor === c
                    ? 'border-indigo-500 scale-110 shadow-md'
                    : 'border-slate-200'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Nexus sync toggle */}
      <div className="pt-4 border-t border-slate-100">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">
            Sync with Time Tool
          </span>
          <Toggle
            checked={!!config.syncWithTimeTool}
            onChange={(checked) =>
              updateWidget(widget.id, {
                config: { ...config, syncWithTimeTool: checked },
              })
            }
            disabled={isSpotify}
            size="sm"
          />
        </div>
        <p className="text-xs text-slate-400 mt-1.5">
          {isSpotify
            ? 'Auto-sync is only available for YouTube stations due to Spotify browser restrictions.'
            : 'Music will automatically play and pause with your active Time Tool.'}
        </p>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Global type declarations for YouTube IFrame API
// ---------------------------------------------------------------------------

interface YTPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  destroy: () => void;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string,
        options: {
          height: string;
          width: string;
          videoId: string;
          playerVars?: Record<string, string | number | boolean>;
          events?: {
            onStateChange?: (event: { data: number }) => void;
            onReady?: () => void;
          };
        }
      ) => YTPlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}
