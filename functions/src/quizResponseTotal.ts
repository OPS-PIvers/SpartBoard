// AB-389: the one server total for a quiz response, shared by score-on-submit, the gradebook, PLC and the connector.
import {
  gradeGroupAnswer,
  paperAnswerOwed,
  selectRepresentativeAnswers,
  trustedPaperTranscript,
  type GroupQuestion,
  type LocalGrade,
  type LocalGradeState,
  type ManualGrade,
  type RawAnswer,
} from './plcAssessmentMath';
import type { FibExtras } from './quizFibMatch';
import { notChosenIds, type ChooseSection } from './quizSectionsChosen';
import { withCalcValues } from './quizCalculated';

export interface ResponseTotalInput {
  /** The answer key, by the question ids the student was served. */
  questions: readonly GroupQuestion[];
  answers: readonly RawAnswer[];
  /** The response's snapshot or the student's override subset; empty serves every key question. */
  servedQuestionIds?: readonly string[];
  sections?: readonly ChooseSection[];
  /** Teacher picks of which answers count, by choose-N section id. */
  countedChoices?: Record<string, string[]>;
  manualGrades?: Record<string, ManualGrade>;
  /** Translated accepted answers for a fill-in-the-blank question. */
  fibAnswersFor?: (questionId: string) => FibExtras | undefined;
  /** Server-imported paper response, so its `paperTranscript` is trusted. */
  paperAttested?: boolean;
  /** Hybrid paper quiz: written questions answered on a printed sheet. */
  paperWrittenQuestionIds?: readonly string[];
  /** Fixes the student's random numbers. */
  calcKey?: string;
  /** The student gets the modified version. */
  modified?: boolean;
  /** Replaces the default random-number fill (PLC seeds from the served copy). */
  prepare?: (question: GroupQuestion) => GroupQuestion;
}

export interface QuestionTotal {
  question: GroupQuestion;
  answer: RawAnswer | undefined;
  grade: LocalGrade;
  /** The grade's state, with an unscanned or untranscribed paper answer moved to awaiting. */
  state: LocalGradeState;
  /** False for a question left out of a choose-N section; it is graded but never totalled. */
  counted: boolean;
}

export interface ResponseTotal {
  /** Points earned on counted, graded questions. */
  earned: number;
  /** Points possible on counted questions, awaiting ones included. */
  max: number;
  /** Points possible on counted questions that have a grade (not awaiting, not keyless). */
  gradedMax: number;
  awaiting: boolean;
  noKey: boolean;
  /** Served question ids the key doesn't have. */
  unknownServed: string[];
  /** One entry per served question in the key, counted or not, in key order. */
  questions: QuestionTotal[];
}

/** Grades every served question of one response and totals the counted ones. */
export function scoreResponseTotal(input: ResponseTotalInput): ResponseTotal {
  const byId = new Map<string, GroupQuestion>();
  for (const q of input.questions) if (!byId.has(q.id)) byId.set(q.id, q);
  const subset = input.servedQuestionIds?.length
    ? [...new Set(input.servedQuestionIds)]
    : null;
  const served = subset ?? [...byId.keys()];
  const notChosen = notChosenIds(
    input.sections ? [...input.sections] : undefined,
    input.answers,
    subset ?? undefined,
    input.countedChoices
  );
  const representative = selectRepresentativeAnswers([...input.answers]);
  const paperWritten = new Set(input.paperWrittenQuestionIds ?? []);
  const prepare =
    input.prepare ??
    ((q: GroupQuestion) =>
      withCalcValues(q, input.calcKey, input.modified === true));

  const out: ResponseTotal = {
    earned: 0,
    max: 0,
    gradedMax: 0,
    awaiting: false,
    noKey: false,
    unknownServed: [],
    questions: [],
  };
  const servedSet = new Set(served);
  for (const id of served)
    if (!byId.has(id) && !notChosen.has(id)) out.unknownServed.push(id);
  // Key order, so sums and evidence add up the same way every time.
  for (const [id, question] of byId) {
    if (!servedSet.has(id)) continue;
    const answer = representative.get(id);
    const grade = gradeGroupAnswer(
      prepare(question),
      answer?.answer ?? '',
      input.manualGrades?.[id],
      question.type === 'FIB' ? input.fibAnswersFor?.(id) : undefined,
      trustedPaperTranscript(question, input.paperAttested, answer)
    );
    let state = grade.state;
    const writtenOnPaper = paperWritten.has(id);
    // A paper answer not yet scanned or still untranscribed is owed a grade, never a 0.
    if (
      state === 'not-attempted' &&
      ((input.paperAttested === true &&
        (question.type === 'free-response' || writtenOnPaper) &&
        paperAnswerOwed(answer?.paperTranscript)) ||
        (writtenOnPaper && answer?.paperTranscript !== 'blank'))
    )
      state = 'awaiting-grade';
    const counted = !notChosen.has(id);
    out.questions.push({ question, answer, grade, state, counted });
    if (!counted) continue;
    out.max += question.points;
    if (state === 'awaiting-grade') {
      out.awaiting = true;
      continue;
    }
    if (state === 'no-key') {
      out.noKey = true;
      continue;
    }
    out.earned += grade.pointsEarned;
    out.gradedMax += grade.pointsMax;
  }
  return out;
}
