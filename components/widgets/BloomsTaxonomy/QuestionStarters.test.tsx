import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BloomsQuestionStarters } from './QuestionStarters';
import { BLOOMS_QUESTION_STARTERS } from './questionStarters';

describe('BloomsQuestionStarters', () => {
  it('opens on level 1 and switches levels from the rail', () => {
    render(<BloomsQuestionStarters widgetType="blooms-taxonomy" />);

    expect(
      screen.getByText('Level 1: Recall/Knowledge/Memory')
    ).toBeInTheDocument();
    expect(screen.getByText('Can you list…?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /6\s*Evaluate/ }));

    expect(screen.getByText('Level 6: Evaluation')).toBeInTheDocument();
    expect(screen.getByText('How would you rank…?')).toBeInTheDocument();
    expect(screen.queryByText('Can you list…?')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /6\s*Evaluate/ })
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps six levels with unique starters per level', () => {
    expect(BLOOMS_QUESTION_STARTERS.map((l) => l.number)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    for (const level of BLOOMS_QUESTION_STARTERS) {
      expect(new Set(level.questionStarters).size).toBe(
        level.questionStarters.length
      );
    }
  });
});
