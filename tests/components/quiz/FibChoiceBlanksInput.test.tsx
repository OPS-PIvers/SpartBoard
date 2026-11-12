import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { FibChoiceBlanksInput } from '@/components/quiz/FibChoiceBlanksInput';
import { hasChoiceBlanks, placementsFromValue } from '@/utils/quizBlankTypes';
import { joinBlanks } from '@/utils/quizFibBlanks';
import type { QuizPublicQuestion } from '@/types';

const dropdown: QuizPublicQuestion = {
  id: 'qd',
  type: 'FIB',
  text: 'Ice ___ when it is ___.',
  timeLimit: 0,
  blankCount: 2,
  blankType: 'dropdown',
  blankChoices: [
    { choices: ['freezes', 'melts'] },
    { choices: ['heated', 'cooled'] },
  ],
};

const drag: QuizPublicQuestion = {
  id: 'qg',
  type: 'FIB',
  text: '___ and ___',
  timeLimit: 0,
  blankCount: 2,
  blankType: 'drag',
  wordBank: ['light', 'heat', 'sand'],
};

describe('hasChoiceBlanks', () => {
  it('is true only for a usable dropdown or drag question', () => {
    expect(hasChoiceBlanks(dropdown)).toBe(true);
    expect(hasChoiceBlanks(drag)).toBe(true);
    expect(hasChoiceBlanks({ ...dropdown, blankChoices: [] })).toBe(false);
    expect(hasChoiceBlanks({ ...drag, blankType: undefined })).toBe(false);
  });
});

describe('placementsFromValue', () => {
  it('reads the saved answer back onto bank words, one use each', () => {
    expect(
      placementsFromValue(
        joinBlanks(['heat', 'heat']),
        ['heat', 'heat'],
        2,
        false
      )
    ).toEqual([0, 1]);
    expect(
      placementsFromValue(joinBlanks(['heat', 'heat']), ['heat'], 2, true)
    ).toEqual([0, 0]);
    expect(
      placementsFromValue(joinBlanks(['typed', '']), ['heat'], 2, false)
    ).toEqual([null, null]);
  });
});

describe('FibChoiceBlanksInput', () => {
  it('writes a dropdown pick as the blank-joined answer', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FibChoiceBlanksInput
        question={dropdown}
        value=""
        onChange={onChange}
        disabled={false}
        light
      />
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Blank 2' }),
      'cooled'
    );
    expect(onChange).toHaveBeenLastCalledWith(joinBlanks(['', 'cooled']));
  });

  it('places a bank word by tapping it, then a blank', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FibChoiceBlanksInput
        question={drag}
        value=""
        onChange={onChange}
        disabled={false}
        light
      />
    );
    await user.click(
      screen.getByRole('button', { name: 'heat, in word bank' })
    );
    await user.click(screen.getByRole('button', { name: 'Blank 2, empty' }));
    expect(onChange).toHaveBeenLastCalledWith(joinBlanks(['', 'heat']));
  });

  it('places and returns words from the keyboard alone', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <FibChoiceBlanksInput
        question={drag}
        value=""
        onChange={onChange}
        disabled={false}
        light
      />
    );
    const word = screen.getByRole('button', { name: 'heat, in word bank' });
    word.focus();
    await user.keyboard('{Enter}');
    expect(word).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByText('heat selected. Choose a blank.')
    ).toBeInTheDocument();

    screen.getByRole('button', { name: 'Blank 2, empty' }).focus();
    await user.keyboard(' ');
    expect(onChange).toHaveBeenLastCalledWith(joinBlanks(['', 'heat']));
    expect(screen.getByText('heat placed in Blank 2.')).toBeInTheDocument();

    rerender(
      <FibChoiceBlanksInput
        question={drag}
        value={joinBlanks(['', 'heat'])}
        onChange={onChange}
        disabled={false}
        light
      />
    );
    expect(
      screen.getByRole('button', { name: 'heat, in Blank 2' })
    ).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(joinBlanks(['', '']));
    rerender(
      <FibChoiceBlanksInput
        question={drag}
        value=""
        onChange={onChange}
        disabled={false}
        light
      />
    );
    expect(
      screen.getByRole('button', { name: 'heat, in word bank' })
    ).toHaveFocus();
  });

  it('hides a used word from the bank unless words can be reused', () => {
    const { rerender } = render(
      <FibChoiceBlanksInput
        question={drag}
        value={joinBlanks(['heat', ''])}
        onChange={vi.fn()}
        disabled={false}
        light
      />
    );
    expect(
      screen.queryByRole('button', { name: 'heat, in word bank' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'heat, in Blank 1' })
    ).toBeInTheDocument();
    rerender(
      <FibChoiceBlanksInput
        question={{ ...drag, wordBankReuse: true }}
        value={joinBlanks(['heat', ''])}
        onChange={vi.fn()}
        disabled={false}
        light
      />
    );
    expect(
      screen.getByRole('button', { name: 'heat, in word bank' })
    ).toBeInTheDocument();
  });
});
