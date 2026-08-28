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

vi.mock('@/hooks/useRubrics', () => ({
  useRubrics: () => ({
    rubrics: [LIBRARY_RUBRIC],
    loading: false,
    error: null,
    saveRubric: vi.fn().mockResolvedValue(undefined),
    deleteRubric: vi.fn(),
    shareRubric: vi.fn(),
    importSharedRubric: vi.fn(),
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
