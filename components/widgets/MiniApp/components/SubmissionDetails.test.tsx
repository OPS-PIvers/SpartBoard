import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SubmissionDetails } from './SubmissionDetails';
import { answerSummary, humanizeKey } from '@/utils/miniAppSubmissionText';

describe('SubmissionDetails', () => {
  it('names fields in plain words', () => {
    expect(humanizeKey('correctAnswers')).toBe('Correct answers');
    expect(humanizeKey('time_spent')).toBe('Time spent');
    expect(humanizeKey('HTMLScore')).toBe('Html score');
  });

  it('shows a result as labelled rows and a table, never code', () => {
    render(
      <SubmissionDetails
        value={{
          totalScore: 4,
          finished: true,
          answers: [
            { question: 'Capital of France', answer: 'Paris', correct: true },
            { question: '2 + 2', answer: 5, correct: false },
          ],
        }}
      />
    );
    const box = screen.getByTestId('mini-app-submission-details');
    expect(box).not.toHaveTextContent('{');
    expect(screen.getByText('Total score')).toBeInTheDocument();
    expect(screen.getByText('Finished').nextSibling).toHaveTextContent('Yes');
    const table = screen.getByRole('table');
    expect(
      within(table).getByRole('columnheader', { name: 'Question' })
    ).toBeInTheDocument();
    expect(within(table).getByText('Paris')).toBeInTheDocument();
    expect(within(table).getByText('No')).toBeInTheDocument();
  });

  it('reads an object answer on one line', () => {
    expect(answerSummary({ x: 3, label: 'Point A' })).toBe(
      'X: 3, Label: Point A'
    );
    expect(answerSummary(null)).toBe('–');
  });
});
