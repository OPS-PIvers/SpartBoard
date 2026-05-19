/**
 * SpotifyResultRow renders a track/playlist/album row across all three
 * tabs. Verifies the playing indicator and onClick wiring.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SpotifyResultRow } from '@/components/widgets/MusicWidget/SpotifyResultRow';

describe('SpotifyResultRow', () => {
  const baseProps = {
    name: 'Banana Pancakes',
    subtitle: 'Jack Johnson',
    imageUrl: 'https://img.test/x.jpg',
    isPlaying: false,
    onClick: vi.fn(),
  };

  it('renders name, subtitle, and image', () => {
    render(<SpotifyResultRow {...baseProps} />);
    expect(screen.getByText('Banana Pancakes')).toBeInTheDocument();
    expect(screen.getByText('Jack Johnson')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://img.test/x.jpg'
    );
  });

  it('calls onClick when row is clicked', () => {
    const onClick = vi.fn();
    render(<SpotifyResultRow {...baseProps} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows the playing indicator when isPlaying is true', () => {
    render(<SpotifyResultRow {...baseProps} isPlaying />);
    expect(screen.getByLabelText('Currently playing')).toBeInTheDocument();
  });

  it('hides the playing indicator when isPlaying is false', () => {
    render(<SpotifyResultRow {...baseProps} isPlaying={false} />);
    expect(screen.queryByLabelText('Currently playing')).toBeNull();
  });
});
