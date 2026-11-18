import { describe, expect, it } from 'vitest';
import type { PeriodAccess, QuizAssignment, QuizResponse } from '@/types';
import {
  deriveAssignedStatus,
  quizAssignedInput,
  type AssignedStatus,
} from '@/utils/assignedStatus';
import {
  classActions,
  mainActionLabel,
  statusLineSegments,
} from './assignedWording';

const NOW = Date.UTC(2026, 10, 18, 16, 0);
const row = (
  label: string,
  over: Partial<PeriodAccess> = {}
): PeriodAccess => ({
  state: 'closed',
  openAt: null,
  closeAt: null,
  bellPeriodId: null,
  verified: true,
  label,
  ...over,
});
const quiz = (over: Partial<QuizAssignment>): QuizAssignment => ({
  id: 'a1',
  quizId: 'q1',
  quizTitle: 'Cells quiz',
  quizDriveFileId: 'f1',
  teacherUid: 't1',
  code: 'ABC',
  status: 'active',
  createdAt: 100,
  updatedAt: 100,
  sessionMode: 'student',
  sessionOptions: {},
  ...over,
});
const done = (classId: string) =>
  ({ classId, status: 'completed' }) as Pick<
    QuizResponse,
    'status' | 'classId' | 'classPeriod'
  >;
const derive = (
  a: Partial<QuizAssignment>,
  extras: {
    responses?: ReturnType<typeof done>[];
    needsGrading?: number;
    sizes?: Record<string, number>;
  } = {}
): AssignedStatus =>
  deriveAssignedStatus(
    quizAssignedInput(quiz(a), {
      responses: extras.responses ?? [],
      needsGrading: extras.needsGrading ?? 0,
      classSizes: extras.sizes,
    }),
    NOW
  );
const line = (s: AssignedStatus) =>
  statusLineSegments(s, NOW)
    .map((x, i) => (i === 0 ? '' : x.glued ? ' ' : ' · ') + x.text)
    .join('');

const three = {
  P1: row('P1', { closedAt: NOW - 1000 }),
  P2: row('P2', { state: 'open' }),
  P5: row('P5'),
};

describe('statusLineSegments', () => {
  it('names the open class with its count and the classes to go', () => {
    const s = derive(
      { periodAccess: three },
      { responses: [done('P2'), done('P2')], sizes: { P2: 27 } }
    );
    expect(line(s)).toBe('Open for P2 2 of 27 turned in · 1 class to go');
    expect(statusLineSegments(s, NOW)[0].tone).toBe('open');
  });

  it('reads Ready for every class before any opens', () => {
    const s = derive({
      status: 'paused',
      periodAccess: { P1: row('P1'), P2: row('P2'), P5: row('P5') },
    });
    expect(line(s)).toBe('Ready for 3 classes');
    expect(mainActionLabel(s.action, 0)).toBe('Choose class');
  });

  it('drops the class name on a single line (D15)', () => {
    const s = derive({ status: 'active' }, { responses: [done('')] });
    expect(line(s)).toBe('Open 1 turned in');
    expect(mainActionLabel(s.action, 0)).toBe('Monitor');
  });

  it('reads Needs grading once every class is closed', () => {
    const s = derive(
      {
        status: 'inactive',
        periodAccess: {
          P1: row('P1', { closedAt: 1 }),
          P2: row('P2', { closedAt: 2 }),
        },
      },
      { responses: [done('P1')], needsGrading: 3 }
    );
    expect(line(s)).toBe('Needs grading');
    expect(mainActionLabel(s.action, 3)).toBe('Grade (3)');
  });

  it('reads Scores not published, then Publish scores', () => {
    const s = derive(
      {
        status: 'inactive',
        periodAccess: {
          P1: row('P1', { closedAt: 1 }),
          P2: row('P2', { closedAt: 2 }),
        },
      },
      { responses: [done('P1')] }
    );
    expect(line(s)).toBe('Scores not published');
    expect(mainActionLabel(s.action, 0)).toBe('Publish scores');
  });

  it('shows an old ended quiz as Closed in Done', () => {
    const s = derive({ status: 'inactive' });
    expect(s.bucket).toBe('done');
    expect(line(s)).toBe('Closed');
  });

  it('reads Shared, view only for a share', () => {
    expect(line(derive({ mode: 'view-only' }))).toBe('Shared, view only');
  });
});

describe('classActions', () => {
  it('offers the D6 actions per class status', () => {
    expect(classActions('open')).toEqual(['pause', 'close', 'monitor']);
    expect(classActions('paused')).toEqual(['resume', 'close']);
    expect(classActions('closed')).toEqual(['reopen']);
    expect(classActions('ready')).toEqual(['open']);
    expect(classActions('scheduled')).toEqual(['open']);
  });
});
