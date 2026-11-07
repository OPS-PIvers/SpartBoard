import React, { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_FLASHCARD_ASSIGN_FORM } from '@/components/widgets/Flashcards/utils/flashcardAssign';
import { FlashcardsCheckStep } from './FlashcardsCheckStep';
import {
  formatFlashcardsModeValue,
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

describe('formatFlashcardsModeValue', () => {
  it('reads the mode, Speak included', () => {
    expect(formatFlashcardsModeValue(DEFAULTS)).toBe('Flashcards');
    expect(formatFlashcardsModeValue({ ...DEFAULTS, checkMode: 'test' })).toBe(
      'Test'
    );
    expect(formatFlashcardsModeValue({ ...DEFAULTS, checkMode: 'speak' })).toBe(
      'Speak'
    );
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

  it('edits test question types', () => {
    render(<Harness initial={{ checkMode: 'test' }} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Multiple choice' }));
    expect(latest.testTypes).toEqual(['fib']);
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
  });
});
