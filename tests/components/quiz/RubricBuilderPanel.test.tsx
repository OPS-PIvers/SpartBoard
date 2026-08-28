import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Rubric } from '@/types';

const saveRubric = vi.fn().mockResolvedValue(undefined);
const rubricsState: { rubrics: Rubric[] } = { rubrics: [] };

vi.mock('@/hooks/useRubrics', () => ({
  useRubrics: () => ({
    rubrics: rubricsState.rubrics,
    loading: false,
    error: null,
    saveRubric,
    deleteRubric: vi.fn(),
    shareRubric: vi.fn(),
    importSharedRubric: vi.fn(),
  }),
}));

import { RubricBuilderPanel } from '@/components/widgets/QuizWidget/components/RubricBuilderPanel';

const CSV = [
  'Criterion,Description,Level 1 Label,Level 1 Points,Level 1 Description,Level 2 Label,Level 2 Points,Level 2 Description',
  'Thesis,Clarity,Below,1,No thesis,Meets,3,Clear thesis',
  'Evidence,Support,Below,1,None,Meets,4,Plenty',
].join('\n');

const renderPanel = (
  overrides: Partial<React.ComponentProps<typeof RubricBuilderPanel>> = {}
) => {
  const props = {
    questionId: 'q1',
    onAttach: vi.fn(),
    onDetach: vi.fn(),
    onClose: vi.fn(),
    teacherUid: 'teacher-1',
    ...overrides,
  };
  render(<RubricBuilderPanel {...props} />);
  return props;
};

describe('RubricBuilderPanel', () => {
  beforeEach(() => {
    rubricsState.rubrics = [];
    saveRubric.mockClear();
  });

  it('renders the library picker and a starter criterion', () => {
    renderPanel();
    expect(screen.getByLabelText('Library')).toBeInTheDocument();
    expect(screen.getByLabelText('Criterion 1 name')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Criterion 1 level 2 label')
    ).toBeInTheDocument();
  });

  it('adds a criterion and a level', () => {
    renderPanel();
    fireEvent.click(screen.getByText('Add Criterion'));
    expect(screen.getByLabelText('Criterion 2 name')).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('Add Level')[0]);
    expect(
      screen.getByLabelText('Criterion 1 level 3 label')
    ).toBeInTheDocument();
  });

  it('shows a validation error for duplicate point values in a criterion', () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText('Criterion 1 level 2 points'), {
      target: { value: '0' },
    });
    expect(screen.getByRole('alert').textContent).toContain(
      'duplicate point value 0'
    );
  });

  it('populates builder state from an imported CSV', async () => {
    renderPanel();
    const input = screen.getByLabelText('Import rubric CSV');
    const file = new File([CSV], 'rubric.csv', { type: 'text/csv' });
    // jsdom File.text() is not implemented in all versions — stub it.
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(CSV) });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(screen.getByLabelText('Criterion 1 name')).toHaveValue('Thesis')
    );
    expect(screen.getByLabelText('Criterion 2 name')).toHaveValue('Evidence');
    // Max-sum of the imported rubric: 3 + 4.
    expect(screen.getByText('Total points: 7')).toBeInTheDocument();
  });

  it('attaches with the snapshot and the criteria max-sum points', () => {
    const props = renderPanel();
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Paragraph Rubric' },
    });
    fireEvent.change(screen.getByLabelText('Criterion 1 name'), {
      target: { value: 'Thesis' },
    });
    fireEvent.change(screen.getByLabelText('Criterion 1 level 1 label'), {
      target: { value: 'Below' },
    });
    fireEvent.change(screen.getByLabelText('Criterion 1 level 2 label'), {
      target: { value: 'Meets' },
    });
    fireEvent.change(screen.getByLabelText('Criterion 1 level 2 points'), {
      target: { value: '5' },
    });

    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByText('Attach to question'));

    expect(props.onAttach).toHaveBeenCalledTimes(1);
    const [rubric] = vi.mocked(props.onAttach).mock.calls[0] as [Rubric];
    expect(rubric.title).toBe('Paragraph Rubric');
    expect(rubric.criteria[0].levels.map((l) => l.points)).toEqual([0, 5]);
  });

  it('offers detach only when a rubric is already attached', () => {
    const snapshot: Rubric = {
      id: 'r1',
      title: 'Existing',
      criteria: [
        {
          id: 'c1',
          name: 'Thesis',
          levels: [
            { id: 'l1', label: 'Below', points: 1 },
            { id: 'l2', label: 'Meets', points: 4 },
          ],
        },
      ],
      createdAt: 1,
      updatedAt: 2,
    };
    const props = renderPanel({ existingSnapshot: snapshot });
    fireEvent.click(screen.getByText('Detach rubric'));
    expect(props.onDetach).toHaveBeenCalled();
  });

  it('warns when the library copy is newer than the attached snapshot', () => {
    const snapshot: Rubric = {
      id: 'r1',
      title: 'Existing',
      criteria: [
        {
          id: 'c1',
          name: 'Thesis',
          levels: [
            { id: 'l1', label: 'Below', points: 1 },
            { id: 'l2', label: 'Meets', points: 4 },
          ],
        },
      ],
      createdAt: 1,
      updatedAt: 2,
    };
    rubricsState.rubrics = [{ ...snapshot, updatedAt: 99 }];
    renderPanel({ existingSnapshot: snapshot });
    expect(screen.getByText(/library copy has changed/i)).toBeInTheDocument();
  });
});
