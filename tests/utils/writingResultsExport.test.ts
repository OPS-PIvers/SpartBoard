import { describe, expect, it, vi } from 'vitest';
import type { WritingResponse } from '@/types';

const exportResultsToSheet = vi.fn((..._args: unknown[]) =>
  Promise.resolve('https://sheet')
);
vi.mock('@/utils/quizDriveService', () => ({
  QuizDriveService: class {
    exportResultsToSheet = exportResultsToSheet;
  },
}));

import { buildResultsSheetData } from '@/utils/assignmentExportShared';
import type { QuizQuestion } from '@/types';
import {
  exportWritingResults,
  WRITING_PIECE_ID,
  writingSheetGrade,
  writingSheetResponses,
} from '@/utils/writingResultsExport';

const response = (extra: Partial<WritingResponse>): WritingResponse =>
  ({
    studentUid: 'uid-1',
    classId: 'c1',
    html: '',
    summary: { wordCount: 120, savedAt: 0, writingMs: 0, sessions: 1 },
    status: 'draft',
    saveCount: 1,
    tabId: 't',
    logChunk: 0,
    startedAt: 0,
    draftCount: 0,
    updatedAt: 0,
    ...extra,
  }) as WritingResponse;

const piece = [
  { id: WRITING_PIECE_ID, text: 'Essay', points: 20 },
] as QuizQuestion[];

const sheet = (responses: WritingResponse[], graded = true) =>
  buildResultsSheetData(
    writingSheetResponses(responses, graded),
    graded ? piece : [],
    writingSheetGrade,
    {
      byStudentUid: new Map([
        ['uid-1', { givenName: 'Ada', familyName: 'Lovelace' }],
      ]),
    }
  );

const cell = (
  out: { headers: string[]; dataRows: string[][] },
  header: string
) => out.dataRows[0][out.headers.indexOf(header)];

describe('Writing results on the shared sheet builder', () => {
  it('exports a returned score as points and a percent', () => {
    const out = sheet([
      response({
        status: 'returned',
        turnedInAt: 5,
        grade: {
          draftId: 'd1',
          draftNumber: 1,
          pointsAwarded: 18,
          maxPoints: 20,
          gradedAt: 9,
        },
      }),
    ]);
    expect(cell(out, 'Student')).toBe('Lovelace, Ada');
    expect(cell(out, 'Status')).toBe('completed');
    expect(cell(out, 'Score (%)')).toBe('90%');
    expect(cell(out, 'Q1 (20pt): Essay')).toBe('18');
  });

  it('marks turned-in work with no score as Ungraded', () => {
    const out = sheet([response({ status: 'turned-in', turnedInAt: 5 })]);
    expect(cell(out, 'Q1 (20pt): Essay')).toBe('Ungraded');
    expect(cell(out, 'Score (%)')).toBe('0% (provisional)');
  });

  it('leaves an excused piece out of the total', () => {
    const out = sheet([
      response({
        status: 'returned',
        grade: { draftId: 'd1', draftNumber: 1, excused: true, gradedAt: 9 },
      }),
    ]);
    expect(cell(out, 'Q1 (20pt): Essay')).toBe('');
    expect(cell(out, 'Max Points')).toBe('0');
  });

  it('leaves the cell blank while the student is still writing', () => {
    const out = sheet([response({ status: 'draft' })]);
    expect(cell(out, 'Status')).toBe('in-progress');
    expect(cell(out, 'Q1 (20pt): Essay')).toBe('');
  });

  it('has no score column when the assignment is ungraded', () => {
    const out = sheet([response({ status: 'turned-in' })], false);
    expect(out.headers.some((h) => h.startsWith('Q1'))).toBe(false);
  });

  it('exports through the Quiz sheet exporter with a Words column', async () => {
    const r = response({ status: 'turned-in' });
    await exportWritingResults('tok', 'Essay', [r], 20);
    const [title, responses, questions, options] = exportResultsToSheet.mock
      .calls[0] as [
      string,
      unknown[],
      QuizQuestion[],
      {
        gradeFn: unknown;
        extraColumn: { header: string; cell: (r: unknown) => string };
      },
    ];
    expect(title).toBe('Essay');
    expect(questions[0].points).toBe(20);
    expect(options.gradeFn).toBe(writingSheetGrade);
    expect(options.extraColumn.header).toBe('Words');
    expect(options.extraColumn.cell(responses[0])).toBe('120');
  });
});
