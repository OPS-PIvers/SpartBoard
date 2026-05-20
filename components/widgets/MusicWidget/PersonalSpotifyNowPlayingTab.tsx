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
import {
  Music2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { spotifyOpenUrlFromInput } from '@/utils/spotifyAuth';
import { SpotifyPlaybackTrack } from '@/hooks/useSpotifyWebPlayback';
import { buildSpotifyEmbedUrl } from './utils';

export interface PersonalSpotifyNowPlayingProps {
  url: string | null;
  thumbnail?: string;
  label?: string;
  isPremium: boolean;
  sdkFailed: boolean;
  /** Device-connected signal from the hook (ready event fired). */
  isReady: boolean;
  currentTrack: SpotifyPlaybackTrack | null;
  isPlaying: boolean;
  /** Current repeat mode: 0 = off, 1 = repeat-context, 2 = repeat-track. */
  repeatMode: number;
  /** Native Spotify shuffle on/off. */
  shuffle: boolean;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onCycleRepeat: () => void;
  onToggleShuffle: () => void;
  onSwitchToLibrary: () => void;
}

export const PersonalSpotifyNowPlayingTab: React.FC<
  PersonalSpotifyNowPlayingProps
> = ({
  url,
  thumbnail,
  label,
  isPremium,
  sdkFailed,
  isReady,
  currentTrack,
  isPlaying,
  repeatMode,
  shuffle,
  onTogglePlay,
  onNext,
  onPrevious,
  onCycleRepeat,
  onToggleShuffle,
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

  return (
    <div className="w-full h-full rounded-2xl overflow-hidden relative bg-gradient-to-br from-slate-900 via-slate-800 to-green-950 flex flex-col">
      <div
        className="flex-1 min-h-0 flex flex-col items-center justify-center text-center"
        style={{
          padding: 'min(16px, 5cqmin)',
          gap: 'min(12px, 4cqmin)',
        }}
      >
        {/* Album art lives in a flex-1 min-h-0 region so it shrinks to whatever
            vertical space is left (e.g. when the tab bar appears) instead of
            overflowing and clipping the transport row below. */}
        <div className="flex-1 min-h-0 w-full flex items-center justify-center">
          {displayImage ? (
            <img
              src={displayImage}
              alt=""
              className="rounded-xl object-contain shadow-2xl"
              style={{
                width: 'min(140px, 38cqh)',
                height: 'min(140px, 38cqh)',
                maxWidth: '100%',
                maxHeight: '100%',
              }}
            />
          ) : (
            <div
              className="rounded-xl bg-slate-700 flex items-center justify-center shadow-2xl"
              style={{
                width: 'min(140px, 38cqh)',
                height: 'min(140px, 38cqh)',
                maxWidth: '100%',
                maxHeight: '100%',
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
        </div>
        {/* Title + transport stay shrink-0 so they are never pushed off / clipped. */}
        <div className="w-full shrink-0">
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
        <div
          className="flex items-center shrink-0"
          style={{ gap: 'min(16px, 6cqmin)' }}
        >
          <button
            type="button"
            onClick={onToggleShuffle}
            disabled={!isReady}
            aria-label="Shuffle"
            aria-pressed={shuffle}
            className={`rounded-full flex items-center justify-center transition disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/70 ${
              shuffle
                ? 'text-green-400 hover:text-green-300'
                : 'text-slate-400 hover:text-white'
            }`}
            style={{
              width: 'min(30px, 11cqmin)',
              height: 'min(30px, 11cqmin)',
            }}
          >
            <Shuffle style={{ width: '70%', height: '70%' }} />
          </button>
          <button
            type="button"
            onClick={onPrevious}
            disabled={!isReady}
            aria-label="Previous"
            className="rounded-full text-white/90 hover:text-white flex items-center justify-center transition disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/70"
            style={{
              width: 'min(36px, 13cqmin)',
              height: 'min(36px, 13cqmin)',
            }}
          >
            <SkipBack
              className="fill-current"
              style={{ width: '70%', height: '70%' }}
            />
          </button>
          <button
            type="button"
            onClick={onTogglePlay}
            disabled={!isReady}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="rounded-full bg-white/90 hover:bg-white text-slate-900 flex items-center justify-center shadow-xl transition disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/70"
            style={{
              width: 'min(56px, 20cqmin)',
              height: 'min(56px, 20cqmin)',
            }}
          >
            {isPlaying ? (
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
          <button
            type="button"
            onClick={onNext}
            disabled={!isReady}
            aria-label="Next"
            className="rounded-full text-white/90 hover:text-white flex items-center justify-center transition disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/70"
            style={{
              width: 'min(36px, 13cqmin)',
              height: 'min(36px, 13cqmin)',
            }}
          >
            <SkipForward
              className="fill-current"
              style={{ width: '70%', height: '70%' }}
            />
          </button>
          <button
            type="button"
            onClick={onCycleRepeat}
            disabled={!isReady}
            aria-label="Repeat"
            aria-pressed={repeatMode !== 0}
            className={`rounded-full flex items-center justify-center transition disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/70 ${
              repeatMode !== 0
                ? 'text-green-400 hover:text-green-300'
                : 'text-slate-400 hover:text-white'
            }`}
            style={{
              width: 'min(30px, 11cqmin)',
              height: 'min(30px, 11cqmin)',
            }}
          >
            {repeatMode === 2 ? (
              <Repeat1 style={{ width: '70%', height: '70%' }} />
            ) : (
              <Repeat style={{ width: '70%', height: '70%' }} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Free-tier / SDK-failure embed fallback
// ---------------------------------------------------------------------------

const EmbedFallback: React.FC<{ url: string; title?: string }> = ({
  url,
  title,
}) => (
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
);
