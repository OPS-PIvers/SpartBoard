/**
 * Library tab renders Recently Played + Your Playlists sections, hides
 * empty sections cleanly, shows skeletons during load, and surfaces a
 * scope-rotation banner when the hook signals it.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PersonalSpotifyLibraryTab } from '@/components/widgets/MusicWidget/PersonalSpotifyLibraryTab';
import type { UseSpotifyLibraryReturn } from '@/hooks/useSpotifyLibrary';

const mockHook = vi.fn<() => UseSpotifyLibraryReturn>();
vi.mock('@/hooks/useSpotifyLibrary', () => ({
  useSpotifyLibrary: () => mockHook(),
}));

const happy: UseSpotifyLibraryReturn = {
  playlists: [
    {
      id: 'pl1',
      name: 'Morning Mix',
      uri: 'spotify:playlist:pl1',
      owner: 'Paul',
    },
  ],
  recents: [
    {
      id: 't1',
      name: 'Banana Pancakes',
      uri: 'spotify:track:t1',
      artist: 'Jack Johnson',
    },
  ],
  isLoading: false,
  error: null,
  refresh: vi.fn(),
};

describe('PersonalSpotifyLibraryTab', () => {
  it('renders both sections when populated', () => {
    mockHook.mockReturnValue(happy);
    render(
      <PersonalSpotifyLibraryTab
        currentUri={null}
        onPlay={vi.fn()}
        onReconnect={vi.fn()}
      />
    );
    expect(screen.getByText(/Recently played/i)).toBeInTheDocument();
    expect(screen.getByText('Banana Pancakes')).toBeInTheDocument();
    expect(screen.getByText(/Your playlists/i)).toBeInTheDocument();
    expect(screen.getByText('Morning Mix')).toBeInTheDocument();
  });

  it('hides Recently Played section when recents are empty', () => {
    mockHook.mockReturnValue({ ...happy, recents: [] });
    render(
      <PersonalSpotifyLibraryTab
        currentUri={null}
        onPlay={vi.fn()}
        onReconnect={vi.fn()}
      />
    );
    expect(screen.queryByText(/Recently played/i)).toBeNull();
    expect(screen.getByText('Morning Mix')).toBeInTheDocument();
  });

  it('shows empty state when both lists are empty', () => {
    mockHook.mockReturnValue({ ...happy, playlists: [], recents: [] });
    render(
      <PersonalSpotifyLibraryTab
        currentUri={null}
        onPlay={vi.fn()}
        onReconnect={vi.fn()}
      />
    );
    expect(screen.getByText(/No playlists/i)).toBeInTheDocument();
  });

  it('shows skeleton rows during initial load', () => {
    mockHook.mockReturnValue({
      ...happy,
      playlists: [],
      recents: [],
      isLoading: true,
    });
    render(
      <PersonalSpotifyLibraryTab
        currentUri={null}
        onPlay={vi.fn()}
        onReconnect={vi.fn()}
      />
    );
    expect(
      screen.getAllByTestId('spotify-row-skeleton').length
    ).toBeGreaterThan(0);
  });

  it('shows the scope-rotation banner on scope errors', () => {
    mockHook.mockReturnValue({
      ...happy,
      playlists: [],
      recents: [],
      error: { kind: 'scope' },
    });
    const onReconnect = vi.fn();
    render(
      <PersonalSpotifyLibraryTab
        currentUri={null}
        onPlay={vi.fn()}
        onReconnect={onReconnect}
      />
    );
    expect(
      screen.getByText(/Spotify connection needs an update/i)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Reconnect/i }));
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('calls onPlay with the resource when a row is clicked', () => {
    mockHook.mockReturnValue(happy);
    const onPlay = vi.fn();
    render(
      <PersonalSpotifyLibraryTab
        currentUri={null}
        onPlay={onPlay}
        onReconnect={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Morning Mix'));
    expect(onPlay).toHaveBeenCalledWith({
      type: 'playlist',
      uri: 'spotify:playlist:pl1',
    });
  });
});
