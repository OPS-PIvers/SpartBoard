import { describe, expect, it } from 'vitest';
import type { PlcAssessmentAggregate } from '@/types';
import {
  AGGREGATES,
  ASSESSMENTS,
  LEARNING_TARGETS,
} from '@/components/plc/redesignMockup/fixtures';
import {
  buildDataOverviewModel,
  buildTagQuestionSets,
  countOpenItems,
  findTargetMastery,
  shortTitleFor,
} from './dataOverviewModel';

const untag = (a: PlcAssessmentAggregate): PlcAssessmentAggregate => {
  const copy = { ...a };
  delete copy.perTarget;
  delete copy.perStandard;
  return copy;
};

const base = {
  aggregates: AGGREGATES,
  assessments: ASSESSMENTS,
  targets: LEARNING_TARGETS,
  teacherUids: ['t1', 't2', 't3', 't4', 't5'],
};

describe('buildDataOverviewModel', () => {
  it('follows the latest scored assessment when nothing is pinned', () => {
    const model = buildDataOverviewModel({ ...base, heroRef: null });
    expect(model.featured?.assessmentId).toBe('u4');
    expect(model.featured?.pinned).toBe(false);
    expect(model.newer).toBeNull();
  });

  it('features a pinned assessment and nudges about newer results', () => {
    const model = buildDataOverviewModel({
      ...base,
      heroRef: { kind: 'assessment', assessmentId: 'u3' },
    });
    expect(model.featured?.assessmentId).toBe('u3');
    expect(model.featured?.pinned).toBe(true);
    expect(model.featured?.itemAnalysis.reteachCount).toBe(3);
    expect(model.newer?.assessmentId).toBe('u4');
    expect(model.featured?.targetOf.q1).toBe('7.RP.1');
  });

  it('falls back to the latest when the pinned assessment is gone', () => {
    const model = buildDataOverviewModel({
      ...base,
      heroRef: { kind: 'assessment', assessmentId: 'missing' },
    });
    expect(model.featured?.assessmentId).toBe('u4');
  });

  it('uses the newest tagged assessment for mastery when the featured one is untagged', () => {
    const model = buildDataOverviewModel({ ...base, heroRef: null });
    expect(model.mastery?.assessmentId).toBe('u3');
    expect(model.mastery?.questionsPerTarget['7.RP.3']).toBe(6);
  });

  it('has no mastery layer when nothing is tagged', () => {
    const model = buildDataOverviewModel({
      ...base,
      aggregates: AGGREGATES.map(untag),
      heroRef: null,
    });
    expect(model.mastery).toBeNull();
  });

  it('keeps team-level rows only: trend oldest first, recent newest first', () => {
    const model = buildDataOverviewModel({ ...base, heroRef: null });
    expect(model.trend.map((p) => p.assessmentId)).toEqual([
      'diag',
      'u1',
      'u2',
      'u3',
      'u4',
    ]);
    expect(model.recent.map((r) => r.assessmentId)).toEqual([
      'u4',
      'u3',
      'u2',
      'u1',
    ]);
    expect(model.participation.at(-1)?.assessmentId).toBe('u4');
    expect(model.participation.at(-1)?.teachersRan).toBe(4);
  });
});

describe('helpers', () => {
  it('clips long titles and prefers the unit label', () => {
    expect(shortTitleFor('Unit 3')).toBe('Unit 3');
    expect(shortTitleFor('Unit 3 Ratios CFA')).toBe('Unit 3 Rati…');
    expect(
      shortTitleFor('Unit 3 Ratios CFA', { ...ASSESSMENTS[3], unitLabel: 'U3' })
    ).toBe('U3');
  });

  it('builds question tag sets newest first', () => {
    const sets = buildTagQuestionSets(AGGREGATES, ASSESSMENTS);
    expect(sets[0].assessmentId).toBe('u3');
    expect(sets[0].questions[1]).toMatchObject({
      questionId: 'q2',
      targetId: '7.RP.2a',
    });
  });

  it('finds a target trend across assessments', () => {
    const row = findTargetMastery(base, '7.RP.1');
    expect(row?.correctPercent).toBe(54);
    expect(row?.points).toHaveLength(1);
  });

  it('counts open action items and the viewer’s share', () => {
    expect(
      countOpenItems(
        [
          {
            actionItems: [
              { done: false, assigneeUid: 'me' },
              { done: true, assigneeUid: 'me' },
              { done: false, assigneeUid: 'x' },
            ],
          },
          { deletedAt: 1, actionItems: [{ done: false, assigneeUid: 'me' }] },
        ],
        'me'
      )
    ).toEqual({ total: 2, mine: 1 });
  });
});
