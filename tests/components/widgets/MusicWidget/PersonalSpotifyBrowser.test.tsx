/**
 * Browser owns tab state, isAudioActive derivation, the tap-to-play handler,
 * and the per-layout routing (default tab strip / small compact bar / minimal
 * view). Each tab and layout child is mocked so this test focuses on
 * integration.
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
vi.mock('@/hooks/useSpotifyWebPlayback', () => ({
  useSpotifyWebPlayback: () => ({
    deviceId: 'dev1',
    isReady: true,
    sdkFailed: false,
    currentTrack: null,
    isPlaying: false,
    togglePlay: vi.fn(),
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
vi.mock('@/components/widgets/MusicWidget/PersonalSpotifyCompactBar', () => ({
  PersonalSpotifyCompactBar: () => <div>mock-compact-bar</div>,
}));
vi.mock('@/components/widgets/MusicWidget/PersonalSpotifyMinimalView', () => ({
  PersonalSpotifyMinimalView: () => <div>mock-minimal-view</div>,
}));

const makeWidget = (config: Record<string, unknown>) => ({
  id: 'w1',
  type: 'music' as const,
  config: { source: 'personal', personalSpotifyUrl: '', ...config },
});

describe('PersonalSpotifyBrowser', () => {
  it('default layout renders the tab strip + Library tab content', () => {
    render(
      <PersonalSpotifyBrowser
        widget={makeWidget({ layout: 'default' }) as never}
      />
    );
    expect(screen.getByText('mock-play-track')).toBeInTheDocument();
  });

  it('falls back to the full browse UI when no layout is set', () => {
    render(<PersonalSpotifyBrowser widget={makeWidget({}) as never} />);
    expect(screen.getByText('mock-play-track')).toBeInTheDocument();
  });

  it('tapping a track persists the URI and auto-switches to Now Playing', () => {
    render(
      <PersonalSpotifyBrowser
        widget={makeWidget({ layout: 'default' }) as never}
      />
    );
    fireEvent.click(screen.getByText('mock-play-track'));

    expect(mockUpdateWidget).toHaveBeenCalledWith('w1', {
      config: { personalSpotifyUrl: 'spotify:track:t1' },
    });
    // Default layout jumps to the Now Playing surface after starting a track.
    expect(screen.getByText(/mock-now-playing/i)).toBeInTheDocument();
  });

  it('clicking the Now Playing tab switches the rendered tab', () => {
    render(
      <PersonalSpotifyBrowser
        widget={makeWidget({ layout: 'default' }) as never}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Now playing/i }));
    expect(screen.getByText(/mock-now-playing/i)).toBeInTheDocument();
  });

  it('small layout renders the compact bar (no tab strip)', () => {
    render(
      <PersonalSpotifyBrowser
        widget={makeWidget({ layout: 'small' }) as never}
      />
    );
    expect(screen.getByText('mock-compact-bar')).toBeInTheDocument();
    expect(screen.queryByText('mock-play-track')).not.toBeInTheDocument();
  });

  it('minimal layout renders the minimal view (no tab strip)', () => {
    render(
      <PersonalSpotifyBrowser
        widget={makeWidget({ layout: 'minimal' }) as never}
      />
    );
    expect(screen.getByText('mock-minimal-view')).toBeInTheDocument();
    expect(screen.queryByText('mock-play-track')).not.toBeInTheDocument();
  });
});
