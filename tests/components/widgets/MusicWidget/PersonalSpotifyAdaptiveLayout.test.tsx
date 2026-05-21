/**
 * PersonalSpotifyAdaptiveLayout — the shared layout for all three personal-
 * Spotify variants (default / minimal / small):
 *  - at rest (isActive=false): only the variant's player surface, no tab bar;
 *  - active (isActive=true): tab bar (Songs/Playlists/search) + the player by
 *    default;
 *  - Songs → recents rows, Playlists → playlist rows;
 *  - tapping a row plays it and returns to the player view;
 *  - the search icon opens the search input;
 *  - the player surface is per-variant (Now Playing card / minimal art /
 *    compact bar).
 *
 * useSpotifyLibrary / useSpotifySearch are mocked (data sources), and each
 * player surface is mocked so the tests focus on the layout's own routing.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PersonalSpotifyAdaptiveLayout } from '@/components/widgets/MusicWidget/PersonalSpotifyAdaptiveLayout';
import type { MusicLayout } from '@/types';
import type { UseSpotifyLibraryReturn } from '@/hooks/useSpotifyLibrary';
import type { UseSpotifySearchReturn } from '@/hooks/useSpotifySearch';

const mockLibrary = vi.fn<() => UseSpotifyLibraryReturn>();
vi.mock('@/hooks/useSpotifyLibrary', () => ({
  useSpotifyLibrary: () => mockLibrary(),
}));

const mockSearch = vi.fn<(query: string) => UseSpotifySearchReturn>();
vi.mock('@/hooks/useSpotifySearch', () => ({
  useSpotifySearch: (q: string) => mockSearch(q),
}));

// Each player surface is mocked with a distinct marker so the per-variant
// player can be asserted independently of its internal markup.
vi.mock(
  '@/components/widgets/MusicWidget/PersonalSpotifyNowPlayingTab',
  () => ({
    PersonalSpotifyNowPlayingTab: ({ url }: { url: string | null }) => (
      <div>mock-default-player url={String(url)}</div>
    ),
  })
);
vi.mock('@/components/widgets/MusicWidget/PersonalSpotifyMinimalView', () => ({
  PersonalSpotifyMinimalView: ({ url }: { url: string | null }) => (
    <div>mock-minimal-player url={String(url)}</div>
  ),
}));
vi.mock('@/components/widgets/MusicWidget/PersonalSpotifyCompactBar', () => ({
  PersonalSpotifyCompactBar: ({ url }: { url: string | null }) => (
    <div>mock-small-player url={String(url)}</div>
  ),
}));

const PLAYER_MARKER: Record<MusicLayout, RegExp> = {
  default: /mock-default-player/i,
  minimal: /mock-minimal-player/i,
  small: /mock-small-player/i,
};

const library: UseSpotifyLibraryReturn = {
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

const playbackProps = {
  url: 'spotify:track:t1' as string | null,
  isPremium: true,
  sdkFailed: false,
  isReady: true,
  currentTrack: null,
  isPlaying: false,
  repeatMode: 0,
  shuffle: false,
  onTogglePlay: vi.fn(),
  onNext: vi.fn(),
  onPrevious: vi.fn(),
  onCycleRepeat: vi.fn(),
  onToggleShuffle: vi.fn(),
};

const renderLayout = (
  overrides: Partial<
    React.ComponentProps<typeof PersonalSpotifyAdaptiveLayout>
  > = {}
) =>
  render(
    <PersonalSpotifyAdaptiveLayout
      variant="default"
      isActive
      currentUri="spotify:track:t1"
      onPlay={vi.fn()}
      onReconnect={vi.fn()}
      playbackProps={playbackProps}
      {...overrides}
    />
  );

const VARIANTS: MusicLayout[] = ['default', 'minimal', 'small'];

describe('PersonalSpotifyAdaptiveLayout', () => {
  beforeEach(() => {
    // Default the search hook to "no results" so non-search tests are stable.
    mockSearch.mockReturnValue({
      results: [],
      isSearching: false,
      searchError: null,
    });
  });

  describe.each(VARIANTS)('variant: %s', (variant) => {
    const marker = PLAYER_MARKER[variant];

    it('at rest (isActive=false) shows ONLY the variant player — no tab bar', () => {
      mockLibrary.mockReturnValue(library);
      renderLayout({ variant, isActive: false });
      expect(screen.getByText(marker)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Songs' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Playlists' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Search' })).toBeNull();
    });

    it('active shows the tab bar and the variant player by default', () => {
      mockLibrary.mockReturnValue(library);
      renderLayout({ variant });
      expect(screen.getByRole('button', { name: 'Songs' })).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Playlists' })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Search' })
      ).toBeInTheDocument();
      // No tab selected by default → the variant's player is shown.
      expect(screen.getByText(marker)).toBeInTheDocument();
    });

    it('Songs shows the recents rows (player hidden while browsing)', () => {
      mockLibrary.mockReturnValue(library);
      renderLayout({ variant });
      fireEvent.click(screen.getByRole('button', { name: 'Songs' }));
      expect(screen.getByText('Banana Pancakes')).toBeInTheDocument();
      expect(screen.queryByText(marker)).toBeNull();
    });

    it('Playlists shows the playlist rows', () => {
      mockLibrary.mockReturnValue(library);
      renderLayout({ variant });
      fireEvent.click(screen.getByRole('button', { name: 'Playlists' }));
      expect(screen.getByText('Morning Mix')).toBeInTheDocument();
    });

    it('tapping a row plays it and returns to the variant player view', () => {
      mockLibrary.mockReturnValue(library);
      const onPlay = vi.fn();
      renderLayout({ variant, onPlay });
      fireEvent.click(screen.getByRole('button', { name: 'Songs' }));
      fireEvent.click(screen.getByText('Banana Pancakes'));
      expect(onPlay).toHaveBeenCalledWith({
        type: 'track',
        uri: 'spotify:track:t1',
      });
      // Returns to the player view (recents row no longer rendered).
      expect(screen.getByText(marker)).toBeInTheDocument();
      expect(screen.queryByText('Banana Pancakes')).toBeNull();
    });

    it('the search icon opens the search input', () => {
      mockLibrary.mockReturnValue(library);
      renderLayout({ variant });
      fireEvent.click(screen.getByRole('button', { name: 'Search' }));
      expect(
        screen.getByRole('textbox', { name: /Search Spotify/i })
      ).toBeInTheDocument();
    });
  });

  it('search with an empty query shows recents below the input', () => {
    mockLibrary.mockReturnValue(library);
    renderLayout();
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByText('Banana Pancakes')).toBeInTheDocument();
  });

  it('Songs shows a scope reconnect banner when the library errors on scope', () => {
    mockLibrary.mockReturnValue({
      ...library,
      recents: [],
      playlists: [],
      error: { kind: 'scope' },
    });
    const onReconnect = vi.fn();
    renderLayout({ onReconnect });
    fireEvent.click(screen.getByRole('button', { name: 'Songs' }));
    fireEvent.click(screen.getByRole('button', { name: /Reconnect/i }));
    expect(onReconnect).toHaveBeenCalledOnce();
  });
});
