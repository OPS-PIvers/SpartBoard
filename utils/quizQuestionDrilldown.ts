import {
  isFreeResponseType,
  type QuizQuestion,
  type QuizResponse,
} from '@/types';
import {
  gradeAnswer,
  getResponseDocKey,
  normalizeAnswer,
  type ResponseDocKey,
} from '@/hooks/useQuizSession';
import { selectRepresentativeAnswers } from '@/utils/answerTakeOrdering';
import {
  multiAnswerCorrectOptions,
  multiAnswerOptions,
  parseMultiAnswer,
} from '@/utils/quizMultiAnswer';
import { isQuestionExcused } from '@/utils/mediaGrading';
import {
  gradeQuestionForResponse,
  type QuestionGradeFn,
} from '@/utils/quizQuestionStats';

/** Share of students served that one wrong answer must draw to be flagged (D21). */
export const COMMON_WRONG_ANSWER_SHARE = 0.4;
/** How many wrong Ordering sequences the drill-down lists. */
export const ORDERING_WRONG_ORDER_LIMIT = 3;

/** One answer bucket; `items` keep the order they were seen in. */
export interface AnswerGroup<T> {
  /** Normalized answer, the grouping key. */
  key: string;
  /** First spelling seen, trimmed (MC: the option text). */
  label: string;
  items: T[];
  /** MA only: this option is part of the key. */
  isKey?: boolean;
}

/** MA: one row per option in option order; each answer counts once under every option it chose. */
function groupMultiAnswerPicks<T>(
  question: Pick<QuizQuestion, 'correctAnswer' | 'incorrectAnswers'>,
  entries: readonly { answer: string; item: T }[]
): AnswerGroup<T>[] {
  const keySet = new Set(
    multiAnswerCorrectOptions(question.correctAnswer).map(normalizeAnswer)
  );
  const groups = new Map<string, AnswerGroup<T>>();
  for (const label of multiAnswerOptions(question)) {
    const key = normalizeAnswer(label);
    if (!groups.has(key))
      groups.set(key, { key, label, items: [], isKey: keySet.has(key) });
  }
  for (const { answer, item } of entries) {
    const picked = new Set(parseMultiAnswer(answer).map(normalizeAnswer));
    for (const key of picked) groups.get(key)?.items.push(item);
  }
  return [...groups.values()];
}

/**
 * Bucket answers the way the grader compares them: MC by option (every option
 * listed, in option order), MA by each option picked, anything else by
 * normalized text, most common first.
 */
export function groupAnswersByOption<T>(
  question: Pick<QuizQuestion, 'type' | 'correctAnswer' | 'incorrectAnswers'>,
  entries: readonly { answer: string; item: T }[]
): AnswerGroup<T>[] {
  if (question.type === 'MA') return groupMultiAnswerPicks(question, entries);
  const groups = new Map<string, AnswerGroup<T>>();
  const isMc = question.type === 'MC';
  if (isMc) {
    const options = [
      question.correctAnswer,
      ...question.incorrectAnswers.filter(Boolean),
    ];
    for (const label of options) {
      const key = normalizeAnswer(label);
      if (!groups.has(key)) groups.set(key, { key, label, items: [] });
    }
  }
  for (const { answer, item } of entries) {
    const key = normalizeAnswer(answer);
    const existing = groups.get(key);
    if (existing) existing.items.push(item);
    // An MC answer that matches no current option is dropped, as in the monitor.
    else if (!isMc)
      groups.set(key, { key, label: answer.trim(), items: [item] });
  }
  const rows = [...groups.values()];
  return isMc ? rows : rows.sort((a, b) => b.items.length - a.items.length);
}

export type StudentOutcome =
  | 'correct'
  | 'partial'
  | 'incorrect'
  | 'ungraded'
  | 'noAnswer'
  | 'excused'
  /** Left out of a choose-N section (QUIZ_EXAMVIEW_IMPORT.md E14). */
  | 'notChosen';

/** A student's identity in the drill-down; render `name` only through the screen's name formatter. */
export interface DrilldownStudent {
  responseKey: ResponseDocKey;
  name: string;
}

/** MC/MA option, FIB answer, or wrong Ordering sequence. */
export interface DrilldownAnswerRow {
  key: string;
  label: string;
  isCorrect: boolean;
  students: DrilldownStudent[];
}

export interface DrilldownPairRow {
  key: string;
  prompt: string;
  answer: string;
  correctCount: number;
  /** Answered but paired this prompt wrongly. */
  missedBy: DrilldownStudent[];
}

export type QuestionDistribution =
  | { kind: 'options'; rows: DrilldownAnswerRow[] }
  | { kind: 'orders'; rows: DrilldownAnswerRow[] }
  | { kind: 'pairs'; rows: DrilldownPairRow[] }
  | { kind: 'none' };

export interface QuestionDrilldown {
  questionId: string;
  /** Denominator for every percentage: served, not excused (D18). */
  servedCount: number;
  outcomes: Record<StudentOutcome, DrilldownStudent[]>;
  distribution: QuestionDistribution;
  commonWrongAnswer: { label: string; count: number } | null;
}

const byName = (a: DrilldownStudent, b: DrilldownStudent) =>
  a.name.localeCompare(b.name);

function emptyOutcomes(): Record<StudentOutcome, DrilldownStudent[]> {
  return {
    correct: [],
    partial: [],
    incorrect: [],
    ungraded: [],
    noAnswer: [],
    excused: [],
    notChosen: [],
  };
}

function isServed(response: QuizResponse, questionId: string): boolean {
  // A lobby-only student has not received an attempt yet.
  if (response.status === 'joined') return false;
  const served = response.servedQuestionIds;
  return !served || served.length === 0 || served.includes(questionId);
}

function splitPair(pair: string): [string, string] {
  const sep = pair.indexOf(':');
  return sep < 0 ? [pair, ''] : [pair.slice(0, sep), pair.slice(sep + 1)];
}

/** First pairing per prompt wins, matching `gradeAnswer`. */
function givenPairMap(answer: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const pair of normalizeAnswer(answer).split('|')) {
    const [left, right] = splitPair(pair);
    if (!map.has(left)) map.set(left, normalizeAnswer(right));
  }
  return map;
}

interface AnsweredEntry {
  student: DrilldownStudent;
  answer: string;
  outcome: StudentOutcome;
}

function buildDistribution(
  question: QuizQuestion,
  answered: AnsweredEntry[]
): QuestionDistribution {
  if (isFreeResponseType(question.type)) return { kind: 'none' };

  if (question.type === 'Matching') {
    const seen = new Set<string>();
    const rows: DrilldownPairRow[] = [];
    const maps = answered.map((e) => givenPairMap(e.answer));
    for (const pair of question.correctAnswer.split('|')) {
      const [prompt, answer] = splitPair(pair);
      const left = normalizeAnswer(prompt);
      if (!prompt.trim() || seen.has(left)) continue;
      seen.add(left);
      const right = normalizeAnswer(answer);
      const missedBy: DrilldownStudent[] = [];
      let correctCount = 0;
      answered.forEach((e, i) => {
        if (maps[i].get(left) === right) correctCount++;
        else missedBy.push(e.student);
      });
      rows.push({
        key: left,
        prompt: prompt.trim(),
        answer: answer.trim(),
        correctCount,
        missedBy: missedBy.sort(byName),
      });
    }
    return { kind: 'pairs', rows };
  }

  if (question.type === 'Ordering') {
    const wrong = answered.filter((e) => e.outcome !== 'correct');
    const rows = groupAnswersByOption(
      question,
      wrong.map((e) => ({ answer: e.answer, item: e.student }))
    )
      .slice(0, ORDERING_WRONG_ORDER_LIMIT)
      .map((g) => ({
        key: g.key,
        label: g.label
          .split('|')
          .map((s) => s.trim())
          .join(' → '),
        isCorrect: false,
        students: g.items.sort(byName),
      }));
    return { kind: 'orders', rows };
  }

  const groups = groupAnswersByOption(
    question,
    answered.map((e) => ({ answer: e.answer, item: e }))
  );
  const rows = groups.map((g) => ({
    key: g.key,
    label: g.label,
    // FIB: a translated accepted answer is correct only for the students it was served to.
    isCorrect:
      question.type === 'MC'
        ? gradeAnswer(question, g.label).isCorrect
        : question.type === 'MA'
          ? g.isKey === true
          : g.items.some((e) => e.outcome === 'correct'),
    students: g.items.map((e) => e.student).sort(byName),
  }));
  return { kind: 'options', rows };
}

function findCommonWrongAnswer(
  distribution: QuestionDistribution,
  servedCount: number
): QuestionDrilldown['commonWrongAnswer'] {
  if (distribution.kind !== 'options' && distribution.kind !== 'orders')
    return null;
  if (servedCount === 0) return null;
  let top: DrilldownAnswerRow | null = null;
  for (const row of distribution.rows) {
    if (row.isCorrect) continue;
    if (!top || row.students.length > top.students.length) top = row;
  }
  if (!top || top.students.length / servedCount < COMMON_WRONG_ANSWER_SHARE)
    return null;
  return { label: top.label, count: top.students.length };
}

/** Per-question outcomes, answer distribution and student lists for the Results drill-down. */
export function computeQuestionDrilldowns(
  questions: QuizQuestion[],
  responses: QuizResponse[],
  resolveName: (response: QuizResponse) => string,
  gradeFn: QuestionGradeFn = gradeQuestionForResponse
): Map<string, QuestionDrilldown> {
  const representatives = responses.map((r) => ({
    response: r,
    student: {
      responseKey: getResponseDocKey(r),
      name: resolveName(r),
    },
    answers: selectRepresentativeAnswers(r.answers ?? []),
  }));

  const result = new Map<string, QuestionDrilldown>();
  for (const q of questions) {
    if (result.has(q.id)) continue;
    const outcomes = emptyOutcomes();
    const answered: AnsweredEntry[] = [];

    for (const { response, student, answers } of representatives) {
      if (!isServed(response, q.id)) continue;
      if (response._notChosen?.includes(q.id)) {
        outcomes.notChosen.push(student);
        continue;
      }
      const entry = answers.get(q.id);
      // Still working toward this question: not part of the denominator yet.
      if (!entry && response.status !== 'completed') continue;
      if (isQuestionExcused(q, response)) {
        outcomes.excused.push(student);
        continue;
      }
      if (!entry || entry.unresponded) {
        outcomes.noAnswer.push(student);
        continue;
      }
      const grade = gradeFn(q, entry.answer, response);
      let outcome: StudentOutcome;
      if (grade.excused) outcome = 'excused';
      else if (grade.state === 'not-attempted') outcome = 'noAnswer';
      else if (grade.state === 'awaiting-grade') outcome = 'ungraded';
      else if (grade.isCorrect) outcome = 'correct';
      else if (grade.pointsEarned > 0) outcome = 'partial';
      else outcome = 'incorrect';
      outcomes[outcome].push(student);
      if (outcome !== 'excused' && outcome !== 'noAnswer') {
        answered.push({ student, answer: entry.answer, outcome });
      }
    }

    for (const list of Object.values(outcomes)) list.sort(byName);
    const servedCount = (Object.keys(outcomes) as StudentOutcome[]).reduce(
      (sum, k) =>
        k === 'excused' || k === 'notChosen' ? sum : sum + outcomes[k].length,
      0
    );
    const distribution = buildDistribution(q, answered);
    result.set(q.id, {
      questionId: q.id,
      servedCount,
      outcomes,
      distribution,
      commonWrongAnswer: findCommonWrongAnswer(distribution, servedCount),
    });
  }
  return result;
}
