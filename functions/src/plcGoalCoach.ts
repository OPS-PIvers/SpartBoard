// PLC goal coach callable: checks a draft goal against the district rubric (docs/plans/TEAMS_REDESIGN.md T22).
import './functionsInit';
import { ANTHROPIC_API_KEY } from './secrets';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { ALLOWED_ORIGINS } from './classlinkShared';
import {
  enforceAiFeatureAccess,
  recordAiUsage,
  refundAiUsage,
  resolveCallerIsAdmin,
  type AiUsageCharge,
} from './aiGeneration';
import {
  buildGoalCoachPrompt,
  buildGoalCoachSchema,
  buildTeamContext,
  clean,
  GOAL_COACH_SYSTEM_PROMPT,
  MAX_GOAL_MEASURE_CHARS,
  MAX_GOAL_PRACTICE_CHARS,
  MAX_GOAL_PRACTICES,
  MAX_GOAL_TITLE_CHARS,
  parseGoalCoachResponse,
  type GoalCoachResult,
  type GoalDraft,
} from './plcGoalCoachAi';
import {
  GOAL_COACH_RUBRIC_FIELD,
  resolveGoalCoachRubric,
  type GoalCoachCriterion,
} from './plcGoalCoachRubric';
import { assertViewAsAllowed } from './viewAsGuard';
import { generateAi } from './aiRouter';

type Firestore = admin.firestore.Firestore;
type Data = Record<string, unknown>;
type Token = { email?: string; email_verified?: boolean };

export const PLC_GOAL_COACH_FEATURE_ID = 'plc-goal-coach';
export const GOAL_COACH_DAILY_LIMIT = 30;
export const EMPTY_GOAL_REASON = 'empty-goal';

export interface GoalCoachRequest {
  plcId: string;
  goal: GoalDraft;
}

export interface GoalCoachDeps {
  db: Firestore;
  isAdmin: (token: Token) => Promise<boolean>;
  charge: (token: Token, uid: string) => Promise<AiUsageCharge>;
  refund: (charge: AiUsageCharge) => Promise<void>;
  /** Counts an admin's check with no limit checks. */
  record: (token: Token, uid: string) => Promise<AiUsageCharge>;
  generate: (prompt: string, rubric: GoalCoachCriterion[]) => Promise<string>;
}

const bad = (msg: string) => new HttpsError('invalid-argument', msg);

export function parseGoalCoachRequest(raw: unknown): GoalCoachRequest {
  const d = (raw ?? {}) as Data;
  const plcId = typeof d.plcId === 'string' ? d.plcId.trim() : '';
  if (!plcId || plcId.includes('/') || plcId.length > 200) {
    throw bad('Malformed identifier.');
  }
  const g = (d.goal ?? {}) as Data;
  const title = clean(g.title, MAX_GOAL_TITLE_CHARS);
  if (!title) {
    throw new HttpsError(
      'invalid-argument',
      'Write a draft goal first. The coach checks a goal; it does not write one.',
      { reason: EMPTY_GOAL_REASON }
    );
  }
  const practices = (Array.isArray(g.practices) ? g.practices : [])
    .map((p) => clean(p, MAX_GOAL_PRACTICE_CHARS))
    .filter(Boolean)
    .slice(0, MAX_GOAL_PRACTICES);
  return {
    plcId,
    goal: {
      title,
      measure: clean(g.measure, MAX_GOAL_MEASURE_CHARS),
      practices,
    },
  };
}

/** Active member: listed in memberUids and not marked removed in the members map. */
export function isPlcMember(plc: Data | undefined, uid: string): boolean {
  if (!plc) return false;
  const memberUids = Array.isArray(plc.memberUids) ? plc.memberUids : [];
  if (!memberUids.includes(uid)) return false;
  const entry = ((plc.members ?? {}) as Record<string, Data>)[uid];
  return !entry || entry.status !== 'removed';
}

async function loadRubric(db: Firestore): Promise<GoalCoachCriterion[]> {
  try {
    const snap = await db
      .collection('admin_settings')
      .doc('team_type_defaults')
      .get();
    return resolveGoalCoachRubric(snap.data()?.[GOAL_COACH_RUBRIC_FIELD]);
  } catch {
    return resolveGoalCoachRubric(undefined);
  }
}

async function loadContext(db: Firestore, plcId: string, plc: Data) {
  const plcRef = db.collection('plcs').doc(plcId);
  const [assessments, aggregates, targets] = await Promise.all([
    plcRef.collection('assessments').get(),
    plcRef.collection('aggregates').get(),
    plcRef.collection('meta').doc('learningTargets').get(),
  ]);
  return buildTeamContext({
    plc,
    assessments: assessments.docs.map((d) => ({ id: d.id, data: d.data() })),
    aggregates: new Map(aggregates.docs.map((d) => [d.id, d.data()])),
    learningTargets: targets.data(),
  });
}

/** Membership, then the flag and quota, then one model call; a failed call refunds its charge. */
export async function runGoalCoach(
  req: GoalCoachRequest,
  uid: string,
  token: Token,
  deps: GoalCoachDeps
): Promise<GoalCoachResult> {
  const snap = await deps.db.collection('plcs').doc(req.plcId).get();
  const plc = snap.data();
  if (!snap.exists || !plc || !isPlcMember(plc, uid)) {
    throw new HttpsError(
      'permission-denied',
      'Only members of this team can use the goal coach.'
    );
  }
  const charge = (await deps.isAdmin(token))
    ? await deps.record(token, uid)
    : await deps.charge(token, uid);
  try {
    const [rubric, context] = await Promise.all([
      loadRubric(deps.db),
      loadContext(deps.db, req.plcId, plc),
    ]);
    const text = await deps.generate(
      buildGoalCoachPrompt(req.goal, rubric, context),
      rubric
    );
    return parseGoalCoachResponse(text, rubric);
  } catch (error) {
    if (charge) await deps.refund(charge).catch(() => undefined);
    if (error instanceof HttpsError) throw error;
    console.error('[plcGoalCoachV1] failed:', error);
    throw new HttpsError(
      'internal',
      'The goal coach could not check this goal.'
    );
  }
}

/** Admins skip the quota, but a flag switched off still stops them. */
export async function adminSkipsGoalCoachQuota(
  db: Firestore,
  token: Token,
  isAdmin: (db: Firestore, token: Token) => Promise<boolean>
): Promise<boolean> {
  if (!(await isAdmin(db, token))) return false;
  const flags = await Promise.all(
    ['gemini-functions', PLC_GOAL_COACH_FEATURE_ID].map((id) =>
      db.collection('global_permissions').doc(id).get()
    )
  );
  return flags.every((d) => d.data()?.enabled !== false);
}

function defaultDeps(): GoalCoachDeps {
  const db = admin.firestore();
  return {
    db,
    isAdmin: (token) =>
      adminSkipsGoalCoachQuota(db, token, resolveCallerIsAdmin),
    charge: (token, uid) =>
      enforceAiFeatureAccess(db, token, uid, PLC_GOAL_COACH_FEATURE_ID, false, {
        key: 'plc-goal-coach-checks',
        limit: GOAL_COACH_DAILY_LIMIT,
        message: `You can check goals ${GOAL_COACH_DAILY_LIMIT} times a day. Try again tomorrow.`,
      }),
    refund: (charge) => refundAiUsage(db, charge),
    record: (token, uid) =>
      recordAiUsage(
        db,
        token,
        uid,
        PLC_GOAL_COACH_FEATURE_ID,
        'plc-goal-coach-checks'
      ),
    generate: async (prompt, rubric) => {
      const result = await generateAi(db, {
        integration: 'plc-goal-coach',
        parts: [{ text: prompt }],
        systemInstruction: GOAL_COACH_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseSchema: buildGoalCoachSchema(rubric),
        temperature: 0,
      });
      if (result.stopped !== 'complete') {
        throw new Error(
          `${result.model} stopped early: ${result.finishReason}`
        );
      }
      if (!result.text) throw new Error('Empty response from the AI model.');
      return result.text;
    },
  };
}

export const plcGoalCoachV1 = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 120,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
    secrets: [ANTHROPIC_API_KEY],
  },
  async (request) => {
    assertViewAsAllowed(request, { outward: true });
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    return runGoalCoach(
      parseGoalCoachRequest(request.data),
      request.auth.uid,
      request.auth.token,
      defaultDeps()
    );
  }
);
