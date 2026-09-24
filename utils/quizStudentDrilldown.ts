import {
  isFreeResponseType,
  type QuizQuestion,
  type QuizResponse,
  type Rubric,
  type WrittenAnswerGrade,
} from '@/types';
import { normalizeAnswer } from '@/hooks/useQuizSession';
import { selectRepresentativeAnswers } from '@/utils/answerTakeOrdering';
import { formatQuizAnswerText } from '@/utils/assignmentExportShared';
import { isQuestionExcused, readSlotGrade } from '@/utils/mediaGrading';
import { paperChoiceOrder } from '@/utils/paperSheetPlan';
import {
  multiAnswerCorrectOptions,
  multiAnswerOptions,
  parseMultiAnswer,
} from '@/utils/quizMultiAnswer';
import { seededShuffle } from '@/utils/quizShuffle';
import { sanitizeQuizResponse } from '@/utils/security';
import {
  gradeQuestionForResponse,
  type QuestionGradeFn,
} from '@/utils/quizQuestionStats';
import type { StudentOutcome } from '@/utils/quizQuestionDrilldown';
import { htmlToPlainText } from '@/utils/writtenAnnotations';

/** One question as one student saw it, graded live. */
export interface StudentQuestionLine {
  questionId: string;
  /** 1-based position in the quiz, matching the Questions screen. */
  number: number;
  text: string;
  type: QuizQuestion['type'];
  mark: StudentOutcome;
  pointsEarned: number;
  /** 0 when excused: the question leaves this student's denominator. */
  pointsMax: number;
  answerText: string;
  /** Answer key text on every auto-graded line with a key; null for written ones. */
  correctAnswerText: string | null;
  /** Written or recorded: graded by the teacher in the grader. */
  manual: boolean;
  /** MC/MA: every option in the order it prints, with the student's picks and the key. */
  options?: StudentOptionLine[];
  /** Matching: one row per prompt the key lists. */
  pairs?: StudentMatchPair[];
  /** Ordering: the student's order and the key's order. */
  order?: { given: string[]; expected: string[] };
  /** Written: the formatted answer, sanitized; the grade snapshot when there is one. */
  answerHtml?: string;
  /** Written: the teacher's grade for the primary slot. */
  writtenGrade?: WrittenAnswerGrade;
  /** Written: the rubric this student was graded on. */
  rubric?: Rubric;
  /** The answer is a recording rather than text. */
  recorded?: 'audio' | 'video';
  stimulusIds?: string[];
}

export interface StudentOptionLine {
  text: string;
  picked: boolean;
  correct: boolean;
}

export interface StudentMatchPair {
  term: string;
  given: string;
  expected: string;
  correct: boolean;
}

/** The key under a line only when the student missed it: the screen's rule. */
export function showsMissedKey(line: StudentQuestionLine): boolean {
  return (
    line.correctAnswerText !== null &&
    (line.mark === 'incorrect' || line.mark === 'partial')
  );
}

export interface StudentDrilldownOptions {
  /** A paper batch's lettered option order per question; absent for online work. */
  choiceOrder?: Record<string, string[]>;
  /** The rubric after per-student overrides; defaults to the question's snapshot. */
  rubricFor?: (question: QuizQuestion) => Rubric | undefined;
}

export interface StudentDrilldown {
  lines: StudentQuestionLine[];
  pointsEarned: number;
  pointsMax: number;
  /** Rounded percent over the questions that count; null when none do. */
  percent: number | null;
  /** At least one answer still needs a teacher grade. */
  provisional: boolean;
  submittedAt: number | null;
}

function isServed(response: QuizResponse, questionId: string): boolean {
  const served = response.servedQuestionIds;
  return !served || served.length === 0 || served.includes(questionId);
}

function readableAnswer(
  question: QuizQuestion,
  entry: Parameters<typeof formatQuizAnswerText>[1]
): string {
  const text = formatQuizAnswerText(question, entry);
  return isFreeResponseType(question.type) && /<[a-z][\s\S]*>/i.test(text)
    ? htmlToPlainText(text).trim()
    : text;
}

const same = (a: string, b: string) =>
  normalizeAnswer(a) === normalizeAnswer(b);

/** Online options print in one fixed shuffle: authoring order would always put the key first. */
function mcOptions(
  q: QuizQuestion,
  answer: string,
  choiceOrder: string[] | undefined
): StudentOptionLine[] {
  const order =
    choiceOrder && choiceOrder.length > 0
      ? choiceOrder
      : paperChoiceOrder('results-print', {
          ...q,
          incorrectAnswers: q.incorrectAnswers.filter(Boolean),
        });
  return order.map((text) => ({
    text,
    picked: answer !== '' && same(text, answer),
    correct: q.correctAnswer.trim() !== '' && same(text, q.correctAnswer),
  }));
}

/** MA options in one fixed shuffle, each marked picked and/or in the key. */
function multiAnswerOptionLines(
  q: QuizQuestion,
  answer: string
): StudentOptionLine[] {
  const picked = new Set(parseMultiAnswer(answer).map(normalizeAnswer));
  const key = new Set(
    multiAnswerCorrectOptions(q.correctAnswer).map(normalizeAnswer)
  );
  return seededShuffle(multiAnswerOptions(q), `results-print:${q.id}`).map(
    (text) => ({
      text,
      picked: picked.has(normalizeAnswer(text)),
      correct: key.has(normalizeAnswer(text)),
    })
  );
}

const splitPair = (pair: string): [string, string] => {
  const sep = pair.indexOf(':');
  return sep < 0 ? [pair, ''] : [pair.slice(0, sep), pair.slice(sep + 1)];
};

function matchPairs(q: QuizQuestion, answer: string): StudentMatchPair[] {
  const given = new Map<string, string>();
  for (const p of answer ? answer.split('|') : []) {
    const [term, def] = splitPair(p);
    const key = normalizeAnswer(term);
    if (!given.has(key)) given.set(key, def);
  }
  const seen = new Set<string>();
  return q.correctAnswer
    .split('|')
    .filter(Boolean)
    .flatMap((p) => {
      const [term, expected] = splitPair(p);
      const key = normalizeAnswer(term);
      if (seen.has(key)) return [];
      seen.add(key);
      const answered = given.get(key) ?? '';
      return [
        {
          term,
          given: answered,
          expected,
          correct: answered !== '' && same(answered, expected),
        },
      ];
    });
}

function recordedKind(
  entry: Parameters<typeof formatQuizAnswerText>[1]
): 'audio' | 'video' | undefined {
  const art = entry.artifacts?.find(
    (a) => a.kind === 'audio' || a.kind === 'video'
  );
  return art ? (art.kind as 'audio' | 'video') : undefined;
}

/** Question-by-question results for one student; bank quizzes list only the questions served. */
export function computeStudentDrilldown(
  questions: QuizQuestion[],
  response: QuizResponse,
  gradeFn: QuestionGradeFn = gradeQuestionForResponse,
  options: StudentDrilldownOptions = {}
): StudentDrilldown {
  const answers = selectRepresentativeAnswers(response.answers ?? []);
  const seen = new Set<string>();
  const lines: StudentQuestionLine[] = [];

  questions.forEach((q, index) => {
    if (seen.has(q.id)) return;
    seen.add(q.id);
    if (!isServed(response, q.id)) return;
    const entry = answers.get(q.id);
    const max = q.points ?? 1;
    const manual = isFreeResponseType(q.type);
    const hasKey = !manual && q.correctAnswer.trim() !== '';
    const answer = entry && !entry.unresponded ? (entry.answer ?? '') : '';
    const base: Pick<
      StudentQuestionLine,
      | 'questionId'
      | 'number'
      | 'text'
      | 'type'
      | 'manual'
      | 'correctAnswerText'
      | 'options'
      | 'pairs'
      | 'order'
      | 'answerHtml'
      | 'writtenGrade'
      | 'rubric'
      | 'recorded'
      | 'stimulusIds'
    > = {
      questionId: q.id,
      number: index + 1,
      text: q.text,
      type: q.type,
      manual,
      correctAnswerText: hasKey
        ? formatQuizAnswerText(q, { answer: q.correctAnswer })
        : null,
    };
    if (q.stimulusIds?.length) base.stimulusIds = [...q.stimulusIds];
    if (q.type === 'MC') {
      base.options = mcOptions(q, answer, options.choiceOrder?.[q.id]);
    } else if (q.type === 'MA') {
      base.options = multiAnswerOptionLines(q, answer);
    } else if (q.type === 'Matching') {
      base.pairs = matchPairs(q, answer);
    } else if (q.type === 'Ordering') {
      base.order = {
        given: answer ? answer.split('|') : [],
        expected: q.correctAnswer.split('|').filter(Boolean),
      };
    } else if (manual) {
      const grade = readSlotGrade(response.grading, q.id);
      const rubric = options.rubricFor
        ? options.rubricFor(q)
        : q.rubricSnapshot;
      if (grade) base.writtenGrade = grade;
      if (rubric) base.rubric = rubric;
      if (entry) {
        const recorded = recordedKind(entry);
        if (recorded) base.recorded = recorded;
      }
      const html =
        grade?.gradingSnapshot ?? (answer ? sanitizeQuizResponse(answer) : '');
      if (html) base.answerHtml = html;
    }

    if (isQuestionExcused(q, response)) {
      lines.push({
        ...base,
        mark: 'excused',
        pointsEarned: 0,
        pointsMax: 0,
        answerText: entry ? readableAnswer(q, entry) : '',
      });
      return;
    }
    if (!entry || entry.unresponded) {
      lines.push({
        ...base,
        mark: 'noAnswer',
        pointsEarned: 0,
        pointsMax: max,
        answerText: '',
      });
      return;
    }

    const grade = gradeFn(q, entry.answer, response);
    let mark: StudentOutcome;
    if (grade.excused) mark = 'excused';
    else if (grade.state === 'not-attempted') mark = 'noAnswer';
    else if (grade.state === 'awaiting-grade') mark = 'ungraded';
    else if (grade.isCorrect) mark = 'correct';
    else if (grade.pointsEarned > 0) mark = 'partial';
    else mark = 'incorrect';

    lines.push({
      ...base,
      mark,
      pointsEarned: mark === 'excused' ? 0 : grade.pointsEarned,
      pointsMax: mark === 'excused' ? 0 : grade.pointsMax,
      answerText: readableAnswer(q, entry),
    });
  });

  let pointsEarned = 0;
  let pointsMax = 0;
  for (const line of lines) {
    pointsEarned += line.pointsEarned;
    pointsMax += line.pointsMax;
  }
  return {
    lines,
    pointsEarned,
    pointsMax,
    percent:
      pointsMax > 0 ? Math.round((pointsEarned / pointsMax) * 100) : null,
    provisional: lines.some((l) => l.mark === 'ungraded'),
    submittedAt: response.submittedAt ?? null,
  };
}
