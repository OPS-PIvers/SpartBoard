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
  onTogglePlay: vi.fn(),
  onNext: vi.fn(),
  onPrevious: vi.fn(),
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
