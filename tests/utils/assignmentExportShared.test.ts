import { describe, it, expect } from 'vitest';
import {
  buildResultsSheetData,
  formatExportPoints,
  type ExportableQuestion,
  type ExportableResponse,
} from '@/utils/assignmentExportShared';
import type { GradeResult } from '@/types';

describe('formatExportPoints', () => {
  it('renders integers without decimals', () => {
    expect(formatExportPoints(0)).toBe('0');
    expect(formatExportPoints(5)).toBe('5');
    expect(formatExportPoints(100)).toBe('100');
  });

  it('renders fractional values with up to 2 decimals', () => {
    expect(formatExportPoints(0.5)).toBe('0.5');
    expect(formatExportPoints(1.25)).toBe('1.25');
  });

  it('strips trailing zeros from rounded fractionals', () => {
    expect(formatExportPoints(1.1)).toBe('1.1');
  });
});

describe('buildResultsSheetData', () => {
  const ALWAYS_FULL: (q: { points?: number }) => GradeResult = (q) => ({
    isCorrect: true,
    pointsEarned: q.points ?? 1,
    pointsMax: q.points ?? 1,
  });
  const ALWAYS_ZERO: () => GradeResult = () => ({
    isCorrect: false,
    pointsEarned: 0,
    pointsMax: 1,
  });

  function q(overrides: Partial<ExportableQuestion> = {}): ExportableQuestion {
    return {
      id: 'q1',
      text: 'What?',
      points: 1,
      ...overrides,
    };
  }

  function r(overrides: Partial<ExportableResponse> = {}): ExportableResponse {
    return {
      pin: '01',
      studentUid: 'student-1',
      classPeriod: 'Period 1',
      answers: [{ questionId: 'q1', answer: 'a' }],
      status: 'completed',
      submittedAt: 1700000000000,
      tabSwitchWarnings: 0,
      ...overrides,
    };
  }

  it('emits the canonical column header layout', () => {
    const { headers } = buildResultsSheetData(
      [r()],
      [q({ id: 'q1', text: 'Question 1', points: 2 })],
      ALWAYS_FULL
    );
    expect(headers).toEqual([
      'Timestamp',
      'Teacher',
      'Class Period',
      'Student',
      'PIN',
      'Status',
      'Score (%)',
      'Points Earned',
      'Max Points',
      'Warnings',
      'Submitted At',
      'Q1 (2pt): Question 1',
    ]);
  });

  it('routes correctness through the injected grader (full credit)', () => {
    const { dataRows } = buildResultsSheetData(
      [r()],
      [q({ points: 3 })],
      ALWAYS_FULL
    );
    expect(dataRows).toHaveLength(1);
    // Score column is index 6 (after Timestamp, Teacher, Class, Student, PIN, Status)
    expect(dataRows[0][6]).toBe('100%');
    // Points Earned at index 7
    expect(dataRows[0][7]).toBe('3');
  });

  it('routes correctness through the injected grader (zero credit)', () => {
    const { dataRows } = buildResultsSheetData(
      [r()],
      [q({ points: 3 })],
      ALWAYS_ZERO
    );
    // Even though the response is "completed", earned is 0 so score is 0%
    expect(dataRows[0][6]).toBe('0%');
    expect(dataRows[0][7]).toBe('0');
  });

  it('hides score column for in-progress responses', () => {
    const { dataRows } = buildResultsSheetData(
      [r({ status: 'in-progress', submittedAt: null })],
      [q()],
      ALWAYS_FULL
    );
    // Score column blank for non-completed
    expect(dataRows[0][6]).toBe('');
  });

  it('resolves SSO students by studentUid first, falling back to PIN', () => {
    const ssoMap = new Map([
      ['sso-1', { givenName: 'Alex', familyName: 'Lee' }],
    ]);
    // Period-scoped pinToName uses the canonical `${period}${pin}` key
    // shape produced by `buildPinToNameMap`.
    const PIN_KEY_SEP = String.fromCharCode(0x01);
    const { dataRows } = buildResultsSheetData(
      [
        r({ studentUid: 'sso-1', pin: undefined }),
        r({ studentUid: 'pin-1', pin: '02' }),
      ],
      [q()],
      ALWAYS_FULL,
      {
        byStudentUid: ssoMap,
        pinToName: { [`Period 1${PIN_KEY_SEP}02`]: 'Maya' },
      }
    );
    // Student column at index 3; rows are sorted by name so verify both
    const names = dataRows.map((row) => row[3]);
    expect(names).toContain('Alex Lee');
    expect(names).toContain('Maya');
  });

  it('passes question.points to the grader call (max points sums correctly)', () => {
    const { dataRows } = buildResultsSheetData(
      [r({ answers: [{ questionId: 'q1', answer: 'x' }] })],
      [q({ id: 'q1', points: 5 })],
      ALWAYS_FULL
    );
    // Max Points column at index 8
    expect(dataRows[0][8]).toBe('5');
  });

  it('sorts rows by student name', () => {
    const PIN_KEY_SEP = String.fromCharCode(0x01);
    const { dataRows } = buildResultsSheetData(
      [r({ studentUid: 'a', pin: '03' }), r({ studentUid: 'b', pin: '01' })],
      [q()],
      ALWAYS_FULL,
      {
        pinToName: {
          [`Period 1${PIN_KEY_SEP}01`]: 'Aiden',
          [`Period 1${PIN_KEY_SEP}03`]: 'Zara',
        },
      }
    );
    expect(dataRows[0][3]).toBe('Aiden');
    expect(dataRows[1][3]).toBe('Zara');
  });

  it('handles empty questions and responses without crashing', () => {
    const empty = buildResultsSheetData([], [], ALWAYS_FULL);
    expect(empty.headers).toHaveLength(11); // 11 fixed cols + 0 question cols
    expect(empty.dataRows).toEqual([]);

    // Responses but no questions: maxPoints = 0 must not divide-by-zero;
    // Score column blanks out via the maxPoints > 0 guard.
    const noQs = buildResultsSheetData([r()], [], ALWAYS_FULL);
    expect(noQs.dataRows[0][6]).toBe(''); // Score (%) blank
    expect(noQs.dataRows[0][8]).toBe('0'); // Max Points = 0
  });
});
