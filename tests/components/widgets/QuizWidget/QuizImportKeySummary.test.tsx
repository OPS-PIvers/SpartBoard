import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuizImportKeySummary } from '@/components/widgets/QuizWidget/components/QuizImportKeySummary';

describe('QuizImportKeySummary', () => {
  it('renders the counts in words', () => {
    render(
      <QuizImportKeySummary
        summary={{
          entries: 22,
          matched: 18,
          unmatchedLabels: ['21', '22'],
          conflicts: 2,
        }}
        questionCount={20}
        untickedCount={3}
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      /Answer key: 18 of 20 questions matched.*2 conflicts.*3 items unticked/
    );
  });

  it('renders nothing with no key and nothing unticked', () => {
    const { container } = render(
      <QuizImportKeySummary questionCount={4} untickedCount={0} />
    );
    expect(container.firstChild).toBeNull();
  });
});
