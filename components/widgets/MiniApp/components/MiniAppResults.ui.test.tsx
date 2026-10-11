// Mini App results UI (MINI_APP_RESULTS.md D8-D10): the assign step and the results table.
import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MiniAppAssignStepper } from './MiniAppAssignStepper';
import { MiniAppResultsTable } from './MiniAppResultsTable';
import { SAMPLE_ROSTERS } from '@/components/common/library/assignStepper/assignStepperTestRosters';

const stepper = (
  over: Partial<React.ComponentProps<typeof MiniAppAssignStepper>> = {}
) =>
  render(
    <MiniAppAssignStepper
      appTitle="Fraction Pizza"
      assignmentName="Fraction Pizza"
      onNameChange={() => undefined}
      rosters={SAMPLE_ROSTERS}
      initialClassIds={['c1']}
      defaultKind="work"
      submitting={false}
      onSubmit={() => Promise.resolve()}
      onClose={() => undefined}
      {...over}
    />
  );

describe('MiniAppAssignStepper results step', () => {
  it('is absent without results', () => {
    stepper();
    expect(screen.queryByText('Attempts and results')).toBeNull();
  });

  it('is absent for a study resource', () => {
    stepper({
      defaultKind: 'resource',
      resultsDefault: { attemptLimit: 1, showCorrectAnswers: true },
    });
    expect(screen.queryByText('Attempts and results')).toBeNull();
  });

  it('hands the picked attempts to submit', async () => {
    const onSubmit = vi.fn(() => Promise.resolve());
    stepper({
      onSubmit,
      resultsDefault: { attemptLimit: 1, showCorrectAnswers: true },
    });
    fireEvent.click(screen.getByText('Attempts and results'));
    fireEvent.click(screen.getByRole('button', { name: 'Unlimited' }));
    fireEvent.click(screen.getByRole('button', { name: /^assign$/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0][1]).toEqual({
      attemptLimit: null,
      showCorrectAnswers: true,
    });
  });
});

describe('MiniAppResultsTable', () => {
  it('shows best score, attempts and per-question marks', async () => {
    const loadAttempts = vi.fn(() =>
      Promise.resolve([{ attemptNo: 1, submittedAt: 1, score: 1, maxScore: 2 }])
    );
    render(
      <MiniAppResultsTable
        rows={[
          {
            id: 'a',
            name: 'Ava',
            attemptCount: 1,
            best: {
              score: 1,
              maxScore: 2,
              attemptNo: 1,
              gradedBy: 'app',
              items: [
                { id: 'q1', correct: true, by: 'server' },
                { id: 'q2', correct: false, by: 'app' },
              ],
            },
            lastSubmittedAt: 1,
            doneOnly: false,
          },
        ]}
        questions={[
          { id: 'q1', type: 'mc', prompt: 'One' },
          { id: 'q2', type: 'other', prompt: 'Two' },
        ]}
        attemptLimit={3}
        loadAttempts={loadAttempts}
      />
    );
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
    expect(screen.getByLabelText('Correct')).toBeInTheDocument();
    expect(screen.getByLabelText('Incorrect')).toBeInTheDocument();
    expect(screen.getByText('from app')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Ava'));
    expect(await screen.findByText('Attempt 1')).toBeInTheDocument();
    expect(loadAttempts).toHaveBeenCalledWith('a');
  });
});
