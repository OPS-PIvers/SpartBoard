import React, { useState, useEffect, useRef } from 'react';
import { Link, Music, Pause, Play, Radio } from 'lucide-react';
import { WidgetData, MusicConfig, TimeToolConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useMusicStations } from '@/hooks/useMusicStations';
import { ScaledEmptyState } from '../common/ScaledEmptyState';
import { Toggle } from '../common/Toggle';
import { WidgetLayout } from './WidgetLayout';

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
    if (typeof playerRef.current?.playVideo !== 'function') return;
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
          <div className="w-full h-full overflow-hidden rounded-2xl">
            <iframe
              src={spotifyEmbedUrl}
              title={`Spotify: ${activeStation.title}`}
              width="100%"
              height="100%"
              allow="encrypted-media"
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

  // YouTube chromeless player
  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          className="w-full h-full bg-slate-900 rounded-2xl flex items-center overflow-hidden relative shadow-inner"
          style={{ padding: '0 min(12px, 3cqmin)', gap: 'min(12px, 3cqmin)' }}
        >
          {/* Hidden 1×1 iframe mount point */}
          <div className="absolute top-0 left-0 w-px h-px overflow-hidden opacity-0 pointer-events-none">
            <div id={`yt-player-${widget.id}`} />
          </div>

          {/* Album art */}
          {activeStation.thumbnail ? (
            <img
              src={activeStation.thumbnail}
              alt={activeStation.title}
              className="rounded-lg object-cover shadow-md shrink-0"
              style={{
                width: 'min(48px, 12cqmin)',
                height: 'min(48px, 12cqmin)',
              }}
            />
          ) : (
            <div
              className="rounded-lg bg-slate-800 flex items-center justify-center shrink-0"
              style={{
                width: 'min(48px, 12cqmin)',
                height: 'min(48px, 12cqmin)',
              }}
            >
              <Music
                className="text-slate-500"
                style={{
                  width: 'min(20px, 5cqmin)',
                  height: 'min(20px, 5cqmin)',
                }}
              />
            </div>
          )}

          {/* Station info */}
          <div className="flex-1 min-w-0">
            <div
              className="flex items-center"
              style={{ gap: 'min(6px, 1.5cqmin)' }}
            >
              <h3
                className="text-white font-bold truncate"
                style={{ fontSize: 'min(14px, 5.5cqmin)' }}
              >
                {activeStation.title}
              </h3>
              {config.syncWithTimeTool && (
                <Link
                  className="text-indigo-400 shrink-0"
                  style={{
                    width: 'min(12px, 3cqmin)',
                    height: 'min(12px, 3cqmin)',
                  }}
                  aria-label="Synced with Time Tool"
                />
              )}
            </div>
            <p
              className="text-slate-400 truncate"
              style={{ fontSize: 'min(12px, 4.5cqmin)' }}
            >
              {activeStation.channel}
            </p>
          </div>

          {/* Play / Pause */}
          <button
            onClick={togglePlay}
            className="bg-white rounded-full flex items-center justify-center text-slate-900 hover:scale-105 transition-transform shadow-lg shrink-0"
            style={{
              width: 'min(40px, 10cqmin)',
              height: 'min(40px, 10cqmin)',
              marginRight: 'min(4px, 1cqmin)',
            }}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause
                className="fill-current"
                style={{
                  width: 'min(20px, 5cqmin)',
                  height: 'min(20px, 5cqmin)',
                }}
              />
            ) : (
              <Play
                className="fill-current"
                style={{
                  width: 'min(20px, 5cqmin)',
                  height: 'min(20px, 5cqmin)',
                  marginLeft: 'min(2px, 0.5cqmin)',
                }}
              />
            )}
          </button>
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

  const activeStation = stations.find((s) => s.id === config.stationId);
  const isSpotify = activeStation?.url
    ? buildSpotifyEmbedUrl(activeStation.url) !== null
    : false;

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
          <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
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
          playerVars?: Record<string, number>;
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
