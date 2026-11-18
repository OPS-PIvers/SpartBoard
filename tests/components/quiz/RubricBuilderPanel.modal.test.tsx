// The rubric-grading-v2 preview opens the builder as the full rubric modal.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Rubric } from '@/types';
import { AuthContext, type AuthContextType } from '@/context/AuthContextValue';
import { mockAuth } from '@/components/student/studentMocks';

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

const saveRubric = vi.fn().mockResolvedValue(undefined);

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

import { RubricBuilderPanel } from '@/components/widgets/QuizWidget/components/RubricBuilderPanel';

const auth: AuthContextType = {
  ...mockAuth,
  canAccessFeature: (id) => id === 'rubric-grading-v2',
  rubricLevelOrder: 'high-first',
  updateAccountPreferences: vi.fn().mockResolvedValue(undefined),
};

describe('RubricBuilderPanel as the rubric modal', () => {
  it('picks from the library, edits in the table and attaches', async () => {
    const onAttach = vi.fn();
    render(
      <AuthContext.Provider value={auth}>
        <RubricBuilderPanel
          questionId="q1"
          onAttach={onAttach}
          onDetach={vi.fn()}
          onClose={vi.fn()}
          teacherUid="uid-test"
        />
      </AuthContext.Provider>
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByLabelText('Rubric builder')).toBeNull();
    fireEvent.change(screen.getByLabelText('Library'), {
      target: { value: LIBRARY_RUBRIC.id },
    });
    const name =
      await screen.findByLabelText<HTMLTextAreaElement>('Criterion 1 name');
    expect(name.value).toBe('Thesis');
    fireEvent.change(name, { target: { value: 'Claim' } });
    fireEvent.click(screen.getByRole('button', { name: 'Attach to question' }));
    await waitFor(() => expect(onAttach).toHaveBeenCalled());
    const attached = onAttach.mock.calls[0][0] as Rubric;
    expect(attached.id).toBe('rub-1');
    expect(attached.criteria[0].name).toBe('Claim');
  });

  it('keeps the side panel when the preview is off', () => {
    render(
      <RubricBuilderPanel
        questionId="q1"
        onAttach={vi.fn()}
        onDetach={vi.fn()}
        onClose={vi.fn()}
        teacherUid="uid-test"
      />
    );
    expect(screen.getByLabelText('Rubric builder')).toBeInTheDocument();
  });
});
