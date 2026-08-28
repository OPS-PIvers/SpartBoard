import { describe, it, expect } from 'vitest';
import {
  buildResultsSheetData,
  type ExportableQuestion,
  type ExportableResponse,
} from '@/utils/assignmentExportShared';
import type { Rubric, GradeResult } from '@/types';

const rubric: Rubric = {
  id: 'r1',
  title: 'Essay Rubric',
  createdAt: 0,
  updatedAt: 0,
  criteria: [
    {
      id: 'crit-thesis',
      name: 'Thesis',
      levels: [
        { id: 'lvl-below', label: 'Below', points: 1 },
        { id: 'lvl-meets', label: 'Meets', points: 3 },
      ],
    },
    {
      id: 'crit-evidence',
      name: 'Evidence',
      levels: [
        { id: 'lvl-e-below', label: 'Below', points: 1 },
        { id: 'lvl-e-meets', label: 'Meets', points: 3 },
      ],
    },
  ],
};

const gradeFn = (
  question: ExportableQuestion,
  answer: string
): GradeResult => ({
  isCorrect: false,
  pointsEarned: answer ? (question.points ?? 1) : 0,
  pointsMax: question.points ?? 1,
});

function makeResponse(
  overrides: Partial<ExportableResponse>
): ExportableResponse {
  return {
    studentUid: 'u1',
    answers: [],
    status: 'completed',
    submittedAt: Date.now(),
    ...overrides,
  };
}

describe('buildResultsSheetData rubric columns', () => {
  it('emits no extra columns for a question without a rubric', () => {
    const questions: ExportableQuestion[] = [
      { id: 'q1', text: 'Essay', points: 4 },
    ];
    const responses = [
      makeResponse({ answers: [{ questionId: 'q1', answer: 'text' }] }),
    ];
    const { headers } = buildResultsSheetData(responses, questions, gradeFn);
    expect(headers.some((h) => h.includes('Rubric'))).toBe(false);
  });

  it('emits criterion columns with correct labels and values when scored', () => {
    const questions: ExportableQuestion[] = [
      { id: 'q1', text: 'Essay', points: 6, rubricSnapshot: rubric },
    ];
    const responses = [
      makeResponse({
        studentUid: 'u1',
        answers: [{ questionId: 'q1', answer: 'text' }],
        grading: {
          q1: {
            rubricScores: [
              { criterionId: 'crit-thesis', levelId: 'lvl-meets', points: 3 },
              {
                criterionId: 'crit-evidence',
                levelId: 'lvl-e-below',
                points: 1,
              },
            ],
          },
        },
      }),
    ];
    const { headers, dataRows } = buildResultsSheetData(
      responses,
      questions,
      gradeFn
    );
    expect(headers).toContain('Q1 Rubric - Thesis');
    expect(headers).toContain('Q1 Rubric - Thesis Points');
    expect(headers).toContain('Q1 Rubric - Evidence');
    expect(headers).toContain('Q1 Rubric - Evidence Points');

    const thesisIdx = headers.indexOf('Q1 Rubric - Thesis');
    const thesisPtsIdx = headers.indexOf('Q1 Rubric - Thesis Points');
    const evidenceIdx = headers.indexOf('Q1 Rubric - Evidence');
    const evidencePtsIdx = headers.indexOf('Q1 Rubric - Evidence Points');
    expect(dataRows[0][thesisIdx]).toBe('Meets');
    expect(dataRows[0][thesisPtsIdx]).toBe('3');
    expect(dataRows[0][evidenceIdx]).toBe('Below');
    expect(dataRows[0][evidencePtsIdx]).toBe('1');
  });

  it('leaves rubric cells empty for unscored responses while others fill in', () => {
    const questions: ExportableQuestion[] = [
      { id: 'q1', text: 'Essay', points: 6, rubricSnapshot: rubric },
    ];
    const responses = [
      makeResponse({
        studentUid: 'u1',
        pin: '1111',
        answers: [{ questionId: 'q1', answer: 'text' }],
        grading: {
          q1: {
            rubricScores: [
              { criterionId: 'crit-thesis', levelId: 'lvl-meets', points: 3 },
              {
                criterionId: 'crit-evidence',
                levelId: 'lvl-e-meets',
                points: 3,
              },
            ],
          },
        },
      }),
      makeResponse({
        studentUid: 'u2',
        pin: '2222',
        answers: [{ questionId: 'q1', answer: 'text' }],
      }),
    ];
    const { headers, dataRows } = buildResultsSheetData(
      responses,
      questions,
      gradeFn
    );
    const thesisIdx = headers.indexOf('Q1 Rubric - Thesis');
    const thesisPtsIdx = headers.indexOf('Q1 Rubric - Thesis Points');

    const scoredRow = dataRows.find((r) => r[4] === '1111');
    const unscoredRow = dataRows.find((r) => r[4] === '2222');
    if (!scoredRow || !unscoredRow) throw new Error('expected both rows');
    expect(scoredRow[thesisIdx]).toBe('Meets');
    expect(scoredRow[thesisPtsIdx]).toBe('3');
    expect(unscoredRow[thesisIdx]).toBe('');
    expect(unscoredRow[thesisPtsIdx]).toBe('');
  });

  it('only emits rubric columns for the specific question that has the rubric', () => {
    const questions: ExportableQuestion[] = [
      { id: 'q1', text: 'Essay', points: 6, rubricSnapshot: rubric },
      { id: 'q2', text: 'Short answer', points: 2 },
    ];
    const responses = [
      makeResponse({
        answers: [
          { questionId: 'q1', answer: 'text' },
          { questionId: 'q2', answer: 'text' },
        ],
        grading: {
          q1: {
            rubricScores: [
              { criterionId: 'crit-thesis', levelId: 'lvl-meets', points: 3 },
              {
                criterionId: 'crit-evidence',
                levelId: 'lvl-e-meets',
                points: 3,
              },
            ],
          },
        },
      }),
    ];
    const { headers } = buildResultsSheetData(responses, questions, gradeFn);
    expect(headers.filter((h) => h.startsWith('Q1 Rubric'))).toHaveLength(4);
    expect(headers.filter((h) => h.startsWith('Q2 Rubric'))).toHaveLength(0);
  });
});
