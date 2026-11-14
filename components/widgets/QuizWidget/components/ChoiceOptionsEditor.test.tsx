import React, { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { QuizQuestion } from '@/types';
import { ChoiceOptionsEditor } from './ChoiceOptionsEditor';

const seen: { q: QuizQuestion | null } = { q: null };

const Harness: React.FC<{ initial: QuizQuestion }> = ({ initial }) => {
  const [q, setQ] = useState(initial);
  return (
    <ChoiceOptionsEditor
      key={q.id}
      question={q}
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

const ExplainHarness: React.FC<{ initial: QuizQuestion }> = ({ initial }) => {
  const [q, setQ] = useState(initial);
  return (
    <ChoiceOptionsEditor
      key={q.id}
      question={q}
      onChange={(u) => setQ((prev) => ({ ...prev, ...u }))}
      onExplanationsChange={(optionExplanations) => {
        const next = { ...q, optionExplanations };
        seen.q = next;
        setQ(next);
      }}
    />
  );
};

describe('ChoiceOptionsEditor option explanations', () => {
  const explainButton = (letter: string) =>
    screen.getByRole('button', { name: `Explanation for option ${letter}` });
  const explainBox = (letter: string) =>
    screen.queryByRole('textbox', { name: `Explanation for option ${letter}` });
  const typeInto = (letter: string, value: string) =>
    fireEvent.change(
      screen.getByRole('textbox', { name: `Explanation for option ${letter}` }),
      { target: { value } }
    );

  it('hides the button without a handler', () => {
    render(<Harness initial={base} />);
    expect(
      screen.queryByRole('button', { name: 'Explanation for option A' })
    ).toBeNull();
  });

  it('opens one explanation at a time and toggles it closed', () => {
    render(<ExplainHarness initial={base} />);
    expect(explainBox('A')).toBeNull();
    fireEvent.click(explainButton('A'));
    expect(explainButton('A')).toHaveAttribute('aria-expanded', 'true');
    typeInto('A', 'Closest');
    expect(seen.q?.optionExplanations).toEqual({ Mercury: 'Closest' });
    fireEvent.click(explainButton('B'));
    expect(explainBox('A')).toBeNull();
    expect(explainBox('B')).toBeInTheDocument();
    fireEvent.click(explainButton('B'));
    expect(explainBox('B')).toBeNull();
  });

  it('shows a saved explanation and drops it when cleared', () => {
    render(
      <ExplainHarness
        initial={{ ...base, optionExplanations: { Venus: 'Second' } }}
      />
    );
    fireEvent.click(explainButton('B'));
    expect(explainBox('B')).toHaveValue('Second');
    typeInto('B', '');
    expect(seen.q?.optionExplanations).toBeUndefined();
  });
});
