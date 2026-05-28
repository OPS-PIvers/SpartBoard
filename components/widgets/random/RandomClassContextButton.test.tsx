import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RandomClassContextButton } from './RandomClassContextButton';
import { useDashboard } from '@/context/useDashboard';
import { getLocalIsoDate } from '@/utils/localDate';
import type { ClassRoster } from '@/types';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));

const today = getLocalIsoDate();

const makeRoster = (
  id: string,
  name: string,
  studentCount = 20,
  absentIds: string[] = []
): ClassRoster => ({
  id,
  name,
  driveFileId: null,
  studentCount,
  createdAt: 0,
  students: Array.from({ length: studentCount }, (_, i) => ({
    id: `${id}-s${i}`,
    firstName: `First${i}`,
    lastName: `Last${i}`,
    pin: String(i + 1).padStart(2, '0'),
  })),
  absent:
    absentIds.length > 0 ? { date: today, studentIds: absentIds } : undefined,
});

const noop = () => undefined;

const mockUseDashboard = (
  rosters: ClassRoster[],
  activeRosterId: string | null,
  setActiveRoster: ReturnType<typeof vi.fn> = vi.fn()
) => {
  (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    rosters,
    activeRosterId,
    setActiveRoster,
  });
  return setActiveRoster;
};

describe('RandomClassContextButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when there is no active roster', () => {
    mockUseDashboard([], null);
    const { container } = render(
      <RandomClassContextButton
        roster={null}
        rosterMode="class"
        onOpenAbsentModal={noop}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders an interactive button when a roster is active', () => {
    const r = makeRoster('r1', 'Period 1');
    mockUseDashboard([r], 'r1');
    render(
      <RandomClassContextButton
        roster={r}
        rosterMode="class"
        onOpenAbsentModal={noop}
      />
    );
    const button = screen.getByRole('button', {
      name: /Active class: Period 1/i,
    });
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows an absent count badge when students are marked absent today', () => {
    const r = makeRoster('r1', 'Period 1', 20, ['r1-s0', 'r1-s1', 'r1-s2']);
    mockUseDashboard([r], 'r1');
    render(
      <RandomClassContextButton
        roster={r}
        rosterMode="class"
        onOpenAbsentModal={noop}
      />
    );
    // The badge is aria-hidden, so we match its text content directly inside
    // the trigger. The accessible name carries the count for screen readers
    // via the pluralized `triggerAriaWithAbsent_other` key in en.json.
    expect(
      screen.getByRole('button', { name: /3 students marked absent today/i })
    ).toBeInTheDocument();
  });

  it('uses singular grammar in the aria-label when exactly one student is absent', () => {
    const r = makeRoster('r1', 'Period 1', 20, ['r1-s0']);
    mockUseDashboard([r], 'r1');
    render(
      <RandomClassContextButton
        roster={r}
        rosterMode="class"
        onOpenAbsentModal={noop}
      />
    );
    expect(
      screen.getByRole('button', { name: /1 student marked absent today/i })
    ).toBeInTheDocument();
  });

  it('omits absent phrasing from the aria-label in custom-names mode', () => {
    const r = makeRoster('r1', 'Period 1', 20, ['r1-s0', 'r1-s1']);
    const r2 = makeRoster('r2', 'Period 2');
    mockUseDashboard([r, r2], 'r1');
    render(
      <RandomClassContextButton
        roster={r}
        rosterMode="custom"
        onOpenAbsentModal={noop}
      />
    );
    // In custom mode the widget intentionally ignores roster absence — the
    // accessible name should not announce "marked absent today" because no
    // absent affordance is reachable from this chip.
    const trigger = screen.getByRole('button', {
      name: /Active class: Period 1/i,
    });
    expect(trigger.getAttribute('aria-label')).not.toMatch(/absent/i);
  });

  it('hides the absent-count badge when canMarkAbsent is false (stale state)', () => {
    // Class roster with absent IDs but zero students — old AbsentButton
    // returned null in this case; the new combined chip must not show a
    // misleading red badge that the user cannot clear.
    const r: ClassRoster = {
      id: 'r1',
      name: 'Period 1',
      driveFileId: null,
      studentCount: 0,
      createdAt: 0,
      students: [],
      absent: { date: today, studentIds: ['ghost-1', 'ghost-2'] },
    };
    mockUseDashboard([r], 'r1');
    render(
      <RandomClassContextButton
        roster={r}
        rosterMode="class"
        onOpenAbsentModal={noop}
      />
    );
    // The badge text would be "2" if rendered — it must not appear.
    expect(screen.queryByText('2')).not.toBeInTheDocument();
  });

  it('opens the popover and lists rosters as menuitemradio (multi-class)', () => {
    const r1 = makeRoster('r1', 'Period 1');
    const r2 = makeRoster('r2', 'Period 2');
    mockUseDashboard([r1, r2], 'r1');
    render(
      <RandomClassContextButton
        roster={r1}
        rosterMode="class"
        onOpenAbsentModal={noop}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Active class: Period 1/i })
    );
    const items = screen.getAllByRole('menuitemradio');
    expect(items).toHaveLength(2);
    const active = items.find((i) => i.getAttribute('aria-checked') === 'true');
    expect(active?.textContent).toMatch(/Period 1/);
  });

  it('focuses the active roster (aria-checked) on open, not the first item', () => {
    const r1 = makeRoster('r1', 'Period 1');
    const r2 = makeRoster('r2', 'Period 2');
    const r3 = makeRoster('r3', 'Period 3');
    mockUseDashboard([r1, r2, r3], 'r3');
    render(
      <RandomClassContextButton
        roster={r3}
        rosterMode="class"
        onOpenAbsentModal={noop}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Active class: Period 3/i })
    );
    const active = screen.getByRole('menuitemradio', {
      checked: true,
    });
    expect(document.activeElement).toBe(active);
  });

  it('calls setActiveRoster when a different class is picked', () => {
    const r1 = makeRoster('r1', 'Period 1');
    const r2 = makeRoster('r2', 'Period 2');
    const setActiveRoster = mockUseDashboard([r1, r2], 'r1');
    render(
      <RandomClassContextButton
        roster={r1}
        rosterMode="class"
        onOpenAbsentModal={noop}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Active class: Period 1/i })
    );
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Period 2/i }));
    expect(setActiveRoster).toHaveBeenCalledWith('r2');
  });

  it('opens the absent modal via the popover action', () => {
    const r = makeRoster('r1', 'Period 1');
    mockUseDashboard([r], 'r1');
    const onOpen = vi.fn();
    render(
      <RandomClassContextButton
        roster={r}
        rosterMode="class"
        onOpenAbsentModal={onOpen}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Active class: Period 1/i })
    );
    // Mark Absent has role="menuitem" so AT navigates it via menu mode
    // (alongside the menuitemradio class switchers).
    fireEvent.click(
      screen.getByRole('menuitem', { name: /Mark absent students/i })
    );
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('hides the absent action in custom roster mode', () => {
    const r1 = makeRoster('r1', 'Period 1');
    const r2 = makeRoster('r2', 'Period 2');
    mockUseDashboard([r1, r2], 'r1');
    render(
      <RandomClassContextButton
        roster={r1}
        rosterMode="custom"
        onOpenAbsentModal={noop}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Active class: Period 1/i })
    );
    // Class switcher still works in custom mode (teachers may switch back),
    // but marking absent doesn't apply — that action belongs to class mode.
    expect(
      screen.queryByRole('menuitem', { name: /Mark absent students/i })
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(2);
  });

  it('renders a static (non-interactive) chip when only one class exists and rosterMode is custom', () => {
    const r = makeRoster('r1', 'Period 1');
    mockUseDashboard([r], 'r1');
    const { container } = render(
      <RandomClassContextButton
        roster={r}
        rosterMode="custom"
        onOpenAbsentModal={noop}
      />
    );
    // No switch (single roster) and no absent action (custom mode) → the
    // chip has nothing actionable behind it, so it renders as a static div
    // rather than a button.
    expect(
      screen.queryByRole('button', { name: /Active class: Period 1/i })
    ).not.toBeInTheDocument();
    expect(container.firstChild).not.toBeNull();
  });
});
