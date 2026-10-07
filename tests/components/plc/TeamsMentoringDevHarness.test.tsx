import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TeamsMentoringDevHarness } from '@/components/plc/teams/mentoring/dev/TeamsMentoringDevHarness';

const visit = (query: string) =>
  window.history.replaceState(null, '', `/teams-mentoring-dev?${query}`);

afterEach(() => window.history.replaceState(null, '', '/'));

describe('mentoring production views on fixtures', () => {
  it('shows facilitators the submission status, not their own tasks', () => {
    visit('screen=mhub&role=lead');
    render(<TeamsMentoringDevHarness />);
    expect(
      screen.getByRole('heading', { name: 'Classroom observation reflection' })
    ).toBeInTheDocument();
    expect(screen.getByText('Submission status')).toBeInTheDocument();
    expect(screen.getByText('Open tracker')).toBeInTheDocument();
    expect(screen.queryByText('Your tasks')).not.toBeInTheDocument();
  });

  it('shows a mentee their tasks and their partner', () => {
    visit('screen=mhub&role=member');
    render(<TeamsMentoringDevHarness />);
    expect(screen.getByText('Your tasks')).toBeInTheDocument();
    expect(
      screen.getByText('Your workspace with Dana Whitfield')
    ).toBeInTheDocument();
    expect(screen.queryByText('Submission status')).not.toBeInTheDocument();
  });

  it('titles a workspace with the two names and the facilitator line', () => {
    visit('screen=workspace&role=member');
    render(<TeamsMentoringDevHarness />);
    expect(
      screen.getByRole('heading', { name: 'Dana Whitfield and Marcus Lee' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Program facilitators can view this workspace.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/my pair/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
  });

  it('keeps a facilitator read-only inside a workspace', () => {
    visit('screen=workspace&role=lead');
    render(<TeamsMentoringDevHarness />);
    expect(
      screen.getByRole('button', { name: 'Workspaces' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull();
    expect(screen.queryByText('New check-in')).toBeNull();
  });

  it('filters the tracker and opens a workspace from it', () => {
    visit('screen=tracker&role=lead');
    render(<TeamsMentoringDevHarness />);
    expect(screen.getAllByText('Open submission')).toHaveLength(12);
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter pairs' }), {
      target: { value: 'late' },
    });
    const open = screen.getAllByText('Open workspace');
    expect(open).toHaveLength(2);
    fireEvent.click(open[0]);
    expect(
      screen.getByText('Program facilitators can view this workspace.')
    ).toBeInTheDocument();
  });
});
