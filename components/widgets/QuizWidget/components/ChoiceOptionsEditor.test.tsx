import React, { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { QuizQuestion } from '@/types';
import { ChoiceOptionsEditor } from './ChoiceOptionsEditor';

const seen: { q: QuizQuestion | null } = { q: null };

const Harness: React.FC<{ initial: QuizQuestion; allowMulti?: boolean }> = ({
  initial,
  allowMulti = true,
}) => {
  const [q, setQ] = useState(initial);
  return (
    <ChoiceOptionsEditor
      key={q.id}
      question={q}
      allowMulti={allowMulti}
      onChange={(u) => {
        const next = { ...q, ...u };
        seen.q = next;
        setQ(next);
      }}
    />
  );
};

const base: QuizQuestion = {
  id: 'q1',
  timeLimit: 0,
  text: 'Closest planet?',
  type: 'MC',
  correctAnswer: 'Mercury',
  incorrectAnswers: ['Venus', 'Earth'],
};

describe('ChoiceOptionsEditor', () => {
  it('marks a different option correct from any position', () => {
    render(<Harness initial={base} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Option C is correct' }));
    expect(seen.q?.correctAnswer).toBe('Earth');
    expect(seen.q?.incorrectAnswers).toEqual(['Mercury', 'Venus']);
    expect(screen.getByLabelText('Option A')).toHaveValue('Mercury');
    expect(screen.getByLabelText('Option C')).toHaveValue('Earth');
  });

  it('switches to choose-all and back, keeping the first marked option', () => {
    render(<Harness initial={base} />);
    fireEvent.click(screen.getByLabelText('Multiple correct answers'));
    expect(seen.q?.type).toBe('MA');
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Option B is correct' })
    );
    expect(seen.q?.correctAnswer).toBe('Mercury|Venus');
    expect(screen.getByLabelText('Partial credit')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Multiple correct answers'));
    expect(seen.q?.type).toBe('MC');
    expect(seen.q?.correctAnswer).toBe('Mercury');
    expect(seen.q?.incorrectAnswers).toEqual(['Venus', 'Earth']);
  });

  it('hides the multiple answers setting when choose-all is unavailable', () => {
    render(<Harness initial={base} allowMulti={false} />);
    expect(screen.queryByLabelText('Multiple correct answers')).toBeNull();
  });

  it('opens a blank question with four empty options', () => {
    render(
      <Harness
        initial={{ ...base, correctAnswer: '', incorrectAnswers: ['', ''] }}
      />
    );
    expect(screen.getAllByRole('radio')).toHaveLength(4);
  });

  it('keeps a just-marked blank option marked while typing into it', () => {
    render(
      <Harness
        initial={{ ...base, correctAnswer: '', incorrectAnswers: ['', ''] }}
      />
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Option B is correct' }));
    fireEvent.change(screen.getByLabelText('Option B'), {
      target: { value: 'Mars' },
    });
    expect(seen.q?.correctAnswer).toBe('Mars');
    expect(
      screen.getByRole('radio', { name: 'Option B is correct' })
    ).toHaveAttribute('aria-checked', 'true');
  });
});

describe('ChoiceOptionsEditor keyboard', () => {
  it('moves the correct answer with arrow keys but leaves arrows in a text box alone', () => {
    render(<Harness initial={base} />);
    const first = screen.getByRole('radio', { name: 'Option A is correct' });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(seen.q?.correctAnswer).toBe('Venus');
    expect(
      screen.getByRole('radio', { name: 'Option B is correct' })
    ).toHaveFocus();
    const input = screen.getByLabelText('Option C');
    input.focus();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveFocus();
    expect(seen.q?.correctAnswer).toBe('Venus');
  });
});
