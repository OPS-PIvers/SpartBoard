/**
 * PersonalSpotifyMinimalView — the personal-Spotify "Minimal" layout: a
 * full-bleed album-art surface with a centered play/pause control and a
 * bottom gradient title. Mirrors the curated Music widget's `minimal` layout
 * (see MusicWidget/Widget.tsx) but is driven by the Web Playback SDK.
 *
 * Presentation-only — same contract as PersonalSpotifyCompactBar /
 * PersonalSpotifyNowPlayingTab. The SDK lives in useSpotifyWebPlayback
 * (owned by PersonalSpotifyBrowser).
 *
 * Branches:
 *  - Free tier OR sdkFailed → full-bleed Spotify embed iframe (own controls).
 *  - else → artwork background + centered play/pause + bottom title gradient.
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

export const PersonalSpotifyMinimalView: React.FC<Props> = ({
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
  // Free tier / SDK failure → the embed iframe owns playback.
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
    <div className="w-full h-full relative overflow-hidden">
      {/* Background artwork */}
      {displayImage ? (
        <img
          src={displayImage}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
          <Music2
            className="text-slate-400"
            style={{
              width: 'min(64px, 25cqmin)',
              height: 'min(64px, 25cqmin)',
            }}
          />
        </div>
      )}

      {/* Subtle dark overlay */}
      <div
        className={`absolute inset-0 transition-opacity duration-500 bg-black ${
          isPlaying ? 'opacity-20' : 'opacity-30'
        }`}
      />

      {/* Centered play/pause button */}
      <div className="absolute inset-0 flex items-center justify-center">
        <button
          type="button"
          onClick={onTogglePlay}
          disabled={!isReady || !url}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="rounded-full bg-white/90 hover:bg-white text-slate-900 flex items-center justify-center shadow-xl transition disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/70"
          style={{
            width: 'min(56px, 40cqh)',
            height: 'min(56px, 40cqh)',
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
          {displayName}
        </p>
        {displayArtist && (
          <p
            className="truncate text-white/70 font-medium"
            style={{
              fontSize: 'min(12px, 9cqh)',
              marginTop: 'min(2px, 1cqh)',
            }}
          >
            {displayArtist}
          </p>
        )}
      </div>
    </div>
  );
};
