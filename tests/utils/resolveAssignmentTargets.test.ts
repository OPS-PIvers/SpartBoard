import { describe, it, expect } from 'vitest';
import {
  resolveAssignmentTargets,
  deriveSessionTargetsFromRosters,
  mapLegacyClassIdsToRosterIds,
} from '@/utils/resolveAssignmentTargets';
import type { ClassRoster, Student } from '@/types';

const student = (id: string, name: string, pin: string): Student => ({
  id,
  firstName: name,
  lastName: '',
  pin,
});

const roster = (
  id: string,
  name: string,
  students: Student[],
  extra: Partial<ClassRoster> = {}
): ClassRoster => ({
  id,
  name,
  students,
  driveFileId: null,
  studentCount: students.length,
  createdAt: 0,
  ...extra,
});

const s1 = student('s1', 'Ada', '01');
const s2 = student('s2', 'Blake', '02');
const s3 = student('s3', 'Cody', '03');

describe('resolveAssignmentTargets', () => {
  it('uses rosterIds when present (new path) and derives everything from rosters', () => {
    const r1 = roster('r1', 'Period 1', [s1, s2], {
      classlinkClassId: 'cl-1',
    });
    const r2 = roster('r2', 'Period 2', [s3], { classlinkClassId: 'cl-2' });
    const out = resolveAssignmentTargets(
      { rosterIds: ['r1', 'r2'], classIds: ['ignored'], periodNames: ['x'] },
      [r1, r2]
    );
    expect(out.source).toBe('rosterIds');
    expect(out.rosterIds).toEqual(['r1', 'r2']);
    expect(out.classIds.sort()).toEqual(['cl-1', 'cl-2']);
    expect(out.periodNames.sort()).toEqual(['Period 1', 'Period 2']);
    expect(out.classPeriodByClassId).toEqual({
      'cl-1': 'Period 1',
      'cl-2': 'Period 2',
    });
    expect(out.students.map((s) => s.id).sort()).toEqual(['s1', 's2', 's3']);
  });

  it('falls back to legacy classIds when rosterIds is empty/absent', () => {
    const out = resolveAssignmentTargets(
      { classIds: ['cl-legacy-1', 'cl-legacy-2'] },
      []
    );
    expect(out.source).toBe('classIds');
    expect(out.classIds).toEqual(['cl-legacy-1', 'cl-legacy-2']);
    expect(out.rosterIds).toEqual([]);
    expect(out.periodNames).toEqual([]);
    expect(out.classPeriodByClassId).toEqual({});
  });

  it('falls back to legacy periodNames when only it is present', () => {
    const out = resolveAssignmentTargets({ periodNames: ['Period 1'] }, []);
    expect(out.source).toBe('periodNames');
    expect(out.periodNames).toEqual(['Period 1']);
    expect(out.classPeriodByClassId).toEqual({});
  });

  it('returns source="none" when nothing is targeted', () => {
    const out = resolveAssignmentTargets({}, []);
    expect(out.source).toBe('none');
    expect(out.classPeriodByClassId).toEqual({});
  });

  it('silently drops rosterIds that no longer exist', () => {
    const r1 = roster('r1', 'Period 1', [s1], { classlinkClassId: 'cl-1' });
    const out = resolveAssignmentTargets({ rosterIds: ['r1', 'deleted'] }, [
      r1,
    ]);
    expect(out.rosterIds).toEqual(['r1']);
    expect(out.classIds).toEqual(['cl-1']);
  });

  it('de-dupes students shared across multiple selected rosters', () => {
    const shared = student('shared', 'Shared', '04');
    const r1 = roster('r1', 'Period 1', [s1, shared]);
    const r2 = roster('r2', 'Period 2', [s2, shared]);
    const out = resolveAssignmentTargets({ rosterIds: ['r1', 'r2'] }, [r1, r2]);
    expect(out.students.map((s) => s.id).sort()).toEqual([
      's1',
      's2',
      'shared',
    ]);
  });

  it('de-dupes classIds when two rosters share a classlinkClassId', () => {
    // Teacher imported the same ClassLink class twice under different names.
    const r1 = roster('r1', 'MATH-7 (copy A)', [s1], {
      classlinkClassId: 'cl-dup',
    });
    const r2 = roster('r2', 'MATH-7 (copy B)', [s2], {
      classlinkClassId: 'cl-dup',
    });
    const out = resolveAssignmentTargets({ rosterIds: ['r1', 'r2'] }, [r1, r2]);
    expect(out.classIds).toEqual(['cl-dup']);
    // First-wins on the period-name map matches the dedup of `classIds[]`.
    expect(out.classPeriodByClassId).toEqual({ 'cl-dup': 'MATH-7 (copy A)' });
  });

  it('de-dupes periodNames when rosters share a name', () => {
    const r1 = roster('r1', 'Period 1', [s1]);
    const r2 = roster('r2', 'Period 1', [s2]);
    const out = resolveAssignmentTargets({ rosterIds: ['r1', 'r2'] }, [r1, r2]);
    expect(out.periodNames).toEqual(['Period 1']);
  });

  it('omits rosters without a classlinkClassId from derived classIds', () => {
    const r1 = roster('r1', 'Period 1', [s1], { classlinkClassId: 'cl-1' });
    const r2 = roster('r2', 'Local only', [s2]); // no classlinkClassId
    const out = resolveAssignmentTargets({ rosterIds: ['r1', 'r2'] }, [r1, r2]);
    expect(out.classIds).toEqual(['cl-1']);
    expect(out.rosterIds).toEqual(['r1', 'r2']);
    // Local-only rosters can't be SSO-routed to, so they don't get a
    // classPeriod map entry. The PIN flow uses periodNames separately.
    expect(out.classPeriodByClassId).toEqual({ 'cl-1': 'Period 1' });
  });

  it('includes testClassId in derived classIds for test-class rosters', () => {
    // Roster imported from an admin-managed test class. The test-bypass SSO
    // student's custom token carries `classIds: ['mock-period-1']`, so the
    // session must surface that slug or the student sees an empty list.
    const r1 = roster('r1', 'Mock Period 1 (test)', [s1], {
      testClassId: 'mock-period-1',
    });
    const out = resolveAssignmentTargets({ rosterIds: ['r1'] }, [r1]);
    expect(out.classIds).toEqual(['mock-period-1']);
  });

  it('merges classIds across mixed ClassLink + test-class rosters', () => {
    const r1 = roster('r1', 'Period 1', [s1], { classlinkClassId: 'cl-1' });
    const r2 = roster('r2', 'Mock Period 1 (test)', [s2], {
      testClassId: 'mock-period-1',
    });
    const out = resolveAssignmentTargets({ rosterIds: ['r1', 'r2'] }, [r1, r2]);
    expect(out.classIds.sort()).toEqual(['cl-1', 'mock-period-1']);
    expect(out.classPeriodByClassId).toEqual({
      'cl-1': 'Period 1',
      'mock-period-1': 'Mock Period 1 (test)',
    });
  });

  it('omits rosters with neither classlinkClassId nor testClassId', () => {
    const r1 = roster('r1', 'Local only', [s1]); // truly local, both absent
    const out = resolveAssignmentTargets({ rosterIds: ['r1'] }, [r1]);
    expect(out.classIds).toEqual([]);
    expect(out.rosterIds).toEqual(['r1']);
    expect(out.classPeriodByClassId).toEqual({});
  });
});

describe('deriveSessionTargetsFromRosters', () => {
  it('derives classIds, periodNames, classPeriodByClassId, and de-duped students', () => {
    const r1 = roster('r1', 'Period 1', [s1, s2], {
      classlinkClassId: 'cl-1',
    });
    const r2 = roster('r2', 'Period 2', [s3], { classlinkClassId: 'cl-2' });
    const out = deriveSessionTargetsFromRosters([r1, r2]);
    expect(out.rosterIds).toEqual(['r1', 'r2']);
    expect(out.classIds.sort()).toEqual(['cl-1', 'cl-2']);
    expect(out.periodNames.sort()).toEqual(['Period 1', 'Period 2']);
    expect(out.classPeriodByClassId).toEqual({
      'cl-1': 'Period 1',
      'cl-2': 'Period 2',
    });
    expect(out.students.map((s) => s.id).sort()).toEqual(['s1', 's2', 's3']);
  });

  it('de-dupes classIds (two rosters with same classlinkClassId)', () => {
    const r1 = roster('r1', 'A', [s1], { classlinkClassId: 'cl-dup' });
    const r2 = roster('r2', 'B', [s2], { classlinkClassId: 'cl-dup' });
    const out = deriveSessionTargetsFromRosters([r1, r2]);
    expect(out.classIds).toEqual(['cl-dup']);
    // First-wins on the period name — same dedup semantics as classIds.
    expect(out.classPeriodByClassId).toEqual({ 'cl-dup': 'A' });
  });

  it('builds a mixed map for ClassLink + test-class rosters', () => {
    const r1 = roster('r1', 'Period 1', [s1], { classlinkClassId: 'cl-1' });
    const r2 = roster('r2', 'Mock Period (test)', [s2], {
      testClassId: 'mock-period-1',
    });
    const out = deriveSessionTargetsFromRosters([r1, r2]);
    expect(out.classPeriodByClassId).toEqual({
      'cl-1': 'Period 1',
      'mock-period-1': 'Mock Period (test)',
    });
  });

  it('returns empty arrays for empty input', () => {
    expect(deriveSessionTargetsFromRosters([])).toEqual({
      rosterIds: [],
      classIds: [],
      periodNames: [],
      classPeriodByClassId: {},
      students: [],
    });
  });
});

describe('mapLegacyClassIdsToRosterIds', () => {
  it('maps legacy ClassLink sourcedIds to rosterIds via classlinkClassId', () => {
    const r1 = roster('r1', 'A', [], { classlinkClassId: 'cl-1' });
    const r2 = roster('r2', 'B', [], { classlinkClassId: 'cl-2' });
    expect(mapLegacyClassIdsToRosterIds(['cl-1', 'cl-2'], [r1, r2])).toEqual([
      'r1',
      'r2',
    ]);
  });

  it('returns an empty array when legacy input is undefined/empty', () => {
    expect(mapLegacyClassIdsToRosterIds(undefined, [])).toEqual([]);
    expect(mapLegacyClassIdsToRosterIds([], [])).toEqual([]);
  });

  it('returns partial matches — silently drops legacy IDs with no matching roster', () => {
    const r1 = roster('r1', 'A', [], { classlinkClassId: 'cl-1' });
    expect(
      mapLegacyClassIdsToRosterIds(['cl-1', 'cl-never-imported'], [r1])
    ).toEqual(['r1']);
  });

  it('returns empty array when no roster has matching classlinkClassId', () => {
    const r1 = roster('r1', 'A', [], { classlinkClassId: 'cl-1' });
    expect(mapLegacyClassIdsToRosterIds(['cl-never-imported'], [r1])).toEqual(
      []
    );
  });

  it('first-wins tie-break when two rosters share a classlinkClassId', () => {
    const r1 = roster('r1', 'A', [], { classlinkClassId: 'cl-dup' });
    const r2 = roster('r2', 'B', [], { classlinkClassId: 'cl-dup' });
    expect(mapLegacyClassIdsToRosterIds(['cl-dup'], [r1, r2])).toEqual(['r1']);
  });

  it('ignores rosters without classlinkClassId', () => {
    const r1 = roster('r1', 'Local only', []); // no classlinkClassId
    expect(mapLegacyClassIdsToRosterIds(['cl-1'], [r1])).toEqual([]);
  });
});
