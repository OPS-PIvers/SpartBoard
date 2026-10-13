import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthContext } from '@/context/AuthContextValue';
import type { Rubric } from '@/types';

const showConfirm = vi.fn();

vi.mock('@/hooks/useRubrics', () => ({
  useRubrics: () => ({
    rubrics: [],
    loading: false,
    error: null,
    saveRubric: () => Promise.resolve(),
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

const open = (flagOn: boolean, onAttach = vi.fn(), snapshot?: Rubric) =>
  render(
    <AuthContext.Provider
      value={
        {
          canAccessFeature: (f: string) =>
            flagOn && f === 'rubric-scoring-guides',
        } as never
      }
    >
      <RubricBuilderPanel
        questionId="q1"
        existingSnapshot={snapshot}
        onAttach={onAttach}
        onDetach={vi.fn()}
        onClose={vi.fn()}
        teacherUid="uid-test"
      />
    </AuthContext.Provider>
  );

describe('RubricBuilderPanel scoring guide', () => {
  beforeEach(() => {
    showConfirm.mockReset();
    showConfirm.mockResolvedValue(true);
  });

  it('hides the template switch while the flag is off', () => {
    open(false);
    expect(screen.queryByRole('radio', { name: 'Scoring guide' })).toBeNull();
  });

  it('builds a part with guidelines, examples and points', async () => {
    const onAttach = vi.fn();
    open(true, onAttach);
    fireEvent.click(screen.getByRole('radio', { name: 'Scoring guide' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Part 1 label')).toBeTruthy()
    );

    fireEvent.change(screen.getByLabelText('Title', { selector: 'input' }), {
      target: { value: 'Pain study' },
    });
    fireEvent.change(screen.getByLabelText('Part 1 label'), {
      target: { value: '(A) Research method' },
    });
    fireEvent.change(screen.getByLabelText('Part 1 scoring guidelines'), {
      target: { value: 'Identifies a meta-analysis.' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add example' })[0]);
    fireEvent.change(screen.getByLabelText('Part 1 example 1'), {
      target: { value: 'The study is a meta-analysis.' },
    });
    fireEvent.change(screen.getByLabelText('Part 1 points'), {
      target: { value: '2' },
    });
    expect(screen.queryByText('Import CSV')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Attach to question' }));
    expect(onAttach).toHaveBeenCalledOnce();
    const rubric = onAttach.mock.calls[0][0] as Rubric;
    const [row] = rubric.criteria;
    expect(row.name).toBe('(A) Research method');
    expect(row.guide?.examples).toEqual(['The study is a meta-analysis.']);
    expect(row.levels.map((l) => l.points)).toEqual([0, 1, 2]);
  });
});
