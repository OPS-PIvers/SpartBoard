import { describe, it, expect } from 'vitest';
import type {
  PlcAssessmentAggregate,
  PlcCommonAssessment,
  PlcMeeting,
} from '@/types';
import {
  buildCommonAssessmentBanner,
  deriveBannerPhase,
  pickFeaturedAssessment,
  pickInProgressMeeting,
} from './commonAssessmentBannerSelectors';

function assessment(
  over: Partial<PlcCommonAssessment> = {}
): PlcCommonAssessment {
  return {
    id: 'a1',
    title: 'Unit 4 CFA',
    kind: 'quiz',
    syncGroupId: 'g1',
    status: 'active',
    createdBy: 'u1',
    createdAt: 1000,
    updatedAt: 1000,
    ...over,
  };
}

function aggregate(
  over: Partial<PlcAssessmentAggregate> = {}
): PlcAssessmentAggregate {
  return {
    assessmentId: 'a1',
    schemaVersion: 1,
    teacherCount: 0,
    studentCount: 0,
    teamAveragePercent: 0,
    perQuestion: [],
    perTeacher: [],
    ranAt: 5000,
    ...over,
  };
}

function teacherRow(uid: string) {
  return {
    teacherUid: uid,
    teacherName: `Teacher ${uid}`,
    classCount: 1,
    averagePercent: 80,
    studentCount: 20,
  };
}

function meeting(over: Partial<PlcMeeting> = {}): PlcMeeting {
  return {
    id: 'm1',
    heldAt: 1000,
    facilitatorUid: 'u1',
    attendeeUids: [],
    assessmentIds: [],
    decisions: [],
    actionItems: [],
    status: 'in-progress',
    createdBy: 'u1',
    updatedAt: 1000,
    ...over,
  };
}

describe('pickFeaturedAssessment', () => {
  it('returns null when there are no assessments', () => {
    expect(pickFeaturedAssessment([])).toBeNull();
  });

  it('ignores soft-deleted assessments', () => {
    expect(pickFeaturedAssessment([assessment({ deletedAt: 123 })])).toBeNull();
  });

  it('prefers reviewing over active over planning over closed', () => {
    const result = pickFeaturedAssessment([
      assessment({ id: 'closed', status: 'closed' }),
      assessment({ id: 'planning', status: 'planning' }),
      assessment({ id: 'active', status: 'active' }),
      assessment({ id: 'reviewing', status: 'reviewing' }),
    ]);
    expect(result?.id).toBe('reviewing');
  });

  it('breaks ties within a status tier by newest updatedAt', () => {
    const result = pickFeaturedAssessment([
      assessment({ id: 'older', status: 'active', updatedAt: 100 }),
      assessment({ id: 'newer', status: 'active', updatedAt: 999 }),
    ]);
    expect(result?.id).toBe('newer');
  });
});

describe('pickInProgressMeeting', () => {
  it('returns null when there are no in-progress meetings', () => {
    expect(
      pickInProgressMeeting([meeting({ status: 'completed' })])
    ).toBeNull();
  });

  it('ignores soft-deleted in-progress meetings', () => {
    expect(
      pickInProgressMeeting([meeting({ status: 'in-progress', deletedAt: 1 })])
    ).toBeNull();
  });

  it('returns the newest in-progress meeting (by heldAt)', () => {
    const result = pickInProgressMeeting([
      meeting({ id: 'old', heldAt: 100 }),
      meeting({ id: 'new', heldAt: 900 }),
    ]);
    expect(result?.id).toBe('new');
  });
});

describe('deriveBannerPhase', () => {
  it('returns reviewing when a meeting is in progress, regardless of status', () => {
    expect(
      deriveBannerPhase({
        status: 'active',
        ranCount: 0,
        expectedCount: 4,
        hasInProgressMeeting: true,
      })
    ).toBe('reviewing');
  });

  it('returns reviewing when status === reviewing', () => {
    expect(
      deriveBannerPhase({
        status: 'reviewing',
        ranCount: 2,
        expectedCount: 4,
        hasInProgressMeeting: false,
      })
    ).toBe('reviewing');
  });

  it('returns closed for a closed assessment with no live meeting', () => {
    expect(
      deriveBannerPhase({
        status: 'closed',
        ranCount: 4,
        expectedCount: 4,
        hasInProgressMeeting: false,
      })
    ).toBe('closed');
  });

  it('returns planning when nobody has run it', () => {
    expect(
      deriveBannerPhase({
        status: 'active',
        ranCount: 0,
        expectedCount: 4,
        hasInProgressMeeting: false,
      })
    ).toBe('planning');
  });

  it('returns running when some but not all expected teachers have run it', () => {
    expect(
      deriveBannerPhase({
        status: 'active',
        ranCount: 2,
        expectedCount: 4,
        hasInProgressMeeting: false,
      })
    ).toBe('running');
  });

  it('returns ready when everyone expected has run it', () => {
    expect(
      deriveBannerPhase({
        status: 'active',
        ranCount: 4,
        expectedCount: 4,
        hasInProgressMeeting: false,
      })
    ).toBe('ready');
  });
});

describe('buildCommonAssessmentBanner', () => {
  it('returns null when there is no assessment to feature', () => {
    expect(
      buildCommonAssessmentBanner({
        assessments: [],
        aggregatesById: new Map(),
        meetings: [],
        memberCount: 4,
      })
    ).toBeNull();
  });

  it('derives ranCount from the aggregate perTeacher rows (anonymized)', () => {
    const model = buildCommonAssessmentBanner({
      assessments: [assessment({ id: 'a1', status: 'active' })],
      aggregatesById: new Map([
        ['a1', aggregate({ perTeacher: [teacherRow('t1'), teacherRow('t2')] })],
      ]),
      meetings: [],
      memberCount: 4,
    });
    expect(model?.ranCount).toBe(2);
    expect(model?.expectedCount).toBe(4);
    expect(model?.phase).toBe('running');
  });

  it('uses member count as the expected denominator, falling back to ranCount', () => {
    const model = buildCommonAssessmentBanner({
      assessments: [assessment({ id: 'a1', status: 'active' })],
      aggregatesById: new Map([
        ['a1', aggregate({ perTeacher: [teacherRow('t1')] })],
      ]),
      meetings: [],
      memberCount: 0, // provider not hydrated
    });
    // expectedCount falls back to ranCount (never "1 of 0").
    expect(model?.expectedCount).toBe(1);
  });

  it('reports ranCount 0 / planning when no aggregate exists yet', () => {
    const model = buildCommonAssessmentBanner({
      assessments: [assessment({ id: 'a1', status: 'planning' })],
      aggregatesById: new Map(),
      meetings: [],
      memberCount: 3,
    });
    expect(model?.aggregate).toBeNull();
    expect(model?.ranCount).toBe(0);
    expect(model?.phase).toBe('planning');
  });

  it('surfaces an in-progress meeting to resume and flips phase to reviewing', () => {
    const model = buildCommonAssessmentBanner({
      assessments: [assessment({ id: 'a1', status: 'active' })],
      aggregatesById: new Map([
        ['a1', aggregate({ perTeacher: [teacherRow('t1')] })],
      ]),
      meetings: [meeting({ id: 'live', status: 'in-progress' })],
      memberCount: 4,
    });
    expect(model?.inProgressMeeting?.id).toBe('live');
    expect(model?.phase).toBe('reviewing');
  });
});
