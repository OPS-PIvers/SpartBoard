import React, { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_FLASHCARD_ASSIGN_FORM } from '@/components/widgets/Flashcards/utils/flashcardAssign';
import { FlashcardsCheckStep } from './FlashcardsCheckStep';
import {
  formatFlashcardsCheckValue,
  type FlashcardsCheckValue,
} from './flashcardsCheckValue';

const { collectSubmission: _omit, ...DEFAULTS } = DEFAULT_FLASHCARD_ASSIGN_FORM;

let latest: FlashcardsCheckValue = DEFAULTS;
const record = (value: FlashcardsCheckValue): void => {
  latest = value;
};
const Harness: React.FC<{
  initial?: Partial<FlashcardsCheckValue>;
  cardCount?: number;
}> = ({ initial, cardCount = 24 }) => {
  const [value, setValue] = useState<FlashcardsCheckValue>({
    ...DEFAULTS,
    ...initial,
  });
  return (
    <FlashcardsCheckStep
      value={value}
      onChange={(next) => {
        record(next);
        setValue(next);
      }}
      cardCount={cardCount}
    />
  );
};

describe('formatFlashcardsCheckValue', () => {
  it('reads mode and score visibility', () => {
    expect(formatFlashcardsCheckValue(DEFAULTS)).toBe('Flashcards, score only');
    expect(
      formatFlashcardsCheckValue({
        ...DEFAULTS,
        checkMode: 'test',
        scoreVisibility: 'none',
      })
    ).toBe('Test, hide until I publish');
  });
});

describe('FlashcardsCheckStep', () => {
  it('shows mastery only in Flashcards mode and strict only outside it', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Correct in a row to master')).toBeTruthy();
    expect(screen.queryByRole('switch', { name: 'Strict mode' })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Write' }));
    expect(latest.checkMode).toBe('write');
    expect(screen.queryByLabelText('Correct in a row to master')).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: 'Strict mode' }));
    expect(latest.strict).toBe(true);
  });

  it('keeps mastery between 2 and 4', () => {
    render(<Harness />);
    const input = screen.getByLabelText('Correct in a row to master');
    fireEvent.change(input, { target: { value: '4' } });
    expect(latest.masteryThreshold).toBe(4);
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.change(input, { target: { value: '1' } });
    expect(latest.masteryThreshold).toBe(4);
  });

  it('edits test question types and count', () => {
    render(<Harness initial={{ checkMode: 'test' }} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Multiple choice' }));
    expect(latest.testTypes).toEqual(['fib']);
    fireEvent.change(screen.getByLabelText('Questions'), {
      target: { value: '10' },
    });
    expect(latest.testCount).toBe(10);
    fireEvent.click(screen.getByRole('switch', { name: 'Fill in the blank' }));
    expect(screen.getByRole('alert').textContent).toBe(
      'Choose at least one question type.'
    );
  });

  it('disables multiple choice under 4 cards', () => {
    render(<Harness initial={{ checkMode: 'test' }} cardCount={3} />);
    const mc = screen.getByRole('switch', { name: 'Multiple choice' });
    expect(mc.getAttribute('aria-checked')).toBe('false');
    expect((mc as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByLabelText('Questions').textContent).toBe('All (3)');
  });

  it('sets score visibility', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Score visibility'), {
      target: { value: 'score-and-answers' },
    });
    expect(latest.scoreVisibility).toBe('score-and-answers');
  });
});
