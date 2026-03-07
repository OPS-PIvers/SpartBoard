import React, { useState, useEffect, useRef } from 'react';
import { Link, Music, Pause, Play, Radio } from 'lucide-react';
import { WidgetData, MusicConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useMusicStations } from '@/hooks/useMusicStations';
import { ScaledEmptyState } from '../common/ScaledEmptyState';
import { Toggle } from '../common/Toggle';
import { WidgetLayout } from './WidgetLayout';

// ---------------------------------------------------------------------------
// YouTube IFrame API singleton
// Prevents collision when multiple MusicWidgets are mounted simultaneously.
// ---------------------------------------------------------------------------

let ytApiLoaded = false;
const ytPendingCallbacks: (() => void)[] = [];

const loadYouTubeApi = (callback: () => void) => {
  if (ytApiLoaded && window.YT?.Player) {
    callback();
    return;
  }
  ytPendingCallbacks.push(callback);
  if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  }
  window.onYouTubeIframeAPIReady = () => {
    ytApiLoaded = true;
    ytPendingCallbacks.splice(0).forEach((cb) => cb());
  };
};

const extractYouTubeId = (url: string): string | null => {
  const m = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&]{11})/
  );
  return m ? m[1] : null;
};

const buildSpotifyEmbedUrl = (url: string): string => {
  if (url.includes('/embed/')) return url;
  return url.replace('spotify.com/', 'spotify.com/embed/');
};

// ---------------------------------------------------------------------------
// MusicWidget — front face
// ---------------------------------------------------------------------------

export const MusicWidget: React.FC<{ widget: WidgetData }> = ({ widget }) => {
  const { activeDashboard } = useDashboard();
  const config = widget.config as MusicConfig;
  const { stations } = useMusicStations();
  const [isPlaying, setIsPlaying] = useState(false);
  const playerRef = useRef<YTPlayer | null>(null);

  // Nexus connection: watch Time Tool running state
  const widgets = activeDashboard?.widgets ?? [];
  const timeToolWidget = widgets.find((w) => w.type === 'time-tool');
  const isTimeToolRunning = (
    timeToolWidget?.config as { isRunning?: boolean } | undefined
  )?.isRunning;

  const activeStation = stations.find((s) => s.id === config.stationId);
  const youtubeId = activeStation ? extractYouTubeId(activeStation.url) : null;
  const isSpotify = activeStation?.url.includes('spotify.com') ?? false;

  // YouTube player init / teardown
  useEffect(() => {
    if (!youtubeId) return;

    let destroyed = false;

    loadYouTubeApi(() => {
      if (destroyed) return;
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
          onStateChange: (event) => {
            if (!destroyed) setIsPlaying(event.data === 1);
          },
        },
      });
    });

    return () => {
      destroyed = true;
      if (playerRef.current?.destroy) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      setIsPlaying(false);
    };
  }, [youtubeId, widget.id]);

  // Nexus sync: play/pause with Time Tool
  useEffect(() => {
    if (!config.syncWithTimeTool || !youtubeId) return;
    if (typeof playerRef.current?.playVideo !== 'function') return;
    if (isTimeToolRunning) {
      playerRef.current.playVideo();
    } else {
      playerRef.current.pauseVideo();
    }
  }, [isTimeToolRunning, config.syncWithTimeTool, youtubeId]);

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

  // Spotify fallback — embed iframe (cannot be API-controlled cross-origin)
  if (isSpotify) {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <div className="w-full h-full overflow-hidden rounded-2xl">
            <iframe
              src={buildSpotifyEmbedUrl(activeStation.url)}
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

  // YouTube chromeless player
  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div className="w-full h-full bg-slate-900 rounded-2xl flex items-center px-3 gap-3 overflow-hidden relative shadow-inner">
          {/* Hidden 1×1 iframe mount point */}
          <div className="absolute top-0 left-0 w-px h-px overflow-hidden opacity-0 pointer-events-none">
            <div id={`yt-player-${widget.id}`} />
          </div>

          {/* Album art */}
          {activeStation.thumbnail ? (
            <img
              src={activeStation.thumbnail}
              alt={activeStation.title}
              className="w-12 h-12 rounded-lg object-cover shadow-md shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
              <Music className="w-5 h-5 text-slate-500" />
            </div>
          )}

          {/* Station info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-white text-sm font-bold truncate">
                {activeStation.title}
              </h3>
              {config.syncWithTimeTool && (
                <Link
                  className="w-3 h-3 text-indigo-400 shrink-0"
                  aria-label="Synced with Time Tool"
                />
              )}
            </div>
            <p className="text-slate-400 text-xs truncate">
              {activeStation.channel}
            </p>
          </div>

          {/* Play / Pause */}
          <button
            onClick={togglePlay}
            className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-slate-900 hover:scale-105 transition-transform shadow-lg shrink-0 mr-1"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current ml-0.5" />
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
  const isSpotify = activeStation?.url.includes('spotify.com') ?? false;

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
                  onClick={() =>
                    updateWidget(widget.id, {
                      config: { ...config, stationId: station.id },
                    })
                  }
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
    YT: {
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
    onYouTubeIframeAPIReady: () => void;
  }
}
