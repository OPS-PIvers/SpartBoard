/**
 * Minimal view is presentation-only — the SDK lives in useSpotifyWebPlayback
 * (owned by the Browser). It mirrors the curated Music widget's `minimal`
 * layout: full-bleed artwork + centered play/pause + bottom title gradient
 * for Premium, or the Spotify embed iframe for Free / SDK-failed.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PersonalSpotifyMinimalView } from '@/components/widgets/MusicWidget/PersonalSpotifyMinimalView';

const base = {
  url: 'spotify:track:t1',
  isPremium: true,
  sdkFailed: false,
  isReady: true,
  currentTrack: {
    name: 'Banana Pancakes',
    artist: 'Jack Johnson',
    image: 'https://img/t1.jpg',
  },
  isPlaying: false,
  repeatMode: 0,
  shuffle: false,
  onTogglePlay: vi.fn(),
  onNext: vi.fn(),
  onPrevious: vi.fn(),
  onCycleRepeat: vi.fn(),
  onToggleShuffle: vi.fn(),
};

describe('PersonalSpotifyMinimalView', () => {
  it('renders the current track title and a Play button for Premium', () => {
    render(<PersonalSpotifyMinimalView {...base} />);
    expect(screen.getByText('Banana Pancakes')).toBeInTheDocument();
    expect(screen.getByText('Jack Johnson')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Play/i })).toBeInTheDocument();
  });

  it('renders Previous/Next buttons that forward to their handlers', () => {
    const onNext = vi.fn();
    const onPrevious = vi.fn();
    render(
      <PersonalSpotifyMinimalView
        {...base}
        onNext={onNext}
        onPrevious={onPrevious}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Previous/i }));
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    expect(onPrevious).toHaveBeenCalledOnce();
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('renders Shuffle/Repeat controls that forward to their handlers', () => {
    const onToggleShuffle = vi.fn();
    const onCycleRepeat = vi.fn();
    render(
      <PersonalSpotifyMinimalView
        {...base}
        onToggleShuffle={onToggleShuffle}
        onCycleRepeat={onCycleRepeat}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Shuffle/i }));
    fireEvent.click(screen.getByRole('button', { name: /Repeat/i }));
    expect(onToggleShuffle).toHaveBeenCalledOnce();
    expect(onCycleRepeat).toHaveBeenCalledOnce();
  });

  it('reflects active shuffle/repeat state via aria-pressed', () => {
    render(<PersonalSpotifyMinimalView {...base} shuffle repeatMode={2} />);
    expect(screen.getByRole('button', { name: /Shuffle/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: /Repeat one/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('disables Shuffle/Repeat until the device is ready', () => {
    render(<PersonalSpotifyMinimalView {...base} isReady={false} />);
    expect(screen.getByRole('button', { name: /Shuffle/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Repeat/i })).toBeDisabled();
  });

  it('renders no browse affordance — it is a pure player surface', () => {
    render(<PersonalSpotifyMinimalView {...base} />);
    expect(screen.queryByRole('button', { name: /Browse music/i })).toBeNull();
  });

  it('renders the Spotify embed iframe for Free accounts', () => {
    render(
      <PersonalSpotifyMinimalView
        {...base}
        isPremium={false}
        url="https://open.spotify.com/track/abc123"
      />
    );
    expect(screen.getByTitle(/Spotify/i)).toBeInTheDocument();
  });
});
