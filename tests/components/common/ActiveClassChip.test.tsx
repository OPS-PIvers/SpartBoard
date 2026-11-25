import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

  it('renders a select listing every class with its count', () => {
    const rosters = [
      makeRoster('r1', 'Period 1', 24),
      makeRoster('r2', 'Period 2', 27),
    ];
    mockUseDashboard({ rosters, activeRosterId: 'r1' });

    render(<ActiveClassChip />);

    const select = screen.getByRole('combobox', {
      name: /active class: period 1/i,
    });
    expect(select).toHaveValue('r1');
    expect(
      screen.getByRole('option', { name: 'Period 2 (27)' })
    ).toBeInTheDocument();
  });

  it('calls setActiveRoster when another class is picked', () => {
    const setActiveRoster = vi.fn();
    mockUseDashboard({
      rosters: [makeRoster('r1', 'Period 1'), makeRoster('r2', 'Period 2')],
      activeRosterId: 'r1',
      setActiveRoster,
    });
    render(<ActiveClassChip />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'r2' } });
    expect(setActiveRoster).toHaveBeenCalledWith('r2');
  });
});

describe('ActiveClassChip — group submenu', () => {
  beforeEach(() => vi.clearAllMocks());

  const rosterWithGroup = () => ({
    ...makeRoster('r1', 'Sample 3', 32),
    students: Array.from({ length: 32 }, (_, i) => ({
      id: `s${i}`,
      firstName: `F${i}`,
      lastName: 'L',
      pin: String(i).padStart(2, '0'),
    })),
    groups: [
      {
        id: 'g1',
        name: 'Modified Assessments',
        studentIds: ['s0', 's1', 's2', 's3', 's4'],
      },
    ],
  });

  it('stays a plain class switcher when no groupSelection is passed', () => {
    mockUseDashboard({ rosters: [rosterWithGroup()], activeRosterId: 'r1' });
    render(<ActiveClassChip />);
    // One roster and no group picker ⇒ the static, non-interactive chip.
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('lists the class and its groups under the class name', () => {
    mockUseDashboard({ rosters: [rosterWithGroup()], activeRosterId: 'r1' });
    render(
      <ActiveClassChip
        groupSelection={{ selectedGroupId: null, onSelectGroup: vi.fn() }}
      />
    );
    expect(screen.getByRole('combobox')).toHaveValue('r1');
    expect(screen.getByRole('group', { name: 'Sample 3' })).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Modified Assessments (5)' })
    ).toBeInTheDocument();
  });

  it('reports the picked group to the host', () => {
    const onSelectGroup = vi.fn();
    mockUseDashboard({ rosters: [rosterWithGroup()], activeRosterId: 'r1' });
    render(
      <ActiveClassChip
        groupSelection={{ selectedGroupId: null, onSelectGroup }}
      />
    );
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'r1|g1' },
    });
    expect(onSelectGroup).toHaveBeenCalledWith('g1');
  });

  it('shows the group size on the front face, never the group name', () => {
    mockUseDashboard({ rosters: [rosterWithGroup()], activeRosterId: 'r1' });
    const { container } = render(
      <ActiveClassChip
        groupSelection={{ selectedGroupId: 'g1', onSelectGroup: vi.fn() }}
      />
    );
    const face = container.querySelector('span.font-black');
    expect(face).toHaveTextContent('Sample 3 · 5 students');
    expect(face).not.toHaveTextContent('Modified Assessments');
    expect(screen.getByRole('combobox')).toHaveValue('r1|g1');
  });

  it('counts only members still on the roster', () => {
    const roster = rosterWithGroup();
    roster.groups[0].studentIds = ['s0', 's1', 'left-the-class'];
    mockUseDashboard({ rosters: [roster], activeRosterId: 'r1' });
    render(
      <ActiveClassChip
        groupSelection={{ selectedGroupId: 'g1', onSelectGroup: vi.fn() }}
      />
    );
    expect(screen.getByText('Sample 3 · 2 students')).toBeInTheDocument();
  });

  it('falls back to the whole class when the selected group is gone', () => {
    const roster = rosterWithGroup();
    roster.groups = [];
    mockUseDashboard({ rosters: [roster], activeRosterId: 'r1' });
    render(
      <ActiveClassChip
        groupSelection={{ selectedGroupId: 'g1', onSelectGroup: vi.fn() }}
      />
    );
    // No groups left ⇒ nothing to pick, so the chip is static again.
    expect(screen.getByText('Sample 3')).toBeInTheDocument();
  });

  it('clears the group when the teacher switches class', () => {
    const onSelectGroup = vi.fn();
    const setActiveRoster = vi.fn();
    mockUseDashboard({
      rosters: [rosterWithGroup(), makeRoster('r2', 'Period 4')],
      activeRosterId: 'r1',
      setActiveRoster,
    });
    render(
      <ActiveClassChip
        groupSelection={{ selectedGroupId: 'g1', onSelectGroup }}
      />
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'r2' } });
    expect(setActiveRoster).toHaveBeenCalledWith('r2');
    expect(onSelectGroup).toHaveBeenCalledWith(null);
  });
});
