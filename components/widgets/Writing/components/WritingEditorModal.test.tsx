import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { WritingAssignmentDefinition } from '@/types';
import { WritingEditorModal } from './WritingEditorModal';

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    showConfirm: vi.fn().mockResolvedValue(true),
    showAlert: vi.fn(),
  }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ ensureGoogleScope: vi.fn() }),
}));
vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: () => ({ driveService: null, userDomain: null }),
}));
vi.mock('@/hooks/useGooglePicker', () => ({
  useGooglePicker: () => ({ openPicker: vi.fn() }),
}));
vi.mock('@/hooks/useRubrics', () => ({
  useRubrics: () => ({
    rubrics: [],
    loading: false,
    error: null,
    saveRubric: vi.fn().mockResolvedValue(undefined),
    deleteRubric: vi.fn(),
    shareRubric: vi.fn(),
    importSharedRubric: vi.fn(),
  }),
}));

const assignment = (
  overrides: Partial<WritingAssignmentDefinition> = {}
): WritingAssignmentDefinition => ({
  id: 'wa-1',
  title: 'Argument essay',
  prompt: 'Is homework worth it?',
  stimuli: [],
  grading: { mode: 'ungraded' },
  folderId: null,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const renderEditor = (overrides: Partial<WritingAssignmentDefinition> = {}) => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <WritingEditorModal
      isOpen
      assignment={assignment(overrides)}
      folders={[]}
      teacherUid="teacher-1"
      onSave={onSave}
      onClose={vi.fn()}
    />
  );
  return onSave;
};

// The editor autosaves; closing flushes what the quiet period has not written.
const closeEditor = () =>
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Close' }).slice(-1)[0]
  );

const saved = (onSave: ReturnType<typeof vi.fn>) =>
  onSave.mock.calls[0][0] as WritingAssignmentDefinition;

describe('WritingEditorModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the prompt in the prompt box', () => {
    renderEditor();
    expect(screen.getByRole('textbox', { name: 'Prompt' })).toHaveTextContent(
      'Is homework worth it?'
    );
  });

  it('asks for a prompt when it is blank', () => {
    renderEditor({ prompt: '' });
    expect(screen.getByText(/Add a prompt/)).toBeInTheDocument();
  });

  it('saves word limits', async () => {
    const onSave = renderEditor();
    fireEvent.change(screen.getByLabelText('Minimum words'), {
      target: { value: '250' },
    });
    fireEvent.change(screen.getByLabelText('Maximum words'), {
      target: { value: '500' },
    });
    closeEditor();
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(saved(onSave)).toMatchObject({ minWords: 250, maxWords: 500 });
  });

  it('grades with points', async () => {
    const onSave = renderEditor();
    fireEvent.click(screen.getByRole('radio', { name: 'Points' }));
    fireEvent.change(screen.getByLabelText('Points'), {
      target: { value: '25' },
    });
    closeEditor();
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(saved(onSave).grading).toEqual({ mode: 'points', points: 25 });
  });

  it('opens the rubric builder for Rubric and attaches the rubric built', async () => {
    const onSave = renderEditor();
    fireEvent.click(screen.getByRole('radio', { name: 'Rubric' }));
    // Nothing is graded by rubric until one is attached.
    expect(screen.getByRole('radio', { name: 'Ungraded' })).toBeChecked();
    fireEvent.change(
      screen.getByLabelText('Title', { selector: '#rubric-title' }),
      { target: { value: 'Essay rubric' } }
    );
    fireEvent.change(screen.getByLabelText('Criterion 1 name'), {
      target: { value: 'Claim' },
    });
    fireEvent.change(screen.getByLabelText('Criterion 1 level 1 label'), {
      target: { value: 'Below' },
    });
    fireEvent.change(screen.getByLabelText('Criterion 1 level 2 label'), {
      target: { value: 'Meets' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Attach/ }));
    expect(screen.getByRole('radio', { name: 'Rubric' })).toBeChecked();
    closeEditor();
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const grading = saved(onSave).grading;
    expect(grading.mode).toBe('rubric');
    if (grading.mode !== 'rubric') return;
    expect(grading.rubricSnapshot.title).toBe('Essay rubric');
    expect(grading.rubricId).toBe(grading.rubricSnapshot.id);
  });

  it('detaches a rubric back to ungraded', async () => {
    const onSave = renderEditor({
      grading: {
        mode: 'rubric',
        rubricId: 'rub-1',
        rubricSnapshot: {
          id: 'rub-1',
          title: 'Essay rubric',
          criteria: [],
          createdAt: 1,
          updatedAt: 1,
        },
      },
    });
    expect(screen.getAllByText('Essay rubric').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Detach' }));
    closeEditor();
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(saved(onSave).grading).toEqual({ mode: 'ungraded' });
  });

  it('adds a passage on the Stimuli tab without quiz question controls', async () => {
    const onSave = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Stimuli' }));
    fireEvent.click(screen.getByRole('button', { name: /Add a passage/ }));
    expect(screen.queryByText('Shown on')).not.toBeInTheDocument();
    expect(screen.queryByText('unassigned')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Expand stimulus' }));
    fireEvent.change(screen.getByLabelText('Passage'), {
      target: { value: 'Read this first.' },
    });
    closeEditor();
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(saved(onSave).stimuli).toEqual([
      expect.objectContaining({ type: 'text', text: 'Read this first.' }),
    ]);
  });
});
