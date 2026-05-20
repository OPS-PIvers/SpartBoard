/**
 * Browser owns tab state, isAudioActive derivation, and the tap-to-play
 * handler. Each tab is mocked so this test focuses on integration.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PersonalSpotifyBrowser } from '@/components/widgets/MusicWidget/PersonalSpotifyBrowser';

const mockUpdateWidget = vi.fn();
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ updateWidget: mockUpdateWidget }),
}));
vi.mock('@/hooks/useSpotifyAuth', () => ({
  useSpotifyAuth: () => ({
    isPremium: true,
    getAccessToken: vi.fn().mockResolvedValue('tok'),
    disconnect: vi.fn(),
    connect: vi.fn(),
  }),
}));

const playMock = vi.fn();
vi.mock('@/utils/spotifyAuth', async () => {
  const actual = await vi.importActual<typeof import('@/utils/spotifyAuth')>(
    '@/utils/spotifyAuth'
  );
  return {
    ...actual,
    playOnDevice: (...args: unknown[]): Promise<void> =>
      playMock(...args) as Promise<void>,
  };
});

vi.mock('@/components/widgets/MusicWidget/PersonalSpotifyLibraryTab', () => ({
  PersonalSpotifyLibraryTab: ({
    onPlay,
  }: {
    onPlay: (p: { type: 'track' | 'playlist' | 'album'; uri: string }) => void;
  }) => (
    <button
      type="button"
      onClick={() => onPlay({ type: 'track', uri: 'spotify:track:t1' })}
    >
      mock-play-track
    </button>
  ),
}));
vi.mock('@/components/widgets/MusicWidget/PersonalSpotifySearchTab', () => ({
  PersonalSpotifySearchTab: () => <div>mock-search</div>,
}));
vi.mock(
  '@/components/widgets/MusicWidget/PersonalSpotifyNowPlayingTab',
  () => ({
    PersonalSpotifyNowPlayingTab: ({ url }: { url: string | null }) => (
      <div>mock-now-playing url={String(url)}</div>
    ),
  })
);

const widget = {
  id: 'w1',
  type: 'music' as const,
  config: { source: 'personal', personalSpotifyUrl: '' },
};

describe('PersonalSpotifyBrowser', () => {
  it('defaults to Library tab on mount', () => {
    render(<PersonalSpotifyBrowser widget={widget as never} />);
    expect(screen.getByText('mock-play-track')).toBeInTheDocument();
  });

  it('tap on a track persists URL and stays on current tab', () => {
    render(<PersonalSpotifyBrowser widget={widget as never} />);
    fireEvent.click(screen.getByText('mock-play-track'));

    expect(mockUpdateWidget).toHaveBeenCalledWith('w1', {
      config: { personalSpotifyUrl: 'spotify:track:t1' },
    });
    // Library tab still shown (no auto-switch):
    expect(screen.getByText('mock-play-track')).toBeInTheDocument();
  });

  it('clicking the Now Playing tab switches the rendered tab', () => {
    render(<PersonalSpotifyBrowser widget={widget as never} />);
    fireEvent.click(screen.getByRole('button', { name: /Now playing/i }));
    expect(screen.getByText(/mock-now-playing/i)).toBeInTheDocument();
  });
});
