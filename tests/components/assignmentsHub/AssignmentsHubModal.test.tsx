import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssignmentsHubModal } from '@/components/assignmentsHub/AssignmentsHubModal';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useQuizAssignments } from '@/hooks/useQuizAssignments';
import { useVideoActivityAssignments } from '@/hooks/useVideoActivityAssignments';
import { useGuidedLearningAssignments } from '@/hooks/useGuidedLearningAssignments';
import { useMiniAppAssignments } from '@/hooks/useMiniAppAssignments';
import { useAssignmentPseudonymsMulti } from '@/hooks/useAssignmentPseudonyms';
import { useAssignmentRosterStatus } from '@/hooks/useAssignmentRosterStatus';

vi.mock('@/context/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('@/context/useDashboard', () => ({ useDashboard: vi.fn() }));
vi.mock('@/hooks/useQuizAssignments', () => ({
  useQuizAssignments: vi.fn(),
}));
vi.mock('@/hooks/useVideoActivityAssignments', () => ({
  useVideoActivityAssignments: vi.fn(),
}));
vi.mock('@/hooks/useGuidedLearningAssignments', () => ({
  useGuidedLearningAssignments: vi.fn(),
}));
vi.mock('@/hooks/useMiniAppAssignments', () => ({
  useMiniAppAssignments: vi.fn(),
}));
vi.mock('@/hooks/useAssignmentPseudonyms', async () => {
  const actual = await vi.importActual<
    typeof import('@/hooks/useAssignmentPseudonyms')
  >('@/hooks/useAssignmentPseudonyms');
  return { ...actual, useAssignmentPseudonymsMulti: vi.fn() };
});
vi.mock('@/hooks/useAssignmentRosterStatus', () => ({
  useAssignmentRosterStatus: vi.fn(),
}));

const quizAssignment = {
  id: 'quiz-1',
  quizTitle: 'Fractions Quiz',
  className: 'Period 2',
  status: 'active' as const,
  createdAt: 100,
  targetMode: 'students' as const,
  targetSkippedCount: 2,
  openAt: null,
  closeAt: null,
};

const vaAssignment = {
  id: 'va-1',
  activityTitle: 'Volcano Video',
  className: 'Period 3',
  status: 'inactive' as const,
  createdAt: 90,
};

const emptyReturn = { assignments: [], loading: false, error: null };

function setupHooks({
  quizAssignments = [quizAssignment],
  vaAssignments = [vaAssignment],
}: {
  quizAssignments?: unknown[];
  vaAssignments?: unknown[];
} = {}) {
  (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    user: { uid: 'teacher-1' },
  });
  (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    rosters: [],
  });
  (useQuizAssignments as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    ...emptyReturn,
    assignments: quizAssignments,
  });
  (
    useVideoActivityAssignments as unknown as ReturnType<typeof vi.fn>
  ).mockReturnValue({
    ...emptyReturn,
    assignments: vaAssignments,
  });
  (
    useGuidedLearningAssignments as unknown as ReturnType<typeof vi.fn>
  ).mockReturnValue(emptyReturn);
  (
    useMiniAppAssignments as unknown as ReturnType<typeof vi.fn>
  ).mockReturnValue(emptyReturn);
  (
    useAssignmentPseudonymsMulti as unknown as ReturnType<typeof vi.fn>
  ).mockReturnValue({
    byStudentUid: new Map(),
    byAssignmentPseudonym: new Map(),
    targetRefKeyByStudentUid: new Map(),
  });
  (
    useAssignmentRosterStatus as unknown as ReturnType<typeof vi.fn>
  ).mockReturnValue({
    statusByUid: new Map(),
    totalQuestions: null,
    loading: false,
  });
}

describe('AssignmentsHubModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders rows for every kind with targeting/skipped markers', () => {
    setupHooks();
    render(<AssignmentsHubModal onClose={vi.fn()} />);
    expect(screen.getByText('Fractions Quiz')).toBeInTheDocument();
    expect(screen.getByText('Volcano Video')).toBeInTheDocument();
    expect(screen.getByText('Individual')).toBeInTheDocument();
    expect(screen.getByText('2 skipped')).toBeInTheDocument();
  });

  it('filters by assignment kind and keeps the multi-select open', () => {
    setupHooks();
    render(<AssignmentsHubModal onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Filter by type' }));
    fireEvent.click(screen.getByRole('option', { name: 'Quiz' }));
    expect(screen.getByText('Fractions Quiz')).toBeInTheDocument();
    expect(screen.queryByText('Volcano Video')).not.toBeInTheDocument();

    // Still open — a second type widens the selection rather than replacing it.
    fireEvent.click(screen.getByRole('option', { name: 'Video Activity' }));
    expect(screen.getByText('Fractions Quiz')).toBeInTheDocument();
    expect(screen.getByText('Volcano Video')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Filter by type' })
    ).toHaveTextContent('Type: 2 selected');
  });

  it('filters by status and closes the single-select on pick', () => {
    setupHooks();
    render(<AssignmentsHubModal onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Filter by status' }));
    fireEvent.click(screen.getByRole('option', { name: 'Inactive' }));
    expect(screen.queryByText('Fractions Quiz')).not.toBeInTheDocument();
    expect(screen.getByText('Volcano Video')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('filters by class via the multi-select once more than one class exists', () => {
    setupHooks();
    render(<AssignmentsHubModal onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Filter by class' }));
    fireEvent.click(screen.getByRole('option', { name: 'Period 3' }));
    expect(screen.queryByText('Fractions Quiz')).not.toBeInTheDocument();
    expect(screen.getByText('Volcano Video')).toBeInTheDocument();
  });

  it('clears every filter with the clear action', () => {
    setupHooks();
    render(<AssignmentsHubModal onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Filter by status' }));
    fireEvent.click(screen.getByRole('option', { name: 'Inactive' }));
    expect(screen.queryByText('Fractions Quiz')).not.toBeInTheDocument();

    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search assignments' }),
      { target: { value: 'volcano' } }
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(
      screen.getByRole('searchbox', { name: 'Search assignments' })
    ).toHaveValue('');
    expect(screen.getByText('Fractions Quiz')).toBeInTheDocument();
    expect(screen.getByText('Volcano Video')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Clear filters' })
    ).not.toBeInTheDocument();
  });

  it('searches across assignment titles and class names', () => {
    setupHooks();
    render(<AssignmentsHubModal onClose={vi.fn()} />);
    const box = screen.getByRole('searchbox', { name: 'Search assignments' });

    fireEvent.change(box, { target: { value: 'volcano' } });
    expect(screen.queryByText('Fractions Quiz')).not.toBeInTheDocument();
    expect(screen.getByText('Volcano Video')).toBeInTheDocument();

    fireEvent.change(box, { target: { value: 'period 2' } });
    expect(screen.getByText('Fractions Quiz')).toBeInTheDocument();
    expect(screen.queryByText('Volcano Video')).not.toBeInTheDocument();

    fireEvent.change(box, { target: { value: 'nothing here' } });
    expect(
      screen.getByText('No assignments match these filters.')
    ).toBeInTheDocument();
  });

  it('combines the search box with the dropdown filters', () => {
    setupHooks();
    render(<AssignmentsHubModal onClose={vi.fn()} />);
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search assignments' }),
      { target: { value: 'o' } }
    );
    expect(screen.getByText('Fractions Quiz')).toBeInTheDocument();
    expect(screen.getByText('Volcano Video')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Filter by type' }));
    fireEvent.click(screen.getByRole('option', { name: 'Quiz' }));
    expect(screen.getByText('Fractions Quiz')).toBeInTheDocument();
    expect(screen.queryByText('Volcano Video')).not.toBeInTheDocument();
  });

  it('escape clears a non-empty search box without closing the modal', () => {
    setupHooks();
    const onClose = vi.fn();
    render(<AssignmentsHubModal onClose={onClose} />);
    const box = screen.getByRole('searchbox', { name: 'Search assignments' });
    fireEvent.change(box, { target: { value: 'volcano' } });

    fireEvent.keyDown(box, { key: 'Escape' });
    expect(box).toHaveValue('');
    expect(screen.getByText('Fractions Quiz')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('escape closes an open dropdown without closing the modal', () => {
    setupHooks();
    const onClose = vi.fn();
    render(<AssignmentsHubModal onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Filter by type' }));
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows the empty state with an action when there are no assignments', () => {
    setupHooks({ quizAssignments: [], vaAssignments: [] });
    const onClose = vi.fn();
    render(<AssignmentsHubModal onClose={onClose} />);
    expect(screen.getByText(/No assignments yet/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go create one' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders the D2 detail pane once a row is selected', () => {
    setupHooks();
    render(<AssignmentsHubModal onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Fractions Quiz'));
    // Empty rosters in this test fixture -> the detail pane's empty-roster state.
    expect(
      screen.getByText('No students are targeted by this assignment yet.')
    ).toBeInTheDocument();
  });
});
