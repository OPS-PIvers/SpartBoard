import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import {
  OverrideEditorRow,
  type OverrideEditorQuestion,
} from '@/components/common/library/OverrideEditorRow';
import type { Rubric } from '@/types';

const rubric: Rubric = {
  id: 'r1',
  title: 'Essay rubric',
  createdAt: 0,
  updatedAt: 0,
  criteria: [],
};

const questions: OverrideEditorQuestion[] = [
  {
    id: 'q1',
    label: 'Question 1 (MC)',
    options: [
      { id: 'a', text: 'Correct', isCorrect: true },
      { id: 'b', text: 'Wrong', isCorrect: false },
      { id: 'c', text: 'Also wrong', isCorrect: false },
    ],
  },
  { id: 'q2', label: 'Question 2 (essay)' },
];

describe('OverrideEditorRow', () => {
  it('renders collapsed with a no-accommodations placeholder when override is empty', () => {
    render(
      <OverrideEditorRow
        studentName="Ada Lovelace"
        override={{}}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('No accommodations')).toBeInTheDocument();
  });

  it('renders active chips when collapsed', () => {
    render(
      <OverrideEditorRow
        studentName="Grace Hopper"
        override={{ timeMultiplier: 2 }}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText('2x time')).toBeInTheDocument();
  });

  it('expands and emits a time multiplier change', () => {
    const onChange = vi.fn();
    render(
      <OverrideEditorRow
        studentName="Ada Lovelace"
        override={{}}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByText('Ada Lovelace'));
    fireEvent.click(screen.getByText('2x'));
    expect(onChange).toHaveBeenCalledWith({ timeMultiplier: 2 });
  });

  it('never allows hiding the correct MC option, even via a direct toggle call', () => {
    const onChange = vi.fn();
    render(
      <OverrideEditorRow
        studentName="Ada Lovelace"
        override={{}}
        onChange={onChange}
        quizMode
        questions={questions}
        defaultExpanded
      />
    );
    const correctOptionCheckbox = screen.getByRole('checkbox', {
      name: /Correct/,
    });
    expect(correctOptionCheckbox).toBeDisabled();
    fireEvent.click(correctOptionCheckbox);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('toggles a hideable MC option', () => {
    const onChange = vi.fn();
    render(
      <OverrideEditorRow
        studentName="Ada Lovelace"
        override={{}}
        onChange={onChange}
        quizMode
        questions={questions}
        defaultExpanded
      />
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Wrong' }));
    expect(onChange).toHaveBeenCalledWith({
      hiddenOptionIdsByQuestion: { q1: ['b'] },
    });
  });

  it('drops the questionIds override when every question is re-included', () => {
    const onChange = vi.fn();
    render(
      <OverrideEditorRow
        studentName="Ada Lovelace"
        override={{ questionIds: ['q1'] }}
        onChange={onChange}
        quizMode
        questions={questions}
        defaultExpanded
      />
    );
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Question 2 (essay)' })
    );
    expect(onChange).toHaveBeenCalledWith({ questionIds: undefined });
  });

  it('sets a rubric override to points mode', () => {
    const onChange = vi.fn();
    render(
      <OverrideEditorRow
        studentName="Ada Lovelace"
        override={{}}
        onChange={onChange}
        quizMode
        questions={questions}
        rubrics={[rubric]}
        defaultExpanded
      />
    );
    fireEvent.change(screen.getByDisplayValue('Default'), {
      target: { value: 'points' },
    });
    expect(onChange).toHaveBeenCalledWith({
      rubricOverrideByQuestion: { q2: 'points' },
    });
  });

  it('gives the tab-warning threshold input an accessible name', () => {
    render(
      <OverrideEditorRow
        studentName="Ada Lovelace"
        override={{}}
        onChange={vi.fn()}
        quizMode
        questions={questions}
        defaultExpanded
      />
    );
    expect(screen.getByLabelText('Tab-warning threshold')).toBeInTheDocument();
  });

  it('stores a rubric snapshot copy rather than aliasing the library rubric', () => {
    const onChange = vi.fn();
    render(
      <OverrideEditorRow
        studentName="Ada Lovelace"
        override={{}}
        onChange={onChange}
        quizMode
        questions={questions}
        rubrics={[rubric]}
        defaultExpanded
      />
    );
    fireEvent.change(screen.getByDisplayValue('Default'), {
      target: { value: 'r1' },
    });
    const stored = (
      onChange.mock.calls[0][0] as {
        rubricOverrideByQuestion: Record<string, Rubric>;
      }
    ).rubricOverrideByQuestion.q2;
    expect(stored).toEqual(rubric);
    expect(stored).not.toBe(rubric);
    expect(stored.criteria).not.toBe(rubric.criteria);
  });

  it('still shows a stored rubric snapshot whose source left the library', () => {
    const removed: Rubric = {
      id: 'gone',
      title: 'Retired rubric',
      createdAt: 0,
      updatedAt: 0,
      criteria: [],
    };
    const onChange = vi.fn();
    render(
      <OverrideEditorRow
        studentName="Ada Lovelace"
        override={{ rubricOverrideByQuestion: { q2: removed } }}
        onChange={onChange}
        quizMode
        questions={questions}
        rubrics={[rubric]}
        defaultExpanded
      />
    );
    // Reads as the stored snapshot, not a misleading "Default".
    const select = screen.getByDisplayValue('Retired rubric');
    expect(select).toHaveValue('gone');

    // Re-selecting it keeps the snapshot instead of silently clearing.
    fireEvent.change(select, { target: { value: 'r1' } });
    fireEvent.change(select, { target: { value: 'gone' } });
    expect(onChange).toHaveBeenLastCalledWith({
      rubricOverrideByQuestion: { q2: removed },
    });
  });

  it("copies another selected student's full override", () => {
    const onChange = vi.fn();
    const peers = [
      {
        id: 'peer-1',
        name: 'Grace Hopper',
        override: {
          timeMultiplier: 2 as const,
          tabWarningThreshold: 'off' as const,
        },
      },
    ];
    render(
      <OverrideEditorRow
        studentName="Ada Lovelace"
        override={{}}
        onChange={onChange}
        peers={peers}
        defaultExpanded
      />
    );
    fireEvent.change(screen.getByLabelText('Copy overrides from'), {
      target: { value: 'peer-1' },
    });
    fireEvent.click(screen.getByText('Copy'));
    expect(onChange).toHaveBeenCalledWith({
      timeMultiplier: 2,
      tabWarningThreshold: 'off',
    });
  });
});
