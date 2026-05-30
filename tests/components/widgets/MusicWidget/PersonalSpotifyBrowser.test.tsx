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

// ── Queue-and-flush: tap-to-play before SDK device is registered ─────────────
// A separate describe block with its own useSpotifyWebPlayback mock so we can
// flip deviceId from null → 'dev1' between renders. Without queueing, a tap
// during the registration window (up to ~15s) silently no-ops because
// handlePlay's `if (!playback.deviceId) return` short-circuits before
// playOnDevice ever runs.

describe('PersonalSpotifyBrowser — tap-before-device-ready queue-and-flush', () => {
  it('queues the pick and flushes it when deviceId arrives', async () => {
    playMock.mockClear();
    mockUpdateWidget.mockClear();

    // Dynamic state for the playback mock so we can transition deviceId.
    let currentDeviceId: string | null = null;
    vi.doMock('@/hooks/useSpotifyWebPlayback', () => ({
      useSpotifyWebPlayback: () => ({
        deviceId: currentDeviceId,
        isReady: currentDeviceId !== null,
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
    // Re-import the component so it picks up the doMock'd hook.
    const { PersonalSpotifyBrowser: Browser } =
      await import('@/components/widgets/MusicWidget/PersonalSpotifyBrowser');
    const { rerender } = render(
      <Browser widget={makeWidget({ layout: 'default' }) as never} />
    );

    // Tap a row while deviceId is still null (registration polling in flight).
    fireEvent.click(screen.getByText('mock-play-track'));
    // URI is persisted regardless — that's the user's intent, captured.
    expect(mockUpdateWidget).toHaveBeenCalledWith('w1', {
      config: { personalSpotifyUrl: 'spotify:track:t1' },
    });
    // But playback should NOT have started yet — there's no device.
    expect(playMock).not.toHaveBeenCalled();

    // Device finally registers. Re-render so the hook returns the new id;
    // the queue-flush useEffect should fire and call playOnDevice.
    currentDeviceId = 'dev1';
    rerender(<Browser widget={makeWidget({ layout: 'default' }) as never} />);
    // The flush is async (await getAccessToken inside). Microtask wait.
    await new Promise((r) => setTimeout(r, 0));

    expect(playMock).toHaveBeenCalledWith('tok', 'dev1', {
      uris: ['spotify:track:t1'],
    });
    vi.doUnmock('@/hooks/useSpotifyWebPlayback');
  });
});
