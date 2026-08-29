/**
 * M12 Phase 3-H — rubric preview shown to students while answering a
 * written question. `CollapsibleRubric` is exported from QuizStudentApp.tsx
 * for direct testing (the full answering screen wires Firestore listeners).
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CollapsibleRubric } from '@/components/quiz/QuizStudentApp';
import type { Rubric } from '@/types';

const rubric: Rubric = {
  id: 'r1',
  title: 'Essay Rubric',
  criteria: [
    {
      id: 'c1',
      name: 'Thesis',
      description: 'Clarity of argument',
      levels: [
        { id: 'l1', label: 'Weak', points: 1, description: 'No thesis' },
        { id: 'l2', label: 'Strong', points: 3, description: 'Clear thesis' },
      ],
    },
  ],
  createdAt: 0,
  updatedAt: 0,
};

describe('CollapsibleRubric', () => {
  it('renders nothing for a rubric with no criteria', () => {
    const { container } = render(
      <CollapsibleRubric rubric={{ ...rubric, criteria: [] }} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('starts collapsed, hiding criteria detail', () => {
    render(<CollapsibleRubric rubric={rubric} />);
    expect(screen.getByText('Essay Rubric')).toBeInTheDocument();
    expect(screen.queryByText('Thesis')).not.toBeInTheDocument();
  });

  it('expands to show criteria, levels, points, and descriptors on click', () => {
    render(<CollapsibleRubric rubric={rubric} />);
    fireEvent.click(screen.getByRole('button', { name: /Essay Rubric/i }));
    expect(screen.getByText('Thesis')).toBeInTheDocument();
    expect(screen.getByText('Clarity of argument')).toBeInTheDocument();
    expect(screen.getByText(/Strong \(3 pts\)/)).toBeInTheDocument();
    expect(screen.getByText('Clear thesis')).toBeInTheDocument();
  });
});
