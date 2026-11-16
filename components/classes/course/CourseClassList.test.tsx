import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { CourseClassList } from './CourseClassList';
import type { Course } from '@/utils/course/contract';

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
  it('shows linked classes together under the Course name and unlinked ones on their own', () => {
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
    const linked = container.querySelector('[data-course-group="linked"]');
    expect(linked).not.toBeNull();
    const inLinked = within(linked as HTMLElement);
    expect(inLinked.getByText('English 9')).toBeInTheDocument();
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
});
