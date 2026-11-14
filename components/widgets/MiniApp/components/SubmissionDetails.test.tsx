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

  it('says how many rows are hidden past the cap', () => {
    render(
      <SubmissionDetails
        value={{ log: Array.from({ length: 205 }, (_, i) => ({ step: i })) }}
      />
    );
    expect(screen.getByText('5 more not shown')).toBeInTheDocument();
  });

  it('keeps deep values readable instead of hiding them', () => {
    render(
      <SubmissionDetails
        value={{ deep: [{ q: 1, meta: { a: { b: 'kept' } } }] }}
      />
    );
    expect(screen.getByTestId('mini-app-submission-details')).toHaveTextContent(
      'kept'
    );
  });

  it('keeps small numbers and leaves missing table cells blank-marked', () => {
    render(<SubmissionDetails value={[{ constructor: 1 }, { rate: 0.004 }]} />);
    const cells = screen.getAllByRole('cell').map((c) => c.textContent);
    expect(cells).toEqual(['1', '–', '–', '0.004']);
  });
});
