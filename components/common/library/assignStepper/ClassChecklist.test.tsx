import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { ClassChecklist } from './ClassChecklist';
import {
  EMPTY_ASSIGN_CLASSES_VALUE,
  type AssignClassesValue,
} from './assignClassesValue';
import { SAMPLE_ROSTERS } from './assignStepperTestRosters';

const Harness = ({
  initial = EMPTY_ASSIGN_CLASSES_VALUE,
  singleSelect,
  disabled,
  onChange,
}: {
  initial?: AssignClassesValue;
  singleSelect?: boolean;
  disabled?: boolean;
  onChange?: (v: AssignClassesValue) => void;
}) => {
  const [value, setValue] = useState(initial);
  return (
    <ClassChecklist
      rosters={SAMPLE_ROSTERS}
      value={value}
      singleSelect={singleSelect}
      disabled={disabled}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
};

describe('ClassChecklist', () => {
  it('lists every class inline with no menu button', () => {
    render(<Harness />);
    expect(screen.getByRole('group', { name: 'Classes' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Sample 1/)).toBeVisible();
    expect(screen.queryByRole('button', { expanded: false })).toBeNull();
  });

  it('keeps picks in roster order', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/Sample 2/));
    fireEvent.click(screen.getByLabelText(/Sample 1/));
    expect(screen.getByLabelText(/Sample 1/)).toBeChecked();
    expect(onChange).toHaveBeenLastCalledWith({
      classIds: ['c1', 'c2'],
      studentsByClass: {},
    });
  });

  it('Select all skips unavailable classes and Clear empties', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(screen.getByLabelText(/Sample 3/)).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    expect(onChange).toHaveBeenLastCalledWith({
      classIds: ['c1', 'c2'],
      studentsByClass: {},
    });
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenLastCalledWith(EMPTY_ASSIGN_CLASSES_VALUE);
  });

  it('unpicking a class drops its student picks', () => {
    const onChange = vi.fn();
    render(
      <Harness
        onChange={onChange}
        initial={{
          classIds: ['c1', 'c2'],
          studentsByClass: { c1: [{ kind: 'classlink', sourcedId: 'SID-a' }] },
        }}
      />
    );
    fireEvent.click(screen.getByLabelText(/Sample 1/));
    expect(onChange).toHaveBeenLastCalledWith({
      classIds: ['c2'],
      studentsByClass: {},
    });
  });

  it('single select replaces the pick and has no Select all', () => {
    const onChange = vi.fn();
    render(
      <Harness
        singleSelect
        onChange={onChange}
        initial={{ classIds: ['c1'], studentsByClass: {} }}
      />
    );
    expect(screen.queryByRole('button', { name: 'Select all' })).toBeNull();
    fireEvent.click(screen.getByLabelText(/Sample 2/));
    expect(onChange).toHaveBeenLastCalledWith({
      classIds: ['c2'],
      studentsByClass: {},
    });
    expect(screen.getByLabelText(/Sample 1/)).not.toBeChecked();
  });

  it('disabled locks every row and button', () => {
    render(<Harness disabled />);
    expect(screen.getByLabelText(/Sample 1/)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Select all' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
  });
});
