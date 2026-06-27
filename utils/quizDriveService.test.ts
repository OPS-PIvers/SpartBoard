/**
 * Regression tests for quizDriveService stats deduplication.
 *
 * Bug (nightly/state-2026-06-27): The per-response `r.answers` loop in
 * `exportResultsToSheet`'s "Question Analysis" stats block did NOT filter
 * for first-occurrence per questionId before adding to `correctSet`. A
 * response with duplicate answers for the same questionId — where the
 * FIRST answer is wrong and a LATER duplicate is correct — would flip the
 * question into `correctSet`, inflating "# Correct" in the exported sheet.
 * The actual grader (and `buildResultsSheetDataShared`) both use
 * first-occurrence semantics, so the stats contradicted the published grade.
 *
 * Fix: add a `firstOccurrenceAnswers` Map that keeps only the first answer
 * per questionId before the `answeredSet`/`correctSet` loop, mirroring the
 * guard in `buildResultsSheetDataShared`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { QuizQuestion, QuizResponse } from '@/types';
import type { GradeResult } from '@/types';

// ── Minimal mocks needed to import the service ────────────────────────────────

vi.mock('@/hooks/useQuizSession', () => ({
  gradeAnswer: vi.fn(
    (
      question: { correctAnswer: string; type: string; points?: number },
      answer: string
    ): GradeResult => {
      const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
      const isCorrect = norm(question.correctAnswer) === norm(answer);
      const max = question.points ?? 1;
      return { isCorrect, pointsEarned: isCorrect ? max : 0, pointsMax: max };
    }
  ),
}));

vi.mock('@/utils/assignmentExportShared', async (importOriginal) => {
  // Use the REAL implementation so `buildResultsSheetData` (PLC path) is not
  // broken by this mock. We only need to mock the parts that would otherwise
  // pull in Firebase.
  const actual =
    await importOriginal<typeof import('@/utils/assignmentExportShared')>();
  return actual;
});

vi.mock('@/utils/logError', () => ({
  logError: vi.fn(),
}));

vi.mock('@/components/widgets/QuizWidget/utils/quizScoreboard', () => ({
  resolvePinName: vi.fn(
    (_map: Record<string, string>, _period: string | undefined, pin: string) =>
      `Student(${pin})`
  ),
}));

vi.mock('@/config/constants', () => ({
  APP_NAME: 'SpartBoard',
}));

vi.mock('./driveAuthErrors', () => ({
  authError: (msg: string) => new Error(msg),
}));

// ── Import the class under test after mocks are set up ───────────────────────
import { QuizDriveService } from './quizDriveService';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQuestion(
  id: string,
  correctAnswer: string,
  type: QuizQuestion['type'] = 'MC'
): QuizQuestion {
  return {
    id,
    timeLimit: 0,
    text: `Question ${id}`,
    type,
    correctAnswer,
    incorrectAnswers: ['wrong1', 'wrong2'],
    points: 1,
  };
}

function makeResponse(
  pin: string,
  answers: { questionId: string; answer: string }[]
): QuizResponse {
  return {
    studentUid: `uid-${pin}`,
    pin,
    joinedAt: Date.now(),
    status: 'completed',
    answers: answers.map((a) => ({
      questionId: a.questionId,
      answer: a.answer,
      answeredAt: Date.now(),
    })),
    score: null,
    submittedAt: Date.now(),
    tabSwitchWarnings: 0,
  };
}

/**
 * Capture the rows sent to the Sheets API create call.
 * `exportResultsToSheet` serialises all rows (header, data, stats) into
 * a single `rowData` array inside the POST body. We extract them here so
 * tests can assert on the Question Analysis section without going through
 * the network.
 */
function captureExportedRows(
  fetchMock: ReturnType<typeof vi.fn>
): string[][] | null {
  // Scan all fetch calls for the spreadsheet create POST (not values/append).
  for (const call of fetchMock.mock.calls) {
    const [url, init] = call as [string, RequestInit | undefined];
    if (
      typeof url === 'string' &&
      url.startsWith('https://sheets.googleapis.com/v4/spreadsheets') &&
      !url.includes('/values') &&
      init?.method === 'POST'
    ) {
      const body = JSON.parse(init.body as string) as {
        sheets?: {
          data?: {
            rowData?: {
              values: { userEnteredValue: { stringValue: string } }[];
            }[];
          }[];
        }[];
      };
      const rowData = body.sheets?.[0]?.data?.[0]?.rowData;
      if (!rowData) return null;
      return rowData.map((row) =>
        row.values.map((v) => v.userEnteredValue.stringValue)
      );
    }
  }
  return null;
}

/** Return the Question Analysis row for a given question id, or throw. */
function findAnalysisRow(rows: string[][], questionId: string): string[] {
  const row = rows.find(
    (r) => r.length >= 7 && r[0].startsWith(`Question ${questionId}`)
  );
  if (!row) throw new Error(`Analysis row for ${questionId} not found`);
  return row;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('exportResultsToSheet – Question Analysis deduplication', () => {
  let service: QuizDriveService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new QuizDriveService('fake-token');

    // Stub fetch to avoid real network calls. The create-spreadsheet call
    // must return a spreadsheetUrl; all other calls (folder list / file
    // create) return minimal valid JSON.
    fetchMock = vi.fn().mockImplementation((url: string) => {
      if (
        typeof url === 'string' &&
        url.startsWith('https://sheets.googleapis.com/v4/spreadsheets') &&
        !url.includes('/values')
      ) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              spreadsheetUrl:
                'https://docs.google.com/spreadsheets/d/fake-id/edit',
            }),
            { status: 200 }
          )
        );
      }
      // Drive folder/file calls — not needed for solo export but stubbed defensively
      return Promise.resolve(
        new Response(JSON.stringify({ files: [] }), { status: 200 })
      );
    });

    vi.stubGlobal('fetch', fetchMock);
  });

  it('REGRESSION: duplicate answer for same questionId uses first occurrence for correctSet — wrong then correct stays wrong', async () => {
    // Student submitted 'wrong' first, then a duplicate entry 'correct' for
    // the same question. Grading (first-occurrence) counts 'wrong'. The stats
    // block must agree: correctSet should NOT include this question.
    const q = makeQuestion('q1', 'correct');
    const response = makeResponse('001', [
      { questionId: 'q1', answer: 'wrong' }, // first occurrence — wrong
      { questionId: 'q1', answer: 'correct' }, // duplicate — correct, should be IGNORED
    ]);

    await service.exportResultsToSheet('Test Quiz', [response], [q]);

    const rows = captureExportedRows(fetchMock);
    expect(rows).not.toBeNull();
    const analysisRow = findAnalysisRow(rows ?? [], 'q1');

    // analysisRow: [questionText, type, points, correctAnswer, #Correct, #Answered, %Correct]
    const numAnswered = analysisRow[5]; // index 5 = "# Answered"
    const numCorrect = analysisRow[4]; // index 4 = "# Correct"
    const pctCorrect = analysisRow[6]; // index 6 = "% Correct"

    expect(numAnswered).toBe('1'); // question was answered
    expect(numCorrect).toBe('0'); // BUT first occurrence was wrong → not correct
    expect(pctCorrect).toBe('0%');
  });

  it('correct first occurrence is still counted as correct even when followed by a wrong duplicate', async () => {
    // Student submitted 'correct' first, then 'wrong' as a duplicate. The
    // first-occurrence rule means this student DID answer correctly.
    const q = makeQuestion('q1', 'correct');
    const response = makeResponse('001', [
      { questionId: 'q1', answer: 'correct' }, // first — correct
      { questionId: 'q1', answer: 'wrong' }, // duplicate — ignored
    ]);

    await service.exportResultsToSheet('Test Quiz', [response], [q]);

    const rows = captureExportedRows(fetchMock);
    expect(rows).not.toBeNull();
    const analysisRow = findAnalysisRow(rows ?? [], 'q1');

    const numAnswered = analysisRow[5];
    const numCorrect = analysisRow[4];
    const pctCorrect = analysisRow[6];

    expect(numAnswered).toBe('1');
    expect(numCorrect).toBe('1'); // first occurrence was correct → counted
    expect(pctCorrect).toBe('100%');
  });

  it('single non-duplicate correct answer is counted normally', async () => {
    const q = makeQuestion('q1', 'correct');
    const response = makeResponse('001', [
      { questionId: 'q1', answer: 'correct' },
    ]);

    await service.exportResultsToSheet('Test Quiz', [response], [q]);

    const rows = captureExportedRows(fetchMock);
    expect(rows).not.toBeNull();
    const analysisRow = findAnalysisRow(rows ?? [], 'q1');

    expect(analysisRow[4]).toBe('1'); // # Correct
    expect(analysisRow[5]).toBe('1'); // # Answered
    expect(analysisRow[6]).toBe('100%');
  });

  it('single non-duplicate wrong answer is counted as 0 correct', async () => {
    const q = makeQuestion('q1', 'correct');
    const response = makeResponse('001', [
      { questionId: 'q1', answer: 'wrong' },
    ]);

    await service.exportResultsToSheet('Test Quiz', [response], [q]);

    const rows = captureExportedRows(fetchMock);
    expect(rows).not.toBeNull();
    const analysisRow = findAnalysisRow(rows ?? [], 'q1');

    expect(analysisRow[4]).toBe('0'); // # Correct
    expect(analysisRow[5]).toBe('1'); // # Answered
    expect(analysisRow[6]).toBe('0%');
  });

  it('multiple students: each deduplicated independently', async () => {
    // Student A: first=wrong, dup=correct → should count as 0 correct
    // Student B: first=correct, no dup → should count as 1 correct
    // Total: 1/2 correct (50%)
    const q = makeQuestion('q1', 'correct');
    const studentA = makeResponse('A01', [
      { questionId: 'q1', answer: 'wrong' },
      { questionId: 'q1', answer: 'correct' }, // duplicate — ignored
    ]);
    const studentB = makeResponse('B01', [
      { questionId: 'q1', answer: 'correct' },
    ]);

    await service.exportResultsToSheet('Test Quiz', [studentA, studentB], [q]);

    const rows = captureExportedRows(fetchMock);
    expect(rows).not.toBeNull();
    const analysisRow = findAnalysisRow(rows ?? [], 'q1');

    expect(analysisRow[4]).toBe('1'); // # Correct (only B)
    expect(analysisRow[5]).toBe('2'); // # Answered (both A and B)
    expect(analysisRow[6]).toBe('50%');
  });
});
