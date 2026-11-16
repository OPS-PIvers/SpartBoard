import { describe, expect, it } from 'vitest';
import {
  DECK_CHECK_REFRESH_MS,
  classPageLink,
  courseSaveInput,
  neededSharing,
  sharingProblem,
  shouldRecordCheck,
} from './agendaLogic';
import type { Course } from '@/utils/course/contract';

const course: Course = {
  id: 'c1',
  name: 'English 9',
  teacherName: 'T',
  rosterIds: ['p2', 'p5'],
  agenda: null,
  pinnedLinks: [],
  familyLink: null,
  linkId: 'link1',
  formerLinkIds: [],
  formerShareIds: [],
  rosterClassIds: {},
  deckCheck: null,
  createdAt: 0,
  updatedAt: 42,
};

describe('agendaLogic', () => {
  it('needs anyone-with-the-link only while the family link is on', () => {
    expect(neededSharing(null)).toBe('domain');
    expect(neededSharing({ familyLink: { shareId: 's', on: false } })).toBe(
      'domain'
    );
    expect(neededSharing({ familyLink: { shareId: 's', on: true } })).toBe(
      'anyone'
    );
  });

  it('names what is wrong with the deck sharing', () => {
    expect(sharingProblem(null, 'domain')).toBeNull();
    expect(sharingProblem('private', 'domain')).toBe('students');
    expect(sharingProblem('private', 'anyone')).toBe('students');
    expect(sharingProblem('domain', 'domain')).toBeNull();
    expect(sharingProblem('anyone', 'domain')).toBeNull();
    expect(sharingProblem('domain', 'anyone')).toBe('families');
    expect(sharingProblem('anyone', 'anyone')).toBeNull();
    expect(sharingProblem('unknown', 'domain')).toBe('unknown');
  });

  it('records a check only when it is new, different or old', () => {
    const prev = { checkedAt: 1000, modifiedAt: 5, sharing: 'domain' as const };
    expect(
      shouldRecordCheck(null, { sharing: 'domain', modifiedAt: 5 }, 1000)
    ).toBe(true);
    expect(
      shouldRecordCheck(prev, { sharing: 'domain', modifiedAt: 5 }, 2000)
    ).toBe(false);
    expect(
      shouldRecordCheck(prev, { sharing: 'private', modifiedAt: 5 }, 2000)
    ).toBe(true);
    expect(
      shouldRecordCheck(prev, { sharing: 'domain', modifiedAt: 6 }, 2000)
    ).toBe(true);
    expect(
      shouldRecordCheck(
        prev,
        { sharing: 'domain', modifiedAt: 5 },
        1000 + DECK_CHECK_REFRESH_MS
      )
    ).toBe(true);
  });

  it('patches a saved Course with only the changed field and its updatedAt', () => {
    const agenda = { fileId: 'deck123456', title: 'Daily' };
    expect(
      courseSaveInput(
        { course, rosters: [{ id: 'p2', name: 'P2' }] },
        { agenda }
      )
    ).toEqual({ id: 'c1', expectedUpdatedAt: 42, agenda });
  });

  it('creates a Course named after a class that has none', () => {
    expect(
      courseSaveInput(
        { course: null, rosters: [{ id: 'p3', name: 'Speech P3' }] },
        { pinnedLinks: [] }
      )
    ).toEqual({ name: 'Speech P3', rosterIds: ['p3'], pinnedLinks: [] });
  });

  it('gives the Class page link only when a class in the Course has a Class page', () => {
    expect(classPageLink(null, 'https://x')).toBeNull();
    expect(classPageLink(course, 'https://x')).toBeNull();
    expect(
      classPageLink({ ...course, rosterClassIds: { p2: 'cl1' } }, 'https://x')
    ).toBe('https://x/my-assignments/course/link1');
  });
});
