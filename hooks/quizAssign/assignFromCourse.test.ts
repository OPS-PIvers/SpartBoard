import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { QuizData, QuizQuestion } from '@/types';
import { saveAttemptPolicy } from '@/hooks/gradebook/useGradebookColumnWrites';
import { EMPTY_ASSIGN_TARGETING_VALUE } from '@/utils/studentTargetRef';
import {
  assignFromCourse,
  type AssignFromCourseDeps,
} from './assignFromCourse';

vi.mock('@/hooks/gradebook/useGradebookColumnWrites', () => ({
  saveAttemptPolicy: vi.fn().mockResolvedValue(undefined),
}));

const question: QuizQuestion = {
  id: 'q1',
  type: 'MC',
  text: 'Two plus two?',
  correctAnswer: '4',
  incorrectAnswers: ['3', '5'],
  points: 2,
  timeLimit: 0,
};

const data: QuizData = {
  id: 'quiz-1',
  title: 'Sums',
  questions: [question],
  createdAt: 0,
  updatedAt: 0,
};

function makeDeps() {
  const deps = {
    loadBankContentsForQuiz: vi.fn().mockResolvedValue(new Map()),
    saveDriveSnapshot: vi.fn().mockResolvedValue('frozen-file'),
    createAssignment: vi
      .fn<AssignFromCourseDeps['createAssignment']>()
      .mockResolvedValue({ id: 'assignment-1', code: 'ABC123' }),
    setAssignmentTargets: vi.fn(),
    setAssignmentTargetSkippedCount: vi.fn(),
  } satisfies AssignFromCourseDeps;
  return deps;
}

function run(
  deps: AssignFromCourseDeps,
  behavior: Parameters<typeof assignFromCourse>[0]['behavior']
) {
  return assignFromCourse({
    uid: 'teacher-1',
    meta: { id: 'quiz-1', title: 'Sums', driveFileId: 'live-file' },
    data,
    behavior,
    targeting: EMPTY_ASSIGN_TARGETING_VALUE,
    dueAt: 5_000,
    rosters: [],
    linkedRosterIds: [],
    course: {
      className: 'Schoology',
      classIds: ['schoology:sec-1'],
      rosterIds: [],
      periodNames: ['Period 2'],
      classPeriodByClassId: { 'schoology:sec-1': 'Period 2' },
    },
    teacherName: 'Ms. Lee',
    plcLinkage: undefined,
    plcPoolSyncGroupId: undefined,
    deps,
    notify: vi.fn(),
    logScope: 'test',
  });
}

describe('assignFromCourse', () => {
  beforeEach(() => vi.mocked(saveAttemptPolicy).mockClear());

  it('creates an open assignment with the Quiz widget fields', async () => {
    const deps = makeDeps();
    const result = await run(deps, {
      sessionMode: 'student',
      sessionOptions: {},
      attemptLimit: 1,
    });
    expect(result).toEqual({
      assignmentId: 'assignment-1',
      code: 'ABC123',
      maxPoints: 2,
    });
    const [quizRef, settings, options] = deps.createAssignment.mock
      .calls[0] as unknown[];
    expect(quizRef).toMatchObject({ id: 'quiz-1', driveFileId: 'live-file' });
    expect(settings).toMatchObject({
      className: 'Schoology',
      sessionMode: 'student',
      dueAt: 5_000,
      dueAtHasTime: true,
      periodNames: ['Period 2'],
      teacherName: 'Ms. Lee',
      frozenDriveFileId: 'frozen-file',
    });
    expect(options).toMatchObject({
      initialStatus: 'active',
      classIds: ['schoology:sec-1'],
      classPeriodByClassId: { 'schoology:sec-1': 'Period 2' },
      lenientTranslatedFib: true,
    });
    expect(deps.setAssignmentTargets).not.toHaveBeenCalled();
    expect(saveAttemptPolicy).not.toHaveBeenCalled();
  });

  it('saves the Final score the teacher picked', async () => {
    const deps = makeDeps();
    await run(deps, {
      sessionMode: 'student',
      sessionOptions: {},
      attemptLimit: 3,
      finalScore: 'highest',
    });
    expect(saveAttemptPolicy).toHaveBeenCalledWith(
      'teacher-1',
      'assignment-1',
      'quiz',
      'highest'
    );
  });
});
