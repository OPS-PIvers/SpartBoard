import { describe, expect, it } from 'vitest';
import type { PeriodAccess, QuizAssignment, QuizResponse } from '@/types';
import {
  deriveAssignedStatus,
  quizAssignedInput,
  type AssignedStatus,
} from '@/utils/assignedStatus';
import {
  accessBadge,
  classActions,
  classBadge,
  classDetailText,
  detailText,
  mainActionLabel,
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
const three = {
  P1: row('P1', { closedAt: NOW - 1000 }),
  P2: row('P2', { state: 'open' }),
  P5: row('P5'),
};

describe('accessBadge and detailText', () => {
  it('names the open class, with its count and the classes to go as grey text', () => {
    const s = derive(
      { periodAccess: three },
      { responses: [done('P2'), done('P2')], sizes: { P2: 27 } }
    );
    expect(accessBadge(s)).toEqual({
      label: 'Open · P2',
      tone: 'success',
      dot: true,
    });
    expect(detailText(s, NOW)).toBe('2 of 27 submitted · 1 class to go');
    expect(detailText(s, NOW, false)).toBe('1 class to go');
  });

  it('reads Ready before any class opens', () => {
    const s = derive({
      status: 'paused',
      periodAccess: { P1: row('P1'), P2: row('P2'), P5: row('P5') },
    });
    expect(accessBadge(s)?.label).toBe('Ready');
    expect(detailText(s, NOW)).toBe('3 classes');
    expect(mainActionLabel(s.action, 0)).toBe('Choose class');
  });

  it('drops the class name on a single line (D15)', () => {
    const s = derive({ status: 'active' }, { responses: [done('')] });
    expect(accessBadge(s)?.label).toBe('Open');
    expect(detailText(s, NOW)).toBe('1 submitted');
    expect(mainActionLabel(s.action, 0)).toBe('Monitor');
  });

  it('keeps grading out of the status word once every class is closed', () => {
    const s = derive(
      {
        status: 'inactive',
        closedAt: NOW - 1000,
        periodAccess: { P1: row('P1', { closedAt: NOW - 1000 }) },
      },
      { responses: [done('P1')], needsGrading: 3 }
    );
    expect(accessBadge(s)).toEqual({ label: 'Closed', tone: 'neutral' });
    expect(detailText(s, NOW)).toBe('3 to grade');
    expect(mainActionLabel(s.action, 3)).toBe('Grade (3)');
  });

  it('gives a Finished row the same Closed word its classes show', () => {
    const s = derive({ status: 'inactive' });
    expect(s.bucket).toBe('done');
    expect(accessBadge(s)).toEqual({ label: 'Closed', tone: 'neutral' });
    expect(detailText(s, NOW)).toBe('');
  });

  it('reads View only for a share', () => {
    expect(detailText(derive({ mode: 'view-only' }), NOW)).toBe('View only');
  });

  it('describes one class without its status word', () => {
    const s = derive(
      { periodAccess: three },
      { responses: [done('P2')], sizes: { P2: 27 } }
    );
    const [p1, p2, p5] = s.classes;
    expect(classBadge(p2)).toEqual({
      label: 'Open',
      tone: 'success',
      dot: true,
    });
    expect(classDetailText(p2, NOW, null)).toBe('1 of 27 submitted');
    expect(classBadge(p1).label).toBe('Closed');
    expect(classBadge(p5).label).toBe('Ready');
    expect(classDetailText(p5, NOW, '9:55 to 10:40')).toBe('9:55 to 10:40');
  });
});

describe('classActions', () => {
  it('offers the D6 actions per class status', () => {
    expect(classActions('open')).toEqual(['pause', 'close']);
    expect(classActions('paused')).toEqual(['resume', 'close']);
    expect(classActions('closed')).toEqual(['reopen']);
    expect(classActions('ready')).toEqual(['open']);
    expect(classActions('scheduled')).toEqual(['open']);
  });
});
