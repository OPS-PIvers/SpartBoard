// Class-level result summaries (CC-D3, CC-D11): own sessions only, no student-level data, suppressed below 5 responses.
import type * as admin from 'firebase-admin';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ToolError, type ToolContext } from './activity';
import { driveTokenFor, readDriveJson } from './drive';
import { READ_ONLY, iso, run } from './toolKit';
import { bucketScores } from '../plcAssessmentMath';
import { readManifest, type ManifestQuestion } from '../miniAppGrading';
import type {
  AggregatePayload,
  CompletedResponse,
  SessionInput,
} from '../plcAssessmentMath';

/** Smallest class a summary is shown for (CC-D3). */
export const MIN_RESPONSES = 5;
const MAX_SESSIONS = 5;
const MAX_TEXT = 300;

type Data = Record<string, unknown>;

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asText = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : fallback;
const clip = (s: string) =>
  s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT - 3)}...` : s;

/** Shapes the aggregate for Claude: counts and percents only, never a student or a typed answer. */
export function formatSummary(
  payload: AggregatePayload,
  questionTypes: Map<string, string>
) {
  return {
    completed_responses: payload.studentCount,
    average_percent:
      payload.scoredStudentCount > 0 ? payload.teamAveragePercent : null,
    scored_responses: payload.scoredStudentCount,
    score_bands: payload.scoreDistribution.map((b) => ({
      percent: `${b.min}-${b.max}`,
      students: b.count,
    })),
    questions: payload.perQuestion.map((q, i) => ({
      number: i + 1,
      question_id: q.questionId,
      text: clip(q.text),
      type: questionTypes.get(q.questionId) ?? null,
      points: q.points,
      answered: q.answered,
      graded: q.graded,
      percent_correct: q.graded > 0 ? q.correctPercent : null,
      ...(q.choiceDistribution.length > 0
        ? {
            choices: q.choiceDistribution.map((c) => ({
              choice: clip(c.label),
              picked: c.count,
              correct: c.isCorrect,
            })),
          }
        : {}),
    })),
    ...(payload.alignmentWarning ? { warning: payload.alignmentWarning } : {}),
  };
}

export const suppressed = (count: number) => ({
  completed_responses: count < 1 ? 0 : `fewer than ${MIN_RESPONSES}`,
  suppressed: true,
  reason: `Summaries are only shown once at least ${MIN_RESPONSES} students have finished, so no one student can be singled out.`,
});

const TYPE_NAMES: Record<string, string> = {
  MC: 'multiple_choice',
  MA: 'choose_all',
  FIB: 'fill_in_blank',
  Matching: 'matching',
  Ordering: 'ordering',
  'free-response': 'free_response',
};

function typeMap(questions: unknown[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const q of questions) {
    const r = (q ?? {}) as Data;
    if (typeof r.id === 'string' && typeof r.type === 'string') {
      out.set(r.id, TYPE_NAMES[r.type] ?? r.type);
    }
  }
  return out;
}

async function aggregate(
  kind: 'quiz' | 'video-activity',
  id: string,
  title: string,
  keyQuestions: unknown[],
  session: Omit<SessionInput, 'teacherName'>
) {
  const { computeAssessmentAggregate, resolveGroupQuestions } =
    await import('../plcAssessmentMath');
  const groupQuestions = resolveGroupQuestions(
    { questions: keyQuestions },
    session.publicQuestions,
    session.questionSnapshot ?? []
  );
  const payload = computeAssessmentAggregate({
    assessmentId: id,
    title,
    kind,
    groupQuestions,
    sessions: [{ ...session, teacherName: '' }],
  });
  return formatSummary(payload, typeMap(keyQuestions));
}

async function quizSessionSummary(
  ctx: ToolContext,
  sessionDoc: admin.firestore.DocumentSnapshot,
  keyCache: Map<string, unknown[]>
) {
  const [
    { withQuizSessionContent },
    recompute,
    { parseChooseSections },
    { sessionClassPredicate },
  ] = await Promise.all([
    import('../quizSessionContent'),
    import('../recomputePlcAssessments'),
    import('../quizSectionsChosen'),
    import('../sessionClassFilter'),
  ]);
  const sessionData: Data = sessionDoc.data() ?? {};
  const s = await withQuizSessionContent(sessionDoc.ref, sessionData);
  const assignmentId = asText(s.assignmentId, sessionDoc.id);
  const [responsesSnap, assignmentSnap] = await Promise.all([
    sessionDoc.ref
      .collection('responses')
      .where('status', '==', 'completed')
      .get(),
    ctx.db.doc(`users/${ctx.uid}/quiz_assignments/${assignmentId}`).get(),
  ]);
  // Classes removed from the quiz are left out, as in Quiz Results.
  const keepClass = sessionClassPredicate(s);
  const responses = responsesSnap.docs.filter((d) => keepClass(d.data()));
  const assignment: Data = assignmentSnap.data() ?? {};
  const header = {
    assignment_id: sessionDoc.id,
    class_periods: asArray(s.periodNames ?? assignment.periodNames),
    status: s.status ?? null,
    started_at: iso(s.startedAt),
    ended_at: iso(s.endedAt),
    scores_published: s.scorePublishedAt != null,
  };
  if (responses.length < MIN_RESPONSES) {
    return { ...header, ...suppressed(responses.length) };
  }
  const keyQuestions = await quizKey(ctx, s, assignment, keyCache);
  return {
    ...header,
    ...(await aggregate(
      'quiz',
      sessionDoc.id,
      asText(s.quizTitle),
      keyQuestions,
      {
        id: sessionDoc.id,
        teacherUid: ctx.uid,
        publicQuestions: asArray(s.publicQuestions),
        questionSnapshot: asArray(assignment.questionSnapshot),
        responses: responses.map((d): CompletedResponse =>
          recompute.parseCompletedResponse(d.data())
        ),
        scorePublishedAt:
          typeof s.scorePublishedAt === 'number' ? s.scorePublishedAt : null,
        localizedFibAnswers: recompute.parseLocalizedFibAnswers(
          assignment.localizedFibAnswers
        ),
        overridesByStudentUid: recompute.parseServedLanguages(
          assignment.overridesByStudentUid
        ),
        sections: parseChooseSections(s.sections),
      }
    )),
  };
}

/** Answer key: the PLC canonical copy when synced, otherwise the Drive file the assignment was built from. */
async function quizKey(
  ctx: ToolContext,
  session: Data,
  assignment: Data,
  cache: Map<string, unknown[]>
): Promise<unknown[]> {
  const syncGroupId =
    typeof session.syncGroupId === 'string' ? session.syncGroupId : '';
  const fileId =
    typeof assignment.quizDriveFileId === 'string'
      ? assignment.quizDriveFileId
      : '';
  const cacheKey = syncGroupId ? `sync:${syncGroupId}` : `drive:${fileId}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  let questions: unknown[] = [];
  if (syncGroupId) {
    const synced = await ctx.db.doc(`synced_quizzes/${syncGroupId}`).get();
    questions = asArray(synced.get('questions'));
  }
  if (questions.length === 0 && fileId) {
    const token = await driveTokenFor(ctx.uid);
    questions = asArray(
      ((await readDriveJson(token, fileId)) as Data)?.questions
    );
  }
  cache.set(cacheKey, questions);
  return questions;
}

/** Video keys store FIB alternates as acceptableVariants; the shared grader reads alternateAnswers. */
export function videoKeyForGrader(questions: unknown[]): unknown[] {
  return questions.map((q) => {
    const r = (q ?? {}) as Data;
    return Array.isArray(r.acceptableVariants)
      ? { ...r, alternateAnswers: r.acceptableVariants }
      : r;
  });
}

/** Live (teacher-paced) sessions score only the questions the class was asked. */
export function videoAskedScope(session: Data): {
  pacing: 'live' | 'self_paced';
  keep: (questions: unknown[]) => unknown[];
} {
  if (session.sessionMode !== 'teacher') {
    return { pacing: 'self_paced', keep: (questions) => questions };
  }
  const live = (session.live ?? {}) as Data;
  const asked = new Set(
    asArray(live.askedQuestionIds).filter(
      (id): id is string => typeof id === 'string'
    )
  );
  return {
    pacing: 'live',
    keep: (questions) =>
      questions.filter((q) => asked.has(asText(((q ?? {}) as Data).id))),
  };
}

async function videoSessionSummary(
  ctx: ToolContext,
  sessionDoc: admin.firestore.DocumentSnapshot
) {
  const recompute = await import('../recomputePlcAssessments');
  const s: Data = sessionDoc.data() ?? {};
  const [responses, keySnap] = await Promise.all([
    sessionDoc.ref.collection('responses').get(),
    sessionDoc.ref.collection('key').doc('answers').get(),
  ]);
  const completed = responses.docs.filter((d) => d.get('completedAt') != null);
  const scope = videoAskedScope(s);
  const header = {
    assignment_id: sessionDoc.id,
    assignment_name: s.assignmentName ?? null,
    pacing: scope.pacing,
    class_periods: asArray(s.periodNames),
    status: s.status ?? null,
    created_at: iso(s.createdAt),
    ended_at: iso(s.endedAt),
  };
  if (completed.length < MIN_RESPONSES) {
    return { ...header, ...suppressed(completed.length) };
  }
  const allKeyQuestions = videoKeyForGrader(
    asArray(keySnap.get('questions')).length > 0
      ? asArray(keySnap.get('questions'))
      : asArray(s.questions)
  );
  const keyQuestions = scope.keep(allKeyQuestions);
  const publicQuestions = scope.keep(asArray(s.publicQuestions));
  const notAsked = allKeyQuestions.length - keyQuestions.length;
  return {
    ...header,
    ...(scope.pacing === 'live' ? { questions_not_asked: notAsked } : {}),
    ...(await aggregate(
      'video-activity',
      sessionDoc.id,
      asText(s.activityTitle),
      keyQuestions,
      {
        id: sessionDoc.id,
        teacherUid: ctx.uid,
        publicQuestions:
          publicQuestions.length > 0 ? publicQuestions : keyQuestions,
        responses: completed.map((d) =>
          recompute.parseCompletedResponse(d.data())
        ),
        scorePublishedAt:
          typeof s.scorePublishedAt === 'number' ? s.scorePublishedAt : null,
      }
    )),
  };
}

const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** D15: a Mini App assignment's class-level summary from each student's best attempt. */
export function summarizeMiniAppSubmissions(
  questions: ManifestQuestion[],
  submissions: Data[]
) {
  const percents: number[] = [];
  const marks = new Map<
    string,
    { graded: number; correct: number; byApp: boolean }
  >();
  let attempts = 0;
  for (const sub of submissions) {
    if (isNum(sub.attemptCount)) attempts += sub.attemptCount;
    const best = (sub.best ?? null) as Data | null;
    if (!best) continue;
    if (isNum(best.score) && isNum(best.maxScore) && best.maxScore > 0)
      percents.push((best.score / best.maxScore) * 100);
    for (const item of asArray(best.items)) {
      const r = (item ?? {}) as Data;
      if (typeof r.id !== 'string') continue;
      const m = marks.get(r.id) ?? { graded: 0, correct: 0, byApp: false };
      m.graded++;
      if (r.correct === true) m.correct++;
      if (r.by === 'app') m.byApp = true;
      marks.set(r.id, m);
    }
  }
  const pct = (n: number, d: number) => Math.round((n / d) * 100);
  return {
    completed_responses: submissions.length,
    scored_responses: percents.length,
    average_percent:
      percents.length > 0
        ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length)
        : null,
    average_attempts:
      submissions.length > 0
        ? Math.round((attempts / submissions.length) * 10) / 10
        : null,
    score_bands: bucketScores(percents).map((b) => ({
      percent: `${b.min}-${b.max}`,
      students: b.count,
    })),
    questions: questions.map((q, i) => {
      const m = marks.get(q.id);
      return {
        number: i + 1,
        question_id: q.id,
        text: clip(q.prompt),
        type: q.type,
        points: q.points ?? 1,
        graded: m?.graded ?? 0,
        percent_correct: m && m.graded > 0 ? pct(m.correct, m.graded) : null,
        ...(m?.byApp ? { scored_by: 'app' } : {}),
      };
    }),
  };
}

async function miniAppSessionSummary(
  sessionDoc: admin.firestore.DocumentSnapshot
) {
  const s: Data = sessionDoc.data() ?? {};
  const header = {
    assignment_id: sessionDoc.id,
    assignment_name: s.assignmentName ?? null,
    status: s.status ?? null,
    created_at: iso(s.createdAt),
    ended_at: iso(s.endedAt),
  };
  if (s.resultsVersion !== 2) {
    return {
      ...header,
      note: 'This assignment was made before Mini App results were scored, so it has no summary.',
    };
  }
  const subs = await sessionDoc.ref.collection('submissions').get();
  const finished = subs.docs
    .map((d) => d.data())
    .filter(
      (d) =>
        (isNum(d.attemptCount) && d.attemptCount > 0) ||
        ((d.payload ?? {}) as Data).completed === true
    );
  if (finished.length < MIN_RESPONSES) {
    return { ...header, ...suppressed(finished.length) };
  }
  return {
    ...header,
    ...summarizeMiniAppSubmissions(readManifest(s.manifest), finished),
  };
}

const sessionTime = (d: admin.firestore.DocumentSnapshot): number =>
  Number(d.get('endedAt') ?? d.get('startedAt') ?? d.get('createdAt') ?? 0);

async function ownSession(
  ctx: ToolContext,
  collection: string,
  id: string
): Promise<admin.firestore.DocumentSnapshot> {
  const snap = await ctx.db.doc(`${collection}/${id}`).get();
  if (!snap.exists || snap.get('teacherUid') !== ctx.uid) {
    throw new ToolError(
      "That assignment was not found among this teacher's own assignments."
    );
  }
  return snap;
}

const PRIVACY =
  'Class-level only: counts and percents, no student names, answers or individual scores.';

export function registerResultsTools(
  server: McpServer,
  ctx: ToolContext
): void {
  server.registerTool(
    'get_quiz_results_summary',
    {
      title: 'Summarize quiz results',
      description: `Class-level results for the newest ${MAX_SESSIONS} assignments of a quiz: average, score bands, percent correct and choice counts per question. Hidden under ${MIN_RESPONSES} finishers.`,
      inputSchema: {
        quiz_id: z.string().min(1).describe('From list_quizzes.'),
        assignment_id: z.string().optional().describe('Omit for the newest.'),
      },
      annotations: READ_ONLY,
    },
    ({ quiz_id, assignment_id }) =>
      run('get_quiz_results_summary', ctx, async () => {
        let sessions: admin.firestore.DocumentSnapshot[];
        if (assignment_id) {
          const snap = await ownSession(ctx, 'quiz_sessions', assignment_id);
          if (snap.get('quizId') !== quiz_id) {
            throw new ToolError('That assignment is for a different quiz.');
          }
          sessions = [snap];
        } else {
          const snap = await ctx.db
            .collection('quiz_sessions')
            .where('teacherUid', '==', ctx.uid)
            .where('quizId', '==', quiz_id)
            .limit(50)
            .get();
          sessions = snap.docs
            .sort((a, b) => sessionTime(b) - sessionTime(a))
            .slice(0, MAX_SESSIONS);
        }
        const keyCache = new Map<string, unknown[]>();
        const assignments = [];
        for (const doc of sessions) {
          assignments.push(await quizSessionSummary(ctx, doc, keyCache));
        }
        return {
          quiz_id,
          assignments,
          ...(assignments.length === 0
            ? { note: 'This quiz has not been assigned yet.' }
            : {}),
          privacy: PRIVACY,
        };
      })
  );

  server.registerTool(
    'get_video_activity_results_summary',
    {
      title: 'Summarize video activity results',
      description: `Class-level results for the newest ${MAX_SESSIONS} assignments of a video activity: average, score bands, percent correct and choice counts per question. Live (teacher-paced) assignments cover only the questions the class was asked. Hidden under ${MIN_RESPONSES} finishers.`,
      inputSchema: {
        activity_id: z.string().min(1).describe('From list_video_activities.'),
        assignment_id: z.string().optional().describe('Omit for the newest.'),
      },
      annotations: READ_ONLY,
    },
    ({ activity_id, assignment_id }) =>
      run('get_video_activity_results_summary', ctx, async () => {
        let sessions: admin.firestore.DocumentSnapshot[];
        if (assignment_id) {
          const snap = await ownSession(
            ctx,
            'video_activity_sessions',
            assignment_id
          );
          if (snap.get('activityId') !== activity_id) {
            throw new ToolError(
              'That assignment is for a different video activity.'
            );
          }
          sessions = [snap];
        } else {
          const snap = await ctx.db
            .collection('video_activity_sessions')
            .where('activityId', '==', activity_id)
            .where('teacherUid', '==', ctx.uid)
            .orderBy('createdAt', 'desc')
            .limit(MAX_SESSIONS)
            .get();
          sessions = snap.docs;
        }
        const assignments = [];
        for (const doc of sessions) {
          assignments.push(await videoSessionSummary(ctx, doc));
        }
        return {
          activity_id,
          assignments,
          ...(assignments.length === 0
            ? { note: 'This video activity has not been assigned yet.' }
            : {}),
          privacy: PRIVACY,
        };
      })
  );

  server.registerTool(
    'get_mini_app_results_summary',
    {
      title: 'Summarize mini-app results',
      description: `Class-level results for the newest ${MAX_SESSIONS} assignments of a mini-app that collects results: average best score, score bands, attempts and percent correct per question. Hidden under ${MIN_RESPONSES} students.`,
      inputSchema: {
        app_id: z.string().min(1).describe('From list_mini_apps.'),
        assignment_id: z.string().optional().describe('Omit for the newest.'),
      },
      annotations: READ_ONLY,
    },
    ({ app_id, assignment_id }) =>
      run('get_mini_app_results_summary', ctx, async () => {
        let sessions: admin.firestore.DocumentSnapshot[];
        if (assignment_id) {
          const snap = await ownSession(
            ctx,
            'mini_app_sessions',
            assignment_id
          );
          if (snap.get('appId') !== app_id) {
            throw new ToolError('That assignment is for a different mini-app.');
          }
          sessions = [snap];
        } else {
          const snap = await ctx.db
            .collection('mini_app_sessions')
            .where('appId', '==', app_id)
            .where('teacherUid', '==', ctx.uid)
            .orderBy('createdAt', 'desc')
            .limit(MAX_SESSIONS)
            .get();
          sessions = snap.docs;
        }
        const assignments = [];
        for (const doc of sessions) {
          assignments.push(await miniAppSessionSummary(doc));
        }
        return {
          app_id,
          assignments,
          ...(assignments.length === 0
            ? { note: 'This mini-app has not been assigned yet.' }
            : {}),
          privacy: PRIVACY,
        };
      })
  );
}
