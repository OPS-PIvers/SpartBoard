/**
 * PersonalSpotifyNowPlayingTab — presentation-only "Now Playing" surface.
 *
 * The Spotify Web Playback SDK is NOT owned here. It lives in
 * useSpotifyWebPlayback (owned by PersonalSpotifyBrowser) so the playback
 * device survives tab switches. This component just renders the current
 * playback state it's handed and forwards play/pause to the hook.
 *
 * Render branches:
 *  - url null → empty state with "Open library" button.
 *  - Free tier OR sdkFailed → Spotify embed iframe (30-second previews).
 *  - else → SDK player surface (album art + track name + artist + play/pause).
 */

import React from 'react';
import { Loader2, Music2, Pause, Play } from 'lucide-react';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { spotifyOpenUrlFromInput } from '@/utils/spotifyAuth';
import { SpotifyPlaybackTrack } from '@/hooks/useSpotifyWebPlayback';
import { buildSpotifyEmbedUrl } from './utils';

interface Props {
  url: string | null;
  thumbnail?: string;
  label?: string;
  isPremium: boolean;
  sdkFailed: boolean;
  currentTrack: SpotifyPlaybackTrack | null;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSwitchToLibrary: () => void;
}

export const PersonalSpotifyNowPlayingTab: React.FC<Props> = ({
  url,
  thumbnail,
  label,
  isPremium,
  sdkFailed,
  currentTrack,
  isPlaying,
  onTogglePlay,
  onSwitchToLibrary,
}) => {
  // ── 1. Empty state ──────────────────────────────────────────────────────────
  if (!url) {
    return (
      <div
        className="flex flex-col items-center justify-center text-center h-full text-slate-400"
        style={{ padding: 'min(20px, 5cqmin)', fontSize: 'min(13px, 4cqmin)' }}
      >
        <div style={{ marginBottom: 'min(8px, 2cqmin)' }}>
          Pick something from your library or search to start.
        </div>
        <button
          type="button"
          onClick={onSwitchToLibrary}
          className="text-green-400 hover:text-green-300 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/70 rounded"
          style={{
            fontSize: 'min(12px, 3.5cqmin)',
            padding: 'min(2px, 0.5cqmin) min(4px, 1cqmin)',
          }}
        >
          Open library
        </button>
      </div>
    );
  }

  // ── 2. Free tier OR SDK failure → embed iframe ──────────────────────────────
  if (!isPremium || sdkFailed) {
    const openUrlForEmbed = spotifyOpenUrlFromInput(url);
    const embedUrl = openUrlForEmbed
      ? buildSpotifyEmbedUrl(openUrlForEmbed)
      : null;
    return embedUrl ? <EmbedFallback url={embedUrl} title={label} /> : null;
  }

  // ── 3. Premium + SDK OK → player surface ────────────────────────────────────
  const displayImage = currentTrack?.image ?? thumbnail;
  const displayName = currentTrack?.name ?? label ?? 'Spotify';
  const displayArtist = currentTrack?.artist ?? '';
  // No track has loaded yet (device still spinning up) — show a loading
  // affordance on the play button until the first state arrives.
  const isReady = currentTrack !== null;

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div className="w-full h-full rounded-2xl overflow-hidden relative bg-gradient-to-br from-slate-900 via-slate-800 to-green-950 flex flex-col">
          <div
            className="flex-1 flex flex-col items-center justify-center text-center"
            style={{
              padding: 'min(16px, 5cqmin)',
              gap: 'min(12px, 4cqmin)',
            }}
          >
            {displayImage ? (
              <img
                src={displayImage}
                alt=""
                className="rounded-xl object-cover shadow-2xl"
                style={{
                  width: 'min(140px, 50cqmin)',
                  height: 'min(140px, 50cqmin)',
                }}
              />
            ) : (
              <div
                className="rounded-xl bg-slate-700 flex items-center justify-center shadow-2xl"
                style={{
                  width: 'min(140px, 50cqmin)',
                  height: 'min(140px, 50cqmin)',
                }}
              >
                <Music2
                  className="text-slate-400"
                  style={{
                    width: 'min(48px, 20cqmin)',
                    height: 'min(48px, 20cqmin)',
                  }}
                />
              </div>
            )}
            <div className="w-full">
              <p
                className="font-black text-white truncate"
                style={{ fontSize: 'min(16px, 7cqmin)' }}
              >
                {displayName}
              </p>
              {displayArtist && (
                <p
                  className="font-medium text-white/70 truncate"
                  style={{
                    fontSize: 'min(12px, 5cqmin)',
                    marginTop: 'min(2px, 1cqmin)',
                  }}
                >
                  {displayArtist}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onTogglePlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="rounded-full bg-white/90 hover:bg-white text-slate-900 flex items-center justify-center shadow-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                width: 'min(56px, 20cqmin)',
                height: 'min(56px, 20cqmin)',
              }}
            >
              {!isReady ? (
                <Loader2
                  className="animate-spin"
                  style={{ width: '40%', height: '40%' }}
                />
              ) : isPlaying ? (
                <Pause
                  className="fill-current"
                  style={{ width: '40%', height: '40%' }}
                />
              ) : (
                <Play
                  className="fill-current"
                  style={{ width: '40%', height: '40%', marginLeft: '8%' }}
                />
              )}
            </button>
          </div>
        </div>
      }
    />
  );
};

// ---------------------------------------------------------------------------
// Free-tier / SDK-failure embed fallback
// ---------------------------------------------------------------------------

const EmbedFallback: React.FC<{ url: string; title?: string }> = ({
  url,
  title,
}) => (
  <WidgetLayout
    padding="p-0"
    content={
      <div className="w-full h-full overflow-hidden rounded-2xl bg-black">
        <iframe
          src={url}
          title={`Spotify: ${title ?? 'preview'}`}
          width="100%"
          height="100%"
          allow="encrypted-media; autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          className="border-none w-full h-full"
        />
      </div>
    }
  />
);
