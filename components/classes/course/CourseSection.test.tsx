import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CourseSection } from './CourseSection';
import type { Course } from '@/utils/course/contract';

const course: Course = {
  id: 'c1',
  name: 'English 9',
  rosterIds: ['p2', 'p5'],
  agenda: null,
  pinnedLinks: [],
  familyLink: null,
  linkId: 'l1',
  rosterClassIds: {},
  deckCheck: null,
  createdAt: 0,
  updatedAt: 0,
};

describe('CourseSection', () => {
  it('lists each Course once and every unlinked class as its own row', () => {
    render(
      <CourseSection
        rosters={[
          { id: 'p2', name: 'English 9 P2' },
          { id: 'p5', name: 'English 9 P5' },
          { id: 'p3', name: 'Speech P3' },
        ]}
        courses={[course]}
        saveCourse={vi.fn()}
      />
    );
    expect(screen.getByText('Courses')).toBeInTheDocument();
    expect(screen.getByText('English 9')).toBeInTheDocument();
    expect(screen.getByText('English 9 P2, English 9 P5')).toBeInTheDocument();
    expect(screen.getByText('Speech P3')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('renders nothing without classes', () => {
    const { container } = render(
      <CourseSection rosters={[]} courses={[]} saveCourse={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
