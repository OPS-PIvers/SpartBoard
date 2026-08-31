import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';
import { buildAssignmentRosterRows } from '@/utils/buildAssignmentRosterRows';
import type { AssignmentPseudonymMaps } from '@/hooks/useAssignmentPseudonyms';
import type { ClassRoster, Student } from '@/types';

// Minimal stub matching how the app's translation calls are shaped here:
// t(key, { defaultValue, ...interpolations }).
const t = ((_key: string, opts?: Record<string, unknown>) => {
  const defaultValue = (opts?.defaultValue as string) ?? '';
  return defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => {
    const value = opts?.[name];
    return typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : '';
  });
}) as unknown as TFunction;

const emptyMaps = (): AssignmentPseudonymMaps => ({
  byStudentUid: new Map(),
  byAssignmentPseudonym: new Map(),
  targetRefKeyByStudentUid: new Map(),
  targetRefKeyByAssignmentPseudonym: new Map(),
});

function makeStudent(overrides: Partial<Student> = {}): Student {
  return {
    id: 'student-1',
    firstName: 'Alex',
    lastName: 'Doe',
    pin: '01',
    ...overrides,
  };
}

function makeRoster(overrides: Partial<ClassRoster> = {}): ClassRoster {
  return {
    id: 'roster-1',
    name: 'Period 2',
    driveFileId: null,
    studentCount: 1,
    createdAt: 0,
    students: [],
    ...overrides,
  };
}

describe('buildAssignmentRosterRows', () => {
  it('resolves an SSO student name via byStudentUid for quiz/VA/GL kinds', () => {
    const sso = makeStudent({ id: 's1', classLinkSourcedId: 'SID-1' });
    const roster = makeRoster({ students: [sso] });
    const pseudonyms = emptyMaps();
    pseudonyms.targetRefKeyByStudentUid.set('uid-1', 'classlink:SID-1');
    pseudonyms.byStudentUid.set('uid-1', {
      givenName: 'Alex',
      familyName: 'Doe',
    });

    const rows = buildAssignmentRosterRows({
      kind: 'quiz',
      targetMode: 'class',
      targetStudents: [],
      matchedRosters: [roster],
      overridesBySourcedId: undefined,
      totalQuestions: null,
      pseudonyms,
      statusByUid: new Map([['uid-1', 'in-progress']]),
      t,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].displayName).toBe('Alex Doe');
    expect(rows[0].status).toBe('in-progress');
    expect(rows[0].manual).toBe(false);
  });

  it('marks a manually-created roster student as PIN/manual with no status', () => {
    const manual = makeStudent({ id: 's2', classLinkSourcedId: undefined });
    const roster = makeRoster({ students: [manual] });

    const rows = buildAssignmentRosterRows({
      kind: 'quiz',
      targetMode: 'class',
      targetStudents: [],
      matchedRosters: [roster],
      overridesBySourcedId: undefined,
      totalQuestions: null,
      pseudonyms: emptyMaps(),
      statusByUid: new Map(),
      t,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].manual).toBe(true);
    expect(rows[0].status).toBeNull();
  });

  it('renders a "modified" marker, with count for a quiz question subset', () => {
    const sso = makeStudent({ id: 's1', classLinkSourcedId: 'SID-1' });
    const roster = makeRoster({ students: [sso] });
    const pseudonyms = emptyMaps();
    pseudonyms.targetRefKeyByStudentUid.set('uid-1', 'classlink:SID-1');
    pseudonyms.byStudentUid.set('uid-1', {
      givenName: 'Alex',
      familyName: 'Doe',
    });

    const rows = buildAssignmentRosterRows({
      kind: 'quiz',
      targetMode: 'class',
      targetStudents: [],
      matchedRosters: [roster],
      overridesBySourcedId: {
        'classlink:SID-1': { questionIds: ['q1', 'q2'] },
      },
      totalQuestions: 5,
      pseudonyms,
      statusByUid: new Map(),
      t,
    });

    expect(rows[0].modifiedNote).toBe('modified (2 of 5 Qs)');
  });

  it('renders a plain "modified" marker for a non-question override', () => {
    const sso = makeStudent({ id: 's1', classLinkSourcedId: 'SID-1' });
    const roster = makeRoster({ students: [sso] });
    const pseudonyms = emptyMaps();
    pseudonyms.targetRefKeyByStudentUid.set('uid-1', 'classlink:SID-1');

    const rows = buildAssignmentRosterRows({
      kind: 'video-activity',
      targetMode: 'class',
      targetStudents: [],
      matchedRosters: [roster],
      overridesBySourcedId: { 'classlink:SID-1': { timeMultiplier: 2 } },
      totalQuestions: null,
      pseudonyms,
      statusByUid: new Map(),
      t,
    });

    expect(rows[0].modifiedNote).toBe('modified');
  });

  it('builds rows from targetStudents refs for a partial-roster (students-mode) assignment', () => {
    const pseudonyms = emptyMaps();
    pseudonyms.targetRefKeyByStudentUid.set('uid-9', 'test:kid@school.org');
    pseudonyms.byStudentUid.set('uid-9', {
      givenName: 'Sam',
      familyName: 'Lee',
    });

    const rows = buildAssignmentRosterRows({
      kind: 'guided-learning',
      targetMode: 'students',
      targetStudents: [
        { kind: 'test', email: 'kid@school.org' },
        { kind: 'classlink', sourcedId: 'UNRESOLVED' },
      ],
      matchedRosters: [],
      overridesBySourcedId: undefined,
      totalQuestions: null,
      pseudonyms,
      statusByUid: new Map([['uid-9', 'submitted']]),
      t,
    });

    expect(rows).toHaveLength(2);
    const resolved = rows.find((r) => r.displayName === 'Sam Lee');
    expect(resolved?.status).toBe('submitted');
    const unresolved = rows.find((r) => r.displayName === 'Student');
    expect(unresolved?.status).toBe('not-started');
  });

  it('resolves mini-app names/status via byAssignmentPseudonym, not byStudentUid', () => {
    const sso = makeStudent({ id: 's1', classLinkSourcedId: 'SID-1' });
    const roster = makeRoster({ students: [sso] });
    const pseudonyms = emptyMaps();
    // Deliberately populate ONLY the assignmentPseudonym-keyed maps to prove
    // the mini-app branch doesn't fall back to the studentUid ones.
    pseudonyms.targetRefKeyByAssignmentPseudonym.set(
      'pseudo-1',
      'classlink:SID-1'
    );
    pseudonyms.byAssignmentPseudonym.set('pseudo-1', {
      givenName: 'Jamie',
      familyName: 'Fox',
    });

    const rows = buildAssignmentRosterRows({
      kind: 'mini-app',
      targetMode: 'class',
      targetStudents: [],
      matchedRosters: [roster],
      overridesBySourcedId: undefined,
      totalQuestions: null,
      pseudonyms,
      statusByUid: new Map([['pseudo-1', 'submitted']]),
      t,
    });

    expect(rows[0].displayName).toBe('Jamie Fox');
    expect(rows[0].status).toBe('submitted');
  });
});
