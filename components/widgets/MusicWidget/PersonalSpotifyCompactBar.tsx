/**
 * PersonalSpotifyCompactBar — the personal-Spotify surface when the Music
 * widget is too small for the full 3-tab browse UI (tabs + lists would be
 * unusable below ~220px). Many teachers keep the Music widget shrunk and out
 * of the way, so at small sizes we collapse to a single now-playing strip:
 * artwork + title/artist + a play/pause control.
 *
 * Presentation-only — same contract as PersonalSpotifyNowPlayingTab. The SDK
 * lives in useSpotifyWebPlayback (owned by PersonalSpotifyBrowser).
 *
 * Branches:
 *  - Free tier OR sdkFailed → compact Spotify embed iframe (its own controls).
 *  - else → artwork + title + play/pause wired to the SDK.
 */

import React from 'react';
import { Music2, Pause, Play } from 'lucide-react';
import { spotifyOpenUrlFromInput } from '@/utils/spotifyAuth';
import { SpotifyPlaybackTrack } from '@/hooks/useSpotifyWebPlayback';
import { buildSpotifyEmbedUrl } from './utils';

interface Props {
  url: string | null;
  thumbnail?: string;
  label?: string;
  isPremium: boolean;
  sdkFailed: boolean;
  isReady: boolean;
  currentTrack: SpotifyPlaybackTrack | null;
  isPlaying: boolean;
  onTogglePlay: () => void;
}

export const PersonalSpotifyCompactBar: React.FC<Props> = ({
  url,
  thumbnail,
  label,
  isPremium,
  sdkFailed,
  isReady,
  currentTrack,
  isPlaying,
  onTogglePlay,
}) => {
  // Free tier / SDK failure → the embed iframe owns playback. Spotify's embed
  // auto-compacts to its mini player at small heights, so it fills the strip.
  if (url && (!isPremium || sdkFailed)) {
    const openUrl = spotifyOpenUrlFromInput(url);
    const embedUrl = openUrl ? buildSpotifyEmbedUrl(openUrl) : null;
    if (embedUrl) {
      return (
        <iframe
          src={embedUrl}
          title={label ?? 'Spotify'}
          className="w-full h-full border-0"
          allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"
          loading="lazy"
        />
      );
    }
  }

  const displayImage = currentTrack?.image ?? thumbnail;
  const displayName =
    currentTrack?.name ?? label ?? (url ? 'Spotify' : 'No music');
  const displayArtist = currentTrack?.artist ?? '';

  return (
    <div
      className="flex items-center h-full w-full bg-slate-900/60 backdrop-blur-sm"
      style={{ gap: 'min(10px, 7cqh)', padding: 'min(8px, 6cqh)' }}
    >
      {displayImage ? (
        <img
          src={displayImage}
          alt=""
          className="rounded-xl object-cover flex-shrink-0 shadow-lg"
          style={{ width: 'min(64px, 60cqh)', height: 'min(64px, 60cqh)' }}
        />
      ) : (
        <div
          className="rounded-xl bg-slate-700 flex items-center justify-center flex-shrink-0"
          style={{ width: 'min(64px, 60cqh)', height: 'min(64px, 60cqh)' }}
        >
          <Music2
            className="text-slate-400"
            style={{
              width: '50%',
              height: '50%',
            }}
          />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p
          className="font-bold text-white truncate"
          style={{ fontSize: 'min(16px, 16cqh)', lineHeight: 1.2 }}
        >
          {displayName}
        </p>
        {displayArtist && (
          <p
            className="text-slate-400 truncate"
            style={{
              fontSize: 'min(12px, 12cqh)',
              marginTop: 'min(2px, 1.5cqh)',
            }}
          >
            {displayArtist}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onTogglePlay}
        disabled={!isReady || !url}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        className="flex-shrink-0 flex items-center justify-center rounded-full bg-white text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/70"
        style={{ width: 'min(44px, 44cqh)', height: 'min(44px, 44cqh)' }}
      >
        {isPlaying ? (
          <Pause
            fill="currentColor"
            style={{
              width: '45%',
              height: '45%',
            }}
          />
        ) : (
          <Play
            fill="currentColor"
            style={{
              width: '45%',
              height: '45%',
            }}
          />
        )}
      </button>
    </div>
  );
};
