/**
 * Now Playing tab: only the empty-state path is covered here. The SDK
 * player surface is extracted from PersonalSpotifyPlayer (covered by
 * existing player tests via the dispatcher in Task 11) and the iframe
 * is a single <iframe src={url}> with no testable logic — both are on
 * the manual-verification checklist (Task 13).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PersonalSpotifyNowPlayingTab } from '@/components/widgets/MusicWidget/PersonalSpotifyNowPlayingTab';

vi.mock('@/hooks/useSpotifyAuth', () => ({
  useSpotifyAuth: () => ({
    isPremium: true,
    getAccessToken: vi.fn().mockResolvedValue('tok'),
  }),
}));

describe('PersonalSpotifyNowPlayingTab', () => {
  it('shows empty state when no URI is set', () => {
    render(
      <PersonalSpotifyNowPlayingTab url={null} onSwitchToLibrary={vi.fn()} />
    );
    expect(
      screen.getByText(/Pick something from your library or search/i)
    ).toBeInTheDocument();
  });

  it('renders the Open library button in the empty state', () => {
    const onSwitch = vi.fn();
    render(
      <PersonalSpotifyNowPlayingTab url={null} onSwitchToLibrary={onSwitch} />
    );
    expect(
      screen.getByRole('button', { name: /Open library/i })
    ).toBeInTheDocument();
  });

  it('calls onSwitchToLibrary when Open library is clicked', () => {
    const onSwitch = vi.fn();
    render(
      <PersonalSpotifyNowPlayingTab url={null} onSwitchToLibrary={onSwitch} />
    );
    fireEvent.click(screen.getByRole('button', { name: /Open library/i }));
    expect(onSwitch).toHaveBeenCalledOnce();
  });
});
