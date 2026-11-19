import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { PrintStudentTree, type PrintTreeStudent } from './PrintStudentTree';
import type { PrintTreeNode } from '@/utils/quizResultsPrintTree';

const NODES: PrintTreeNode[] = [
  {
    kind: 'course',
    id: 'k1',
    name: 'Math 7',
    sections: [
      { id: 'r1', name: 'Period 1', keys: ['a', 'b'] },
      { id: 'r2', name: 'Period 2', keys: ['c'] },
    ],
  },
  { kind: 'section', section: { id: 'r3', name: 'WIN', keys: ['d'] } },
];
const STUDENTS = new Map<string, PrintTreeStudent>([
  ['a', { key: 'a', name: 'Berg, Maya' }],
  ['b', { key: 'b', name: 'Dahl, Owen', detail: 'In progress' }],
  ['c', { key: 'c', name: 'Kim, Theo' }],
  ['d', { key: 'd', name: 'Novak, Hana' }],
]);

const Harness = ({
  initial = ['a', 'b', 'c', 'd'],
}: {
  initial?: string[];
}) => {
  const [selected, setSelected] = useState(() => new Set(initial));
  return (
    <>
      <PrintStudentTree
        nodes={NODES}
        students={STUDENTS}
        selected={selected}
        onChange={setSelected}
      />
      <output data-testid="picked">{[...selected].sort().join(',')}</output>
    </>
  );
};

const picked = () => screen.getByTestId('picked').textContent;

describe('PrintStudentTree', () => {
  it('starts with Courses and classes closed', () => {
    render(<Harness />);
    expect(screen.getByRole('checkbox', { name: 'Math 7' })).toBeChecked();
    expect(screen.queryByRole('checkbox', { name: 'Period 1' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Novak, Hana' })).toBeNull();
    expect(screen.getByText('4 of 4')).toBeInTheDocument();
  });

  it('a Course row picks and clears every student in its classes', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Math 7' }));
    expect(picked()).toBe('d');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Math 7' }));
    expect(picked()).toBe('a,b,c,d');
  });

  it('opens to classes and students, and one student can be left out', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Show Math 7' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show Period 1' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Dahl, Owen' }));
    expect(picked()).toBe('a,c,d');
    expect(
      screen.getByRole('checkbox', { name: 'Period 1' })
    ).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Math 7' })).not.toBeChecked();
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
  });

  it('Select all and Clear cover everyone', () => {
    render(<Harness initial={['a']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    expect(picked()).toBe('a,b,c,d');
    expect(screen.getByRole('button', { name: 'Select all' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(picked()).toBe('');
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
  });
});
