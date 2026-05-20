/**
 * SpotifyTransportControls — the single shared transport row for ALL THREE
 * personal-Spotify player surfaces (Default card, Minimal full-bleed art,
 * Small compact bar). Renders the standard audio-player control order:
 *
 *   shuffle · previous · play/pause · next · repeat
 *
 * Visual hierarchy (standard for a media transport):
 *  - play/pause is the prominent filled circular button (largest)
 *  - previous/next are medium icon buttons
 *  - shuffle/repeat are the smallest icon buttons, flanking the cluster
 *
 * State affordances:
 *  - shuffle on / repeatMode !== 0 → Spotify-green accent
 *  - inactive → muted slate
 *  - everything disabled until `isReady` (the SDK device has connected)
 *
 * Sizing is container-query driven via the `size` variant so the SAME markup
 * scales correctly inside the card (lg), over the art (md), and inside the
 * narrow bar (sm). No hardcoded Tailwind text/size classes in the controls.
 */

import React from 'react';
import {
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
} from 'lucide-react';

export interface SpotifyTransportControlsProps {
  isReady: boolean;
  isPlaying: boolean;
  /** Current repeat mode: 0 = off, 1 = context (all), 2 = track (one). */
  repeatMode: number;
  shuffle: boolean;
  onTogglePlay: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onCycleRepeat: () => void;
  onToggleShuffle: () => void;
  /** sm = compact bar, md = minimal-over-art, lg = default card. */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * cq-scaled button dimensions per variant. Play is the largest; prev/next are
 * medium; shuffle/repeat the smallest. md/sm key off container *height* (cqh)
 * because those surfaces are wide-but-short; lg keys off cqmin (the card is
 * roughly square so the smaller dimension governs).
 */
const SIZES = {
  lg: {
    gap: 'min(16px, 6cqmin)',
    play: 'min(56px, 20cqmin)',
    skip: 'min(36px, 13cqmin)',
    toggle: 'min(30px, 11cqmin)',
  },
  md: {
    gap: 'min(14px, 12cqh)',
    play: 'min(52px, 40cqh)',
    skip: 'min(34px, 26cqh)',
    toggle: 'min(28px, 22cqh)',
  },
  sm: {
    gap: 'min(5px, 4cqh)',
    play: 'min(40px, 40cqh)',
    skip: 'min(28px, 28cqh)',
    toggle: 'min(22px, 22cqh)',
  },
} as const;

const repeatLabel = (mode: number): string =>
  mode === 2 ? 'Repeat one' : mode === 1 ? 'Repeat all' : 'Repeat off';

export const SpotifyTransportControls: React.FC<
  SpotifyTransportControlsProps
> = ({
  isReady,
  isPlaying,
  repeatMode,
  shuffle,
  onTogglePlay,
  onPrevious,
  onNext,
  onCycleRepeat,
  onToggleShuffle,
  size = 'lg',
}) => {
  const s = SIZES[size];
  const repeatActive = repeatMode !== 0;

  // Shared classes for the small toggle (shuffle/repeat) buttons — colored by
  // active state.
  const toggleClass = (active: boolean) =>
    `rounded-full flex items-center justify-center transition disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/70 ${
      active
        ? 'text-green-400 hover:text-green-300'
        : 'text-slate-400 hover:text-white'
    }`;

  const skipClass =
    'rounded-full text-white/90 hover:text-white flex items-center justify-center transition disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/70';

  return (
    <div
      className="flex items-center justify-center shrink-0"
      style={{ gap: s.gap }}
    >
      {/* Shuffle */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleShuffle();
        }}
        disabled={!isReady}
        aria-label="Shuffle"
        aria-pressed={shuffle}
        className={toggleClass(shuffle)}
        style={{ width: s.toggle, height: s.toggle }}
      >
        <Shuffle style={{ width: '70%', height: '70%' }} />
      </button>

      {/* Previous */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onPrevious();
        }}
        disabled={!isReady}
        aria-label="Previous"
        className={skipClass}
        style={{ width: s.skip, height: s.skip }}
      >
        <SkipBack
          className="fill-current"
          style={{ width: '70%', height: '70%' }}
        />
      </button>

      {/* Play / Pause — prominent filled circular button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onTogglePlay();
        }}
        disabled={!isReady}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        className="rounded-full bg-white/90 hover:bg-white text-slate-900 flex items-center justify-center shadow-xl transition disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/70"
        style={{ width: s.play, height: s.play }}
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

      {/* Next */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onNext();
        }}
        disabled={!isReady}
        aria-label="Next"
        className={skipClass}
        style={{ width: s.skip, height: s.skip }}
      >
        <SkipForward
          className="fill-current"
          style={{ width: '70%', height: '70%' }}
        />
      </button>

      {/* Repeat */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onCycleRepeat();
        }}
        disabled={!isReady}
        aria-label={repeatLabel(repeatMode)}
        aria-pressed={repeatActive}
        className={toggleClass(repeatActive)}
        style={{ width: s.toggle, height: s.toggle }}
      >
        {repeatMode === 2 ? (
          <Repeat1 style={{ width: '70%', height: '70%' }} />
        ) : (
          <Repeat style={{ width: '70%', height: '70%' }} />
        )}
      </button>
    </div>
  );
};
