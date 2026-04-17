import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { ActiveClassChip } from './ActiveClassChip';
import { useDashboard } from '@/context/useDashboard';

vi.mock('@/context/useDashboard');

type MockRoster = { id: string; name: string; studentCount: number };

const makeDashboard = (overrides: {
  rosters: MockRoster[];
  activeRosterId: string | null;
  setActiveRoster?: Mock;
}) => ({
  rosters: overrides.rosters,
  activeRosterId: overrides.activeRosterId,
  setActiveRoster: overrides.setActiveRoster ?? (vi.fn() as Mock),
});

describe('ActiveClassChip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when there is no active roster', () => {
    (useDashboard as Mock).mockReturnValue(
      makeDashboard({ rosters: [], activeRosterId: null })
    );
    const { container } = render(<ActiveClassChip />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a non-interactive chip when only one roster exists', () => {
    (useDashboard as Mock).mockReturnValue(
      makeDashboard({
        rosters: [{ id: 'r1', name: 'Period 1', studentCount: 20 }],
        activeRosterId: 'r1',
      })
    );
    render(<ActiveClassChip />);
    expect(screen.getByText('Period 1')).toBeInTheDocument();
    // Not rendered as a button — clicking should not open a menu
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('renders an interactive chip when multiple rosters exist', () => {
    (useDashboard as Mock).mockReturnValue(
      makeDashboard({
        rosters: [
          { id: 'r1', name: 'Period 1', studentCount: 20 },
          { id: 'r2', name: 'Period 2', studentCount: 22 },
        ],
        activeRosterId: 'r1',
      })
    );
    render(<ActiveClassChip />);
    const trigger = screen.getByRole('button', { name: /active class/i });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens a menu of rosters when the chip is clicked', async () => {
    const user = userEvent.setup();
    (useDashboard as Mock).mockReturnValue(
      makeDashboard({
        rosters: [
          { id: 'r1', name: 'Period 1', studentCount: 20 },
          { id: 'r2', name: 'Period 2', studentCount: 22 },
        ],
        activeRosterId: 'r1',
      })
    );
    render(<ActiveClassChip />);
    await user.click(screen.getByRole('button', { name: /active class/i }));

    const menu = screen.getByRole('menu', { name: /switch active class/i });
    expect(menu).toBeInTheDocument();

    const options = screen.getAllByRole('menuitemradio');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveAttribute('aria-checked', 'true');
    expect(options[1]).toHaveAttribute('aria-checked', 'false');
  });

  it('calls setActiveRoster and closes the menu when a different class is picked', async () => {
    const user = userEvent.setup();
    const setActiveRoster = vi.fn() as Mock;
    (useDashboard as Mock).mockReturnValue(
      makeDashboard({
        rosters: [
          { id: 'r1', name: 'Period 1', studentCount: 20 },
          { id: 'r2', name: 'Period 2', studentCount: 22 },
        ],
        activeRosterId: 'r1',
        setActiveRoster,
      })
    );
    render(<ActiveClassChip />);
    await user.click(screen.getByRole('button', { name: /active class/i }));
    await user.click(screen.getByRole('menuitemradio', { name: /Period 2/ }));

    expect(setActiveRoster).toHaveBeenCalledTimes(1);
    expect(setActiveRoster).toHaveBeenCalledWith('r2');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('does not call setActiveRoster when the already-active class is picked', async () => {
    const user = userEvent.setup();
    const setActiveRoster = vi.fn() as Mock;
    (useDashboard as Mock).mockReturnValue(
      makeDashboard({
        rosters: [
          { id: 'r1', name: 'Period 1', studentCount: 20 },
          { id: 'r2', name: 'Period 2', studentCount: 22 },
        ],
        activeRosterId: 'r1',
        setActiveRoster,
      })
    );
    render(<ActiveClassChip />);
    await user.click(screen.getByRole('button', { name: /active class/i }));
    await user.click(screen.getByRole('menuitemradio', { name: /Period 1/ }));

    expect(setActiveRoster).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes the menu when Escape is pressed', async () => {
    const user = userEvent.setup();
    (useDashboard as Mock).mockReturnValue(
      makeDashboard({
        rosters: [
          { id: 'r1', name: 'Period 1', studentCount: 20 },
          { id: 'r2', name: 'Period 2', studentCount: 22 },
        ],
        activeRosterId: 'r1',
      })
    );
    render(<ActiveClassChip />);
    await user.click(screen.getByRole('button', { name: /active class/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes the menu when clicking outside', async () => {
    const user = userEvent.setup();
    (useDashboard as Mock).mockReturnValue(
      makeDashboard({
        rosters: [
          { id: 'r1', name: 'Period 1', studentCount: 20 },
          { id: 'r2', name: 'Period 2', studentCount: 22 },
        ],
        activeRosterId: 'r1',
      })
    );
    render(
      <div>
        <ActiveClassChip />
        <button type="button">outside</button>
      </div>
    );

    await user.click(screen.getByRole('button', { name: /active class/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
