import type { ClassRoster } from '@/types';
import type { Course } from '@/utils/course/contract';
import { defineFixtures, type FixtureName } from './types';
import { STRESS, makeRoster, range } from './stress';

const roster = (id: string, name: string): ClassRoster => ({
  ...makeRoster(26, name),
  id,
});

const ENGLISH = [1, 2, 4].map((p) =>
  roster(`roster-eng-${p}`, `English 9 (Period ${p})`)
);
const HISTORY = roster('roster-hist-6', 'US History (Period 6)');
const STRESS_ROSTERS = range(12, (i) =>
  roster(`roster-stress-${i}`, `${STRESS.title} ${i + 1}`)
);

const course = (
  id: string,
  name: string,
  rosters: ClassRoster[],
  agenda: Course['agenda'],
  sharing: 'domain' | 'private' = 'domain'
): Course => ({
  id,
  name,
  teacherName: 'Ms. Rivera',
  rosterIds: rosters.map((r) => r.id),
  agenda,
  pinnedLinks: [],
  familyLink: null,
  linkId: `link-${id}`,
  formerLinkIds: [],
  formerShareIds: [],
  rosterClassIds: {},
  deckCheck: agenda
    ? { checkedAt: Date.now(), modifiedAt: Date.now(), sharing }
    : null,
  createdAt: Date.UTC(2026, 8, 1),
  updatedAt: Date.UTC(2026, 10, 16),
});

const ENGLISH_COURSE = course('course-eng-9', 'English 9', ENGLISH, {
  fileId: '1AgendaFixtureDeckEnglish9xx',
  title: 'English 9 Daily Agenda',
});

// The harness has no Course listener, so the stub hands the widget these by fixture name.
export const AGENDA_FIXTURE_COURSES: Record<FixtureName, Course[]> = {
  empty: [ENGLISH_COURSE],
  typical: [ENGLISH_COURSE],
  stress: [
    course(
      'course-stress',
      `${STRESS.title} ${STRESS.word}`,
      STRESS_ROSTERS,
      {
        fileId: '1AgendaFixtureDeckStressxxxx',
        title: `${STRESS.word} ${STRESS.title}`,
      },
      'private'
    ),
  ],
};

export const agendaFixtures = defineFixtures<'agenda'>({
  empty: { config: {}, rosters: [...ENGLISH, HISTORY] },
  typical: {
    config: { courseId: ENGLISH_COURSE.id, rosterId: ENGLISH[0].id },
    rosters: [...ENGLISH, HISTORY],
  },
  stress: {
    config: { courseId: 'course-stress', rosterId: STRESS_ROSTERS[0].id },
    customTitle: STRESS.title,
    rosters: STRESS_ROSTERS,
  },
});
