import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { RubricScoringPanel } from '@/components/widgets/QuizWidget/components/RubricScoringPanel';
import type { Rubric } from '@/types';

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
