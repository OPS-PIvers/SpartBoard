import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { RubricScoringPanel } from '@/components/widgets/QuizWidget/components/RubricScoringPanel';
import type { Rubric, WrittenAnswerRubricScore } from '@/types';

const rubric: Rubric = {
  id: 'r1',
  title: 'Essay rubric',
  description: 'Two dimensions',
  createdAt: 0,
  updatedAt: 0,
  criteria: [
    {
      id: 'c1',
      name: 'Thesis',
      description: 'Clarity of the claim',
      levels: [
        { id: 'c1l1', label: 'Below', points: 1, description: 'No thesis' },
        { id: 'c1l2', label: 'Meets', points: 3 },
        { id: 'c1l3', label: 'Exceeds', points: 4 },
      ],
    },
    {
      id: 'c2',
      name: 'Evidence',
      levels: [
        { id: 'c2l1', label: 'Below', points: 1 },
        { id: 'c2l2', label: 'Meets', points: 2 },
      ],
    },
  ],
};

describe('RubricScoringPanel evidence counts', () => {
  it('shows no jump link for a criterion with no tagged evidence', () => {
    render(
      <RubricScoringPanel
        rubric={rubric}
        maxPoints={10}
        onChange={vi.fn()}
        tagCounts={{ c1: 0 }}
        onJumpToTagged={vi.fn()}
      />
    );
    expect(
      screen.queryByRole('button', { name: /as evidence for/i })
    ).not.toBeInTheDocument();
  });

  it('counts highlights on the criterion and cycles on click', () => {
    const onJump = vi.fn();
    render(
      <RubricScoringPanel
        rubric={rubric}
        maxPoints={10}
        onChange={vi.fn()}
        tagCounts={{ c1: 2 }}
        onJumpToTagged={onJump}
      />
    );
    // The accessible name opens with the visible text (WCAG 2.5.3), so a
    // voice-control user saying what they can see matches the button.
    const link = screen.getByRole('button', {
      name: '2 highlights as evidence for Thesis',
    });
    expect(link).toHaveTextContent('2 highlights');
    fireEvent.click(link);
    expect(onJump).toHaveBeenCalledWith('c1');
  });

  it('says notes rather than highlights on a spoken response', () => {
    render(
      <RubricScoringPanel
        rubric={rubric}
        maxPoints={10}
        onChange={vi.fn()}
        tagCounts={{ c1: 1 }}
        onJumpToTagged={vi.fn()}
        tagCountKind="note"
      />
    );
    expect(
      screen.getByRole('button', { name: /notes? as evidence for thesis/i })
    ).toHaveTextContent('1 note');
  });

  it('renders no link at all when the parent wires no jump handler', () => {
    render(
      <RubricScoringPanel
        rubric={rubric}
        maxPoints={10}
        onChange={vi.fn()}
        tagCounts={{ c1: 3 }}
      />
    );
    expect(screen.queryByText('3 highlights')).not.toBeInTheDocument();
  });
});

describe('RubricScoringPanel', () => {
  it('renders each criterion with its levels ordered highest-to-lowest', () => {
    render(
      <RubricScoringPanel rubric={rubric} maxPoints={10} onChange={vi.fn()} />
    );
    expect(screen.getByText('Thesis')).toBeInTheDocument();
    expect(screen.getByText('Evidence')).toBeInTheDocument();
    const thesisRadios = screen.getAllByRole('radio', {
      name: /Below|Meets|Exceeds/,
    });
    // 3 levels on c1 + 2 on c2.
    expect(thesisRadios).toHaveLength(5);
    const thesisLabels = screen
      .getAllByRole('radio')
      .slice(0, 3)
      .map((r) => (r as HTMLInputElement).value);
    expect(thesisLabels).toEqual(['c1l3', 'c1l2', 'c1l1']);
  });

  it('emits the selected score and derived points on every selection', () => {
    const onChange =
      vi.fn<(s: WrittenAnswerRubricScore[], derived: number) => void>();
    render(
      <RubricScoringPanel rubric={rubric} maxPoints={10} onChange={onChange} />
    );
    fireEvent.click(screen.getByRole('radio', { name: /Exceeds/ }));
    expect(onChange).toHaveBeenLastCalledWith(
      [{ criterionId: 'c1', levelId: 'c1l3', points: 4 }],
      4
    );
    fireEvent.click(screen.getAllByRole('radio', { name: /Meets/ })[1]);
    expect(onChange).toHaveBeenLastCalledWith(
      [
        { criterionId: 'c1', levelId: 'c1l3', points: 4 },
        { criterionId: 'c2', levelId: 'c2l2', points: 2 },
      ],
      6
    );
    expect(screen.getByText('6 / 6')).toBeInTheDocument();
  });

  it('replaces a prior selection within the same criterion', () => {
    const onChange =
      vi.fn<(s: WrittenAnswerRubricScore[], derived: number) => void>();
    render(
      <RubricScoringPanel rubric={rubric} maxPoints={10} onChange={onChange} />
    );
    fireEvent.click(screen.getByRole('radio', { name: /Exceeds/ }));
    fireEvent.click(screen.getAllByRole('radio', { name: /Meets/ })[0]);
    expect(onChange).toHaveBeenLastCalledWith(
      [{ criterionId: 'c1', levelId: 'c1l2', points: 3 }],
      3
    );
  });

  it('hydrates from initialScores', () => {
    render(
      <RubricScoringPanel
        rubric={rubric}
        maxPoints={10}
        initialScores={[
          { criterionId: 'c1', levelId: 'c1l2', points: 3 },
          { criterionId: 'c2', levelId: 'c2l1', points: 1, note: 'thin' },
        ]}
        onChange={vi.fn()}
      />
    );
    expect(screen.getAllByRole('radio', { name: /Meets/ })[0]).toBeChecked();
    expect(screen.getByText('4 / 6')).toBeInTheDocument();
    // A saved note is expanded on mount rather than hidden behind the toggle.
    expect(screen.getByLabelText('Note for Evidence')).toHaveValue('thin');
  });

  it('records a per-criterion note behind the expand toggle', () => {
    const onChange =
      vi.fn<(s: WrittenAnswerRubricScore[], derived: number) => void>();
    render(
      <RubricScoringPanel rubric={rubric} maxPoints={10} onChange={onChange} />
    );
    expect(screen.queryByLabelText('Note for Thesis')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /Exceeds/ }));
    fireEvent.click(
      screen.getByRole('button', { name: /Add note for Thesis/ })
    );
    fireEvent.change(screen.getByLabelText('Note for Thesis'), {
      target: { value: 'Strong claim' },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      [
        {
          criterionId: 'c1',
          levelId: 'c1l3',
          points: 4,
          note: 'Strong claim',
        },
      ],
      4
    );
  });

  it('keeps raw note whitespace in the textarea and trims only on commit', () => {
    const onChange =
      vi.fn<(s: WrittenAnswerRubricScore[], derived: number) => void>();
    render(
      <RubricScoringPanel rubric={rubric} maxPoints={10} onChange={onChange} />
    );
    fireEvent.click(screen.getByRole('radio', { name: /Exceeds/ }));
    fireEvent.click(
      screen.getByRole('button', { name: /Add note for Thesis/ })
    );
    const note = screen.getByLabelText('Note for Thesis');
    fireEvent.change(note, { target: { value: '  ' } });
    expect(note).toHaveValue('  ');
    expect(onChange).toHaveBeenLastCalledWith(
      [{ criterionId: 'c1', levelId: 'c1l3', points: 4 }],
      4
    );
    fireEvent.change(note, { target: { value: '  Strong claim ' } });
    expect(note).toHaveValue('  Strong claim ');
    expect(onChange).toHaveBeenLastCalledWith(
      [{ criterionId: 'c1', levelId: 'c1l3', points: 4, note: 'Strong claim' }],
      4
    );
  });

  it('flags a partial selection until every criterion is scored', () => {
    render(
      <RubricScoringPanel rubric={rubric} maxPoints={10} onChange={vi.fn()} />
    );
    expect(screen.getByText(/0 of 2 criteria scored/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Exceeds/ }));
    expect(screen.getByText(/1 of 2 criteria scored/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('radio', { name: /Meets/ })[1]);
    expect(screen.queryByText(/criteria scored/)).toBeNull();
  });

  it('warns when the completed rubric total exceeds the question max', () => {
    render(
      <RubricScoringPanel rubric={rubric} maxPoints={4} onChange={vi.fn()} />
    );
    fireEvent.click(screen.getByRole('radio', { name: /Exceeds/ }));
    fireEvent.click(screen.getAllByRole('radio', { name: /Meets/ })[1]);
    expect(screen.getByText(/Points capped at 4/)).toBeInTheDocument();
  });
});
