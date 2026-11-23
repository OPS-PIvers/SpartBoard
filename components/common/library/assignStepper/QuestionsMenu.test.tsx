import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { QuestionsMenu } from './QuestionsMenu';

const QUESTIONS = Array.from({ length: 6 }, (_, i) => ({
  id: `q${i + 1}`,
  label: `Question text ${i + 1}`,
}));

let latest: string[] | undefined | 'unset' = 'unset';
const Host = ({ start }: { start?: string[] }) => {
  const [picked, setPicked] = useState(start);
  return (
    <QuestionsMenu
      questions={QUESTIONS}
      picked={picked}
      onChange={(next) => {
        latest = next;
        setPicked(next);
      }}
    />
  );
};

const open = () =>
  fireEvent.click(screen.getByRole('button', { name: /^(All|\d of 6)$/ }));
const done = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
const setCount = (n: number) => {
  const count = screen.getByLabelText('Number of questions');
  fireEvent.change(count, { target: { value: String(n) } });
  fireEvent.blur(count);
};

describe('QuestionsMenu', () => {
  it('checks the typed count at random and saves it on Done', () => {
    latest = 'unset';
    render(<Host />);
    open();
    setCount(4);
    expect(screen.getAllByRole('checkbox', { checked: true })).toHaveLength(4);
    expect(latest).toBe('unset');
    done();
    expect(latest).toHaveLength(4);
    expect(screen.getByRole('button', { name: '4 of 6' })).toBeInTheDocument();
  });

  it('keeps quiz order, and Cancel drops the changes', () => {
    latest = 'unset';
    render(<Host />);
    open();
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(latest).toBe('unset');
    open();
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    done();
    expect(latest).toEqual(['q1', 'q3', 'q4', 'q5', 'q6']);
  });

  it('Select all clears the rule', () => {
    render(<Host start={['q1', 'q2']} />);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    done();
    expect(latest).toBeUndefined();
  });

  it('never leaves zero questions', () => {
    render(<Host start={['q2']} />);
    open();
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    expect(screen.getAllByRole('checkbox', { checked: true })).toHaveLength(1);
  });

  it('caps the count at the quiz length, which means every question', () => {
    render(<Host start={['q1', 'q2']} />);
    open();
    setCount(99);
    done();
    expect(latest).toBeUndefined();
  });
});
