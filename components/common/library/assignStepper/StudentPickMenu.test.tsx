import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { StudentPickMenu } from './StudentPickMenu';
import type { AssignClassesValue } from './assignClassesValue';
import { SAMPLE_ROSTERS } from './assignStepperTestRosters';

let latest: AssignClassesValue;
const Harness = ({ initial }: { initial: AssignClassesValue }) => {
  const [value, setValue] = useState(initial);
  return (
    <StudentPickMenu
      rosters={SAMPLE_ROSTERS}
      value={value}
      onChange={(v) => {
        latest = v;
        setValue(v);
      }}
    />
  );
};

const both: AssignClassesValue = {
  classIds: ['c1', 'c2'],
  studentsByClass: {},
};
const ref = (id: string) => ({
  kind: 'classlink' as const,
  sourcedId: `SID-${id}`,
});
const openFor = (name: string) =>
  fireEvent.click(
    screen.getByRole('button', { name: `${name}: All students` })
  );

describe('StudentPickMenu', () => {
  it('renders nothing with no class picked', () => {
    const { container } = render(
      <Harness initial={{ classIds: [], studentsByClass: {} }} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lists a row per picked class on All students', () => {
    render(<Harness initial={both} />);
    expect(screen.getByText('Sample 1')).toBeInTheDocument();
    expect(screen.getByText('Sample 2')).toBeInTheDocument();
    expect(screen.getAllByText('All students')).toHaveLength(2);
  });

  it('picking students narrows the class and tints the count', () => {
    render(<Harness initial={both} />);
    openFor('Sample 2');
    fireEvent.click(screen.getByLabelText('Sofia S'));
    fireEvent.click(screen.getByLabelText('Hana S'));
    expect(latest.studentsByClass).toEqual({ c2: [ref('e'), ref('g')] });
    const button = screen.getByRole('button', { name: 'Sample 2: 2 students' });
    expect(button.className).toContain('bg-brand-blue-lighter/40');
  });

  it('greys out students without a sign-in with a tooltip', () => {
    render(<Harness initial={both} />);
    openFor('Sample 1');
    const mateo = screen.getByLabelText(/Mateo S/);
    expect(mateo).toBeDisabled();
    expect(mateo.closest('label')).toHaveAttribute(
      'title',
      'Individual assignment needs a school sign-in'
    );
    expect(
      within(mateo.closest('label') as HTMLElement).getByText('No sign-in')
    ).toBeInTheDocument();
  });

  it('a group ticks and unticks every member with a sign-in', () => {
    render(<Harness initial={both} />);
    openFor('Sample 1');
    const group = screen.getByRole('button', { name: /Reading group A/ });
    fireEvent.click(group);
    expect(latest.studentsByClass.c1).toEqual([ref('a'), ref('c')]);
    expect(group).toHaveTextContent('Added');
    fireEvent.click(group);
    expect(latest.studentsByClass.c1).toBeUndefined();
    expect(
      screen.getByRole('button', { name: /Needs reteach/ })
    ).toBeDisabled();
  });

  it('search filters the list', () => {
    render(<Harness initial={both} />);
    openFor('Sample 1');
    fireEvent.change(screen.getByLabelText('Search students'), {
      target: { value: 'pri' },
    });
    expect(screen.getByLabelText('Priya S')).toBeInTheDocument();
    expect(screen.queryByLabelText('Avery S')).toBeNull();
  });

  it('All students resets and closes; Clear resets and stays open', () => {
    render(
      <Harness initial={{ ...both, studentsByClass: { c1: [ref('a')] } }} />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Sample 1: 1 student' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(latest.studentsByClass).toEqual({});
    expect(screen.getByLabelText('Search students')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Avery S'));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'All students',
      })
    );
    expect(latest.studentsByClass).toEqual({});
    expect(screen.queryByLabelText('Search students')).toBeNull();
  });
});
