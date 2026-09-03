import { describe, it, expect } from 'vitest';
import {
  buildGradeFromDraft,
  isGradeComplete,
  parsePoints,
  type GradeDraft,
  type GradeDraftContext,
} from '@/utils/gradeDraft';

const draft = (over: Partial<GradeDraft> = {}): GradeDraft => ({
  pointsInput: '',
  comment: '',
  annotations: [],
  rubricScores: [],
  pinnedTakeIndex: null,
  adjudication: 'none',
  ...over,
});

const ctx = (over: Partial<GradeDraftContext> = {}): GradeDraftContext => ({
  kind: 'text',
  captureUnavailable: false,
  maxPoints: 10,
  rubricCriteriaCount: 0,
  teacherUid: 't1',
  answerText: '<p>hello</p>',
  ...over,
});

const score = (criterionId: string, points: number) => ({
  criterionId,
  levelId: `${criterionId}-l`,
  points,
});

describe('parsePoints', () => {
  it('accepts finite numbers inside the range only', () => {
    expect(parsePoints('7', 10)).toBe(7);
    expect(parsePoints(' 2.5 ', 10)).toBe(2.5);
    expect(parsePoints('', 10)).toBeNull();
    expect(parsePoints('abc', 10)).toBeNull();
    expect(parsePoints('11', 10)).toBeNull();
    expect(parsePoints('-1', 10)).toBeNull();
  });
});

describe('isGradeComplete', () => {
  it('needs a valid score when there is no rubric', () => {
    expect(isGradeComplete(draft(), ctx())).toBe(false);
    expect(isGradeComplete(draft({ pointsInput: '1' }), ctx())).toBe(true);
    expect(isGradeComplete(draft({ pointsInput: '15' }), ctx())).toBe(false);
  });

  it('needs every rubric criterion scored, regardless of the points field', () => {
    const rubricCtx = ctx({ rubricCriteriaCount: 2 });
    expect(
      isGradeComplete(draft({ rubricScores: [score('c1', 3)] }), rubricCtx)
    ).toBe(false);
    expect(
      isGradeComplete(
        draft({ rubricScores: [score('c1', 3)], pointsInput: '3' }),
        rubricCtx
      )
    ).toBe(false);
    expect(
      isGradeComplete(
        draft({ rubricScores: [score('c1', 3), score('c2', 4)] }),
        rubricCtx
      )
    ).toBe(true);
  });

  it('treats a points-only override as having no rubric', () => {
    expect(
      isGradeComplete(
        draft({ pointsInput: '6' }),
        ctx({ rubricCriteriaCount: 0 })
      )
    ).toBe(true);
  });

  it('completes an unavailable capture on Excuse, Blank, or a noted substitute', () => {
    const media = ctx({ kind: 'media', captureUnavailable: true });
    expect(isGradeComplete(draft(), media)).toBe(false);
    expect(isGradeComplete(draft({ adjudication: 'excuse' }), media)).toBe(
      true
    );
    expect(isGradeComplete(draft({ adjudication: 'blank' }), media)).toBe(true);
    expect(isGradeComplete(draft({ adjudication: 'substitute' }), media)).toBe(
      false
    );
    expect(
      isGradeComplete(
        draft({ adjudication: 'substitute', comment: 'heard it' }),
        media
      )
    ).toBe(true);
    expect(
      isGradeComplete(
        draft({
          adjudication: 'substitute',
          comment: 'heard it',
          pointsInput: '99',
        }),
        media
      )
    ).toBe(false);
  });
});

describe('buildGradeFromDraft', () => {
  it('writes a plain points grade', () => {
    const r = buildGradeFromDraft(draft({ pointsInput: '7' }), ctx(), 5);
    expect(r).toEqual({
      ok: true,
      grade: {
        pointsAwarded: 7,
        overallComment: undefined,
        annotations: undefined,
        gradingSnapshot: undefined,
        rubricScores: undefined,
        gradedBy: 't1',
        gradedAt: 5,
      },
    });
  });

  it('rejects a comment with no score, and an out-of-range score', () => {
    expect(buildGradeFromDraft(draft({ comment: 'nice' }), ctx())).toEqual({
      ok: false,
      error: 'numericScore',
    });
    expect(buildGradeFromDraft(draft({ pointsInput: '12' }), ctx())).toEqual({
      ok: false,
      error: 'range',
    });
  });

  it('banks a partial rubric with its running sum when points are empty', () => {
    const r = buildGradeFromDraft(
      draft({ rubricScores: [score('c1', 3)] }),
      ctx({ rubricCriteriaCount: 2 }),
      1
    );
    expect(r.ok && r.grade.pointsAwarded).toBe(3);
    expect(r.ok && r.grade.rubricScores).toEqual([score('c1', 3)]);
  });

  it('freezes the snapshot on the first annotated save and keeps it after', () => {
    const annotations = [
      { id: 'a1', from: 0, to: 2, authorUid: 't1', createdAt: 1 },
    ];
    const first = buildGradeFromDraft(
      draft({ pointsInput: '4', annotations }),
      ctx({ answerText: '<p>hi <b>there</b></p>' }),
      1
    );
    expect(first.ok && first.grade.gradingSnapshot).toContain('hi');
    const later = buildGradeFromDraft(
      draft({ pointsInput: '4', annotations }),
      ctx({ answerText: '<p>edited</p>', existingSnapshot: '<p>FROZEN</p>' }),
      1
    );
    expect(later.ok && later.grade.gradingSnapshot).toBe('<p>FROZEN</p>');
    expect(
      buildGradeFromDraft(
        draft({ pointsInput: '4', annotations }),
        ctx({ answerText: '' })
      )
    ).toEqual({ ok: false, error: 'emptyAnnotations' });
  });

  it('labels media comments in milliseconds and records the graded take', () => {
    const r = buildGradeFromDraft(
      draft({
        pointsInput: '3',
        annotations: [
          {
            id: 'a1',
            from: 0,
            to: 0,
            authorUid: 't1',
            createdAt: 1,
            comment: 'x',
          },
          { id: 'a2', from: 5, to: 5, authorUid: 't1', createdAt: 1 },
        ],
      }),
      ctx({ kind: 'media', gradedTakeIndex: 2 }),
      1
    );
    expect(r.ok && r.grade.annotationUnit).toBe('ms');
    expect(r.ok && r.grade.annotations).toHaveLength(1);
    expect(r.ok && r.grade.gradedTakeIndex).toBe(2);
  });

  it('adjudicates an unavailable capture', () => {
    const media = ctx({ kind: 'media', captureUnavailable: true });
    expect(buildGradeFromDraft(draft(), media)).toEqual({
      ok: false,
      error: 'chooseOutcome',
    });
    expect(
      buildGradeFromDraft(draft({ adjudication: 'substitute' }), media)
    ).toEqual({ ok: false, error: 'noteRequired' });
    const excused = buildGradeFromDraft(
      draft({ adjudication: 'excuse' }),
      media,
      1
    );
    expect(excused).toEqual({
      ok: true,
      grade: { pointsAwarded: 0, excused: true, gradedBy: 't1', gradedAt: 1 },
    });
    const sub = buildGradeFromDraft(
      draft({
        adjudication: 'substitute',
        comment: ' heard it ',
        pointsInput: '2',
      }),
      media,
      1
    );
    expect(sub).toEqual({
      ok: true,
      grade: {
        pointsAwarded: 2,
        overallComment: 'heard it',
        gradedBy: 't1',
        gradedAt: 1,
      },
    });
  });
});
