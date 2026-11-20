import {
  calcAttemptKey,
  calcValuesFor,
  formatCalcAnswer,
  isCalcQuestion,
  withCalcValues,
} from '@/utils/quizCalculated';
import { deleteField } from 'firebase/firestore';
import type {
  QuestionTranslation,
  QuizData,
  QuizQuestion,
  QuizResponse,
  QuizResponseAnswer,
  QuizScorePoints,
  QuizScoreVisibility,
  QuizSessionSection,
  QuizTranslation,
  RevealedExplanations,
  RevealedRubricExamples,
  StudentOverride,
} from '@/types';
import { isFreeResponseType } from '@/types';
import { rubricExamplesByCriterion } from '@/utils/rubricGuide';
import { notChosenQuestionIds } from '@/utils/quizSections';
import { dedupeQuestionsById } from '@/utils/quizMaxPoints';
import { fibAcceptedAnswers } from '@/utils/quizFibAnswers';
import { fibTranslationIssue } from '@/utils/quizFibTranslation';
import { selectRepresentativeAnswers } from '@/utils/answerTakeOrdering';
import { applyMediaSlots, readSlotGrade } from '@/utils/mediaGrading';
import { gradingPaperTranscript } from '@/utils/paperWritten';
import { revealValueFor } from '@/utils/quizFibAlternates';
import {
  activeResultsOverride,
  answersWithoutVerdicts,
  visibilityShowsResponses,
} from '@/utils/quizResultsVisibility';
import { gradeAnswer, isPaperWrittenSlotAwaiting } from '../useQuizSession';
/** Per-quiz sidecars at publish, keyed by BCP-47 code. */
export type QuizTranslationsByLocale = Record<string, QuizTranslation>;

/**
 * Review AND staleness are both gated here, at publish (§4.3): a question is
 * projected for a locale only when the teacher reviewed it and the sidecar's
 * recorded hash still matches the live English body. `freshQuestionIdsByLocale`
 * is computed by the caller, which holds the quiz body and can await the hash.
 */
export function selectQuestionTranslations(
  questionId: string,
  translations: QuizTranslationsByLocale | undefined,
  freshQuestionIdsByLocale?: Record<string, ReadonlySet<string>>,
  /** The English question, so a FIB entry missing its answer key falls back. */
  question?: Pick<QuizQuestion, 'type' | 'text' | 'correctAnswer'>
): Record<string, QuestionTranslation> | undefined {
  if (!translations) return undefined;
  const out: Record<string, QuestionTranslation> = {};
  for (const [locale, translation] of Object.entries(translations)) {
    const entry = translation.questions?.[questionId];
    if (!entry) continue;
    if (!translation.reviewedQuestionIds?.includes(questionId)) continue;
    if (!freshQuestionIdsByLocale?.[locale]?.has(questionId)) continue;
    if (question && fibTranslationIssue(question, entry)) continue;
    out[locale] = entry;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Teacher-only inputs `gradeResponseForPublish` needs beyond the response itself. */
export interface ResponseGradingContext {
  questionsById: Map<string, QuizQuestion>;
  overridesByStudentUid: Record<string, StudentOverride>;
  servedLanguageByStudentUid: Record<string, string>;
  localizedFibAnswers: Record<string, Record<string, string[]>>;
  /** Served locales graded with typo leniency. */
  lenientFibLocales?: string[];
  /** The session's sections; a choose-N section leaves unchosen questions out (E14). */
  sections?: QuizSessionSection[];
  /** Hybrid paper quiz: an unscanned written answer holds the score. */
  paperWrittenQuestionIds?: string[];
}

export function buildResponseGradingContext(
  quizData: QuizData,
  assignmentData: Record<string, unknown> | undefined
): ResponseGradingContext {
  // Dedupe first-wins (matches session creation) — last-wins can grade against a duplicate's differing correctAnswer.
  const questionsById = new Map<string, QuizQuestion>();
  for (const q of dedupeQuestionsById(quizData.questions))
    questionsById.set(q.id, q);
  return {
    questionsById,
    overridesByStudentUid: (assignmentData?.overridesByStudentUid ??
      {}) as Record<string, StudentOverride>,
    servedLanguageByStudentUid: (assignmentData?.servedLanguageByStudentUid ??
      {}) as Record<string, string>,
    localizedFibAnswers: (assignmentData?.localizedFibAnswers ?? {}) as Record<
      string,
      Record<string, string[]>
    >,
    lenientFibLocales: Array.isArray(assignmentData?.lenientFibLocales)
      ? (assignmentData.lenientFibLocales as unknown[]).filter(
          (l): l is string => typeof l === 'string'
        )
      : undefined,
    paperWrittenQuestionIds: Array.isArray(
      assignmentData?.paperWrittenQuestionIds
    )
      ? (assignmentData.paperWrittenQuestionIds as unknown[]).filter(
          (id): id is string => typeof id === 'string'
        )
      : undefined,
  };
}

/** Every question's answer text, as published at the answers level. */
export function buildRevealedAnswers(
  quizData: QuizData
): Record<string, string> {
  const revealed: Record<string, string> = {};
  // First-wins, matching buildResponseGradingContext — the revealed answer must match what the student was graded against.
  for (const q of dedupeQuestionsById(quizData.questions))
    // A random-number answer is added per student by `withCalcRevealed`.
    if (!isCalcQuestion(q)) revealed[q.id] = revealValueFor(q);
  return revealed;
}

/** The published key for one student: each random-number question's answer from their own numbers. */
export function withCalcRevealed(
  answerKey: Record<string, string> | null,
  questions: Iterable<QuizQuestion>,
  responseKey: string,
  response: Pick<QuizResponse, 'status' | 'completedAttempts'>
): Record<string, string> | null {
  if (!answerKey) return answerKey;
  const key = calcAttemptKey(responseKey, response);
  let out = answerKey;
  for (const q of questions) {
    if (!isCalcQuestion(q) || !q.calc) continue;
    const values = calcValuesFor(q, key);
    if (!values) continue;
    if (out === answerKey) out = { ...answerKey };
    out[q.id] = formatCalcAnswer(q.calc, values);
  }
  return out;
}

/** Scoring-guide example responses by question, published with the answer key; null when there are none. */
export function buildRevealedRubricExamples(
  quizData: QuizData
): RevealedRubricExamples | null {
  const out: RevealedRubricExamples = {};
  for (const q of dedupeQuestionsById(quizData.questions)) {
    if (!q.rubricSnapshot) continue;
    // Modified-rubric criteria carry their own ids, so both share the question's map.
    const examples = {
      ...rubricExamplesByCriterion(q.rubricSnapshot),
      ...(q.modifiedRubricSnapshot
        ? rubricExamplesByCriterion(q.modifiedRubricSnapshot)
        : {}),
    };
    if (Object.keys(examples).length > 0) out[q.id] = examples;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** One response graded for publishing; `score` and `points` are null while a slot awaits a teacher grade. */
export interface PublishGrade {
  score: number | null;
  answers: QuizResponseAnswer[];
  points?: QuizScorePoints | null;
}

/** Grades one response for publishing; `score` is null while a slot awaits a teacher grade. */
export function gradeResponseForPublish(
  data: QuizResponse,
  ctx: ResponseGradingContext,
  /** The response doc id; fixes each student's random numbers. */
  responseKey: string
): PublishGrade {
  const {
    questionsById,
    overridesByStudentUid,
    servedLanguageByStudentUid,
    localizedFibAnswers,
  } = ctx;
  const answers = Array.isArray(data.answers) ? data.answers : [];
  // Prefer the response doc's own served-subset snapshot (written by
  // the student app at answer time) over the live override map — the
  // live map reflects CURRENT targeting, so removing a student's
  // override after they submit would otherwise re-score their subset
  // answers against the full question set. Absent snapshot AND absent
  // override (or no subset on it) = the full quiz, unchanged.
  const snapshotIds =
    Array.isArray(data.servedQuestionIds) && data.servedQuestionIds.length > 0
      ? data.servedQuestionIds
      : undefined;
  const subsetIds =
    snapshotIds ?? overridesByStudentUid[data.studentUid]?.questionIds;
  const baseServed =
    Array.isArray(subsetIds) && subsetIds.length > 0
      ? new Set(subsetIds)
      : null;
  // A question left out of a choose-N section is off this student's total (E14).
  const notChosen = new Set(
    notChosenQuestionIds(
      {
        answers,
        servedQuestionIds: baseServed ? [...baseServed] : undefined,
        status: data.status,
        countedChoices: data.countedChoices,
        completedAttempts: data.completedAttempts,
      },
      ctx.sections
    )
  );
  const servedIds =
    notChosen.size > 0
      ? new Set(
          [...(baseServed ?? questionsById.keys())].filter(
            (id) => !notChosen.has(id)
          )
        )
      : baseServed;
  // Teacher-side truth only: never the client-asserted `response.locale`.
  const servedLocale =
    overridesByStudentUid[data.studentUid]?.language ??
    servedLanguageByStudentUid[data.studentUid] ??
    undefined;
  let pointsEarned = 0;
  let pointsMax = 0;
  // Set when any answered slot is still owed a teacher grade (ungraded
  // written response, or a rubric with criteria left unscored). Such a
  // response gets its `answers` refreshed but NO published `score` —
  // the ungraded slot counts as 0 here, so publishing now would show
  // the student a grade the teacher hasn't finished awarding.
  let awaitingGrade = false;
  // Pick one representative answer per questionId — highest takeIndex
  // wins, ties (equal or absent takeIndex, e.g. an arrayUnion race)
  // broken by earliest answeredAt — so a duplicate answer can't
  // inflate pointsEarned and pointsMax. Each answer is still graded
  // for its `isCorrect` flag, but only the representative contributes
  // to the totals — matching the dedup already applied in the
  // unanswered loop below and mirroring the identical guard in
  // `useVideoActivityAssignments.publishAssignmentScores` (#1728,
  // #1787, #1803).
  const representativeAnswers = selectRepresentativeAnswers(answers);
  const gradedAnswers: QuizResponseAnswer[] = answers.map((a) => {
    const q = questionsById.get(a.questionId);
    if (!q) {
      // Question deleted between submission and publish — we can't
      // claim correctness any more. Strip any stale `isCorrect`
      // from a prior publish so the response doesn't carry a
      // value the canonical quiz no longer supports.
      const { isCorrect: _stale, ...rest } = a;
      void _stale;
      return rest;
    }
    // Pull manual grades for written types so a teacher's stored
    // grade survives the archive snapshot. Without this, archiving
    // a quiz that contained essays would freeze them at 0 points
    // and the archive would silently disagree with the live results
    // view forever after.
    const manualGrade =
      isFreeResponseType(q.type) || q.type === 'FIB'
        ? readSlotGrade(data.grading, q.id)
        : undefined;
    const result = applyMediaSlots(
      q,
      data,
      gradeAnswer(
        withCalcValues(q, calcAttemptKey(responseKey, data)),
        a.answer,
        manualGrade,
        fibAcceptedAnswers(
          localizedFibAnswers,
          q.id,
          servedLocale,
          ctx.lenientFibLocales
        ),
        gradingPaperTranscript(q, data, a)
      )
    );
    if (
      representativeAnswers.get(a.questionId) !== a ||
      (baseServed && !baseServed.has(a.questionId))
    ) {
      // Only the graded answer per served question gets a verdict, so extra entries can't probe the key.
      const { isCorrect: _extra, ...rest } = a;
      void _extra;
      return rest;
    }
    if (!servedIds || servedIds.has(a.questionId)) {
      pointsEarned += result.pointsEarned;
      pointsMax += result.pointsMax;
      // An ungraded extra answer in a choose-N section is not scored, so it can't hold the score.
      if (result.state === 'awaiting-grade') awaitingGrade = true;
    }
    return { ...a, isCorrect: result.isCorrect };
  });
  // Count questions the student didn't answer toward the denominator
  // so a blank response scores 0%, not undefined. Use a Set lookup
  // (O(Q) total) rather than `answers.some(...)` per question (O(Q*A))
  // — the inner `.some` would otherwise become a noticeable stall on
  // PLC-shared assignments with hundreds of submissions × dozens of
  // questions.
  //
  // Iterate questionsById (already deduped) rather than the raw
  // quizData.questions array. A duplicate question id in the raw array
  // (possible when a Drive export writes the same question twice via an
  // arrayUnion-style race) would cause pointsMax to count the same
  // question's points more than once, inflating the denominator and
  // deflating every student's published score. Mirrors the identical
  // fix in publishAssignmentScores for Video Activity (#1728, #1787).
  const answeredQuestionIds = new Set<string>();
  for (const a of answers) answeredQuestionIds.add(a.questionId);
  for (const qId of ctx.paperWrittenQuestionIds ?? []) {
    if (servedIds && !servedIds.has(qId)) continue;
    if (
      questionsById.has(qId) &&
      isPaperWrittenSlotAwaiting(data, qId, ctx.paperWrittenQuestionIds)
    )
      awaitingGrade = true;
  }
  for (const [qId, q] of questionsById) {
    if (servedIds && !servedIds.has(qId)) continue;
    if (!answeredQuestionIds.has(qId)) {
      pointsMax += q.points ?? 1;
    }
  }
  const score =
    pointsMax === 0 ? 0 : Math.round((pointsEarned / pointsMax) * 100);
  if (awaitingGrade)
    return { score: null, answers: gradedAnswers, points: null };
  return {
    score,
    answers: gradedAnswers,
    points: {
      earned: pointsEarned,
      possible: pointsMax,
      attempt: data.completedAttempts ?? 0,
    },
  };
}

/** The score fields a publish writes; both clear while a slot awaits a grade. */
export function publishScoreFields(graded: PublishGrade): {
  score: number | ReturnType<typeof deleteField>;
  scorePoints: QuizScorePoints | ReturnType<typeof deleteField>;
} {
  return {
    score: graded.score ?? deleteField(),
    scorePoints: graded.points ?? deleteField(),
  };
}

/** True when a class publish must keep the key and verdicts off a response: an open attempt or a hidden student. */
export function withholdsPublishedResults(
  data: QuizResponse,
  now: number
): boolean {
  return (
    data.status !== 'completed' ||
    activeResultsOverride(data.resultsOverride, now)?.mode === 'hidden'
  );
}

/** One response's class-publish patch; the key lives on each response, never the session (D4). */
export function classPublishPatch(
  data: QuizResponse,
  graded: PublishGrade,
  opts: {
    visibility: QuizScoreVisibility;
    now: number;
    answerKey: Record<string, string> | null;
    rubricExamples: RevealedRubricExamples | null;
    explanations: RevealedExplanations | null;
  }
): Record<string, unknown> {
  const withhold = withholdsPublishedResults(data, opts.now);
  const override = activeResultsOverride(data.resultsOverride, opts.now);
  // Right/wrong stays off the student-readable doc unless the class or this student's own publish shows responses.
  const keepVerdicts =
    !withhold &&
    (visibilityShowsResponses(opts.visibility) ||
      (override?.mode === 'shown' &&
        visibilityShowsResponses(override.visibility)));
  return {
    // `deleteField()` so a stale score can't linger once a slot awaits grading.
    ...publishScoreFields(graded),
    answers: keepVerdicts
      ? graded.answers
      : answersWithoutVerdicts(graded.answers),
    revealedAnswers: (withhold ? null : opts.answerKey) ?? deleteField(),
    revealedRubricExamples:
      (withhold ? null : opts.rubricExamples) ?? deleteField(),
    revealedExplanations:
      (withhold ? null : opts.explanations) ?? deleteField(),
  };
}

/** Hiding a student also pulls the key and right/wrong an earlier class publish wrote. */
export function hiddenResultsPatch(
  data: QuizResponse,
  override: Record<string, unknown>
): Record<string, unknown> {
  return {
    resultsOverride: override,
    revealedAnswers: deleteField(),
    revealedRubricExamples: deleteField(),
    revealedExplanations: deleteField(),
    ...(Array.isArray(data.answers)
      ? { answers: answersWithoutVerdicts(data.answers) }
      : {}),
  };
}
