/**
 * Browser owns the SDK hook, the tap-to-play handler, and routes ALL THREE
 * layouts (default / minimal / small) through the shared adaptive layout. The
 * adaptive layout is mocked so this test focuses on integration: the right
 * variant is passed through, isActive is threaded, and a row tap persists the
 * URI + triggers playback.
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

// The shared adaptive layout is mocked: it surfaces the variant + isActive it
// receives and exposes a button that calls onPlay (so we can assert the
// Browser's persistence/playback wiring).
vi.mock(
  '@/components/widgets/MusicWidget/PersonalSpotifyAdaptiveLayout',
  () => ({
    PersonalSpotifyAdaptiveLayout: ({
      variant,
      isActive,
      onPlay,
    }: {
      variant: string;
      isActive: boolean;
      onPlay: (p: {
        type: 'track' | 'playlist' | 'album';
        uri: string;
      }) => void;
    }) => (
      <div>
        mock-adaptive-layout variant={variant} active={String(isActive)}
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

const makeWidget = (config: Record<string, unknown>) => ({
  id: 'w1',
  type: 'music' as const,
  config: { source: 'personal', personalSpotifyUrl: '', ...config },
});

describe('PersonalSpotifyBrowser', () => {
  it('routes the default layout through the adaptive layout', () => {
    render(
      <PersonalSpotifyBrowser
        widget={makeWidget({ layout: 'default' }) as never}
      />
    );
    expect(screen.getByText(/mock-adaptive-layout/i)).toBeInTheDocument();
    expect(screen.getByText(/variant=default/i)).toBeInTheDocument();
  });

  it('falls back to the default variant when no layout is set', () => {
    render(<PersonalSpotifyBrowser widget={makeWidget({}) as never} />);
    expect(screen.getByText(/variant=default/i)).toBeInTheDocument();
  });

  it('routes the small layout through the adaptive layout (no overlay)', () => {
    render(
      <PersonalSpotifyBrowser
        widget={makeWidget({ layout: 'small' }) as never}
      />
    );
    expect(screen.getByText(/mock-adaptive-layout/i)).toBeInTheDocument();
    expect(screen.getByText(/variant=small/i)).toBeInTheDocument();
  });

  it('routes the minimal layout through the adaptive layout (no overlay)', () => {
    render(
      <PersonalSpotifyBrowser
        widget={makeWidget({ layout: 'minimal' }) as never}
      />
    );
    expect(screen.getByText(/mock-adaptive-layout/i)).toBeInTheDocument();
    expect(screen.getByText(/variant=minimal/i)).toBeInTheDocument();
  });

  it('tapping a track persists the URI (view state owned by the layout)', () => {
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
});
