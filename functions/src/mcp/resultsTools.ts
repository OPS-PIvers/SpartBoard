// Class-level result summaries (CC-D3, CC-D11): own sessions only, no student-level data, suppressed below 5 responses.
import type * as admin from 'firebase-admin';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ToolError, type ToolContext } from './activity';
import { driveTokenFor, readDriveJson } from './drive';
import { READ_ONLY, iso, run } from './toolKit';
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
  const [{ withQuizSessionContent }, recompute, { parseChooseSections }] =
    await Promise.all([
      import('../quizSessionContent'),
      import('../recomputePlcAssessments'),
      import('../quizSectionsChosen'),
    ]);
  const s = await withQuizSessionContent(
    sessionDoc.ref,
    (sessionDoc.data() ?? {}) as Data
  );
  const assignmentId = asText(s.assignmentId, sessionDoc.id);
  const [responses, assignmentSnap] = await Promise.all([
    sessionDoc.ref
      .collection('responses')
      .where('status', '==', 'completed')
      .get(),
    ctx.db.doc(`users/${ctx.uid}/quiz_assignments/${assignmentId}`).get(),
  ]);
  const assignment = (assignmentSnap.data() ?? {}) as Data;
  const header = {
    assignment_id: sessionDoc.id,
    class_periods: asArray(s.periodNames ?? assignment.periodNames),
    status: s.status ?? null,
    started_at: iso(s.startedAt),
    ended_at: iso(s.endedAt),
    scores_published: s.scorePublishedAt != null,
  };
  if (responses.size < MIN_RESPONSES) {
    return { ...header, ...suppressed(responses.size) };
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
        responses: responses.docs.map(
          (d): CompletedResponse => recompute.parseCompletedResponse(d.data())
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

async function videoSessionSummary(
  ctx: ToolContext,
  sessionDoc: admin.firestore.DocumentSnapshot
) {
  const recompute = await import('../recomputePlcAssessments');
  const s = (sessionDoc.data() ?? {}) as Data;
  const [responses, keySnap] = await Promise.all([
    sessionDoc.ref.collection('responses').get(),
    sessionDoc.ref.collection('key').doc('answers').get(),
  ]);
  const completed = responses.docs.filter((d) => d.get('completedAt') != null);
  const header = {
    assignment_id: sessionDoc.id,
    assignment_name: s.assignmentName ?? null,
    class_periods: asArray(s.periodNames),
    status: s.status ?? null,
    created_at: iso(s.createdAt),
    ended_at: iso(s.endedAt),
  };
  if (completed.length < MIN_RESPONSES) {
    return { ...header, ...suppressed(completed.length) };
  }
  const keyQuestions = videoKeyForGrader(
    asArray(keySnap.get('questions')).length > 0
      ? asArray(keySnap.get('questions'))
      : asArray(s.questions)
  );
  const publicQuestions = asArray(s.publicQuestions);
  return {
    ...header,
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
      description: `Class-level results for the teacher's own assignments of a quiz (newest ${MAX_SESSIONS}): average score, score bands, and percent correct and answer choice counts per question. Hidden until at least ${MIN_RESPONSES} students have finished. ${PRIVACY}`,
      inputSchema: {
        quiz_id: z.string().min(1).describe('From list_quizzes.'),
        assignment_id: z
          .string()
          .optional()
          .describe('Only this assignment; omit for the most recent ones.'),
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
      description: `Class-level results for the teacher's own assignments of a video activity (newest ${MAX_SESSIONS}): average score, score bands, and percent correct and answer choice counts per question. Hidden until at least ${MIN_RESPONSES} students have finished. ${PRIVACY}`,
      inputSchema: {
        activity_id: z.string().min(1).describe('From list_video_activities.'),
        assignment_id: z
          .string()
          .optional()
          .describe('Only this assignment; omit for the most recent ones.'),
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
}
