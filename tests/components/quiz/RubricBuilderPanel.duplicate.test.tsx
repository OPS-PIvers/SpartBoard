import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Rubric } from '@/types';
import { AuthContext } from '@/context/AuthContextValue';
import type { AuthContextType } from '@/context/AuthContextValue';

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

const saveRubric = vi.fn();

vi.mock('@/hooks/useRubrics', () => ({
  useRubrics: () => ({
    rubrics: [LIBRARY_RUBRIC],
    loading: false,
    error: null,
    saveRubric,
    deleteRubric: vi.fn(),
    shareRubric: vi.fn(),
    importSharedRubric: vi.fn(),
  }),
}));

vi.mock('@/context/useDialog', () => ({
  useDialog: vi.fn(() => ({
    showAlert: vi.fn(),
    showConfirm: vi.fn().mockResolvedValue(true),
    showPrompt: vi.fn(),
  })),
}));

import { RubricBuilderPanel } from '@/components/widgets/QuizWidget/components/RubricBuilderPanel';

const open = (flagOn: boolean) =>
  render(
    <AuthContext.Provider
      value={
        {
          canAccessFeature: (id: string) =>
            flagOn && id === 'library-duplicate-more',
        } as unknown as AuthContextType
      }
    >
      <RubricBuilderPanel
        questionId="q1"
        existingSnapshot={LIBRARY_RUBRIC}
        onAttach={vi.fn()}
        onDetach={vi.fn()}
        onClose={vi.fn()}
        teacherUid="uid-test"
      />
    </AuthContext.Provider>
  );

describe('RubricBuilderPanel — Duplicate', () => {
  beforeEach(() => {
    saveRubric.mockReset();
    saveRubric.mockResolvedValue(undefined);
  });

  it('hides Duplicate while the flag is off', () => {
    open(false);
    expect(screen.queryByRole('button', { name: 'Duplicate' })).toBeNull();
  });

  it('saves a titled copy with a new id', async () => {
    open(true);
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));

    await waitFor(() => expect(saveRubric).toHaveBeenCalledTimes(1));
    const copy = saveRubric.mock.calls[0][0] as Rubric;
    expect(copy.id).not.toBe(LIBRARY_RUBRIC.id);
    expect(copy.title).toBe('Paragraph Rubric (Copy)');
    expect(copy.criteria).toEqual(LIBRARY_RUBRIC.criteria);
    expect(
      await screen.findByText('Duplicated as "Paragraph Rubric (Copy)".')
    ).toBeTruthy();
  });

  it('disables Duplicate once the draft has unsaved edits', () => {
    open(true);
    fireEvent.change(screen.getByLabelText('Rubric title'), {
      target: { value: 'Edited' },
    });
    expect(
      screen.getByRole('button', { name: 'Duplicate' }).hasAttribute('disabled')
    ).toBe(true);
  });
});
