/**
 * After the refactor, PersonalSpotifyPlayer is pure dispatch — either the
 * CTA or the Browser. Tests cover both branches.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PersonalSpotifyPlayer } from '@/components/widgets/MusicWidget/PersonalSpotifyPlayer';

vi.mock('@/components/widgets/MusicWidget/PersonalSpotifyBrowser', () => ({
  PersonalSpotifyBrowser: () => <div>mock-browser</div>,
}));

type MockSpotifyAuth = { isConnected: boolean; state: { status: string } };
const mockUseSpotifyAuth = vi.fn(() => ({}) as MockSpotifyAuth);
vi.mock('@/hooks/useSpotifyAuth', () => ({
  useSpotifyAuth: () => mockUseSpotifyAuth(),
}));

const widget = {
  id: 'w1',
  type: 'music' as const,
  config: { source: 'personal', personalSpotifyUrl: '' },
};

describe('PersonalSpotifyPlayer dispatch', () => {
  it('renders the Connect CTA when not connected', () => {
    mockUseSpotifyAuth.mockReturnValue({
      isConnected: false,
      state: { status: 'disconnected' },
    });
    render(<PersonalSpotifyPlayer widget={widget as never} />);
    expect(screen.getByText(/Connect Spotify/i)).toBeInTheDocument();
  });

  it('renders the Browser when connected', () => {
    mockUseSpotifyAuth.mockReturnValue({
      isConnected: true,
      state: { status: 'connected' },
    });
    render(<PersonalSpotifyPlayer widget={widget as never} />);
    expect(screen.getByText('mock-browser')).toBeInTheDocument();
  });
});
