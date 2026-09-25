/**
 * Shared results-sheet export primitives.
 *
 * Originally lived as `private buildResultsSheetData` on `QuizDriveService`.
 * PR3b lifts it here so Video Activity (and any future Quiz-style widget)
 * can produce the same column shape without duplicating the loop. The
 * grader is injected as a callback so each widget passes its own —
 * Quiz uses `gradeAnswer`, VA uses `gradeVideoActivityAnswer` (which
 * handles MA/FIB-variants that the Quiz grader has no case for).
 *
 * The shape is intentionally minimal: just the fields the column layout
 * reads. Quiz passes its `QuizResponse` / `QuizQuestion` directly (they
 * fit). VA wraps its `VideoActivityResponse` to map `completedAt` →
 * `submittedAt` + derive a `status` string.
 */

import type {
  GradeResult,
  QuizQuestion,
  QuizResponseAnswer,
  Rubric,
  TabExit,
  UnrespondedReason,
  WrittenAnswerRubricScore,
} from '@/types';
import { resolvePinName } from '@/components/widgets/QuizWidget/utils/quizScoreboard';
import { logError } from '@/utils/logError';
import { formatTabAwayTotal } from '@/utils/tabExits';
import { selectRepresentativeAnswers } from '@/utils/answerTakeOrdering';

/**
 * Format a points value for export. Whole numbers stay as integers;
 * fractional partial-credit values render with up to 2 decimals.
 */
export function formatExportPoints(points: number): string {
  if (Number.isInteger(points)) return String(points);
  return (Math.round(points * 100) / 100).toString();
}

/** Minimum response shape the export reads. */
export interface ExportableResponse {
  pin?: string;
  studentUid: string;
  classPeriod?: string;
  answers: {
    questionId: string;
    answer: string;
    /** Dedup tiebreak input; entries without it sort as 0. */
    takeIndex?: number;
    /** Dedup tiebreak input when `takeIndex` ties. */
    answeredAt?: number;
    /** Present means the student did not respond; absent on VA responses. */
    unresponded?: UnrespondedReason;
  }[];
  /** 'completed' | 'in-progress' | other widget-specific status string. */
  status: string;
  /**
   * When the response was finalized. VA's `completedAt` and Quiz's
   * `submittedAt` both fit; the export displays it verbatim.
   */
  submittedAt: number | null;
  tabSwitchWarnings?: number;
  tabExits?: TabExit[];
  /** Per-question manual grades; read for rubric score export columns. */
  grading?: {
    [questionId: string]: {
      rubricScores?: WrittenAnswerRubricScore[];
      /** Excused: terminal, and out of THIS student's denominator. */
      excused?: boolean;
    };
  };
  /** Served-subset snapshot (Quiz); questions outside it leave this row's denominator. */
  servedQuestionIds?: string[];
  /** Questions left out of a choose-N section (Quiz); out of the denominator, shown as "Not chosen". */
  _notChosen?: string[];
}

/** Minimum question shape the export reads. */
export interface ExportableQuestion {
  id: string;
  text: string;
  points?: number;
  /** When present, emits per-criterion rubric columns (see buildResultsSheetData). */
  rubricSnapshot?: Rubric;
}

export interface BuildResultsSheetDataOptions<
  Q extends ExportableQuestion = ExportableQuestion,
  R extends ExportableResponse = ExportableResponse,
> {
  /** PIN → roster student name lookup. Per-period when keyed. */
  pinToName?: Record<string, string>;
  /** SSO uid → resolved ClassLink name. Wins over `pinToName` when present. */
  byStudentUid?: Map<string, { givenName: string; familyName: string }>;
  /** Teacher display name for the "Teacher" column. */
  teacherName?: string;
  /** When present, adds a "Qn Answer" column after each points column. */
  formatAnswer?: (question: Q, answer: R['answers'][number]) => string;
  /** Adds "Time Away" after "Warnings". Solo sheets only: PLC sheets are read by column position. */
  timeAway?: boolean;
}

/** Sheets rejects any cell over 50,000 characters. */
const MAX_ANSWER_CELL_CHARS = 49_000;

/** Header of the answer-text column for 1-based question number `n`. */
export function answerColumnHeader(n: number): string {
  return `Q${n} Answer`;
}

/** True when a results-sheet header row carries answer-text columns. */
export function headersHaveAnswerColumns(headers: string[]): boolean {
  return headers.some((h) => /^Q\d+ Answer$/.test(h));
}

/** Readable answer text for a quiz answer; Matching/Ordering/MA unpacked from their pipe encoding. */
export function formatQuizAnswerText(
  question: Pick<QuizQuestion, 'type'>,
  answer: Pick<QuizResponseAnswer, 'answer' | 'artifacts' | 'unresponded'>
): string {
  if (answer.unresponded) return '';
  const raw = answer.answer ?? '';
  let text = raw;
  if (raw && question.type === 'Matching') {
    text = raw
      .split('|')
      .map((pair) => {
        const sep = pair.indexOf(':');
        return sep < 0
          ? pair
          : `${pair.slice(0, sep)} → ${pair.slice(sep + 1)}`;
      })
      .join('; ');
  } else if (raw && question.type === 'Ordering') {
    text = raw
      .split('|')
      .map((item, i) => `${i + 1}. ${item}`)
      .join('; ');
  } else if (raw && question.type === 'MA') {
    text = raw.split('|').filter(Boolean).join('; ');
  }
  const parts = [text.trim()];
  for (const art of answer.artifacts ?? []) {
    if (art.kind === 'text') parts.push(art.text?.trim() ?? '');
    else parts.push(`[${art.kind}]`);
  }
  const joined = parts.filter(Boolean).join(' ');
  return joined.length > MAX_ANSWER_CELL_CHARS
    ? `${joined.slice(0, MAX_ANSWER_CELL_CHARS)}…`
    : joined;
}

/**
 * Build headers + data rows for a results sheet export. Side-effect free.
 * The grader callback is widget-specific so MA/FIB-variant grading works
 * for VA, and Matching/Ordering partial credit works for Quiz.
 */
export function buildResultsSheetData<
  Q extends ExportableQuestion,
  R extends ExportableResponse,
>(
  responses: R[],
  questions: Q[],
  /**
   * Per-row grader. Receives the response as the optional third argument so
   * widget-specific graders that need per-response state (e.g. Quiz's manual
   * grades for `short`/`essay` questions, read from
   * `response.grading[questionId]`) can plumb it through. Auto-grading
   * widgets (or VA's grader) can ignore it.
   */
  gradeFn: (question: Q, studentAnswer: string, response?: R) => GradeResult,
  options?: BuildResultsSheetDataOptions<Q, R>
): { headers: string[]; dataRows: string[][] } {
  const pinToName = options?.pinToName ?? {};
  const byStudentUid = options?.byStudentUid;
  const teacherName =
    (options?.teacherName?.trim() ? options.teacherName.trim() : null) ??
    'Unknown Teacher';
  const timestamp = new Date().toISOString();
  const formatAnswer = options?.formatAnswer;

  // Deduplicate questions by id before all downstream point math. Drive-
  // sync duplication and arrayUnion races on the template doc can leave
  // the same question id present multiple times in `questions`; without
  // this fence the maxPoints denominator AND the earnedPoints numerator
  // both inflate by the duplication factor. Mirrors the seen-set fix
  // PR #1728 applied to `computeVideoActivityScorePct` — the export
  // path had the same bug, undetected because no test exercised it.
  const seenQuestionIds = new Set<string>();
  questions = questions.filter((q) => {
    if (seenQuestionIds.has(q.id)) return false;
    seenQuestionIds.add(q.id);
    return true;
  });

  // Counts rows that resolved to neither a pseudonym map entry nor a PIN
  // — i.e. an SSO joiner whose ClassLink lookup didn't return a name, OR
  // a truly anonymous response missing both `studentUid` resolution and a
  // PIN. Both cases hit the generic 'Student' label. Logged once per
  // export below so a regression is visible in ops triage.
  let unresolvedAnonymousCount = 0;
  const resolveStudent = (r: R): string => {
    const sso = byStudentUid?.get(r.studentUid);
    if (sso) {
      const full = `${sso.givenName ?? ''} ${sso.familyName ?? ''}`.trim();
      if (full) return full;
    }
    if (r.pin) {
      const name = resolvePinName(pinToName, r.classPeriod, r.pin);
      return name ?? `Student (PIN: ${r.pin})`;
    }
    unresolvedAnonymousCount++;
    return 'Student';
  };

  // Per-row, because an excused question leaves only that student's total.
  const rowMaxPoints = (r: R): number => {
    const served =
      r.servedQuestionIds && r.servedQuestionIds.length > 0
        ? new Set(r.servedQuestionIds)
        : null;
    return questions.reduce((sum, q) => {
      if (served && !served.has(q.id)) return sum;
      if (r._notChosen?.includes(q.id)) return sum;
      return r.grading?.[q.id]?.excused ? sum : sum + (q.points ?? 1);
    }, 0);
  };

  // Gated on the quiz definition alone: any question carrying a snapshot
  // always emits its criterion columns, ungraded responses render empty
  // cells. Gating on scores would make the header non-deterministic between
  // a pre-grading and a post-grading export of the same quiz, and the PLC
  // shared-sheet append guard rejects a schema change.
  const rubricQuestionIds = new Set(
    questions.filter((q) => q.rubricSnapshot).map((q) => q.id)
  );

  const headers = [
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
    ...(options?.timeAway ? ['Time Away'] : []),
    'Submitted At',
    ...questions.flatMap((q, i) => {
      const cols = [
        `Q${i + 1} (${q.points ?? 1}pt): ${q.text.substring(0, 40)}`,
      ];
      if (formatAnswer) cols.push(answerColumnHeader(i + 1));
      if (rubricQuestionIds.has(q.id) && q.rubricSnapshot) {
        for (const c of q.rubricSnapshot.criteria) {
          cols.push(`Q${i + 1} Rubric - ${c.name}`);
          cols.push(`Q${i + 1} Rubric - ${c.name} Points`);
        }
      }
      return cols;
    }),
  ];

  const dataRows = responses.map((r) => {
    const submitted = r.submittedAt
      ? new Date(r.submittedAt).toLocaleString()
      : '';
    const warnings = r.tabSwitchWarnings?.toString() ?? '0';
    // Dedup by questionId via the take/answeredAt tiebreak shared with scoring.
    const answerMap = selectRepresentativeAnswers(r.answers ?? []);
    // Grade once per question per response, cached by question id. The
    // previous shape called `gradeFn` twice (once for the answer column,
    // once for the row sum) which doubled normalization/regex work on
    // exports and is wasted effort even for cheap graders.
    const grades = new Map<string, ReturnType<typeof gradeFn>>();
    for (const q of questions) {
      const ans = answerMap.get(q.id);
      if (!ans || ans.unresponded) continue; // absent OR unresponded === no cell
      if (r._notChosen?.includes(q.id)) continue;
      grades.set(q.id, gradeFn(q, ans.answer, r));
    }
    // An `awaiting-grade` slot's 0 is a placeholder, not a score. Render the
    // cell as "Ungraded" (distinct from an unanswered question's blank) and
    // flag the row total as provisional so nobody reads the deflated
    // percentage as the student's final grade.
    const answerCols = questions.flatMap((q) => {
      const grade = grades.get(q.id);
      const baseCell = r._notChosen?.includes(q.id)
        ? 'Not chosen'
        : !grade
          ? ''
          : grade.state === 'awaiting-grade'
            ? 'Ungraded'
            : formatExportPoints(grade.pointsEarned);
      const cols = [baseCell];
      if (formatAnswer) {
        const ans = answerMap.get(q.id);
        cols.push(ans && !ans.unresponded ? formatAnswer(q, ans) : '');
      }
      if (rubricQuestionIds.has(q.id) && q.rubricSnapshot) {
        const scores = r.grading?.[q.id]?.rubricScores ?? [];
        const scoreMap = new Map<string, (typeof scores)[number]>();
        for (const s of scores) {
          if (!scoreMap.has(s.criterionId)) {
            scoreMap.set(s.criterionId, s);
          }
        }
        for (const c of q.rubricSnapshot.criteria) {
          const score = scoreMap.get(c.id);
          if (!score) {
            cols.push('', '');
            continue;
          }
          const level = c.levels.find((l) => l.id === score.levelId);
          cols.push(level?.label ?? '', formatExportPoints(score.points));
        }
      }
      return cols;
    });
    const awaitingGrade = questions.some(
      (q) => grades.get(q.id)?.state === 'awaiting-grade'
    );
    const earnedPoints = questions.reduce((sum, q) => {
      const grade = grades.get(q.id);
      return grade ? sum + grade.pointsEarned : sum;
    }, 0);
    const rowMax = rowMaxPoints(r);
    const scoreDisplay =
      r.status === 'completed' && rowMax > 0
        ? `${Math.round((earnedPoints / rowMax) * 100)}%${awaitingGrade ? ' (provisional)' : ''}`
        : '';
    return [
      timestamp,
      teacherName,
      r.classPeriod ?? '',
      resolveStudent(r),
      r.pin ?? '',
      r.status,
      scoreDisplay,
      formatExportPoints(earnedPoints),
      String(rowMax),
      warnings,
      ...(options?.timeAway ? [formatTabAwayTotal(r.tabExits)] : []),
      submitted,
      ...answerCols,
    ];
  });

  // Stable sort by student name so the export reads naturally even when
  // responses arrive in arbitrary join order.
  dataRows.sort((a, b) => a[3].localeCompare(b[3]));

  if (unresolvedAnonymousCount > 0) {
    logError(
      'assignmentExportShared.buildResultsSheetData',
      new Error(
        `${unresolvedAnonymousCount} response(s) exported with generic 'Student' label (no resolvable identity)`
      ),
      {
        unresolvedCount: unresolvedAnonymousCount,
        totalRows: dataRows.length,
        byStudentUidSize: byStudentUid?.size ?? 0,
      }
    );
  }

  return { headers, dataRows };
}
