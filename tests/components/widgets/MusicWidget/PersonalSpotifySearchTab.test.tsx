/**
 * Search tab: debounced search, empty-query Recently Played fallback,
 * tap-to-play on results.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { SpotifySearchResult } from '@/utils/spotifyAuth';
import { PersonalSpotifySearchTab } from '@/components/widgets/MusicWidget/PersonalSpotifySearchTab';

const mockSearch =
  vi.fn<(...args: unknown[]) => Promise<SpotifySearchResult[]>>();
const mockGetAccessToken = vi.fn<() => Promise<string | null>>();
vi.mock('@/utils/spotifyAuth', async () => {
  const actual = await vi.importActual<typeof import('@/utils/spotifyAuth')>(
    '@/utils/spotifyAuth'
  );
  return {
    ...actual,
    searchSpotify: (...args: unknown[]) => mockSearch(...args),
  };
});
vi.mock('@/hooks/useSpotifyAuth', () => ({
  useSpotifyAuth: () => ({ getAccessToken: mockGetAccessToken }),
}));
vi.mock('@/hooks/useSpotifyLibrary', () => ({
  useSpotifyLibrary: () => ({
    playlists: [],
    recents: [
      { id: 't1', name: 'Fallback Song', uri: 'spotify:track:t1', artist: 'X' },
    ],
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

/** Advance fake timers then flush all pending microtasks/promises. */
async function advanceAndFlush(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await vi.runAllTimersAsync();
  });
}

describe('PersonalSpotifySearchTab', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockGetAccessToken.mockResolvedValue('tok');
    mockSearch.mockResolvedValue([
      {
        type: 'track',
        id: 'r1',
        name: 'Jack Johnson Result',
        uri: 'spotify:track:r1',
        subtitle: 'Jack Johnson',
      },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('shows Recently Played fallback when input is empty', () => {
    render(<PersonalSpotifySearchTab currentUri={null} onPlay={vi.fn()} />);
    expect(screen.getByText(/Type to search Spotify/i)).toBeInTheDocument();
    expect(screen.getByText('Fallback Song')).toBeInTheDocument();
  });

  it('debounces search by 300ms', async () => {
    render(<PersonalSpotifySearchTab currentUri={null} onPlay={vi.fn()} />);
    const input = screen.getByPlaceholderText(/Search Spotify/i);

    fireEvent.change(input, { target: { value: 'jack' } });
    expect(mockSearch).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(mockSearch).not.toHaveBeenCalled();

    await advanceAndFlush(2);
    expect(mockSearch).toHaveBeenCalledWith('tok', 'jack', expect.anything());
  });

  it('renders search results after debounce fires', async () => {
    render(<PersonalSpotifySearchTab currentUri={null} onPlay={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Search Spotify/i), {
      target: { value: 'jack' },
    });
    await advanceAndFlush(301);
    expect(screen.getByText('Jack Johnson Result')).toBeInTheDocument();
  });

  it('calls onPlay with the resource when a result is clicked', async () => {
    const onPlay = vi.fn();
    render(<PersonalSpotifySearchTab currentUri={null} onPlay={onPlay} />);
    fireEvent.change(screen.getByPlaceholderText(/Search Spotify/i), {
      target: { value: 'jack' },
    });
    await advanceAndFlush(301);
    expect(screen.getByText('Jack Johnson Result')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Jack Johnson Result'));

    expect(onPlay).toHaveBeenCalledWith({
      type: 'track',
      uri: 'spotify:track:r1',
    });
  });
});
