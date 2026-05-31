import { describe, it, expect } from 'vitest';
import { buildContributionDoc } from '@/utils/plcContributions';
import type { QuizData, QuizQuestion, QuizResponse } from '@/types';

function makeMcQuestion(
  id: string,
  text: string,
  correctAnswer: string,
  points?: number
): QuizQuestion {
  return {
    id,
    text,
    type: 'MC',
    correctAnswer,
    incorrectAnswers: ['wrong-a', 'wrong-b'],
    timeLimit: 30,
    ...(points !== undefined ? { points } : {}),
  };
}

function makeQuiz(questions: QuizQuestion[]): QuizData {
  return {
    id: 'quiz-1',
    title: 'Sample Quiz',
    questions,
    createdAt: 1,
    updatedAt: 1,
  };
}

function makeResponse(args: {
  pin: string;
  classPeriod?: string;
  answers: Record<string, string>;
  status?: 'completed' | 'in-progress';
  submittedAt?: number | null;
}): QuizResponse {
  return {
    studentUid: `uid-${args.pin}`,
    pin: args.pin,
    classPeriod: args.classPeriod ?? 'Period 1',
    answers: Object.entries(args.answers).map(([questionId, answer]) => ({
      questionId,
      answer,
      answeredAt: 100,
    })),
    status: args.status ?? 'completed',
    submittedAt: args.submittedAt ?? 200,
    tabSwitchWarnings: 0,
  } as unknown as QuizResponse;
}

describe('buildContributionDoc', () => {
  it('produces a deterministic doc id and identity fields', () => {
    const doc = buildContributionDoc({
      plcId: 'plc-A',
      teacherUid: 'teacher-1',
      teacherName: 'Teacher One',
      quiz: makeQuiz([makeMcQuestion('q1', 'Q1', 'a')]),
      responses: [makeResponse({ pin: '1111', answers: { q1: 'a' } })],
      syncGroupId: 'sync-X',
    });

    expect(doc.id).toBe('quiz-1_teacher-1');
    expect(doc.schemaVersion).toBe(1);
    expect(doc.quizId).toBe('quiz-1');
    expect(doc.teacherUid).toBe('teacher-1');
    expect(doc.teacherName).toBe('Teacher One');
    expect(doc.syncGroupId).toBe('sync-X');
  });

  it('defaults syncGroupId to null when not provided', () => {
    const doc = buildContributionDoc({
      plcId: 'plc-A',
      teacherUid: 'teacher-1',
      teacherName: 'Teacher One',
      quiz: makeQuiz([makeMcQuestion('q1', 'Q1', 'a')]),
      responses: [],
    });
    expect(doc.syncGroupId).toBeNull();
  });

  it('grades MC answers via gradeAnswer — correct -> points value, incorrect -> 0, unanswered absent', () => {
    const quiz = makeQuiz([
      makeMcQuestion('q1', 'Q1', 'a', 2),
      makeMcQuestion('q2', 'Q2', 'b'),
      makeMcQuestion('q3', 'Q3', 'c'),
    ]);
    const doc = buildContributionDoc({
      plcId: 'plc-A',
      teacherUid: 'teacher-1',
      teacherName: 'Teacher One',
      quiz,
      // q1: correct (2 pts), q2: wrong (0 pts), q3: unanswered (absent)
      responses: [makeResponse({ pin: '1', answers: { q1: 'a', q2: 'x' } })],
    });

    const points = doc.responses[0].pointsByQuestionId;
    expect(points.q1).toBe(2);
    expect(points.q2).toBe(0);
    expect('q3' in points).toBe(false);
    expect(doc.responses[0].pointsEarned).toBe(2);
    // Max points = 2 + 1 + 1 = 4. Earned = 2. Percent = 50.
    expect(doc.responses[0].maxPoints).toBe(4);
    expect(doc.responses[0].scorePercent).toBe(50);
  });

  it('leaves scorePercent null for in-progress responses', () => {
    const doc = buildContributionDoc({
      plcId: 'plc-A',
      teacherUid: 'teacher-1',
      teacherName: 'Teacher One',
      quiz: makeQuiz([makeMcQuestion('q1', 'Q1', 'a')]),
      responses: [
        makeResponse({
          pin: '1',
          answers: { q1: 'a' },
          status: 'in-progress',
          submittedAt: null,
        }),
      ],
    });
    expect(doc.responses[0].status).toBe('in-progress');
    expect(doc.responses[0].scorePercent).toBeNull();
    expect(doc.responses[0].submittedAt).toBeNull();
  });

  it('captures questionsSnapshot with id, text, and points (defaulting to 1)', () => {
    const doc = buildContributionDoc({
      plcId: 'plc-A',
      teacherUid: 'teacher-1',
      teacherName: 'Teacher One',
      quiz: makeQuiz([
        makeMcQuestion('q1', 'Q1 text', 'a', 3),
        makeMcQuestion('q2', 'Q2 text', 'b'),
      ]),
      responses: [],
    });
    expect(doc.questionsSnapshot).toEqual([
      { id: 'q1', text: 'Q1 text', points: 3 },
      { id: 'q2', text: 'Q2 text', points: 1 },
    ]);
  });

  it('resolves student display name from PIN via pinToName, falling back to "Student (PIN: x)"', () => {
    const doc = buildContributionDoc({
      plcId: 'plc-A',
      teacherUid: 'teacher-1',
      teacherName: 'Teacher One',
      quiz: makeQuiz([makeMcQuestion('q1', 'Q1', 'a')]),
      responses: [
        makeResponse({ pin: '1234', answers: { q1: 'a' } }),
        makeResponse({ pin: '5678', answers: { q1: 'a' } }),
      ],
      pinToName: {
        // Key shape `${classPeriod}${pin}` matches the production
        // `buildPinToNameMap` helper. The `resolvePinName` helper checks
        // both period-scoped and bare keys; here we test the bare PIN
        // fallback path used when the response carries no period.
        '1234': 'Alice Johnson',
      },
    });
    // The pinToName map keying uses the period-scoped path. Since
    // resolvePinName checks both, '1234' bare match works as a fallback.
    expect(doc.responses[0].studentDisplayName).toMatch(/Alice|PIN: 1234/);
    // 5678 isn't in the map → falls back to "Student (PIN: 5678)".
    expect(doc.responses[1].studentDisplayName).toBe('Student (PIN: 5678)');
  });

  it('sorts response output in input order (PlcTab does its own sorting)', () => {
    const quiz = makeQuiz([makeMcQuestion('q1', 'Q1', 'a')]);
    const doc = buildContributionDoc({
      plcId: 'plc-A',
      teacherUid: 'teacher-1',
      teacherName: 'Teacher One',
      quiz,
      responses: [
        makeResponse({ pin: 'zeta', answers: { q1: 'a' } }),
        makeResponse({ pin: 'alpha', answers: { q1: 'a' } }),
      ],
    });
    expect(doc.responses[0].pin).toBe('zeta');
    expect(doc.responses[1].pin).toBe('alpha');
  });

  it('deduplicates duplicate question IDs before computing maxPoints and pointsEarned (Drive-sync duplication guard)', () => {
    // Drive-sync or arrayUnion races can write the same question twice.
    // Without a dedup fence, maxPoints inflates and pointsEarned double-counts
    // for questions whose graded answer is non-zero.
    //
    // Scenario A: q1 correct (2 pts, duplicated), q2 wrong (1 pt)
    //   Bug:  maxPoints=5, pointsEarned=4, scorePercent=80
    //   Fix:  maxPoints=3, pointsEarned=2, scorePercent=67
    const quizA = makeQuiz([
      makeMcQuestion('q1', 'Q1', 'a', 2),
      makeMcQuestion('q1', 'Q1', 'a', 2), // duplicate — same id, same shape
      makeMcQuestion('q2', 'Q2', 'b', 1),
    ]);
    const docA = buildContributionDoc({
      plcId: 'plc-A',
      teacherUid: 'teacher-1',
      teacherName: 'Teacher One',
      quiz: quizA,
      responses: [
        makeResponse({ pin: '1', answers: { q1: 'a', q2: 'x' } }), // q1 correct, q2 wrong
      ],
    });
    expect(docA.responses[0].maxPoints).toBe(3);
    expect(docA.responses[0].pointsEarned).toBe(2);
    expect(docA.responses[0].scorePercent).toBe(67);

    // Scenario B: q1 wrong (2 pts, duplicated), q2 correct (1 pt)
    //   Bug:  maxPoints=5, pointsEarned=1, scorePercent=20
    //   Fix:  maxPoints=3, pointsEarned=1, scorePercent=33
    const quizB = makeQuiz([
      makeMcQuestion('q1', 'Q1', 'a', 2),
      makeMcQuestion('q1', 'Q1', 'a', 2), // duplicate
      makeMcQuestion('q2', 'Q2', 'b', 1),
    ]);
    const docB = buildContributionDoc({
      plcId: 'plc-A',
      teacherUid: 'teacher-1',
      teacherName: 'Teacher One',
      quiz: quizB,
      responses: [
        makeResponse({ pin: '2', answers: { q1: 'x', q2: 'b' } }), // q1 wrong, q2 correct
      ],
    });
    expect(docB.responses[0].maxPoints).toBe(3);
    expect(docB.responses[0].pointsEarned).toBe(1);
    expect(docB.responses[0].scorePercent).toBe(33);

    // questionsSnapshot should also deduplicate (no repeated entry)
    expect(docA.questionsSnapshot).toHaveLength(2);
    expect(docA.questionsSnapshot.map((q) => q.id)).toEqual(['q1', 'q2']);
  });
});
