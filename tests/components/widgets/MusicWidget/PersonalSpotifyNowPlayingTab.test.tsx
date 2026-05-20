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
  currentTrack: null as SpotifyPlaybackTrack | null,
  isPlaying: false,
  onTogglePlay: vi.fn(),
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
