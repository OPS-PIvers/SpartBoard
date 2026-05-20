/**
 * BrowsePanel is the extracted tab strip + active-tab body shared by the
 * default layout (inline, no onClose) and the small/minimal browse overlay
 * (with onClose → renders an X close button). Leaf tabs are mocked so this
 * focuses on the panel's own wiring (tabs, body routing, optional close).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PersonalSpotifyBrowsePanel } from '@/components/widgets/MusicWidget/PersonalSpotifyBrowsePanel';

vi.mock('@/components/widgets/MusicWidget/PersonalSpotifyLibraryTab', () => ({
  PersonalSpotifyLibraryTab: () => <div>mock-library</div>,
}));
vi.mock('@/components/widgets/MusicWidget/PersonalSpotifySearchTab', () => ({
  PersonalSpotifySearchTab: () => <div>mock-search</div>,
}));
vi.mock(
  '@/components/widgets/MusicWidget/PersonalSpotifyNowPlayingTab',
  () => ({
    PersonalSpotifyNowPlayingTab: () => <div>mock-now-playing</div>,
  })
);

const playbackProps = {
  url: null,
  isPremium: true,
  sdkFailed: false,
  isReady: true,
  currentTrack: null,
  isPlaying: false,
  onTogglePlay: vi.fn(),
  onNext: vi.fn(),
  onPrevious: vi.fn(),
};

const baseProps = {
  activeTab: 'library' as const,
  onTabChange: vi.fn(),
  isAudioActive: false,
  currentUri: null,
  onPlay: vi.fn(),
  onReconnect: vi.fn(),
  onSwitchToLibrary: vi.fn(),
  playbackProps,
};

describe('PersonalSpotifyBrowsePanel', () => {
  it('renders the tab strip and the active tab body', () => {
    render(<PersonalSpotifyBrowsePanel {...baseProps} />);
    expect(
      screen.getByRole('button', { name: /Playlists/i })
    ).toBeInTheDocument();
    expect(screen.getByText('mock-library')).toBeInTheDocument();
  });

  it('routes to the search body when activeTab is search', () => {
    render(<PersonalSpotifyBrowsePanel {...baseProps} activeTab="search" />);
    expect(screen.getByText('mock-search')).toBeInTheDocument();
  });

  it('does not render the close button when onClose is omitted', () => {
    render(<PersonalSpotifyBrowsePanel {...baseProps} />);
    expect(screen.queryByRole('button', { name: /Close browse/i })).toBeNull();
  });

  it('renders the close button and calls onClose when provided', () => {
    const onClose = vi.fn();
    render(<PersonalSpotifyBrowsePanel {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Close browse/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
