import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { ClassChecklist } from './ClassChecklist';
import {
  EMPTY_ASSIGN_CLASSES_VALUE,
  type AssignClassesValue,
} from './assignClassesValue';
import { SAMPLE_ROSTERS } from './assignStepperTestRosters';
import { ClassChecklistCoursesContext } from './classChecklistCourses';
import type { ClassRoster } from '@/types';
import type { Course } from '@/utils/course/contract';

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

const roster = (
  id: string,
  name: string,
  studentCount: number
): ClassRoster => ({
  id,
  name,
  driveFileId: null,
  studentCount,
  createdAt: 0,
  students: [],
});

const COURSE_ROSTERS: ClassRoster[] = [
  roster('s1', 'Mock Period 1', 24),
  roster('solo', 'Advisory', 12),
  roster('s2', 'Mock Period 1', 1),
  { ...roster('s3', 'Mock Period 3', 20), loadError: 'Could not load' },
];

const COURSE = {
  id: 'k1',
  name: 'Sample Course',
  rosterIds: ['s1', 's2', 's3'],
} as Course;

const CourseHarness = ({
  initial = EMPTY_ASSIGN_CLASSES_VALUE,
  onChange,
  singleSelect,
}: {
  initial?: AssignClassesValue;
  onChange?: (v: AssignClassesValue) => void;
  singleSelect?: boolean;
}) => {
  const [value, setValue] = useState(initial);
  return (
    <ClassChecklistCoursesContext.Provider value={[COURSE]}>
      <ClassChecklist
        rosters={COURSE_ROSTERS}
        value={value}
        singleSelect={singleSelect}
        onChange={(v) => {
          setValue(v);
          onChange?.(v);
        }}
      />
    </ClassChecklistCoursesContext.Provider>
  );
};

describe('ClassChecklist with Courses', () => {
  it('shows a Course as one closed row and leaves other classes flat', () => {
    render(<CourseHarness />);
    expect(
      screen.getByRole('checkbox', { name: /Sample Course/ })
    ).not.toBeChecked();
    expect(screen.getByLabelText(/Advisory/)).toBeVisible();
    expect(screen.queryByLabelText(/Mock Period 1/)).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Show sections in Sample Course' })
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('ticking the Course picks its available sections in roster order', () => {
    const onChange = vi.fn();
    render(
      <CourseHarness
        onChange={onChange}
        initial={{ classIds: ['solo'], studentsByClass: {} }}
      />
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /Sample Course/ }));
    expect(onChange).toHaveBeenLastCalledWith({
      classIds: ['s1', 'solo', 's2'],
      studentsByClass: {},
    });
    expect(
      screen.getByRole('checkbox', { name: /Sample Course/ })
    ).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: /Sample Course/ }));
    expect(onChange).toHaveBeenLastCalledWith({
      classIds: ['solo'],
      studentsByClass: {},
    });
  });

  it('opens to sections told apart by student count, and one section can be picked', () => {
    const onChange = vi.fn();
    render(<CourseHarness onChange={onChange} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Show sections in Sample Course' })
    );
    expect(screen.getByLabelText(/Mock Period 1\s*24 students/)).toBeVisible();
    fireEvent.click(screen.getByLabelText(/Mock Period 1\s*1 student$/));
    expect(onChange).toHaveBeenLastCalledWith({
      classIds: ['s2'],
      studentsByClass: {},
    });
    const course = screen.getByRole<HTMLInputElement>('checkbox', {
      name: /Sample Course/,
    });
    expect(course).not.toBeChecked();
    expect(course.indeterminate).toBe(true);
    expect(screen.getByLabelText(/Mock Period 3/)).toBeDisabled();
  });

  it('starts open when only some sections are picked', () => {
    render(
      <CourseHarness initial={{ classIds: ['s1'], studentsByClass: {} }} />
    );
    expect(
      screen.getByRole('button', { name: 'Hide sections in Sample Course' })
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('single select keeps every class flat', () => {
    render(<CourseHarness singleSelect />);
    expect(
      screen.queryByRole('checkbox', { name: /Sample Course/ })
    ).toBeNull();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
  });
});
