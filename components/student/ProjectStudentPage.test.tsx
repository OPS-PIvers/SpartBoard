import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectGroup, ProjectRun } from '@/types';
import { ProjectStudentPage } from './ProjectStudentPage';

const h = vi.hoisted(() => ({
  run: null as ProjectRun | null,
  myGroup: null as ProjectGroup | null,
  setStepState: vi.fn((..._args: unknown[]) => Promise.resolve()),
}));

vi.mock('@/context/useStudentAuth', () => ({
  useStudentAuth: () => ({
    pseudonymUid: 'ps-1',
    classIds: ['class-1'],
    signOut: vi.fn(),
  }),
}));
vi.mock('@/hooks/useStudentProjectRun', () => ({
  useStudentProjectRun: () => ({
    run: h.run,
    myGroup: h.myGroup,
    workLinks: [],
    grade: null,
    loading: false,
    error: null,
    setStepState: h.setStepState,
    addWorkLink: vi.fn(),
    removeWorkLink: vi.fn(),
  }),
}));
vi.mock('@/hooks/useProjectsWidgetSettings', () => ({
  useProjectsWidgetSettings: () => ({ enabled: true }),
}));
vi.mock('@/hooks/useProjectUploads', () => ({
  useProjectUploads: () => ({
    uploads: [],
    loading: false,
    uploadFile: vi.fn(),
    removeUpload: vi.fn(),
  }),
}));
vi.mock('./project/ProjectGroupWork', () => ({
  ProjectGroupWork: () => <div data-testid="group-work" />,
}));

const makeRun = (overrides: Partial<ProjectRun> = {}): ProjectRun => ({
  id: 'teacher_p1',
  projectId: 'p1',
  teacherUid: 'teacher',
  title: 'Bridge build',
  steps: [
    { id: 's1', title: 'Research' },
    { id: 's2', title: 'Sketch', requiresApproval: true },
    { id: 's3', title: 'Build' },
  ],
  classIds: ['class-1'],
  approvalStepIds: ['s2'],
  showStatusToStudents: false,
  acceptingUpdates: true,
  updatedAt: 1,
  ...overrides,
});

const makeGroup = (overrides: Partial<ProjectGroup>): ProjectGroup => ({
  id: 'g1',
  name: 'Team Rocket',
  classId: 'class-1',
  memberUids: ['ps-1'],
  order: 0,
  color: 'bg-rose-500',
  stepStates: {},
  updatedAt: 1,
  ...overrides,
});

const stepsList = () => screen.getByRole('list', { name: 'Your steps' });
const cell = (name: RegExp) =>
  within(stepsList()).getByRole('button', { name });

describe('ProjectStudentPage', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/project/teacher_p1');
    h.setStepState.mockClear();
    h.run = makeRun();
    h.myGroup = makeGroup({});
  });

  it('renders the own group row with its color and one cell per step', () => {
    render(<ProjectStudentPage />);
    expect(screen.getByRole('heading', { name: 'Team Rocket' })).toBeVisible();
    expect(screen.getByTestId('own-group-edge')).toHaveClass('bg-rose-500');
    expect(within(stepsList()).getAllByRole('listitem')).toHaveLength(3);
    expect(cell(/Research: Not started/)).toBeEnabled();
  });

  it('falls back to the palette color by order when the group has none', () => {
    h.myGroup = makeGroup({ color: undefined, order: 0 });
    render(<ProjectStudentPage />);
    expect(screen.getByTestId('own-group-edge')).toHaveClass('bg-blue-500');
  });

  it('writes the picked state in one tap', () => {
    render(<ProjectStudentPage />);
    fireEvent.click(cell(/Build: Not started/));
    const picker = screen.getByRole('dialog', { name: 'Set Build' });
    fireEvent.click(within(picker).getByRole('button', { name: 'Done' }));
    expect(h.setStepState).toHaveBeenCalledWith('s3', 'done');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the picker on Escape without writing', () => {
    render(<ProjectStudentPage />);
    fireEvent.click(cell(/Research/));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(h.setStepState).not.toHaveBeenCalled();
  });

  it('offers no done option on an approval step', () => {
    render(<ProjectStudentPage />);
    fireEvent.click(cell(/Sketch/));
    const picker = screen.getByRole('dialog', { name: 'Set Sketch' });
    expect(
      within(picker).queryByRole('button', { name: 'Done' })
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(picker).getByRole('button', { name: 'Ready for review' })
    );
    expect(h.setStepState).toHaveBeenCalledWith('s2', 'readyForReview');
  });

  it('locks a teacher-approved step', () => {
    h.myGroup = makeGroup({ stepStates: { s2: 'done' } });
    render(<ProjectStudentPage />);
    const locked = cell(/Sketch: Approved, locked/);
    expect(locked).toBeDisabled();
    fireEvent.click(locked);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(h.setStepState).not.toHaveBeenCalled();
  });

  it('never shows other groups, even on a run that once allowed it', () => {
    h.run = makeRun({ showStatusToStudents: true });
    render(<ProjectStudentPage />);
    expect(screen.queryByText('Other groups')).not.toBeInTheDocument();
    expect(screen.queryByTestId(/^peer-row-/)).not.toBeInTheDocument();
  });

  it('disables every cell once the run is closed', () => {
    h.run = makeRun({ acceptingUpdates: false });
    render(<ProjectStudentPage />);
    for (const button of within(stepsList()).getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
    fireEvent.click(cell(/Research/));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(h.setStepState).not.toHaveBeenCalled();
  });
});
