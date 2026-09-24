import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ProjectDefinition, Rubric } from '@/types';
import { ProjectEditorModal } from './ProjectEditorModal';

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    showConfirm: vi.fn().mockResolvedValue(true),
    showAlert: vi.fn(),
  }),
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

const RUBRIC: Rubric = {
  id: 'rub-1',
  title: 'Poster rubric',
  criteria: [
    {
      id: 'c1',
      name: 'Accuracy',
      levels: [
        { id: 'l1', label: 'Below', points: 1 },
        { id: 'l2', label: 'Meets', points: 4 },
      ],
    },
  ],
  createdAt: 1,
  updatedAt: 2,
};

const project = (
  overrides: Partial<ProjectDefinition> = {}
): ProjectDefinition => ({
  id: 'project-1',
  title: 'Ecosystem poster',
  steps: [
    { id: 'step-1', title: 'Research' },
    { id: 'step-2', title: 'Draft' },
  ],
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const renderEditor = (
  overrides: Partial<ProjectDefinition> = {},
  onSave = vi.fn().mockResolvedValue(undefined),
  rubrics: Rubric[] = []
) => {
  render(
    <ProjectEditorModal
      isOpen
      project={project(overrides)}
      rubrics={rubrics}
      folders={[]}
      teacherUid="teacher-1"
      onSave={onSave}
      onClose={vi.fn()}
    />
  );
  return onSave;
};

/**
 * The editor autosaves, so there is no Save button: closing flushes whatever
 * the quiet period has not written yet.
 */
const closeEditor = () =>
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Close' }).slice(-1)[0]
  );

describe('ProjectEditorModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('edits the selected step in the detail pane', async () => {
    const onSave = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Draft' }));
    fireEvent.change(screen.getByLabelText('What this step means'), {
      target: { value: 'Two paragraphs, cited.' },
    });
    closeEditor();

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const saved = onSave.mock.calls[0][0] as ProjectDefinition;
    expect(saved.steps[1].description).toBe('Two paragraphs, cited.');
  });

  // D16 — paste seven lines and go survives as the list's bulk-add.
  it('keeps a pasted step’s id when its text is unchanged', async () => {
    const onSave = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Paste steps' }));
    fireEvent.change(screen.getByLabelText('One step per line'), {
      target: { value: 'Research\nBuild an outline' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Use these steps' }));
    closeEditor();

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const saved = onSave.mock.calls[0][0] as ProjectDefinition;
    // "Research" survives untouched, so its groups keep their progress.
    expect(saved.steps[0]).toEqual({ id: 'step-1', title: 'Research' });
    expect(saved.steps[1].title).toBe('Build an outline');
    expect(saved.steps[1].id).not.toBe('step-2');
  });

  // Autosave writes a step the moment it is added, so a blank row is kept
  // rather than deleted out from under the teacher who is still naming it.
  it('keeps a step left untitled', async () => {
    const onSave = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));
    closeEditor();

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const saved = onSave.mock.calls[0][0] as ProjectDefinition;
    expect(saved.steps).toHaveLength(3);
    expect(saved.steps[2].title).toBe('');
    expect(screen.queryByText(/Every step needs a title/)).not.toBeNull();
  });

  it('marks a step as needing approval (D3)', async () => {
    const onSave = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Research' }));
    fireEvent.click(screen.getByLabelText('Research needs approval'));
    closeEditor();

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const saved = onSave.mock.calls[0][0] as ProjectDefinition;
    expect(saved.steps[0].requiresApproval).toBe(true);
  });

  it('picks a rubric from the library', async () => {
    const onSave = renderEditor({}, undefined, [RUBRIC]);
    fireEvent.change(screen.getByLabelText('Rubric'), {
      target: { value: 'rub-1' },
    });
    closeEditor();
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const saved = onSave.mock.calls[0][0] as ProjectDefinition;
    expect(saved.rubric?.id).toBe('rub-1');
    expect(saved.rubricMaxPoints).toBe(4);
  });

  it('keeps an attached rubric that is missing from the library', () => {
    renderEditor({ rubric: RUBRIC, rubricMaxPoints: 4 });
    const select = screen.getByLabelText<HTMLSelectElement>('Rubric');
    expect(select.value).toBe('rub-1');
    expect(
      screen.getByRole('option', { name: 'Poster rubric' })
    ).toBeInTheDocument();
  });

  it('builds a new rubric in the rubric builder', async () => {
    const onSave = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    fireEvent.change(
      screen.getByLabelText('Title', { selector: '#rubric-title' }),
      { target: { value: 'Group work' } }
    );
    fireEvent.change(screen.getByLabelText('Criterion 1 name'), {
      target: { value: 'Teamwork' },
    });
    fireEvent.change(screen.getByLabelText('Criterion 1 level 1 label'), {
      target: { value: 'Below' },
    });
    fireEvent.change(screen.getByLabelText('Criterion 1 level 2 label'), {
      target: { value: 'Meets' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Use for project' }));
    expect(
      screen.queryByRole('complementary', { name: 'Rubric builder' })
    ).not.toBeInTheDocument();
    closeEditor();
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const saved = onSave.mock.calls[0][0] as ProjectDefinition;
    expect(saved.rubric?.title).toBe('Group work');
    expect(saved.rubric?.criteria[0].name).toBe('Teamwork');
  });
});
