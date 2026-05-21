/**
 * Now Playing tab is presentation-only — the SDK lives in
 * useSpotifyWebPlayback (owned by the Browser). These tests exercise the
 * three render branches: empty state (url null), embed iframe (Free tier or
 * sdkFailed), and the SDK player surface (Premium + currentTrack).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PersonalSpotifyNowPlayingTab } from '@/components/widgets/MusicWidget/PersonalSpotifyNowPlayingTab';
import type { SpotifyPlaybackTrack } from '@/hooks/useSpotifyWebPlayback';

const baseProps = {
  url: null as string | null,
  isPremium: true,
  sdkFailed: false,
  isReady: true,
  currentTrack: null as SpotifyPlaybackTrack | null,
  isPlaying: false,
  repeatMode: 0,
  shuffle: false,
  onTogglePlay: vi.fn(),
  onNext: vi.fn(),
  onPrevious: vi.fn(),
  onCycleRepeat: vi.fn(),
  onToggleShuffle: vi.fn(),
  onSwitchToLibrary: vi.fn(),
};

describe('PersonalSpotifyNowPlayingTab', () => {
  it('shows empty state when no URI is set', () => {
    render(<PersonalSpotifyNowPlayingTab {...baseProps} url={null} />);
    expect(
      screen.getByText(/Pick something from your library or search/i)
    ).toBeInTheDocument();
  });

  it('renders the Open library button in the empty state', () => {
    render(<PersonalSpotifyNowPlayingTab {...baseProps} url={null} />);
    expect(
      screen.getByRole('button', { name: /Open library/i })
    ).toBeInTheDocument();
  });

  it('calls onSwitchToLibrary when Open library is clicked', () => {
    const onSwitch = vi.fn();
    render(
      <PersonalSpotifyNowPlayingTab
        {...baseProps}
        url={null}
        onSwitchToLibrary={onSwitch}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Open library/i }));
    expect(onSwitch).toHaveBeenCalledOnce();
  });

  it('renders the SDK player surface for Premium with a current track', () => {
    const onToggle = vi.fn();
    render(
      <PersonalSpotifyNowPlayingTab
        {...baseProps}
        url="spotify:track:t1"
        isPremium
        sdkFailed={false}
        isPlaying={false}
        currentTrack={{ name: 'Test Song', artist: 'Test Artist' }}
        onTogglePlay={onToggle}
      />
    );
    expect(screen.getByText('Test Song')).toBeInTheDocument();
    expect(screen.getByText('Test Artist')).toBeInTheDocument();
    // Play state → button labelled "Play"; clicking forwards to onTogglePlay.
    fireEvent.click(screen.getByRole('button', { name: /Play/i }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('renders Previous/Next buttons that forward to their handlers (SDK branch)', () => {
    const onNext = vi.fn();
    const onPrevious = vi.fn();
    render(
      <PersonalSpotifyNowPlayingTab
        {...baseProps}
        url="spotify:track:t1"
        isPremium
        isReady
        currentTrack={{ name: 'Test Song', artist: 'Test Artist' }}
        onNext={onNext}
        onPrevious={onPrevious}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Previous/i }));
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    expect(onPrevious).toHaveBeenCalledOnce();
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('disables Previous/Next until the device is ready', () => {
    render(
      <PersonalSpotifyNowPlayingTab
        {...baseProps}
        url="spotify:track:t1"
        isPremium
        isReady={false}
        currentTrack={null}
      />
    );
    expect(screen.getByRole('button', { name: /Previous/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Next/i })).toBeDisabled();
  });

  it('does NOT render Previous/Next on the Free-tier iframe branch', () => {
    render(
      <PersonalSpotifyNowPlayingTab
        {...baseProps}
        url="spotify:track:t1"
        isPremium={false}
        label="Free Preview"
      />
    );
    expect(screen.queryByRole('button', { name: /Previous/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Next/i })).toBeNull();
  });

  it('renders Shuffle/Repeat buttons that forward to their handlers (SDK branch)', () => {
    const onCycleRepeat = vi.fn();
    const onToggleShuffle = vi.fn();
    render(
      <PersonalSpotifyNowPlayingTab
        {...baseProps}
        url="spotify:track:t1"
        isPremium
        isReady
        currentTrack={{ name: 'Test Song', artist: 'Test Artist' }}
        onCycleRepeat={onCycleRepeat}
        onToggleShuffle={onToggleShuffle}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Shuffle/i }));
    fireEvent.click(screen.getByRole('button', { name: /Repeat/i }));
    expect(onToggleShuffle).toHaveBeenCalledOnce();
    expect(onCycleRepeat).toHaveBeenCalledOnce();
  });

  it('reflects active state on Shuffle/Repeat via aria-pressed', () => {
    render(
      <PersonalSpotifyNowPlayingTab
        {...baseProps}
        url="spotify:track:t1"
        isPremium
        isReady
        shuffle
        repeatMode={1}
        currentTrack={{ name: 'Test Song', artist: 'Test Artist' }}
      />
    );
    expect(screen.getByRole('button', { name: /Shuffle/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: /Repeat/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('disables Shuffle/Repeat until the device is ready', () => {
    render(
      <PersonalSpotifyNowPlayingTab
        {...baseProps}
        url="spotify:track:t1"
        isPremium
        isReady={false}
        currentTrack={null}
      />
    );
    expect(screen.getByRole('button', { name: /Shuffle/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Repeat/i })).toBeDisabled();
  });

  it('does NOT render Shuffle/Repeat on the Free-tier iframe branch', () => {
    render(
      <PersonalSpotifyNowPlayingTab
        {...baseProps}
        url="spotify:track:t1"
        isPremium={false}
        label="Free Preview"
      />
    );
    expect(screen.queryByRole('button', { name: /Shuffle/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Repeat/i })).toBeNull();
  });

  it('labels the toggle button "Pause" when playing', () => {
    render(
      <PersonalSpotifyNowPlayingTab
        {...baseProps}
        url="spotify:track:t1"
        isPremium
        isPlaying
        currentTrack={{ name: 'Test Song', artist: 'Test Artist' }}
      />
    );
    expect(screen.getByRole('button', { name: /Pause/i })).toBeInTheDocument();
  });

  it('disables the play button until the device is ready', () => {
    render(
      <PersonalSpotifyNowPlayingTab
        {...baseProps}
        url="spotify:track:t1"
        isPremium
        isReady={false}
        currentTrack={null}
      />
    );
    // Device not connected yet → button present but disabled (no spinner).
    expect(screen.getByRole('button', { name: /Play/i })).toBeDisabled();
  });

  it('enables the play button once the device is ready', () => {
    render(
      <PersonalSpotifyNowPlayingTab
        {...baseProps}
        url="spotify:track:t1"
        isPremium
        isReady
        currentTrack={null}
      />
    );
    expect(screen.getByRole('button', { name: /Play/i })).toBeEnabled();
  });

  it('renders the embed iframe for Free-tier accounts', () => {
    render(
      <PersonalSpotifyNowPlayingTab
        {...baseProps}
        url="spotify:track:t1"
        isPremium={false}
        label="Free Preview"
      />
    );
    const iframe = screen.getByTitle(/Spotify: Free Preview/i);
    expect(iframe).toBeInTheDocument();
  });

  it('renders the embed iframe when the SDK has failed', () => {
    render(
      <PersonalSpotifyNowPlayingTab
        {...baseProps}
        url="spotify:track:t1"
        isPremium
        sdkFailed
        label="Fallback"
      />
    );
    expect(screen.getByTitle(/Spotify: Fallback/i)).toBeInTheDocument();
  });
});
