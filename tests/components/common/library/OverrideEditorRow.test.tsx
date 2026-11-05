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
  { id: 'q2', label: 'Question 2 (essay)', isWritten: true },
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

  it('clamps a sub-1 tab-warning threshold instead of storing it', () => {
    // `min={1}` only gates form validation, so the handler has to clamp.
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
    const input = screen.getByLabelText('Tab-warning threshold');

    fireEvent.change(input, { target: { value: '0' } });
    expect(onChange).toHaveBeenLastCalledWith({ tabWarningThreshold: 1 });

    fireEvent.change(input, { target: { value: '-3' } });
    expect(onChange).toHaveBeenLastCalledWith({ tabWarningThreshold: 1 });

    // A valid threshold still passes through untouched.
    fireEvent.change(input, { target: { value: '4' } });
    expect(onChange).toHaveBeenLastCalledWith({ tabWarningThreshold: 4 });
  });

  it('clears the tab-warning threshold rather than clamping an emptied field to 1', () => {
    // Needs a stored value so emptying the input is a real DOM change.
    const onChange = vi.fn();
    render(
      <OverrideEditorRow
        studentName="Ada Lovelace"
        override={{ tabWarningThreshold: 5 }}
        onChange={onChange}
        quizMode
        questions={questions}
        defaultExpanded
      />
    );

    fireEvent.change(screen.getByLabelText('Tab-warning threshold'), {
      target: { value: '' },
    });
    expect(onChange).toHaveBeenLastCalledWith({
      tabWarningThreshold: undefined,
    });
  });

  it('names each rubric-swap select by its own question', () => {
    const twoWritten: OverrideEditorQuestion[] = [
      { id: 'q2', label: 'Question 2 (essay)', isWritten: true },
      { id: 'q3', label: 'Question 3 (essay)', isWritten: true },
    ];
    render(
      <OverrideEditorRow
        studentName="Ada Lovelace"
        override={{}}
        onChange={vi.fn()}
        quizMode
        questions={twoWritten}
        rubrics={[rubric]}
        defaultExpanded
      />
    );

    // Without the association both selects announce identically as "Default".
    // The subset checkbox carries the same question label, so scope to the
    // select — they stay distinguishable by role for a screen reader.
    expect(
      screen.getByLabelText('Question 2 (essay)', { selector: 'select' })
    ).toHaveValue('');
    expect(
      screen.getByLabelText('Question 3 (essay)', { selector: 'select' })
    ).toHaveValue('');
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

  it('opens the row when defaultExpanded is set', () => {
    // `expanded` is seeded from defaultExpanded on mount, so compare two
    // separate mounts rather than re-rendering one with a changed prop.
    const collapsed = render(
      <OverrideEditorRow
        studentName="Ada Lovelace"
        override={{}}
        onChange={vi.fn()}
      />
    );
    expect(
      screen.queryByRole('tablist', { name: 'Extended time' })
    ).not.toBeInTheDocument();
    collapsed.unmount();

    render(
      <OverrideEditorRow
        studentName="Ada Lovelace"
        override={{}}
        onChange={vi.fn()}
        defaultExpanded
      />
    );
    expect(
      screen.getByRole('tablist', { name: 'Extended time' })
    ).toBeInTheDocument();
  });

  it('round-trips a window-shift timestamp through the datetime-local input', () => {
    // Both helpers work in local time, so assert the ms → input → ms identity
    // rather than a fixed string: CI runs UTC, developers do not.
    const openAt = new Date(2026, 2, 8, 9, 30).getTime();
    const onChange = vi.fn();
    render(
      <OverrideEditorRow
        studentName="Ada Lovelace"
        override={{ openAt }}
        onChange={onChange}
        defaultExpanded
      />
    );

    // Renders as the local wall-clock time, not the UTC instant.
    const input = screen.getByLabelText(/Opens/);
    expect(input).toHaveValue('2026-03-08T09:30');

    // And typing that same wall-clock value back yields the original epoch ms.
    fireEvent.change(input, { target: { value: '2026-03-08T09:30' } });
    fireEvent.change(input, { target: { value: '2026-03-09T09:30' } });
    expect(onChange).toHaveBeenLastCalledWith({
      openAt: new Date(2026, 2, 9, 9, 30).getTime(),
    });
  });

  it('clears a window-shift bound when the datetime-local input is emptied', () => {
    const onChange = vi.fn();
    render(
      <OverrideEditorRow
        studentName="Ada Lovelace"
        override={{ closeAt: Date.now() }}
        onChange={onChange}
        defaultExpanded
      />
    );

    fireEvent.change(screen.getByLabelText(/Closes/), {
      target: { value: '' },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ closeAt: undefined })
    );
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

  it('hides the Read aloud checkbox unless the host says the feature is available', () => {
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
    expect(
      screen.queryByRole('checkbox', { name: 'Read aloud' })
    ).not.toBeInTheDocument();
  });

  it('does not show Read aloud outside quiz mode even when available', () => {
    render(
      <OverrideEditorRow
        studentName="Ada Lovelace"
        override={{}}
        onChange={vi.fn()}
        readAloudAvailable
        defaultExpanded
      />
    );
    expect(
      screen.queryByRole('checkbox', { name: 'Read aloud' })
    ).not.toBeInTheDocument();
  });

  it('emits readAloud: true and clears it back to undefined', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <OverrideEditorRow
        studentName="Ada Lovelace"
        override={{}}
        onChange={onChange}
        quizMode
        readAloudAvailable
        questions={questions}
        defaultExpanded
      />
    );
    expect(screen.getByText('Signed-in students only.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Read aloud' }));
    expect(onChange).toHaveBeenCalledWith({ readAloud: true });

    rerender(
      <OverrideEditorRow
        studentName="Ada Lovelace"
        override={{ readAloud: true }}
        onChange={onChange}
        quizMode
        readAloudAvailable
        questions={questions}
        defaultExpanded
      />
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Read aloud' }));
    expect(onChange).toHaveBeenLastCalledWith({ readAloud: undefined });
  });

  it('shows a Read aloud chip when collapsed', () => {
    render(
      <OverrideEditorRow
        studentName="Grace Hopper"
        override={{ readAloud: true }}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText('Read aloud')).toBeInTheDocument();
    expect(screen.queryByText('No accommodations')).not.toBeInTheDocument();
  });
});

describe('OverrideEditorRow flashcards mode', () => {
  const cards: OverrideEditorQuestion[] = [
    { id: 'c1', label: 'el perro' },
    { id: 'c2', label: 'el gato' },
    { id: 'c3', label: 'la casa' },
  ];

  it('offers the card subset and tab rules, not the Quiz-only controls', () => {
    render(
      <OverrideEditorRow
        studentName="Ada Lovelace"
        override={{}}
        onChange={vi.fn()}
        flashcardsMode
        questions={cards}
        readAloudAvailable
        defaultExpanded
      />
    );
    expect(screen.getByText('Card subset')).toBeInTheDocument();
    expect(screen.queryByText('Question subset')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Tab-warning threshold')).toBeInTheDocument();
    expect(screen.queryByText('Read aloud')).not.toBeInTheDocument();
    expect(screen.queryByText('Answer choices')).not.toBeInTheDocument();
  });

  it('drops a card and shows it as a cards chip', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <OverrideEditorRow
        studentName="Ada Lovelace"
        override={{}}
        onChange={onChange}
        flashcardsMode
        questions={cards}
        defaultExpanded
      />
    );
    fireEvent.click(screen.getByLabelText('el gato'));
    expect(onChange).toHaveBeenCalledWith({ questionIds: ['c1', 'c3'] });
    rerender(
      <OverrideEditorRow
        studentName="Ada Lovelace"
        override={{ questionIds: ['c1', 'c3'] }}
        onChange={onChange}
        flashcardsMode
        questions={cards}
      />
    );
    expect(screen.getByText('2/3 cards')).toBeInTheDocument();
  });

  it('sets fewer answer choices and back to the default 4', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <OverrideEditorRow
        studentName="Ada Lovelace"
        override={{}}
        onChange={onChange}
        flashcardsMode
        answerChoicesAvailable
        questions={cards}
        defaultExpanded
      />
    );
    fireEvent.click(screen.getByRole('tab', { name: '2' }));
    expect(onChange).toHaveBeenLastCalledWith({ answerChoices: 2 });
    rerender(
      <OverrideEditorRow
        studentName="Ada Lovelace"
        override={{ answerChoices: 2 }}
        onChange={onChange}
        flashcardsMode
        answerChoicesAvailable
        questions={cards}
        defaultExpanded
      />
    );
    expect(screen.getByText('2 answer choices')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '4' }));
    expect(onChange).toHaveBeenLastCalledWith({ answerChoices: undefined });
  });
});
