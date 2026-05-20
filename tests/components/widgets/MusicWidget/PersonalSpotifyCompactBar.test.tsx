/**
 * Compact bar shown when the Music widget is shrunk below the browse-UI
 * threshold: a now-playing strip (art + title + play/pause) for Premium, or
 * the Spotify embed iframe for Free / SDK-failed.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PersonalSpotifyCompactBar } from '@/components/widgets/MusicWidget/PersonalSpotifyCompactBar';

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

describe('PersonalSpotifyCompactBar', () => {
  it('renders the current track title + artist and a Play button', () => {
    render(<PersonalSpotifyCompactBar {...base} />);
    expect(screen.getByText('Banana Pancakes')).toBeInTheDocument();
    expect(screen.getByText('Jack Johnson')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Play/i })).toBeInTheDocument();
  });

  it('shows a Pause control while playing', () => {
    render(<PersonalSpotifyCompactBar {...base} isPlaying />);
    expect(screen.getByRole('button', { name: /Pause/i })).toBeInTheDocument();
  });

  it('calls onTogglePlay when the control is clicked', () => {
    const onTogglePlay = vi.fn();
    render(<PersonalSpotifyCompactBar {...base} onTogglePlay={onTogglePlay} />);
    fireEvent.click(screen.getByRole('button', { name: /Play/i }));
    expect(onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it('disables the control until the device is ready', () => {
    render(<PersonalSpotifyCompactBar {...base} isReady={false} />);
    expect(screen.getByRole('button', { name: /Play/i })).toBeDisabled();
  });

  it('renders Previous/Next buttons that forward to their handlers', () => {
    const onNext = vi.fn();
    const onPrevious = vi.fn();
    render(
      <PersonalSpotifyCompactBar
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
      <PersonalSpotifyCompactBar
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
    render(<PersonalSpotifyCompactBar {...base} shuffle repeatMode={1} />);
    expect(screen.getByRole('button', { name: /Shuffle/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: /Repeat all/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('renders no browse affordance — it is a pure player surface', () => {
    render(<PersonalSpotifyCompactBar {...base} />);
    expect(screen.queryByRole('button', { name: /Browse music/i })).toBeNull();
  });

  it('renders the Spotify embed iframe for Free accounts', () => {
    render(
      <PersonalSpotifyCompactBar
        {...base}
        isPremium={false}
        url="https://open.spotify.com/track/abc123"
      />
    );
    expect(screen.getByTitle(/Spotify/i)).toBeInTheDocument();
  });
});
