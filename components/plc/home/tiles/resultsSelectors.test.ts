import { describe, expect, it } from 'vitest';
import type {
  PlcAggregateTargetRow,
  PlcAssessmentAggregate,
  PlcCommonAssessment,
} from '@/types';
import { zonedTimeToEpoch } from '@/utils/plcHomeTime';
import { latestTargetMastery } from './resultsSelectors';

const NOW = zonedTimeToEpoch(2026, 10, 15, 12);
const THIS_YEAR = zonedTimeToEpoch(2026, 9, 1);
const LATER_THIS_YEAR = zonedTimeToEpoch(2026, 10, 1);
const LAST_YEAR = zonedTimeToEpoch(2026, 5, 1);

function assessment(id: string, opensAt: number): PlcCommonAssessment {
  return {
    id,
    title: id,
    kind: 'quiz',
    syncGroupId: `g-${id}`,
    opensAt,
    status: 'active',
    createdBy: 'u1',
    createdAt: 0,
    updatedAt: 0,
  };
}

function row(
  targetId: string,
  correctPercent: number,
  lowSample = false
): PlcAggregateTargetRow {
  return {
    targetId,
    kind: 'plc',
    code: targetId.toUpperCase(),
    label: `Target ${targetId}`,
    questionIds: ['q1'],
    attempted: lowSample ? 3 : 20,
    correctPercent,
    lowSample,
  };
}

function aggregate(
  assessmentId: string,
  parts: Partial<PlcAssessmentAggregate>
): PlcAssessmentAggregate {
  return {
    assessmentId,
    schemaVersion: 3,
    teacherCount: 2,
    studentCount: 40,
    teamAveragePercent: 70,
    perQuestion: [],
    perTeacher: [],
    // ranAt deliberately scrambled: it must never order anything.
    ranAt: assessmentId === 'a1' ? 9e12 : 1,
    ...parts,
  };
}

describe('latestTargetMastery', () => {
  it('uses the latest assessment per target, worst first, with trend markers', () => {
    const rollup = latestTargetMastery(
      [
        aggregate('a1', { perTarget: [row('t1', 50), row('t2', 90)] }),
        aggregate('a2', { perTarget: [row('t1', 70), row('t2', 88)] }),
      ],
      [assessment('a1', THIS_YEAR), assessment('a2', LATER_THIS_YEAR)],
      { now: NOW }
    );
    expect(rollup.mode).toBe('targets');
    expect(
      rollup.rows.map((r) => [r.targetId, r.correctPercent, r.trend])
    ).toEqual([
      ['t1', 70, 'up'],
      ['t2', 88, null],
    ]);
    expect(rollup.latestAssessmentId).toBe('a2');
  });

  it('drops targets whose latest assessment ran before this school year', () => {
    const rollup = latestTargetMastery(
      [
        aggregate('old', { perTarget: [row('t1', 40)] }),
        aggregate('new', { perTarget: [row('t2', 60)] }),
      ],
      [assessment('old', LAST_YEAR), assessment('new', THIS_YEAR)],
      { now: NOW }
    );
    expect(rollup.rows.map((r) => r.targetId)).toEqual(['t2']);
  });

  it('mutes low-sample targets: last in order and no trend', () => {
    const rollup = latestTargetMastery(
      [
        aggregate('a1', { perTarget: [row('t1', 90), row('t2', 30)] }),
        aggregate('a2', { perTarget: [row('t1', 80), row('t2', 10, true)] }),
      ],
      [assessment('a1', THIS_YEAR), assessment('a2', LATER_THIS_YEAR)],
      { now: NOW }
    );
    expect(rollup.rows.map((r) => [r.targetId, r.trend])).toEqual([
      ['t1', 'down'],
      ['t2', null],
    ]);
  });

  it('falls back to standards, then to the hardest questions', () => {
    const standards = latestTargetMastery(
      [aggregate('a1', { perStandard: [row('s1', 55)] })],
      [assessment('a1', THIS_YEAR)],
      { now: NOW }
    );
    expect(standards.mode).toBe('standards');

    const questions = latestTargetMastery(
      [
        aggregate('a1', {
          perQuestion: [
            { questionId: 'q1', text: 'One', correctPercent: 80, points: 1 },
            { questionId: 'q2', text: 'Two', correctPercent: 20, points: 1 },
          ],
        }),
      ],
      [assessment('a1', THIS_YEAR)],
      { now: NOW }
    );
    expect(questions.mode).toBe('questions');
    expect(questions.weakQuestions.map((q) => q.questionId)).toEqual([
      'q2',
      'q1',
    ]);
  });

  it('ignores aggregates without a live assessment and reports empty', () => {
    const deleted = { ...assessment('a1', THIS_YEAR), deletedAt: 5 };
    const rollup = latestTargetMastery(
      [aggregate('a1', { perTarget: [row('t1', 50)] })],
      [deleted],
      { now: NOW }
    );
    expect(rollup.mode).toBe('empty');
  });
});
