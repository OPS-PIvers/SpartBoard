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
  useDashboard: () => ({
    updateWidget: mockUpdateWidget,
    selectedWidgetId: null,
  }),
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
    repeatMode: 0,
    shuffle: false,
    togglePlay: vi.fn(),
    next: vi.fn(),
    previous: vi.fn(),
    cycleRepeat: vi.fn(),
    toggleShuffle: vi.fn(),
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
  PersonalSpotifyCompactBar: ({
    onOpenBrowse,
  }: {
    onOpenBrowse?: () => void;
  }) => (
    <div>
      mock-compact-bar
      {onOpenBrowse && (
        <button type="button" onClick={onOpenBrowse}>
          open-browse
        </button>
      )}
    </div>
  ),
}));
vi.mock(
  '@/components/widgets/MusicWidget/PersonalSpotifyDefaultLayout',
  () => ({
    PersonalSpotifyDefaultLayout: ({
      isActive,
      onPlay,
    }: {
      isActive: boolean;
      onPlay: (p: {
        type: 'track' | 'playlist' | 'album';
        uri: string;
      }) => void;
    }) => (
      <div>
        mock-default-layout active={String(isActive)}
        <button
          type="button"
          onClick={() => onPlay({ type: 'track', uri: 'spotify:track:t1' })}
        >
          mock-play-track
        </button>
      </div>
    ),
  })
);
vi.mock('@/components/widgets/MusicWidget/PersonalSpotifyMinimalView', () => ({
  PersonalSpotifyMinimalView: ({
    onOpenBrowse,
  }: {
    onOpenBrowse?: () => void;
  }) => (
    <div>
      mock-minimal-view
      {onOpenBrowse && (
        <button type="button" onClick={onOpenBrowse}>
          open-browse
        </button>
      )}
    </div>
  ),
}));

const makeWidget = (config: Record<string, unknown>) => ({
  id: 'w1',
  type: 'music' as const,
  config: { source: 'personal', personalSpotifyUrl: '', ...config },
});

describe('PersonalSpotifyBrowser', () => {
  it('default layout renders the DefaultLayout component', () => {
    render(
      <PersonalSpotifyBrowser
        widget={makeWidget({ layout: 'default' }) as never}
      />
    );
    expect(screen.getByText(/mock-default-layout/i)).toBeInTheDocument();
  });

  it('falls back to the DefaultLayout when no layout is set', () => {
    render(<PersonalSpotifyBrowser widget={makeWidget({}) as never} />);
    expect(screen.getByText(/mock-default-layout/i)).toBeInTheDocument();
  });

  it('default layout: tapping a track persists the URI (view state owned by the layout)', () => {
    render(
      <PersonalSpotifyBrowser
        widget={makeWidget({ layout: 'default' }) as never}
      />
    );
    fireEvent.click(screen.getByText('mock-play-track'));

    expect(mockUpdateWidget).toHaveBeenCalledWith('w1', {
      config: { personalSpotifyUrl: 'spotify:track:t1' },
    });
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

  it('small layout: tapping the compact bar opens the browse overlay', () => {
    render(
      <PersonalSpotifyBrowser
        widget={makeWidget({ layout: 'small' }) as never}
      />
    );
    // Overlay (and its browse panel) is hidden until the surface is tapped.
    expect(screen.queryByText('mock-play-track')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('open-browse'));
    // Browse panel now visible (Library tab mock renders mock-play-track).
    expect(screen.getByText('mock-play-track')).toBeInTheDocument();
  });

  it('small layout: the overlay close button dismisses the browse panel', () => {
    render(
      <PersonalSpotifyBrowser
        widget={makeWidget({ layout: 'small' }) as never}
      />
    );
    fireEvent.click(screen.getByText('open-browse'));
    expect(screen.getByText('mock-play-track')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Close browse/i }));
    expect(screen.queryByText('mock-play-track')).not.toBeInTheDocument();
  });

  it('small layout: selecting a track in the overlay plays it and closes the overlay', () => {
    render(
      <PersonalSpotifyBrowser
        widget={makeWidget({ layout: 'small' }) as never}
      />
    );
    fireEvent.click(screen.getByText('open-browse'));
    fireEvent.click(screen.getByText('mock-play-track'));
    expect(mockUpdateWidget).toHaveBeenCalledWith('w1', {
      config: { personalSpotifyUrl: 'spotify:track:t1' },
    });
    // Overlay closes; the compact bar is shown again (no inline tab switch).
    expect(screen.queryByText('mock-play-track')).not.toBeInTheDocument();
    expect(screen.getByText('mock-compact-bar')).toBeInTheDocument();
  });

  it('minimal layout: tapping the artwork opens the browse overlay', () => {
    render(
      <PersonalSpotifyBrowser
        widget={makeWidget({ layout: 'minimal' }) as never}
      />
    );
    expect(screen.queryByText('mock-play-track')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('open-browse'));
    expect(screen.getByText('mock-play-track')).toBeInTheDocument();
  });
});
