import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
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
    state: 'scored',
  });
  const ALWAYS_ZERO: () => GradeResult = () => ({
    isCorrect: false,
    pointsEarned: 0,
    pointsMax: 1,
    state: 'scored',
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

  // Regression: Firestore arrayUnion races / Drive-sync double-writes can
  // produce duplicate answer entries for the same questionId. The original
  // `new Map(r.answers.map(...))` constructor kept the LAST duplicate, but
  // `getEarnedPoints` (used for the published score) kept the FIRST (by
  // chronological sort). When the last duplicate is wrong and the first is
  // correct, the exported score would be 0% even though the student's
  // published score is 100%. Fix: discard every answer after the first
  // occurrence per questionId, matching the "first-wins" semantics of the
  // scoring path.
  it('deduplicates duplicate answers per question by first-occurrence', () => {
    // Grader that awards full credit for 'correct' and zero for anything else.
    const gradeFn = (_q: ExportableQuestion, answer: string): GradeResult => ({
      isCorrect: answer === 'correct',
      pointsEarned: answer === 'correct' ? 1 : 0,
      pointsMax: 1,
      state: 'scored',
    });

    const response = r({
      answers: [
        { questionId: 'q1', answer: 'correct' }, // first — should win
        { questionId: 'q1', answer: 'wrong' }, // duplicate — should be ignored
      ],
    });

    const { dataRows } = buildResultsSheetData([response], [q()], gradeFn);

    // Score column index 6: should be 100% (first answer correct), not 0%
    expect(dataRows[0][6]).toBe('100%');
    // Points Earned column index 7: should be 1
    expect(dataRows[0][7]).toBe('1');
    // Q1 column (index 11): should show the first answer's earned points
    expect(dataRows[0][11]).toBe('1');
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

  // Silent-failure surfacing: when a response falls through to the generic
  // 'Student' export label (no PIN AND no entry in byStudentUid), the
  // builder must log via logError so ops can see when a regression in
  // pseudonym resolution silently writes unusable rows to the sheet.
  describe('unresolved anonymous response logging', () => {
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('logs when a response with no PIN cannot be resolved', () => {
      const { dataRows } = buildResultsSheetData(
        [r({ studentUid: 'sso-unknown', pin: undefined })],
        [q()],
        ALWAYS_FULL,
        { byStudentUid: new Map() }
      );
      // Row still emits the 'Student' fallback — behavior preserved, just
      // now observable.
      expect(dataRows[0][3]).toBe('Student');
      const mocked = vi.mocked(console.error);
      expect(mocked).toHaveBeenCalledOnce();
      const firstArg = mocked.mock.calls[0]?.[0];
      expect(firstArg).toMatch(/assignmentExportShared\.buildResultsSheetData/);
      expect(firstArg).toMatch(
        /1 response\(s\) exported with generic 'Student' label/
      );
    });

    it('reports the actual unresolved count, not the row count', () => {
      buildResultsSheetData(
        [
          r({ studentUid: 'sso-1', pin: undefined }), // resolves
          r({ studentUid: 'sso-unknown-a', pin: undefined }), // unresolved
          r({ studentUid: 'sso-unknown-b', pin: undefined }), // unresolved
          r({ pin: '01', studentUid: 'no-sso' }), // resolves via PIN
        ],
        [q()],
        ALWAYS_FULL,
        {
          byStudentUid: new Map([
            ['sso-1', { givenName: 'Alex', familyName: 'Lee' }],
          ]),
          pinToName: { '01': 'Pat Smith' },
        }
      );
      const mocked = vi.mocked(console.error);
      expect(mocked).toHaveBeenCalledOnce();
      const firstArg = mocked.mock.calls[0]?.[0];
      // Counter must reflect unresolved count (2), not total rows (4).
      expect(firstArg).toMatch(/2 response\(s\)/);
    });

    it('includes structured context in the logError payload', () => {
      buildResultsSheetData(
        [r({ studentUid: 'sso-unknown', pin: undefined })],
        [q()],
        ALWAYS_FULL,
        {
          byStudentUid: new Map([
            ['sso-1', { givenName: 'Alex', familyName: 'Lee' }],
          ]),
        }
      );
      const mocked = vi.mocked(console.error);
      const contextArg = mocked.mock.calls[0]?.[1];
      expect(contextArg).toMatchObject({
        unresolvedCount: 1,
        totalRows: 1,
        byStudentUidSize: 1,
      });
    });

    it('does not log when every SSO response resolves', () => {
      buildResultsSheetData(
        [r({ studentUid: 'sso-1', pin: undefined })],
        [q()],
        ALWAYS_FULL,
        {
          byStudentUid: new Map([
            ['sso-1', { givenName: 'Alex', familyName: 'Lee' }],
          ]),
        }
      );
      expect(vi.mocked(console.error)).not.toHaveBeenCalled();
    });

    it('does not log for legacy PIN-only responses (no SSO map passed)', () => {
      buildResultsSheetData([r({ pin: '01' })], [q()], ALWAYS_FULL);
      expect(vi.mocked(console.error)).not.toHaveBeenCalled();
    });
  });
  describe('awaiting-grade slots (M12 3-G)', () => {
    const AWAITING: () => GradeResult = () => ({
      isCorrect: false,
      pointsEarned: 0,
      pointsMax: 1,
      state: 'awaiting-grade',
    });

    it("renders an awaiting-grade cell as 'Ungraded', not a 0", () => {
      const { dataRows } = buildResultsSheetData([r()], [q()], AWAITING);
      expect(dataRows[0][11]).toBe('Ungraded');
    });

    it('marks the row score provisional when any slot is awaiting a grade', () => {
      const { dataRows } = buildResultsSheetData([r()], [q()], AWAITING);
      expect(dataRows[0][6]).toBe('0% (provisional)');
    });

    it('leaves a fully scored row unmarked', () => {
      const { dataRows } = buildResultsSheetData([r()], [q()], ALWAYS_FULL);
      expect(dataRows[0][6]).toBe('100%');
      expect(dataRows[0][11]).toBe('1');
    });

    it('marks the row provisional when only one of several questions is ungraded', () => {
      const questions = [q({ id: 'q1' }), q({ id: 'q2' })];
      const response = r({
        answers: [
          { questionId: 'q1', answer: 'a' },
          { questionId: 'q2', answer: 'b' },
        ],
      });
      const gradeFn = (question: ExportableQuestion): GradeResult =>
        question.id === 'q2'
          ? {
              isCorrect: false,
              pointsEarned: 0,
              pointsMax: 1,
              state: 'awaiting-grade',
            }
          : { isCorrect: true, pointsEarned: 1, pointsMax: 1, state: 'scored' };
      const { dataRows } = buildResultsSheetData(
        [response],
        questions,
        gradeFn
      );
      expect(dataRows[0][6]).toBe('50% (provisional)');
      expect(dataRows[0][11]).toBe('1');
      expect(dataRows[0][12]).toBe('Ungraded');
    });
  });

  // RR-06 finding 4 / RR-08: once every passed-over question writes an
  // entry, presence alone can no longer mean "answered." The `unresponded`
  // marker (brief 2.2) is the only correct signal.
  describe('unresponded entries (RR-06 finding 4)', () => {
    it('renders an unresponded entry as a blank cell, not a 0', () => {
      const questions = [q({ id: 'q1' }), q({ id: 'q2' })];
      const response = r({
        answers: [
          { questionId: 'q1', answer: '', unresponded: 'passed' },
          { questionId: 'q2', answer: 'a' },
        ],
      });
      const { dataRows } = buildResultsSheetData(
        [response],
        questions,
        ALWAYS_ZERO
      );
      // Q1 column (index 11) blank — unresponded, not a scored 0.
      expect(dataRows[0][11]).toBe('');
      // Q2 column (index 12) reflects its real grade.
      expect(dataRows[0][12]).toBe('0');
    });

    it('renders a legitimate empty answer (no unresponded flag) as a scored 0', () => {
      // A written-response question the student submitted blank, or a
      // pure-audio response whose content lives in artifacts[] — both
      // store answer: '' while being genuinely answered.
      const response = r({ answers: [{ questionId: 'q1', answer: '' }] });
      const { dataRows } = buildResultsSheetData(
        [response],
        [q()],
        ALWAYS_ZERO
      );
      expect(dataRows[0][11]).toBe('0');
    });

    it('produces identical output to the pre-change baseline for legacy fixtures', () => {
      // No `unresponded` field anywhere — matches every Firestore document
      // written today. Must behave exactly as before this brief.
      const response = r({ answers: [{ questionId: 'q1', answer: 'a' }] });
      const { dataRows } = buildResultsSheetData(
        [response],
        [q()],
        ALWAYS_FULL
      );
      expect(dataRows[0][11]).toBe('1');
    });
  });

  describe('takeIndex/answeredAt dedup tiebreak (owner note, paired with brief 1.2)', () => {
    it('keeps the highest-takeIndex entry when duplicates share a questionId', () => {
      const gradeFn = (
        _q: ExportableQuestion,
        answer: string
      ): GradeResult => ({
        isCorrect: answer === 'second-take',
        pointsEarned: answer === 'second-take' ? 1 : 0,
        pointsMax: 1,
        state: 'scored',
      });
      const response = r({
        answers: [
          { questionId: 'q1', answer: 'first-take', takeIndex: 0 },
          { questionId: 'q1', answer: 'second-take', takeIndex: 1 },
        ],
      });
      const { dataRows } = buildResultsSheetData([response], [q()], gradeFn);
      expect(dataRows[0][11]).toBe('1');
    });

    it('breaks a takeIndex tie on earliest answeredAt', () => {
      const gradeFn = (
        _q: ExportableQuestion,
        answer: string
      ): GradeResult => ({
        isCorrect: answer === 'earlier',
        pointsEarned: answer === 'earlier' ? 1 : 0,
        pointsMax: 1,
        state: 'scored',
      });
      const response = r({
        answers: [
          { questionId: 'q1', answer: 'later', answeredAt: 200 },
          { questionId: 'q1', answer: 'earlier', answeredAt: 100 },
        ],
      });
      const { dataRows } = buildResultsSheetData([response], [q()], gradeFn);
      expect(dataRows[0][11]).toBe('1');
    });

    it('treats a duplicate missing answeredAt as earliest (sorts as 0)', () => {
      const gradeFn = (
        _q: ExportableQuestion,
        answer: string
      ): GradeResult => ({
        isCorrect: answer === 'no-timestamp',
        pointsEarned: answer === 'no-timestamp' ? 1 : 0,
        pointsMax: 1,
        state: 'scored',
      });
      const response = r({
        answers: [
          { questionId: 'q1', answer: 'timestamped', answeredAt: 100 },
          { questionId: 'q1', answer: 'no-timestamp' },
        ],
      });
      const { dataRows } = buildResultsSheetData([response], [q()], gradeFn);
      expect(dataRows[0][11]).toBe('1');
    });
  });
});
