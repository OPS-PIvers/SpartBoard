import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { ClassPickerMenu } from './ClassPickerMenu';
import {
  EMPTY_ASSIGN_CLASSES_VALUE,
  type AssignClassesValue,
} from './assignClassesValue';
import { SAMPLE_ROSTERS } from './assignStepperTestRosters';

const Harness = ({
  initial = EMPTY_ASSIGN_CLASSES_VALUE,
  singleSelect,
  onChange,
}: {
  initial?: AssignClassesValue;
  singleSelect?: boolean;
  onChange?: (v: AssignClassesValue) => void;
}) => {
  const [value, setValue] = useState(initial);
  return (
    <ClassPickerMenu
      rosters={SAMPLE_ROSTERS}
      value={value}
      singleSelect={singleSelect}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
};

const openMenu = () =>
  fireEvent.click(
    screen.getByRole('button', { name: /No classes|Sample|All/ })
  );

describe('ClassPickerMenu', () => {
  it('shows the picks as text and stays open while picking', () => {
    render(<Harness />);
    openMenu();
    fireEvent.click(screen.getByLabelText(/Sample 2/));
    fireEvent.click(screen.getByLabelText(/Sample 1/));
    expect(screen.getByLabelText(/Sample 1/)).toBeChecked();
    expect(
      screen.getByRole('button', { name: 'Sample 1, Sample 2' })
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('Select all skips unavailable classes and Clear empties', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    openMenu();
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
    openMenu();
    fireEvent.click(screen.getByLabelText(/Sample 1/));
    expect(onChange).toHaveBeenLastCalledWith({
      classIds: ['c2'],
      studentsByClass: {},
    });
  });

  it('single select replaces the pick, closes, and has no Select all', () => {
    render(
      <Harness
        singleSelect
        initial={{ classIds: ['c1'], studentsByClass: {} }}
      />
    );
    openMenu();
    expect(screen.queryByRole('button', { name: 'Select all' })).toBeNull();
    fireEvent.click(screen.getByLabelText(/Sample 2/));
    expect(screen.getByRole('button', { name: 'Sample 2' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('Escape closes the menu without reaching the dialog', () => {
    const onWindowKey = vi.fn();
    window.addEventListener('keydown', onWindowKey);
    render(<Harness />);
    openMenu();
    fireEvent.keyDown(screen.getByLabelText(/Sample 1/), { key: 'Escape' });
    expect(screen.queryByLabelText(/Sample 1/)).toBeNull();
    expect(onWindowKey).not.toHaveBeenCalled();
    window.removeEventListener('keydown', onWindowKey);
  });
});
