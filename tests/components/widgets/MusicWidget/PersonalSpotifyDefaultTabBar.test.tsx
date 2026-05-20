/**
 * PersonalSpotifyDefaultTabBar — three left-aligned icon+text pills
 * (Songs / Playlists / Search) shown above the player while the Default-layout
 * widget is selected. Verifies pill selection wiring and the search
 * expand/collapse toggle. (ResizeObserver is a no-op in tests/setup.ts, so the
 * text labels stay visible — we query by accessible name, which works in either
 * icon-only or icon+text mode.)
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PersonalSpotifyDefaultTabBar } from '@/components/widgets/MusicWidget/PersonalSpotifyDefaultTabBar';

const baseProps = {
  activeView: 'player' as const,
  searchOpen: false,
  query: '',
  onSelectView: vi.fn(),
  onToggleSearch: vi.fn(),
  onQueryChange: vi.fn(),
};

describe('PersonalSpotifyDefaultTabBar', () => {
  it('renders three pills — Songs, Playlists, Search — with accessible names', () => {
    render(<PersonalSpotifyDefaultTabBar {...baseProps} />);
    expect(screen.getByRole('button', { name: 'Songs' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Playlists' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
  });

  it('renders the pills left-aligned in Songs, Playlists, Search order', () => {
    render(<PersonalSpotifyDefaultTabBar {...baseProps} />);
    const names = screen
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(['Songs', 'Playlists', 'Search']);
  });

  it('marks the Search pill with aria-expanded reflecting search state', () => {
    const { rerender } = render(
      <PersonalSpotifyDefaultTabBar {...baseProps} />
    );
    expect(screen.getByRole('button', { name: 'Search' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    rerender(<PersonalSpotifyDefaultTabBar {...baseProps} searchOpen />);
    // When open the visible Search trigger is the input; the collapsed pill is
    // hidden, so just assert the input rendered (covered below).
    expect(
      screen.getByRole('textbox', { name: /Search Spotify/i })
    ).toBeInTheDocument();
  });

  it('clicking Songs selects the songs view', () => {
    const onSelectView = vi.fn();
    render(
      <PersonalSpotifyDefaultTabBar
        {...baseProps}
        onSelectView={onSelectView}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Songs' }));
    expect(onSelectView).toHaveBeenCalledWith('songs');
  });

  it('clicking Playlists selects the playlists view', () => {
    const onSelectView = vi.fn();
    render(
      <PersonalSpotifyDefaultTabBar
        {...baseProps}
        onSelectView={onSelectView}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Playlists' }));
    expect(onSelectView).toHaveBeenCalledWith('playlists');
  });

  it('clicking an already-active pill returns to the player view', () => {
    const onSelectView = vi.fn();
    render(
      <PersonalSpotifyDefaultTabBar
        {...baseProps}
        activeView="songs"
        onSelectView={onSelectView}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Songs' }));
    expect(onSelectView).toHaveBeenCalledWith('player');
  });

  it('marks the active pill with aria-pressed', () => {
    render(<PersonalSpotifyDefaultTabBar {...baseProps} activeView="songs" />);
    expect(screen.getByRole('button', { name: 'Songs' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Playlists' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('clicking the search button opens search', () => {
    const onToggleSearch = vi.fn();
    render(
      <PersonalSpotifyDefaultTabBar
        {...baseProps}
        onToggleSearch={onToggleSearch}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(onToggleSearch).toHaveBeenCalledWith(true);
  });

  it('renders a search input + close button when searchOpen', () => {
    render(
      <PersonalSpotifyDefaultTabBar {...baseProps} searchOpen query="x" />
    );
    expect(
      screen.getByRole('textbox', { name: /Search Spotify/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Close search/i })
    ).toBeInTheDocument();
  });

  it('typing in the search input forwards to onQueryChange', () => {
    const onQueryChange = vi.fn();
    render(
      <PersonalSpotifyDefaultTabBar
        {...baseProps}
        searchOpen
        onQueryChange={onQueryChange}
      />
    );
    fireEvent.change(screen.getByRole('textbox', { name: /Search Spotify/i }), {
      target: { value: 'beatles' },
    });
    expect(onQueryChange).toHaveBeenCalledWith('beatles');
  });

  it('clicking the close button closes search', () => {
    const onToggleSearch = vi.fn();
    render(
      <PersonalSpotifyDefaultTabBar
        {...baseProps}
        searchOpen
        onToggleSearch={onToggleSearch}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Close search/i }));
    expect(onToggleSearch).toHaveBeenCalledWith(false);
  });
});
