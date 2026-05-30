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
// Mutable hoisted playback state so a single statically-imported component can
// transition deviceId across renders. (vi.doMock + dynamic import does NOT work
// here: the component is already imported and cached above, so without
// vi.resetModules the re-import returns the cached module still bound to this
// hoisted mock — the dynamic deviceId never reaches the component.)
const playbackState = vi.hoisted(() => ({ deviceId: 'dev1' as string | null }));
vi.mock('@/hooks/useSpotifyWebPlayback', () => ({
  useSpotifyWebPlayback: () => ({
    deviceId: playbackState.deviceId,
    isReady: playbackState.deviceId !== null,
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
  it('queues the pick while deviceId is null and flushes it when the device registers', async () => {
    playMock.mockClear();
    mockUpdateWidget.mockClear();
    // Device not yet registered — Spotify Connect registration still in flight.
    playbackState.deviceId = null;

    const { rerender } = render(
      <PersonalSpotifyBrowser
        widget={makeWidget({ layout: 'default' }) as never}
      />
    );

    // Tap a row while deviceId is still null.
    fireEvent.click(screen.getByText('mock-play-track'));
    // URI is persisted regardless — that's the user's intent, captured.
    expect(mockUpdateWidget).toHaveBeenCalledWith('w1', {
      config: { personalSpotifyUrl: 'spotify:track:t1' },
    });
    // Settle handlePlay's getAccessToken await BEFORE asserting — this is what
    // makes the assertion meaningful. handlePlay reads deviceId only after that
    // await, so without flushing the microtask the "not called" check passes
    // simply because the await hasn't resolved, not because the pick queued.
    // With null deviceId it must queue the pick and skip playback.
    await new Promise((r) => setTimeout(r, 0));
    expect(playMock).not.toHaveBeenCalled();

    // Device finally registers. Re-render so the hook returns the new id; the
    // queue-flush effect should fire and play the queued pick.
    playbackState.deviceId = 'dev1';
    rerender(
      <PersonalSpotifyBrowser
        widget={makeWidget({ layout: 'default' }) as never}
      />
    );
    await new Promise((r) => setTimeout(r, 0));

    expect(playMock).toHaveBeenCalledWith('tok', 'dev1', {
      uris: ['spotify:track:t1'],
    });

    // Restore the shared mock state for any later tests.
    playbackState.deviceId = 'dev1';
  });
});
