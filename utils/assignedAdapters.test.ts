import { describe, expect, it } from 'vitest';
import type {
  FlashcardAssignment,
  GuidedLearningAssignment,
  MiniAppAssignment,
  PeriodAccess,
  VideoActivityAssignment,
  WritingAssignmentRecord,
} from '@/types';
import {
  flashcardAssignedInput,
  flashcardAssignedResponse,
  guidedLearningAssignedInput,
  guidedLearningAssignedResponse,
  miniAppAssignedInput,
  miniAppAssignedResponse,
  videoActivityAssignedInput,
  videoActivityAssignedResponse,
  writingAssignedInput,
  writingAssignedResponse,
} from '@/utils/assignedAdapters';
import {
  deriveAssignedStatus,
  runStatus,
  type AssignedExtras,
  type AssignedResponse,
} from '@/utils/assignedStatus';

const NOW = 1_000_000;

const row = (over: Partial<PeriodAccess> = {}): PeriodAccess => ({
  state: 'closed',
  openAt: null,
  closeAt: null,
  bellPeriodId: null,
  verified: true,
  label: 'P',
  ...over,
});

const loaded = (
  responses: AssignedResponse[] = [],
  needsGrading = 0
): AssignedExtras => ({ responses, needsGrading });

const base = { id: 'a1', teacherUid: 't1', createdAt: 100, updatedAt: 100 };

const va = (over: Partial<VideoActivityAssignment> = {}) =>
  ({
    ...base,
    activityId: 'v1',
    activityTitle: 'Volcanoes',
    activityDriveFileId: 'f1',
    status: 'active',
    ...over,
  }) as VideoActivityAssignment;
const gl = (over: Partial<GuidedLearningAssignment> = {}) =>
  ({
    ...base,
    setId: 's1',
    setTitle: 'Cell parts',
    sessionId: 'a1',
    status: 'active',
    ...over,
  });
const ma = (over: Partial<MiniAppAssignment> = {}) =>
  ({
    ...base,
    sessionId: 'sess1',
    appId: 'm1',
    appTitle: 'Fractions app',
    assignmentName: '',
    status: 'active',
    ...over,
  });
const fc = (over: Partial<FlashcardAssignment> = {}) =>
  ({
    ...base,
    sessionId: 'a1',
    setId: 's1',
    setTitle: 'Spanish verbs',
    kind: 'check',
    status: 'active',
    ...over,
  });
const wr = (over: Partial<WritingAssignmentRecord> = {}) =>
  ({
    ...base,
    sessionId: 'a1',
    itemId: 'w1',
    title: 'My summer',
    status: 'active',
    ...over,
  });

describe('runStatus', () => {
  it('reads every ended spelling as inactive', () => {
    expect(runStatus('active')).toBe('active');
    expect(runStatus('paused')).toBe('paused');
    for (const s of ['inactive', 'ended', 'archived'])
      expect(runStatus(s)).toBe('inactive');
  });
});

describe('Video Activity adapter', () => {
  it('counts every response as started and a completed one as submitted', () => {
    const input = videoActivityAssignedInput(
      va({ periodAccess: { c1: row({ state: 'open', label: 'P1' }) } }),
      loaded([
        videoActivityAssignedResponse({
          classId: 'c1',
          completedAt: 5,
        }),
        videoActivityAssignedResponse({
          classId: 'c1',
          completedAt: null,
        }),
      ])
    );
    expect(input.kind).toBe('video-activity');
    expect(input.title).toBe('Volcanoes');
    expect(input.classes[0]).toMatchObject({ started: 2, submitted: 1 });
  });

  it('D20: an ended assignment with no close mark is legacy Done', () => {
    const s = deriveAssignedStatus(
      videoActivityAssignedInput(va({ status: 'inactive' }), loaded([], 3)),
      NOW
    );
    expect(s.bucket).toBe('done');
    expect(s.legacyDone).toBe(true);
  });

  it('D16: a view-only share reads "Shared, view only" and is Done once closed', () => {
    const live = deriveAssignedStatus(
      videoActivityAssignedInput(va({ mode: 'view-only' }), loaded()),
      NOW
    );
    expect(live.line).toEqual({ kind: 'view-only', closed: false });
    const closed = deriveAssignedStatus(
      videoActivityAssignedInput(
        va({ mode: 'view-only', status: 'inactive', closedAt: 50 } as never),
        loaded()
      ),
      NOW
    );
    expect(closed.bucket).toBe('done');
    expect(closed.legacyDone).toBe(false);
  });

  it('D5: closed through the new tab with unpublished scores stays Active', () => {
    const s = deriveAssignedStatus(
      videoActivityAssignedInput(
        va({
          status: 'inactive',
          periodAccess: { c1: row({ closedAt: 50, label: 'P1' }) },
        }),
        loaded([{ classId: 'c1', started: true, submitted: true }])
      ),
      NOW
    );
    expect(s.bucket).toBe('active');
    expect(s.line.kind).toBe('scores-unpublished');
  });

  it('published scores make a closed assignment Done', () => {
    const s = deriveAssignedStatus(
      videoActivityAssignedInput(
        va({
          status: 'inactive',
          scoreVisibility: 'score-only',
          periodAccess: { c1: row({ closedAt: 50 }) },
        }),
        loaded([{ classId: 'c1', started: true, submitted: true }])
      ),
      NOW
    );
    expect(s.bucket).toBe('done');
  });
});

describe('Guided Learning adapter', () => {
  it('reads archived as ended and legacy Done', () => {
    const input = guidedLearningAssignedInput(
      gl({ status: 'archived' }),
      loaded()
    );
    expect(input.status).toBe('inactive');
    expect(deriveAssignedStatus(input, NOW).legacyDone).toBe(true);
  });

  it('reads assignmentMode view-only as a view-only share', () => {
    const input = guidedLearningAssignedInput(
      gl({ assignmentMode: 'view-only' }),
      loaded()
    );
    expect(input.viewOnly).toBe(true);
    expect(input.publishesScores).toBe(false);
  });

  it('counts a started response by class and completedAt as submitted', () => {
    const input = guidedLearningAssignedInput(
      gl({
        periodAccess: { c1: row({ label: 'P1' }), c2: row({ label: 'P2' }) },
      }),
      loaded([
        guidedLearningAssignedResponse({ classId: 'c1', completedAt: null }),
        guidedLearningAssignedResponse({ classPeriod: 'P2', completedAt: 9 }),
      ])
    );
    expect(input.classes.map((c) => [c.started, c.submitted])).toEqual([
      [1, 0],
      [1, 1],
    ]);
  });
});

describe('Mini App adapter', () => {
  it('titles by assignment name, else app title', () => {
    expect(miniAppAssignedInput(ma(), loaded()).title).toBe('Fractions app');
    expect(
      miniAppAssignedInput(ma({ assignmentName: 'Period 2 run' }), loaded())
        .title
    ).toBe('Period 2 run');
  });

  it('only results-version 2 runs publish scores', () => {
    expect(miniAppAssignedInput(ma(), loaded()).publishesScores).toBe(false);
    expect(
      miniAppAssignedInput(ma({ resultsVersion: 2 }), loaded()).publishesScores
    ).toBe(true);
  });

  it('only mode view-only is a view-only share, as the Mini App manager reads it', () => {
    expect(
      miniAppAssignedInput(ma({ submissionsEnabled: false }), loaded()).viewOnly
    ).toBe(false);
    expect(
      miniAppAssignedInput(ma({ mode: 'view-only' }), loaded()).viewOnly
    ).toBe(true);
    expect(
      miniAppAssignedInput(
        ma({ mode: 'submissions', submissionsEnabled: true }),
        loaded()
      ).viewOnly
    ).toBe(false);
  });

  it('a closed version-1 run with submissions is Done: nothing to publish', () => {
    const s = deriveAssignedStatus(
      miniAppAssignedInput(
        ma({ status: 'inactive', periodAccess: { c1: row({ closedAt: 50 }) } }),
        loaded([miniAppAssignedResponse('c1')])
      ),
      NOW
    );
    expect(s.bucket).toBe('done');
    expect(s.legacyDone).toBe(false);
  });
});

describe('Flashcards adapter', () => {
  it('reads ended as inactive', () => {
    expect(
      flashcardAssignedInput(fc({ status: 'ended' }), loaded()).status
    ).toBe('inactive');
  });

  it('a Study resource publishes no scores, so closing it makes it Done', () => {
    const s = deriveAssignedStatus(
      flashcardAssignedInput(
        fc({
          kind: 'study',
          status: 'ended',
          periodAccess: { c1: row({ closedAt: 50 }) },
        }),
        loaded([flashcardAssignedResponse({ classId: 'c1' })])
      ),
      NOW
    );
    expect(s.bucket).toBe('done');
  });

  it('a Check counts submittedAt as submitted and waits on published scores', () => {
    const input = flashcardAssignedInput(
      fc({ status: 'ended', periodAccess: { c1: row({ closedAt: 50 }) } }),
      loaded([
        flashcardAssignedResponse({ classId: 'c1', submittedAt: 9 }),
        flashcardAssignedResponse({ classId: 'c1' }),
      ])
    );
    expect(input.classes[0]).toMatchObject({ started: 2, submitted: 1 });
    expect(deriveAssignedStatus(input, NOW).line.kind).toBe(
      'scores-unpublished'
    );
  });
});

describe('Writing adapter', () => {
  it('counts turned-in and returned pieces, not drafts or revising ones', () => {
    const input = writingAssignedInput(
      wr({ periodAccess: { c1: row({ state: 'open' }) } }),
      { grading: { mode: 'points', points: 10 } },
      loaded(
        (['draft', 'turned-in', 'returned', 'revising'] as const).map(
          (status) => writingAssignedResponse({ classId: 'c1', status })
        )
      )
    );
    expect(input.classes[0]).toMatchObject({ started: 4, submitted: 2 });
  });

  it('an ungraded assignment publishes no scores', () => {
    const input = writingAssignedInput(
      wr(),
      { grading: { mode: 'ungraded' } },
      loaded()
    );
    expect(input.publishesScores).toBe(false);
  });

  it('reads published grades from the session', () => {
    const input = writingAssignedInput(
      wr(),
      { grading: { mode: 'points', points: 10 }, scorePublishedAt: 5 },
      loaded()
    );
    expect(input.scoresPublished).toBe(true);
  });

  it('keeps the row Active while the session loads', () => {
    const s = deriveAssignedStatus(
      writingAssignedInput(
        wr({ status: 'ended', periodAccess: { c1: row({ closedAt: 50 }) } }),
        null,
        loaded()
      ),
      NOW
    );
    expect(s.grading).toBe('unknown');
    expect(s.bucket).toBe('active');
  });
});
