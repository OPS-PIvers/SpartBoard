import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AssignmentStatusChip } from '@/components/assignmentsHub/AssignmentStatusChip';

describe('AssignmentStatusChip', () => {
  it('renders Not started', () => {
    render(<AssignmentStatusChip status="not-started" />);
    expect(screen.getByText('Not started')).toBeInTheDocument();
  });

  it('renders In progress', () => {
    render(<AssignmentStatusChip status="in-progress" />);
    expect(screen.getByText('In progress')).toBeInTheDocument();
  });

  it('renders Submitted', () => {
    render(<AssignmentStatusChip status="submitted" />);
    expect(screen.getByText('Submitted')).toBeInTheDocument();
  });

  it('renders Graded', () => {
    render(<AssignmentStatusChip status="graded" />);
    expect(screen.getByText('Graded')).toBeInTheDocument();
  });
});
