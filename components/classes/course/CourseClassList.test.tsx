import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { CourseClassList } from './CourseClassList';
import type { Course } from '@/utils/course/contract';

const addToast = vi.fn();
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast }),
}));

const course: Course = {
  id: 'c1',
  name: 'English 9',
  teacherName: 'T',
  rosterIds: ['p2', 'p5'],
  agenda: null,
  pinnedLinks: [],
  familyLink: null,
  linkId: 'l1',
  formerLinkIds: [],
  formerShareIds: [],
  rosterClassIds: {},
  deckCheck: null,
  createdAt: 0,
  updatedAt: 0,
};

const rosters = [
  { id: 'p2', name: 'English 9 P2' },
  { id: 'p3', name: 'Speech P3' },
  { id: 'p5', name: 'English 9 P5' },
];

describe('CourseClassList', () => {
  it('shows a linked Course as one collapsed row that opens to its classes, and unlinked ones on their own', () => {
    const { container } = render(
      <CourseClassList
        rosters={rosters}
        courses={[course]}
        saveCourse={vi.fn()}
        renderRow={(r, i) => <li>{`${i}:${r.name}`}</li>}
        listAttrs={{ 'data-tour': 'classes.roster-list' }}
      />
    );
    const list = container.querySelector('[data-tour="classes.roster-list"]');
    expect(list).not.toBeNull();
    const linked = container.querySelector(
      '[data-course-group="linked"]'
    ) as HTMLElement;
    const inLinked = within(linked);
    expect(inLinked.getByText('English 9')).toBeInTheDocument();
    expect(inLinked.getByText('2 sections')).toBeInTheDocument();
    expect(inLinked.queryByText('0:English 9 P2')).toBeNull();
    const chevron = inLinked.getByRole('button', { name: /2 sections/ });
    fireEvent.click(chevron);
    expect(chevron).toHaveAttribute('aria-expanded', 'true');
    expect(inLinked.getByText('0:English 9 P2')).toBeInTheDocument();
    expect(inLinked.getByText('2:English 9 P5')).toBeInTheDocument();
    const single = container.querySelector('[data-course-group="single"]');
    expect(
      within(single as HTMLElement).getByText('1:Speech P3')
    ).toBeInTheDocument();
    expect(screen.queryByText('Courses')).toBeNull();
  });

  it('shows no Course name for a Course of one class', () => {
    render(
      <CourseClassList
        rosters={[rosters[0]]}
        courses={[{ ...course, name: 'Solo', rosterIds: ['p2'] }]}
        saveCourse={vi.fn()}
        renderRow={(r) => <li>{r.name}</li>}
      />
    );
    expect(screen.queryByText('Solo')).toBeNull();
    expect(screen.getByText('English 9 P2')).toBeInTheDocument();
  });

  it('edits a linked Course: rename, add a class and unlink one in order', async () => {
    const saveCourse = vi.fn().mockResolvedValue({
      courseId: 'c1',
      rostersWithoutClassPage: [],
      classLinkUnavailable: false,
    });
    render(
      <CourseClassList
        rosters={rosters}
        courses={[{ ...course, updatedAt: 7 }]}
        saveCourse={saveCourse}
        renderRow={(r) => <li>{r.name}</li>}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit Course: English 9' })
    );
    fireEvent.change(screen.getByLabelText('Course name'), {
      target: { value: 'English 9 Honors' },
    });
    fireEvent.click(screen.getByLabelText('Speech P3'));
    fireEvent.click(screen.getByLabelText('English 9 P5'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(saveCourse).toHaveBeenCalledTimes(2));
    expect(saveCourse.mock.calls[0][0]).toEqual({
      action: 'save',
      course: {
        id: 'c1',
        name: 'English 9 Honors',
        rosterIds: ['p2', 'p5', 'p3'],
        expectedUpdatedAt: 7,
      },
    });
    expect(saveCourse.mock.calls[1][0]).toEqual({
      action: 'unlink',
      courseId: 'c1',
      rosterId: 'p5',
    });
    await vi.waitFor(() =>
      expect(addToast).toHaveBeenCalledWith('Course saved', 'success')
    );
  });

  it('links two classes by hand into a new Course', async () => {
    const saveCourse = vi.fn().mockResolvedValue({
      courseId: 'n',
      rostersWithoutClassPage: [],
      classLinkUnavailable: false,
    });
    render(
      <CourseClassList
        rosters={rosters}
        courses={[]}
        saveCourse={saveCourse}
        renderRow={(r) => <li>{r.name}</li>}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Link classes' }));
    const link = screen.getByRole('button', { name: 'Link' });
    fireEvent.click(screen.getByLabelText('English 9 P2'));
    expect(link).toBeDisabled();
    fireEvent.click(screen.getByLabelText('English 9 P5'));
    fireEvent.change(screen.getByLabelText('Course name'), {
      target: { value: 'English 9' },
    });
    fireEvent.click(link);
    await vi.waitFor(() =>
      expect(saveCourse).toHaveBeenCalledWith({
        action: 'save',
        course: { name: 'English 9', rosterIds: ['p2', 'p5'] },
      })
    );
  });

  it('suggests matching ClassLink classes and links them in one tap, or hides them on Not now', async () => {
    window.localStorage.clear();
    const saveCourse = vi.fn().mockResolvedValue({
      courseId: 'n',
      rostersWithoutClassPage: [],
      classLinkUnavailable: false,
    });
    const cl = [
      {
        id: 'a',
        name: 'English - English 9 (E1)',
        classlinkSubject: 'English',
        classlinkClassCode: 'E1',
      },
      {
        id: 'b',
        name: 'English - English 9 (E2)',
        classlinkSubject: 'English',
        classlinkClassCode: 'E2',
      },
    ];
    const { unmount } = render(
      <CourseClassList
        rosters={cl}
        courses={[]}
        saveCourse={saveCourse}
        renderRow={(r) => <li>{r.name}</li>}
      />
    );
    expect(
      screen.getByText('English 9: link these 2 classes?')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    await vi.waitFor(() =>
      expect(saveCourse).toHaveBeenCalledWith({
        action: 'save',
        course: { name: 'English 9', rosterIds: ['a', 'b'] },
      })
    );
    const notNow = screen.getByRole('button', { name: 'Not now' });
    await vi.waitFor(() => expect(notNow).not.toBeDisabled());
    fireEvent.click(notNow);
    expect(screen.queryByText('English 9: link these 2 classes?')).toBeNull();
    unmount();
    render(
      <CourseClassList
        rosters={cl}
        courses={[]}
        saveCourse={saveCourse}
        renderRow={(r) => <li>{r.name}</li>}
      />
    );
    expect(screen.queryByText('English 9: link these 2 classes?')).toBeNull();
  });

  it('saves against the Course as the editor opened it, so the server refuses a stale edit', async () => {
    const saveCourse = vi.fn().mockResolvedValue({
      courseId: 'c1',
      rostersWithoutClassPage: [],
      classLinkUnavailable: false,
    });
    const props = {
      rosters,
      saveCourse,
      renderRow: (r: { name: string }) => <li>{r.name}</li>,
    };
    const { rerender } = render(
      <CourseClassList {...props} courses={[course]} />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit Course: English 9' })
    );
    rerender(
      <CourseClassList
        {...props}
        courses={[{ ...course, rosterIds: ['p2', 'p5', 'p3'], updatedAt: 9 }]}
      />
    );
    fireEvent.change(screen.getByLabelText('Course name'), {
      target: { value: 'Eng 9' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(saveCourse).toHaveBeenCalledTimes(1));
    expect(saveCourse.mock.calls[0][0]).toEqual({
      action: 'save',
      course: { id: 'c1', name: 'Eng 9', expectedUpdatedAt: 0 },
    });
  });

  it('keeps only one Course editor open at a time', () => {
    render(
      <CourseClassList
        rosters={[...rosters, { id: 'p7', name: 'Speech P7' }]}
        courses={[course]}
        saveCourse={vi.fn()}
        renderRow={(r) => <li>{r.name}</li>}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Link classes' }));
    expect(screen.getAllByLabelText('Course name')).toHaveLength(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit Course: English 9' })
    );
    expect(screen.getAllByLabelText('Course name')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});
