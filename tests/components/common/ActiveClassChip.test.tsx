import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActiveClassChip } from '@/components/common/ActiveClassChip';
import { useDashboard } from '@/context/useDashboard';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));

const makeRoster = (id: string, name: string, studentCount = 20) => ({
  id,
  name,
  driveFileId: null,
  studentCount,
  createdAt: 0,
  students: [],
});

const mockUseDashboard = (
  overrides: Partial<ReturnType<typeof useDashboard>> = {}
) => {
  (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    rosters: [],
    activeRosterId: null,
    setActiveRoster: vi.fn(),
    ...overrides,
  });
};

describe('ActiveClassChip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders null when there is no active roster', () => {
    mockUseDashboard({ rosters: [], activeRosterId: null });
    const { container } = render(<ActiveClassChip />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a static chip (no button, no chevron) when only one roster exists', () => {
    const rosters = [makeRoster('r1', 'Period 1')];
    mockUseDashboard({ rosters, activeRosterId: 'r1' });

    render(<ActiveClassChip />);

    expect(screen.getByText('Period 1')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /active class/i })
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Active class: Period 1')).toBeInTheDocument();
  });

  it('renders an interactive button when multiple rosters exist', () => {
    const rosters = [
      makeRoster('r1', 'Period 1'),
      makeRoster('r2', 'Period 2'),
    ];
    mockUseDashboard({ rosters, activeRosterId: 'r1' });

    render(<ActiveClassChip />);

    const button = screen.getByRole('button', {
      name: /active class: period 1/i,
    });
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the menu on click and lists all rosters as menuitemradio', () => {
    const rosters = [
      makeRoster('r1', 'Period 1'),
      makeRoster('r2', 'Period 2'),
    ];
    mockUseDashboard({ rosters, activeRosterId: 'r1' });

    render(<ActiveClassChip />);

    fireEvent.click(screen.getByRole('button', { name: /active class/i }));

    const menu = screen.getByRole('menu', { name: 'Switch active class' });
    expect(menu).toBeInTheDocument();

    const items = screen.getAllByRole('menuitemradio');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveAttribute('aria-checked', 'true');
    expect(items[1]).toHaveAttribute('aria-checked', 'false');
  });

  it('calls setActiveRoster when a non-active menu item is clicked', () => {
    const setActiveRoster = vi.fn();
    const rosters = [
      makeRoster('r1', 'Period 1'),
      makeRoster('r2', 'Period 2'),
    ];
    mockUseDashboard({ rosters, activeRosterId: 'r1', setActiveRoster });

    render(<ActiveClassChip />);

    fireEvent.click(screen.getByRole('button', { name: /active class/i }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /period 2/i }));

    expect(setActiveRoster).toHaveBeenCalledWith('r2');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('does not call setActiveRoster when the already-active item is clicked', () => {
    const setActiveRoster = vi.fn();
    const rosters = [
      makeRoster('r1', 'Period 1'),
      makeRoster('r2', 'Period 2'),
    ];
    mockUseDashboard({ rosters, activeRosterId: 'r1', setActiveRoster });

    render(<ActiveClassChip />);

    fireEvent.click(screen.getByRole('button', { name: /active class/i }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /period 1/i }));

    expect(setActiveRoster).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes the menu when Escape is pressed', () => {
    const rosters = [
      makeRoster('r1', 'Period 1'),
      makeRoster('r2', 'Period 2'),
    ];
    mockUseDashboard({ rosters, activeRosterId: 'r1' });

    render(<ActiveClassChip />);
    fireEvent.click(screen.getByRole('button', { name: /active class/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes the menu on outside mousedown', () => {
    const rosters = [
      makeRoster('r1', 'Period 1'),
      makeRoster('r2', 'Period 2'),
    ];
    mockUseDashboard({ rosters, activeRosterId: 'r1' });

    render(
      <div>
        <ActiveClassChip />
        <button type="button" data-testid="outside">
          Outside
        </button>
      </div>
    );

    fireEvent.click(screen.getByRole('button', { name: /active class/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('focuses the active roster when the menu opens', () => {
    const rosters = [
      makeRoster('r1', 'Period 1'),
      makeRoster('r2', 'Period 2'),
      makeRoster('r3', 'Period 3'),
    ];
    mockUseDashboard({ rosters, activeRosterId: 'r2' });

    render(<ActiveClassChip />);
    fireEvent.click(screen.getByRole('button', { name: /active class/i }));

    expect(
      screen.getByRole('menuitemradio', { name: /period 2/i })
    ).toHaveFocus();
  });

  it('moves focus with ArrowDown / ArrowUp inside the menu', async () => {
    const user = userEvent.setup();
    const rosters = [
      makeRoster('r1', 'Period 1'),
      makeRoster('r2', 'Period 2'),
      makeRoster('r3', 'Period 3'),
    ];
    mockUseDashboard({ rosters, activeRosterId: 'r1' });

    render(<ActiveClassChip />);
    fireEvent.click(screen.getByRole('button', { name: /active class/i }));

    expect(
      screen.getByRole('menuitemradio', { name: /period 1/i })
    ).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(
      screen.getByRole('menuitemradio', { name: /period 2/i })
    ).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(
      screen.getByRole('menuitemradio', { name: /period 3/i })
    ).toHaveFocus();

    // Wraps to first.
    await user.keyboard('{ArrowDown}');
    expect(
      screen.getByRole('menuitemradio', { name: /period 1/i })
    ).toHaveFocus();

    // Wraps backward.
    await user.keyboard('{ArrowUp}');
    expect(
      screen.getByRole('menuitemradio', { name: /period 3/i })
    ).toHaveFocus();
  });

  it('returns focus to the trigger when the menu closes', () => {
    const rosters = [
      makeRoster('r1', 'Period 1'),
      makeRoster('r2', 'Period 2'),
    ];
    mockUseDashboard({ rosters, activeRosterId: 'r1' });

    render(<ActiveClassChip />);
    const trigger = screen.getByRole('button', { name: /active class/i });
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
