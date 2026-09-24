import { describe, expect, it } from 'vitest';
import type {
  PlcAssessmentAggregate,
  PlcCommonAssessment,
  PlcMember,
} from '@/types';
import { zonedTimeToEpoch } from '@/utils/plcHomeTime';
import {
  participationRows,
  perTeacherBars,
  pickPerTeacherAggregate,
} from './catalogSelectors';

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

function aggregate(
  id: string,
  teachers: [string, number][]
): PlcAssessmentAggregate {
  return {
    assessmentId: id,
    schemaVersion: 3,
    teacherCount: teachers.length,
    studentCount: 40,
    teamAveragePercent: 70,
    perQuestion: [],
    perTeacher: teachers.map(([uid, avg]) => ({
      teacherUid: uid,
      teacherName: uid.toUpperCase(),
      classCount: 2,
      averagePercent: avg,
      studentCount: 20,
    })),
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
  const aggregates = [
    aggregate('1', [
      ['a', 80],
      ['b', 60],
      ['c', 70],
    ]),
    aggregate('2', [['a', 80]]),
  ];

  it('counts teachers who ran each assessment this year, newest first, viewers excluded', () => {
    const rows = participationRows({
      aggregates,
      assessments,
      members,
      now: NOW,
      withNames: false,
    });
    expect(
      rows.map((r) => [r.assessmentId, r.ranCount, r.expectedCount])
    ).toEqual([
      ['2', 1, 3],
      ['1', 3, 3],
    ]);
    expect(rows[0].notRanNames).toEqual([]);
  });

  it('names who has not run it only when per-teacher results are on', () => {
    const rows = participationRows({
      aggregates,
      assessments,
      members,
      now: NOW,
      withNames: true,
    });
    expect(rows[0].notRanNames).toEqual(['B', 'C']);
  });
});

describe('per-teacher selectors', () => {
  const assessments = [
    assessment('1', zonedTimeToEpoch(2026, 9, 10)),
    assessment('2', zonedTimeToEpoch(2026, 10, 5)),
    assessment('3', zonedTimeToEpoch(2026, 10, 10)),
  ];
  const aggregates = [
    aggregate('1', [
      ['a', 60],
      ['b', 90],
    ]),
    aggregate('2', [['a', 75]]),
    aggregate('3', []),
  ];

  it('defaults to the newest assessment with results and honors a chosen one', () => {
    expect(
      pickPerTeacherAggregate({ aggregates, assessments })?.assessment.id
    ).toBe('2');
    expect(
      pickPerTeacherAggregate({ aggregates, assessments, assessmentId: '1' })
        ?.assessment.id
    ).toBe('1');
    expect(
      pickPerTeacherAggregate({ aggregates, assessments, assessmentId: 'gone' })
        ?.assessment.id
    ).toBe('2');
  });

  it('orders bars by average, highest first', () => {
    expect(perTeacherBars(aggregates[0]).map((b) => b.teacherUid)).toEqual([
      'b',
      'a',
    ]);
  });
});
