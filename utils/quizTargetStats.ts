import type {
  QuestionTargetTag,
  QuizPublicQuestion,
  QuizQuestion,
  QuizResponse,
} from '@/types';
import type { MasteryCutoffs } from '@/utils/learningTargets';
import {
  computeQuestionStats,
  type QuestionStat,
} from '@/utils/quizQuestionStats';

export type MasteryBand = 'proficient' | 'approaching' | 'beginning';

export interface TargetQuestionStat {
  id: string;
  index: number;
  text: string;
  servedCount: number;
  attempted: number;
  correctPercent: number | null;
  lowSample: boolean;
}

export interface TargetStat {
  target: QuestionTargetTag;
  questionIds: string[];
  questions: TargetQuestionStat[];
  /** Number of student-question pairs that received a question in this group. */
  servedCount: number;
  /** Number of student-question pairs with a final, scoreable result. */
  attempted: number;
  correctPercent: number | null;
  lowSample: boolean;
  band: MasteryBand | null;
}

export interface StudentTargetStat {
  servedCount: number;
  attempted: number;
  correctPercent: number | null;
  band: MasteryBand | null;
}

export interface QuizTargetStats {
  /** Every directly applied tag, including standard tags. */
  targets: TargetStat[];
  /** Standards reached directly or through LearningTarget.standardIds. */
  standards: TargetStat[];
  /** Direct-tag stats for the student grid, keyed by response document key. */
  byStudent: Map<string, Map<string, StudentTargetStat>>;
}

export interface TargetGridCsvRow {
  name: string;
  values: ReadonlyMap<string, number | null>;
}

export interface TaggedQuestionGroup<
  T extends Pick<QuizPublicQuestion, 'id' | 'targets'>,
> {
  key: string;
  targets: QuestionTargetTag[];
  questions: T[];
}

interface MutableTargetGroup {
  target: QuestionTargetTag;
  questionIds: Set<string>;
}

const EMPTY_QUESTION_STAT: QuestionStat = {
  answered: 0,
  autoTotal: 0,
  correct: 0,
  manualTotal: 0,
  graded: 0,
  scoredCount: 0,
  ratioSum: 0,
  averagePct: null,
};

const targetLabel = (target: QuestionTargetTag): string =>
  target.code ? `${target.code} ${target.label}` : target.label;

const responseKey = (response: QuizResponse): string =>
  response._responseKey ?? response.studentUid;

function fallbackStandardTag(id: string): QuestionTargetTag {
  const separator = id.indexOf(':');
  const code = separator >= 0 ? id.slice(separator + 1) : id;
  return { id, kind: 'standard', code, label: code };
}

function addQuestionToGroup(
  groups: Map<string, MutableTargetGroup>,
  target: QuestionTargetTag,
  questionId: string,
  preferSnapshot = false
): void {
  const current = groups.get(target.id);
  if (current) {
    current.questionIds.add(questionId);
    if (preferSnapshot) current.target = target;
    return;
  }
  groups.set(target.id, { target, questionIds: new Set([questionId]) });
}

function collectGroups(questions: QuizQuestion[]): {
  targets: Map<string, MutableTargetGroup>;
  standards: Map<string, MutableTargetGroup>;
} {
  const targets = new Map<string, MutableTargetGroup>();
  const standards = new Map<string, MutableTargetGroup>();

  for (const question of questions) {
    const seen = new Set<string>();
    for (const target of question.targets ?? []) {
      if (seen.has(target.id)) continue;
      seen.add(target.id);
      addQuestionToGroup(targets, target, question.id);
      if (target.kind === 'standard') {
        addQuestionToGroup(standards, target, question.id, true);
      } else {
        for (const standardId of new Set(target.standardIds ?? [])) {
          addQuestionToGroup(
            standards,
            fallbackStandardTag(standardId),
            question.id
          );
        }
      }
    }
  }

  return { targets, standards };
}

function countServedByQuestion(
  questions: QuizQuestion[],
  responses: QuizResponse[]
): Map<string, number> {
  const questionIds = new Set(questions.map((question) => question.id));
  const served = new Map<string, number>();
  for (const id of questionIds) served.set(id, 0);

  for (const response of responses) {
    // A lobby-only student has not received an attempt yet.
    if (response.status === 'joined') continue;
    const ids =
      response.servedQuestionIds && response.servedQuestionIds.length > 0
        ? response.servedQuestionIds
        : questions.map((question) => question.id);
    for (const id of new Set(ids)) {
      if (!questionIds.has(id)) continue;
      served.set(id, (served.get(id) ?? 0) + 1);
    }
  }
  return served;
}

export function masteryBandFor(
  percent: number | null,
  cutoffs: MasteryCutoffs
): MasteryBand | null {
  if (percent === null) return null;
  if (percent >= cutoffs.proficient) return 'proficient';
  if (percent >= cutoffs.approaching) return 'approaching';
  return 'beginning';
}

function buildGroupStats(
  groups: Map<string, MutableTargetGroup>,
  questions: QuizQuestion[],
  questionStats: Map<string, QuestionStat>,
  servedByQuestion: Map<string, number>,
  cutoffs: MasteryCutoffs
): TargetStat[] {
  const questionById = new Map(
    questions.map((question, index) => [question.id, { question, index }])
  );

  return Array.from(groups.values())
    .map((group): TargetStat => {
      const details = Array.from(group.questionIds)
        .map((id): TargetQuestionStat | null => {
          const entry = questionById.get(id);
          if (!entry) return null;
          const stats = questionStats.get(id) ?? EMPTY_QUESTION_STAT;
          const servedCount = servedByQuestion.get(id) ?? 0;
          return {
            id,
            index: entry.index,
            text: entry.question.text,
            servedCount,
            attempted: stats.scoredCount,
            correctPercent: stats.averagePct,
            lowSample: stats.scoredCount < 5,
          };
        })
        .filter((detail): detail is TargetQuestionStat => detail !== null)
        .sort((a, b) => a.index - b.index);
      const attempted = details.reduce(
        (sum, detail) => sum + (questionStats.get(detail.id)?.scoredCount ?? 0),
        0
      );
      const ratioSum = details.reduce(
        (sum, detail) => sum + (questionStats.get(detail.id)?.ratioSum ?? 0),
        0
      );
      const correctPercent =
        attempted > 0 ? Math.round((ratioSum / attempted) * 100) : null;
      return {
        target: group.target,
        questionIds: details.map((detail) => detail.id),
        questions: details,
        servedCount: details.reduce(
          (sum, detail) => sum + detail.servedCount,
          0
        ),
        attempted,
        correctPercent,
        lowSample: attempted < 5,
        band: masteryBandFor(correctPercent, cutoffs),
      };
    })
    .sort((a, b) =>
      targetLabel(a.target).localeCompare(targetLabel(b.target), undefined, {
        numeric: true,
        sensitivity: 'base',
      })
    );
}

/**
 * Compute direct-target, standard-rollup and per-student mastery from the
 * canonical question scorer. A question contributes at most once to any one
 * target/standard, even when duplicate snapshots or several child targets
 * point at the same standard.
 */
export function computeTargetStats(
  questions: QuizQuestion[],
  responses: QuizResponse[],
  cutoffs: MasteryCutoffs
): QuizTargetStats {
  const groups = collectGroups(questions);
  const questionStats = computeQuestionStats(questions, responses);
  const servedByQuestion = countServedByQuestion(questions, responses);
  const targets = buildGroupStats(
    groups.targets,
    questions,
    questionStats,
    servedByQuestion,
    cutoffs
  );
  const standards = buildGroupStats(
    groups.standards,
    questions,
    questionStats,
    servedByQuestion,
    cutoffs
  );

  // Untagged quiz: the grid never renders, so skip the per-response rescan.
  const byStudent = new Map<string, Map<string, StudentTargetStat>>();
  for (const response of groups.targets.size > 0 ? responses : []) {
    const responseQuestionStats = computeQuestionStats(questions, [response]);
    const responseServed = countServedByQuestion(questions, [response]);
    const studentTargets = new Map<string, StudentTargetStat>();
    for (const group of groups.targets.values()) {
      let attempted = 0;
      let ratioSum = 0;
      let servedCount = 0;
      for (const questionId of group.questionIds) {
        const stat = responseQuestionStats.get(questionId);
        attempted += stat?.scoredCount ?? 0;
        ratioSum += stat?.ratioSum ?? 0;
        servedCount += responseServed.get(questionId) ?? 0;
      }
      const correctPercent =
        attempted > 0 ? Math.round((ratioSum / attempted) * 100) : null;
      studentTargets.set(group.target.id, {
        servedCount,
        attempted,
        correctPercent,
        band: masteryBandFor(correctPercent, cutoffs),
      });
    }
    byStudent.set(responseKey(response), studentTargets);
  }

  return { targets, standards, byStudent };
}

function quoteCsvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Build the Student × Target grid as RFC-4180-compatible CSV. */
export function buildTargetGridCsv(
  columns: readonly TargetStat[],
  rows: readonly TargetGridCsvRow[]
): string {
  const lines = [
    ['Student', ...columns.map((column) => targetLabel(column.target))],
    ...rows.map((row) => [
      row.name,
      ...columns.map((column) => {
        const value = row.values.get(column.target.id);
        return value === null || value === undefined ? '' : String(value);
      }),
    ]),
  ];
  return lines.map((line) => line.map(quoteCsvCell).join(',')).join('\r\n');
}

/**
 * Group student-safe questions by their exact direct-tag set. This keeps each
 * answer card on screen once even when a question carries several targets.
 */
export function groupQuestionsByTargets<
  T extends Pick<QuizPublicQuestion, 'id' | 'targets'>,
>(questions: readonly T[]): TaggedQuestionGroup<T>[] {
  const groups = new Map<string, TaggedQuestionGroup<T>>();
  for (const question of questions) {
    const uniqueTargets = Array.from(
      new Map(
        (question.targets ?? []).map((target) => [target.id, target])
      ).values()
    ).sort((a, b) => targetLabel(a).localeCompare(targetLabel(b)));
    const key =
      uniqueTargets.length > 0
        ? uniqueTargets
            .map(
              (target) => `${target.kind}:${target.ownerId ?? ''}:${target.id}`
            )
            .sort()
            .join('|')
        : 'untagged';
    const current = groups.get(key);
    if (current) {
      current.questions.push(question);
    } else {
      groups.set(key, { key, targets: uniqueTargets, questions: [question] });
    }
  }
  return Array.from(groups.values());
}
