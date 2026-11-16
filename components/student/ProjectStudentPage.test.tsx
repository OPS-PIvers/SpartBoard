import '@testing-library/jest-dom';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectGroup, ProjectRun } from '@/types';
import { ProjectStudentPage } from './ProjectStudentPage';

const h = vi.hoisted(() => ({
  run: null as ProjectRun | null,
  myGroup: null as ProjectGroup | null,
  setStepState: vi.fn((..._args: unknown[]) => Promise.resolve()),
  signOut: vi.fn(),
  submit: vi.fn((..._args: unknown[]) =>
    Promise.resolve({ submittedAt: 1, late: false })
  ),
  confirm: vi.fn((..._args: unknown[]) => Promise.resolve(true)),
}));

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: h.confirm, showAlert: vi.fn() }),
}));
vi.mock('@/utils/projectRunWrites', () => ({
  submitProjectGroup: h.submit,
}));

vi.mock('@/context/useStudentAuth', () => ({
  useStudentAuth: () => ({
    pseudonymUid: 'ps-1',
    classIds: ['class-1'],
    signOut: h.signOut,
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

  it('Done returns to My Assignments without signing the student out', () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    try {
      render(<ProjectStudentPage />);
      fireEvent.click(
        screen.getByRole('button', { name: 'Done, back to my assignments' })
      );
      expect(assign).toHaveBeenCalledWith('/my-assignments');
      expect(h.signOut).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('renders the own group row with its color and one cell per step', () => {
    render(<ProjectStudentPage />);
    expect(screen.getByRole('heading', { name: 'Team Rocket' })).toBeVisible();
    expect(screen.getByTestId('own-group-name').firstElementChild).toHaveClass(
      'bg-rose-500'
    );
    expect(within(stepsList()).getAllByRole('listitem')).toHaveLength(3);
    expect(cell(/Research: Not started/)).toBeEnabled();
  });

  it('falls back to the palette color by order when the group has none', () => {
    h.myGroup = makeGroup({ color: undefined, order: 0 });
    render(<ProjectStudentPage />);
    expect(screen.getByTestId('own-group-name').firstElementChild).toHaveClass(
      'bg-blue-500'
    );
  });

  it('sends Tab from the picker back to its step', () => {
    render(<ProjectStudentPage />);
    fireEvent.click(cell(/Build: Not started/));
    const picker = screen.getByRole('dialog', { name: 'Set Build' });
    const options = within(picker).getAllByRole('button');
    fireEvent.keyDown(document.activeElement ?? picker, { key: 'ArrowUp' });
    expect(options[options.length - 1]).toHaveFocus();
    fireEvent.keyDown(document.activeElement ?? picker, { key: 'Tab' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(cell(/Build: Not started/)).toHaveFocus();
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

  describe('submitting', () => {
    beforeEach(() => {
      h.submit.mockClear();
      h.confirm.mockClear();
      h.confirm.mockResolvedValue(true);
    });

    it('offers no Submit on a run that takes no submissions', () => {
      render(<ProjectStudentPage />);
      expect(
        screen.queryByRole('button', { name: 'Submit project' })
      ).not.toBeInTheDocument();
    });

    it('submits for the group after a confirm that counts open steps', async () => {
      h.run = makeRun({ studentSubmit: true });
      h.myGroup = makeGroup({ stepStates: { s1: 'done' } });
      render(<ProjectStudentPage />);
      fireEvent.click(screen.getByRole('button', { name: 'Submit project' }));
      await waitFor(() =>
        expect(h.submit).toHaveBeenCalledWith('teacher_p1', 'g1')
      );
      expect(h.confirm).toHaveBeenCalledWith(
        "2 steps aren't done yet. Everyone in Team Rocket will see it as submitted. You can't make changes after this.",
        { title: 'Submit for your group?', confirmLabel: 'Submit' }
      );
    });

    it('does nothing when the student cancels', async () => {
      h.run = makeRun({ studentSubmit: true });
      h.confirm.mockResolvedValue(false);
      render(<ProjectStudentPage />);
      fireEvent.click(screen.getByRole('button', { name: 'Submit project' }));
      await waitFor(() => expect(h.confirm).toHaveBeenCalled());
      expect(h.submit).not.toHaveBeenCalled();
    });

    it('locks the steps and says when it was submitted late', () => {
      h.run = makeRun({ studentSubmit: true });
      h.myGroup = makeGroup({ submittedAt: Date.now(), submittedLate: true });
      render(<ProjectStudentPage />);
      expect(screen.getByRole('status')).toHaveTextContent(/^Submitted late /);
      expect(
        screen.queryByRole('button', { name: 'Submit project' })
      ).not.toBeInTheDocument();
      for (const button of within(stepsList()).getAllByRole('button')) {
        expect(button).toBeDisabled();
      }
    });
  });
});
