import { describe, it, expect } from 'vitest';
import { buildVideoActivityResultsSheetData } from '@/utils/videoActivityDriveService';
import type { VideoActivityQuestion, VideoActivityResponse } from '@/types';

function vaQuestion(
  overrides: Partial<VideoActivityQuestion> = {}
): VideoActivityQuestion {
  return {
    id: 'q1',
    text: 'What organelle?',
    timestamp: 30,
    timeLimit: 30,
    type: 'MC',
    correctAnswer: 'mitochondria',
    incorrectAnswers: [],
    points: 1,
    ...overrides,
  };
}

function vaResponse(
  overrides: Partial<VideoActivityResponse> = {}
): VideoActivityResponse {
  return {
    pin: '01',
    studentUid: 'student-1',
    classPeriod: 'Period 1',
    joinedAt: 1700000000000,
    answers: [
      { questionId: 'q1', answer: 'mitochondria', answeredAt: 1700000000500 },
    ],
    score: null,
    completedAt: 1700000001000,
    tabSwitchWarnings: 0,
    ...overrides,
  };
}

describe('buildVideoActivityResultsSheetData', () => {
  it('grades MA questions correctly (PR2a TODO fix)', () => {
    // The Quiz grader has no 'MA' case and would award 0 points.
    // VA's grader (gradeVideoActivityAnswer) handles set-equality, so a
    // student who picked exactly the correct selections gets full points.
    const ma = vaQuestion({
      id: 'q-ma',
      type: 'MA',
      correctAnswer: 'a|b|c',
      incorrectAnswers: ['d'],
      points: 3,
    });
    const r = vaResponse({
      answers: [
        { questionId: 'q-ma', answer: 'a|b|c', answeredAt: 1700000000500 },
      ],
    });
    const { dataRows } = buildVideoActivityResultsSheetData([r], [ma]);
    // Points Earned at index 7 — 3 points awarded, NOT 0
    expect(dataRows[0][7]).toBe('3');
    // Score column at index 6
    expect(dataRows[0][6]).toBe('100%');
  });

  it('grades FIB with acceptableVariants', () => {
    const fib = vaQuestion({
      type: 'FIB',
      correctAnswer: 'colour',
      acceptableVariants: ['color'],
    });
    const r = vaResponse({
      answers: [{ questionId: 'q1', answer: 'color', answeredAt: 1 }],
    });
    const { dataRows } = buildVideoActivityResultsSheetData([r], [fib]);
    expect(dataRows[0][7]).toBe('1');
  });

  it('maps completedAt → status column "completed"', () => {
    const r = vaResponse({ completedAt: 1700000001000 });
    const { dataRows } = buildVideoActivityResultsSheetData(
      [r],
      [vaQuestion()]
    );
    // Status column at index 5
    expect(dataRows[0][5]).toBe('completed');
  });

  it('maps null completedAt → status "in-progress" with empty score', () => {
    const r = vaResponse({ completedAt: null });
    const { dataRows } = buildVideoActivityResultsSheetData(
      [r],
      [vaQuestion()]
    );
    expect(dataRows[0][5]).toBe('in-progress');
    expect(dataRows[0][6]).toBe(''); // score blank for in-progress
  });

  it('treats completedAt: 0 as completed (explicit null check)', () => {
    // The type allows `number | null`; a truthiness check would misclassify
    // `0` (Jan 1 1970 timestamp) as in-progress.
    const r = vaResponse({ completedAt: 0 });
    const { dataRows } = buildVideoActivityResultsSheetData(
      [r],
      [vaQuestion()]
    );
    expect(dataRows[0][5]).toBe('completed');
  });

  it('preserves the canonical 12-column shape', () => {
    const { headers } = buildVideoActivityResultsSheetData(
      [vaResponse()],
      [vaQuestion({ id: 'q1', text: 'Q1', points: 1 })]
    );
    expect(headers).toHaveLength(12); // 11 fixed + 1 question column
    expect(headers[0]).toBe('Timestamp');
    expect(headers[10]).toBe('Submitted At');
  });

  it('marks never-asked live questions "Not asked" and drops them from max points', () => {
    const q1 = vaQuestion({ id: 'q1', points: 2 });
    const q2 = vaQuestion({ id: 'q2', points: 3 });
    const q3 = vaQuestion({ id: 'q3', points: 1 });
    const r = vaResponse({
      answers: [{ questionId: 'q1', answer: 'mitochondria', answeredAt: 1 }],
    });
    const { headers, dataRows } = buildVideoActivityResultsSheetData(
      [r],
      [q1, q2, q3],
      { notAskedQuestionIds: ['q2'] }
    );
    expect(headers).toHaveLength(14);
    // Max Points at index 8: q1 + q3; asked-but-missed q3 counts, q2 does not.
    expect(dataRows[0][8]).toBe('3');
    expect(dataRows[0][6]).toBe('67%');
    expect(dataRows[0].slice(11)).toEqual(['2', 'Not asked', '']);
  });

  it('leaves the sheet unchanged when no question is marked not asked', () => {
    const responses = [vaResponse()];
    const questions = [vaQuestion(), vaQuestion({ id: 'q2' })];
    const plain = buildVideoActivityResultsSheetData(responses, questions);
    const empty = buildVideoActivityResultsSheetData(responses, questions, {
      notAskedQuestionIds: [],
    });
    expect(empty.headers).toEqual(plain.headers);
    expect(empty.dataRows.map((r) => r.slice(1))).toEqual(
      plain.dataRows.map((r) => r.slice(1))
    );
  });
});
