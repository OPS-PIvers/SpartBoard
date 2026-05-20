/**
 * SpotifyTransportControls — the single shared transport row used by all three
 * personal-Spotify player surfaces. These tests verify the standard
 * shuffle·prev·play·next·repeat control set: all five render with accessible
 * names, each forwards to its handler, shuffle/repeat reflect active state
 * (aria-pressed + Repeat1 icon at mode 2), and everything is disabled until the
 * device is ready.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SpotifyTransportControls } from '@/components/widgets/MusicWidget/SpotifyTransportControls';

const base = {
  isReady: true,
  isPlaying: false,
  repeatMode: 0,
  shuffle: false,
  onTogglePlay: vi.fn(),
  onPrevious: vi.fn(),
  onNext: vi.fn(),
  onCycleRepeat: vi.fn(),
  onToggleShuffle: vi.fn(),
};

describe('SpotifyTransportControls', () => {
  it('renders all five controls with accessible names', () => {
    render(<SpotifyTransportControls {...base} />);
    expect(
      screen.getByRole('button', { name: /Shuffle/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Previous/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Play$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Next/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Repeat/i })).toBeInTheDocument();
  });

  it('forwards each control click to its handler', () => {
    const handlers = {
      onTogglePlay: vi.fn(),
      onPrevious: vi.fn(),
      onNext: vi.fn(),
      onCycleRepeat: vi.fn(),
      onToggleShuffle: vi.fn(),
    };
    render(<SpotifyTransportControls {...base} {...handlers} />);

    fireEvent.click(screen.getByRole('button', { name: /Shuffle/i }));
    fireEvent.click(screen.getByRole('button', { name: /Previous/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Play$/i }));
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    fireEvent.click(screen.getByRole('button', { name: /Repeat/i }));

    expect(handlers.onToggleShuffle).toHaveBeenCalledOnce();
    expect(handlers.onPrevious).toHaveBeenCalledOnce();
    expect(handlers.onTogglePlay).toHaveBeenCalledOnce();
    expect(handlers.onNext).toHaveBeenCalledOnce();
    expect(handlers.onCycleRepeat).toHaveBeenCalledOnce();
  });

  it('labels the toggle "Pause" while playing', () => {
    render(<SpotifyTransportControls {...base} isPlaying />);
    expect(screen.getByRole('button', { name: /Pause/i })).toBeInTheDocument();
  });

  it('reflects shuffle active state via aria-pressed', () => {
    render(<SpotifyTransportControls {...base} shuffle />);
    expect(screen.getByRole('button', { name: /Shuffle/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('shows the off-state aria label and aria-pressed=false at repeatMode 0', () => {
    render(<SpotifyTransportControls {...base} repeatMode={0} />);
    const repeat = screen.getByRole('button', { name: /Repeat off/i });
    expect(repeat).toHaveAttribute('aria-pressed', 'false');
  });

  it('reflects repeat-all (context) active state at repeatMode 1', () => {
    render(<SpotifyTransportControls {...base} repeatMode={1} />);
    const repeat = screen.getByRole('button', { name: /Repeat all/i });
    expect(repeat).toHaveAttribute('aria-pressed', 'true');
  });

  it('uses the Repeat1 icon and "Repeat one" label at repeatMode 2', () => {
    const { container } = render(
      <SpotifyTransportControls {...base} repeatMode={2} />
    );
    const repeat = screen.getByRole('button', { name: /Repeat one/i });
    expect(repeat).toHaveAttribute('aria-pressed', 'true');
    // lucide Repeat1 renders the "repeat-1" class; plain Repeat does not.
    expect(container.querySelector('.lucide-repeat-1')).toBeInTheDocument();
  });

  it('disables all five controls when not ready', () => {
    render(<SpotifyTransportControls {...base} isReady={false} />);
    expect(screen.getByRole('button', { name: /Shuffle/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Previous/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Play$/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Next/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Repeat/i })).toBeDisabled();
  });
});
