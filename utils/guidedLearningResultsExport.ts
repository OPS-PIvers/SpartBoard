// Google Sheets export for Guided Learning results, through the shared Quiz exporter.
import { QuizDriveService } from '@/utils/quizDriveService';
import { formatQuizAnswerPlain } from '@/utils/assignmentExportShared';
import { isAnswerCorrect } from '@/hooks/useGuidedLearningSession';
import type {
  GradeResult,
  GuidedLearningQuestionType,
  GuidedLearningResponse,
  GuidedLearningStep,
  QuizQuestion,
  QuizQuestionType,
  QuizResponse,
} from '@/types';

const SHEET_TYPE: Record<GuidedLearningQuestionType, QuizQuestionType> = {
  'multiple-choice': 'MC',
  matching: 'Matching',
  sorting: 'Ordering',
};

type GlSheetAnswer = QuizResponse['answers'][number];

/** One quiz-shaped question per GL question step, first copy of each id. */
export function glSheetQuestions(steps: GuidedLearningStep[]): QuizQuestion[] {
  const seen = new Set<string>();
  const out: QuizQuestion[] = [];
  for (const s of steps) {
    const q = s.interactionType === 'question' ? s.question : undefined;
    if (!q || seen.has(s.id)) continue;
    seen.add(s.id);
    const key =
      q.type === 'multiple-choice'
        ? (q.correctAnswer ?? '')
        : q.type === 'matching'
          ? (q.matchingPairs ?? [])
              .map((p) => `${p.left} → ${p.right}`)
              .join('; ')
          : (q.sortingItems ?? [])
              .map((item, i) => `${i + 1}. ${item}`)
              .join('; ');
    out.push({
      id: s.id,
      text: q.text,
      type: SHEET_TYPE[q.type],
      points: 1,
      correctAnswer: key,
    } as QuizQuestion);
  }
  return out;
}

/** Quiz-shaped responses; each answer carries the GL grader's verdict, first answer per step. */
export function glSheetResponses(
  responses: GuidedLearningResponse[],
  steps: GuidedLearningStep[]
): QuizResponse[] {
  const stepById = new Map<string, GuidedLearningStep>();
  for (const s of steps) if (!stepById.has(s.id)) stepById.set(s.id, s);
  return responses.map((r) => {
    const seen = new Set<string>();
    const answers: GlSheetAnswer[] = [];
    for (const a of r.answers) {
      const step = stepById.get(a.stepId);
      if (!step || seen.has(a.stepId)) continue;
      seen.add(a.stepId);
      answers.push({
        questionId: a.stepId,
        answer: Array.isArray(a.answer) ? a.answer.join('|') : a.answer,
        isCorrect: isAnswerCorrect(step, a.answer),
      } as GlSheetAnswer);
    }
    const completed = typeof r.completedAt === 'number';
    return {
      studentUid: r.studentAnonymousId,
      pin: r.pin ?? '',
      classPeriod: r.classPeriod,
      joinedAt: r.startedAt,
      status: completed ? 'completed' : 'in-progress',
      answers,
      score: r.score,
      submittedAt: completed ? r.completedAt : null,
      ...(r.staffEmail
        ? { staffEmail: r.staffEmail, staffName: r.staffName ?? '' }
        : {}),
    } as unknown as QuizResponse;
  });
}

/** Scores a GL sheet answer from the verdict `glSheetResponses` stored on it. */
export function glSheetGrade(
  question: QuizQuestion,
  _answer: string,
  response?: QuizResponse
): GradeResult {
  const max = question.points ?? 1;
  const correct =
    response?.answers.find((a) => a.questionId === question.id)?.isCorrect ===
    true;
  return {
    isCorrect: correct,
    pointsEarned: correct ? max : 0,
    pointsMax: max,
    state: 'scored',
  };
}

export interface GuidedLearningExportOptions {
  byStudentUid?: Map<string, { givenName: string; familyName: string }>;
  teacherName?: string;
  /** Gradebook final score per student; adds a Final score column when set. */
  finalScore?: (response: GuidedLearningResponse) => string;
}

/** Creates a results sheet for a Guided Learning assignment and returns its URL. */
export function exportGuidedLearningResults(
  token: string,
  title: string,
  responses: GuidedLearningResponse[],
  steps: GuidedLearningStep[],
  options: GuidedLearningExportOptions = {}
): Promise<string> {
  const byKey = new Map(responses.map((r) => [r.studentAnonymousId, r]));
  const finalScore = options.finalScore;
  return new QuizDriveService(token).exportResultsToSheet(
    title,
    glSheetResponses(responses, steps),
    glSheetQuestions(steps),
    {
      byStudentUid: options.byStudentUid,
      teacherName: options.teacherName,
      gradeFn: glSheetGrade,
      formatAnswer: formatQuizAnswerPlain,
      extraColumn: finalScore
        ? {
            header: 'Final score',
            cell: (r) => {
              const original = byKey.get(r.studentUid);
              return original ? finalScore(original) : '';
            },
          }
        : undefined,
    }
  );
}
