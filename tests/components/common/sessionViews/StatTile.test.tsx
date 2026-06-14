import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Users } from 'lucide-react';
import { StatTile } from '@/components/common/sessionViews/StatTile';

describe('StatTile', () => {
  it('renders value and label on a glass surface', () => {
    render(<StatTile icon={<Users />} value={12} label="Joined" />);
    const tile = screen.getByTestId('stat-tile');
    expect(tile).toHaveTextContent('12');
    expect(tile).toHaveTextContent('Joined');
    expect(tile.className).toContain('bg-white/70');
  });

  it('renders as a button and fires onClick when interactive', () => {
    const onClick = vi.fn();
    render(
      <StatTile
        icon={<Users />}
        value={3}
        label="Active"
        interactive
        onClick={onClick}
      />
    );
    const tile = screen.getByTestId('stat-tile');
    expect(tile.tagName).toBe('BUTTON');
    fireEvent.click(tile);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows the selected ring when selected', () => {
    render(
      <StatTile
        icon={<Users />}
        value={3}
        label="Active"
        interactive
        selected
      />
    );
    expect(screen.getByTestId('stat-tile').className).toContain(
      'ring-brand-blue-primary/40'
    );
  });
});
