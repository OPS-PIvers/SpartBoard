import { describe, expect, it } from 'vitest';
import type {
  PlcAssessmentAggregate,
  PlcCommonAssessment,
  PlcMember,
} from '@/types';
import { zonedTimeToEpoch } from '@/utils/plcHomeTime';
import { participationRows } from './catalogSelectors';

const NOW = zonedTimeToEpoch(2026, 10, 15, 12);

function assessment(id: string, opensAt: number): PlcCommonAssessment {
  return {
    id,
    title: `Unit ${id}`,
    kind: 'quiz',
    syncGroupId: `g-${id}`,
    opensAt,
    status: 'active',
    createdBy: 'u1',
    createdAt: 0,
    updatedAt: 0,
  };
}

function aggregate(id: string, teachers: string[]): PlcAssessmentAggregate {
  return {
    assessmentId: id,
    schemaVersion: 3,
    teacherCount: teachers.length,
    studentCount: 40,
    teamAveragePercent: 70,
    perQuestion: [],
    contributorUids: teachers,
    ranAt: 1,
  };
}

const member = (
  uid: string,
  role: PlcMember['role'] = 'member'
): PlcMember => ({
  uid,
  email: `${uid}@school.org`,
  displayName: uid.toUpperCase(),
  role,
  joinedAt: 0,
  status: 'active',
});

const members = [
  member('a', 'lead'),
  member('b'),
  member('c'),
  member('v', 'viewer'),
];

describe('participationRows', () => {
  const assessments = [
    assessment('1', zonedTimeToEpoch(2026, 9, 10)),
    assessment('2', zonedTimeToEpoch(2026, 10, 5)),
    assessment('old', zonedTimeToEpoch(2026, 5, 1)),
  ];
  const aggregates = [aggregate('1', ['a', 'b', 'c']), aggregate('2', ['a'])];

  it('counts teachers who ran each assessment this year, newest first, viewers excluded', () => {
    const rows = participationRows({
      aggregates,
      assessments,
      members,
      now: NOW,
    });
    expect(
      rows.map((r) => [r.assessmentId, r.ranCount, r.expectedCount])
    ).toEqual([
      ['2', 1, 3],
      ['1', 3, 3],
    ]);
  });
});
