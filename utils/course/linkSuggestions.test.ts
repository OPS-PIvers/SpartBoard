import { describe, expect, it } from 'vitest';
import { cleanClassName, linkSuggestions } from './linkSuggestions';
import { courseGroups } from './courseGroups';
import type { Course } from './contract';

const r = (id: string, name: string, subject?: string, code?: string) => ({
  id,
  name,
  classlinkSubject: subject,
  classlinkClassCode: code,
});

const course = (id: string, name: string, rosterIds: string[]): Course => ({
  id,
  name,
  teacherName: 'T',
  rosterIds,
  agenda: null,
  pinnedLinks: [],
  familyLink: null,
  linkId: `l-${id}`,
  formerLinkIds: [],
  formerShareIds: [],
  rosterClassIds: {},
  deckCheck: null,
  createdAt: 0,
  updatedAt: 0,
});

describe('cleanClassName', () => {
  it.each([
    ['English - English 9 (ENG901)', 'ENG901', 'English - English 9'],
    ['English 9 P2', undefined, 'English 9'],
    ['English 9 - Period 3', undefined, 'English 9'],
    ['English 9 Per. 4', undefined, 'English 9'],
    ['English 9 Hr 1', undefined, 'English 9'],
    ['English 9 - 03', undefined, 'English 9'],
    [
      'Period 3 - Grade 7 Social Studies (Ivers)',
      undefined,
      'Grade 7 Social Studies (Ivers)',
    ],
    ['Biology (Honors)', undefined, 'Biology (Honors)'],
    ['Spanish - 2', undefined, 'Spanish - 2'],
    ['AP Computer Science - Section B', undefined, 'AP Computer Science'],
    ['3rd Hour Physics', undefined, 'Physics'],
    ['Physics 1', undefined, 'Physics 1'],
    ['Spanish 2 Block 4A', undefined, 'Spanish 2'],
  ])('%s', (name, code, want) => {
    expect(cleanClassName(name, code)).toBe(want);
  });
});

describe('linkSuggestions', () => {
  const rosters = [
    r('a', 'English - English 9 (E1)', 'English', 'E1'),
    r('b', 'Speech P1', 'Speech'),
    r('c', 'English - English 9 (E2)', 'English', 'E2'),
    r('d', 'English - English 9 (E3)', 'English', 'E3'),
    r('e', 'Homeroom'),
    r('f', 'Homeroom'),
    r('g', 'English 9 P5', 'Reading'),
  ];

  it('suggests classes with the same subject and cleaned name, and never hand-made ones', () => {
    const s = linkSuggestions(courseGroups([], rosters));
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ name: 'English 9', courseId: null });
    expect(s[0].rosters.map((x) => x.id)).toEqual(['a', 'c', 'd']);
  });

  it('skips a dismissed suggestion', () => {
    expect(
      linkSuggestions(courseGroups([], rosters), new Set(['a,c,d']))
    ).toEqual([]);
  });

  it('suggests adding a matching class to the one linked Course that has its match', () => {
    const s = linkSuggestions(
      courseGroups([course('k', 'Eng 9', ['a', 'c'])], rosters)
    );
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ courseId: 'k', name: 'Eng 9' });
    expect(s[0].rosters.map((x) => x.id)).toEqual(['d']);
  });

  it('treats a Course of one class as unlinked', () => {
    const s = linkSuggestions(
      courseGroups([course('k', 'Solo', ['a'])], rosters)
    );
    expect(s[0].courseId).toBeNull();
    expect(s[0].rosters.map((x) => x.id)).toEqual(['a', 'c', 'd']);
  });

  it('suggests nothing once every match is linked, or when matches sit in two Courses', () => {
    expect(
      linkSuggestions(
        courseGroups([course('k', 'E', ['a', 'c', 'd'])], rosters)
      )
    ).toEqual([]);
    const more = [
      ...rosters,
      r('h', 'English - English 9 (E4)', 'English', 'E4'),
    ];
    expect(
      linkSuggestions(
        courseGroups(
          [course('k', 'E', ['a', 'c']), course('m', 'F', ['d', 'h'])],
          more
        )
      )
    ).toEqual([]);
  });

  it('never suggests adding a class that has its own saved Course, such as one just unlinked', () => {
    expect(
      linkSuggestions(
        courseGroups(
          [course('k', 'E', ['a', 'c']), course('d1', 'D', ['d'])],
          rosters
        )
      )
    ).toEqual([]);
  });
});
