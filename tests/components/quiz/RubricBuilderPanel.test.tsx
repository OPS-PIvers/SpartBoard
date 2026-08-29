/**
 * RubricBuilderPanel — guards against destructive loads silently discarding
 * a teacher's in-progress draft (library pick, CSV import, criterion delete).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Rubric } from '@/types';

const LIBRARY_RUBRIC: Rubric = {
  id: 'rub-1',
  title: 'Paragraph Rubric',
  criteria: [
    {
      id: 'c1',
      name: 'Thesis',
      levels: [
        { id: 'l1', label: 'Below', points: 1 },
        { id: 'l2', label: 'Meets', points: 3 },
      ],
    },
  ],
  createdAt: 1,
  updatedAt: 2,
};

const showConfirm = vi.fn();
const shareRubric = vi.fn();
const importSharedRubric = vi.fn();

vi.mock('@/hooks/useRubrics', () => ({
  useRubrics: () => ({
    rubrics: [LIBRARY_RUBRIC],
    loading: false,
    error: null,
    saveRubric: vi.fn().mockResolvedValue(undefined),
    deleteRubric: vi.fn(),
    shareRubric,
    importSharedRubric,
  }),
}));

vi.mock('@/context/useDialog', () => ({
  useDialog: vi.fn(() => ({
    showAlert: vi.fn(),
    showConfirm,
    showPrompt: vi.fn(),
  })),
}));

import { RubricBuilderPanel } from '@/components/widgets/QuizWidget/components/RubricBuilderPanel';

const open = (existingSnapshot?: Rubric) =>
  render(
    <RubricBuilderPanel
      questionId="q1"
      existingSnapshot={existingSnapshot}
      onAttach={vi.fn()}
      onDetach={vi.fn()}
      onClose={vi.fn()}
      teacherUid="uid-test"
    />
  );

const titleInput = () =>
  screen.getByLabelText<HTMLInputElement>('Title', { selector: 'input' });

const pickFromLibrary = () =>
  fireEvent.change(screen.getByLabelText('Library'), {
    target: { value: LIBRARY_RUBRIC.id },
  });

const CSV =
  'Criterion,Level 1 Label,Level 1 Points,Level 2 Label,Level 2 Points\nVoice,Below,1,Meets,4\n';

// jsdom's File has no .text(); stub it so the panel's reader path works.
const importCsv = () => {
  const file = new File([CSV], 'rubric.csv', { type: 'text/csv' });
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(CSV) });
  fireEvent.change(screen.getByLabelText('Import rubric CSV'), {
    target: { files: [file] },
  });
};

describe('RubricBuilderPanel — destructive-load guards', () => {
  beforeEach(() => {
    showConfirm.mockReset();
    showConfirm.mockResolvedValue(true);
    shareRubric.mockReset();
    importSharedRubric.mockReset();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('loads a library rubric without prompting when the draft is untouched', async () => {
    open();
    pickFromLibrary();

    await waitFor(() => expect(titleInput().value).toBe(LIBRARY_RUBRIC.title));
    expect(showConfirm).not.toHaveBeenCalled();
  });

  it('keeps the edited draft when the discard confirm is declined', async () => {
    showConfirm.mockResolvedValue(false);
    open();
    fireEvent.change(titleInput(), { target: { value: 'My draft' } });

    pickFromLibrary();

    await waitFor(() => expect(showConfirm).toHaveBeenCalled());
    expect(titleInput().value).toBe('My draft');
  });

  it('replaces the edited draft once the discard confirm is accepted', async () => {
    open();
    fireEvent.change(titleInput(), { target: { value: 'My draft' } });

    pickFromLibrary();

    await waitFor(() => expect(titleInput().value).toBe(LIBRARY_RUBRIC.title));
    expect(showConfirm).toHaveBeenCalledTimes(1);
  });

  it('does not prompt for an unedited attached snapshot', async () => {
    open(LIBRARY_RUBRIC);
    pickFromLibrary();

    await waitFor(() => expect(showConfirm).not.toHaveBeenCalled());
  });

  it('disables the remove button for the last remaining criterion', () => {
    open();
    expect(screen.getByLabelText('Remove criterion 1')).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Add Criterion' }));
    expect(screen.getByLabelText('Remove criterion 1')).toBeEnabled();
    expect(screen.getByLabelText('Remove criterion 2')).toBeEnabled();
  });

  it('keeps a teacher-typed title when importing criteria from CSV', async () => {
    open();
    fireEvent.change(titleInput(), { target: { value: 'My draft' } });

    importCsv();

    await waitFor(() =>
      expect(
        screen.getByLabelText<HTMLInputElement>('Criterion 1 name').value
      ).toBe('Voice')
    );
    expect(titleInput().value).toBe('My draft');
  });

  it('falls back to the imported title when the draft has none', async () => {
    open();

    importCsv();

    await waitFor(() => expect(titleInput().value).toBe('Imported Rubric'));
  });
});

describe('RubricBuilderPanel — link sharing', () => {
  beforeEach(() => {
    showConfirm.mockReset();
    showConfirm.mockResolvedValue(true);
    shareRubric.mockReset();
    importSharedRubric.mockReset();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('shares a library rubric and displays the returned code as a link', async () => {
    shareRubric.mockResolvedValue('share-abc');
    open(LIBRARY_RUBRIC);

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    expect(shareRubric).toHaveBeenCalledWith(LIBRARY_RUBRIC.id);
    await waitFor(() =>
      expect(
        screen.getByLabelText<HTMLInputElement>('Rubric share link').value
      ).toContain('/share/rubric/share-abc')
    );
  });

  it('disables sharing a draft that has not been saved to the library', () => {
    open();
    expect(screen.getByRole('button', { name: 'Share' })).toBeDisabled();
  });

  it('shows an error when sharing fails', async () => {
    shareRubric.mockRejectedValue(new Error('Not authenticated'));
    open(LIBRARY_RUBRIC);

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    await waitFor(() =>
      expect(screen.getByText('Not authenticated')).toBeInTheDocument()
    );
  });

  it('imports a rubric from a pasted share code', async () => {
    importSharedRubric.mockResolvedValue(undefined);
    open();

    fireEvent.change(screen.getByLabelText('Rubric share code or link'), {
      target: { value: 'share-xyz' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Import shared rubric' })
    );

    await waitFor(() =>
      expect(importSharedRubric).toHaveBeenCalledWith('share-xyz')
    );
    await waitFor(() =>
      expect(
        screen.getByText('Rubric imported into your library.')
      ).toBeInTheDocument()
    );
  });

  it('extracts the share id from a pasted URL', async () => {
    importSharedRubric.mockResolvedValue(undefined);
    open();

    fireEvent.change(screen.getByLabelText('Rubric share code or link'), {
      target: { value: 'https://spartboard.web.app/share/rubric/share-xyz' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Import shared rubric' })
    );

    await waitFor(() =>
      expect(importSharedRubric).toHaveBeenCalledWith('share-xyz')
    );
  });

  it('disables sharing while the draft diverges from the saved library copy', () => {
    open(LIBRARY_RUBRIC);
    fireEvent.change(titleInput(), { target: { value: 'Edited title' } });

    expect(screen.getByRole('button', { name: 'Share' })).toBeDisabled();
    expect(
      screen.getByText('Save to library before sharing.')
    ).toBeInTheDocument();
  });

  it('clears share state when another library rubric is loaded', async () => {
    shareRubric.mockResolvedValue('share-abc');
    open(LIBRARY_RUBRIC);

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Rubric share link')).toBeInTheDocument()
    );

    fireEvent.change(screen.getByLabelText('Library'), {
      target: { value: '' },
    });

    await waitFor(() =>
      expect(screen.queryByLabelText('Rubric share link')).toBeNull()
    );
  });

  it('extracts the share id from a scheme-less pasted URL', async () => {
    importSharedRubric.mockResolvedValue(undefined);
    open();

    fireEvent.change(screen.getByLabelText('Rubric share code or link'), {
      target: { value: 'spartboard.web.app/share/rubric/share-xyz' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Import shared rubric' })
    );

    await waitFor(() =>
      expect(importSharedRubric).toHaveBeenCalledWith('share-xyz')
    );
  });

  it('shows an error when import fails', async () => {
    importSharedRubric.mockRejectedValue(new Error('Shared rubric not found'));
    open();

    fireEvent.change(screen.getByLabelText('Rubric share code or link'), {
      target: { value: 'bad-code' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Import shared rubric' })
    );

    await waitFor(() =>
      expect(screen.getByText('Shared rubric not found')).toBeInTheDocument()
    );
  });
});
