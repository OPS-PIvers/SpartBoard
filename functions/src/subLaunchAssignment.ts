// launchSubAssignmentV1 — a substitute starts an activity in the teacher's own
// account (docs/plans/SUB_SHARE_COLLECTIONS.md §3.6, D7, D14). The substitute
// cannot write `users/{hostUid}/*` and the session must carry
// `teacherUid = host`, so the write runs here as admin once the caller is
// proven. Everything students can read is derived here from the answer key the
// share bundled; the caller supplies only run settings, from a closed
// allowlist. Rationale for not re-deriving the whole session: see the PR.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { randomUUID } from 'crypto';
import './functionsInit';
import { ALLOWED_ORIGINS } from './classlinkShared';

/** Only the kinds D8 puts in v1; Poll and Activity Wall stay unlaunchable. */
const LAUNCHABLE_KINDS = ['quiz'] as const;
type LaunchKind = (typeof LAUNCHABLE_KINDS)[number];

const MAX_ID_LENGTH = 128;
const MAX_ROSTERS = 20;
/** A session doc is capped at ~1 MiB by Firestore; stay well inside it. */
const MAX_PAYLOAD_BYTES = 700_000;

const DISTRICT_EMAIL = /^[^@]+@orono\.k12\.mn\.us$/;
/** A code a student can still join, so a live one is a collision. */
const JOINABLE_STATUSES = new Set(['waiting', 'active', 'paused']);
const CODE_ATTEMPTS = 5;
/** Pointers read per candidate code; matches the client's own lookup cap. */
const MAX_POINTERS_PER_CODE = 20;

/**
 * Session fields a substitute may choose: how the run behaves, never what it
 * contains. Content, identity, targeting, grading visibility and the PLC
 * linkage are all set here or left off.
 */
const ALLOWED_SESSION_FIELDS = new Set([
  'status',
  'sessionMode',
  'currentQuestionIndex',
  'startedAt',
  'endedAt',
  'autoProgressAt',
  'completenessModel',
  'handRaiseEnabled',
  'questionPhase',
  'pauseMessage',
  'periodNames',
  'attemptLimit',
  'mode',
  'openAt',
  'closeAt',
  'dueAt',
  'tabWarningsEnabled',
  'tabWarningThreshold',
  'blockCopyPaste',
  'showResultToStudent',
  'showCorrectAnswerToStudent',
  'showCorrectOnBoard',
  'speedBonusEnabled',
  'streakBonusEnabled',
  'showPodiumBetweenQuestions',
  'soundEffectsEnabled',
  'shuffleQuestions',
  'shuffleAnswerOptions',
]);

/** The same for the teacher-side archive row. */
const ALLOWED_ASSIGNMENT_FIELDS = new Set([
  'className',
  'sessionMode',
  'sessionOptions',
  'teacherName',
  'periodName',
  'periodNames',
  'attemptLimit',
  'dueAt',
  'dueAtHasTime',
  'status',
  'mode',
  'openAt',
  'closeAt',
  'updatedAt',
]);

/** Any of these anywhere in a payload means the answer key is riding along. */
const ANSWER_FIELDS = [
  'correctAnswer',
  'incorrectAnswers',
  'matchingDistractors',
  'acceptableVariants',
  'rubric',
  'revealedAnswers',
  'localizedFibAnswers',
];

export interface LaunchSubAssignmentInput {
  shareId: string;
  boardId: string;
  widgetId: string;
  kind: LaunchKind;
  /** The item the widget has open — the id the share bundled a key for. */
  itemId: string;
  /** Run settings for the session doc; see `ALLOWED_SESSION_FIELDS`. */
  session: Record<string, unknown>;
  /** Run settings for the teacher's archive row. */
  assignment: Record<string, unknown>;
  /** Rosters from the share to target. Class-wide only in v1. */
  rosterIds: string[];
}

export interface LaunchSubAssignmentResult {
  sessionId: string;
  code: string;
}

export interface SubLaunchCaller {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  anonymous: boolean;
  studentRole: boolean;
}

function bad(message: string): never {
  throw new HttpsError('invalid-argument', message);
}

function denied(message: string): never {
  throw new HttpsError('permission-denied', message);
}

function shortId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value || value.length > MAX_ID_LENGTH) {
    bad(`${field} must be a non-empty id`);
  }
  if (value.includes('/')) bad(`${field} must not be a path`);
  return value;
}

/** Walks a payload for an answer-bearing key at any depth. */
export function findAnswerField(
  value: unknown,
  depth: number = 0
): string | null {
  if (depth > 8 || value === null || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const hit = findAnswerField(entry, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (ANSWER_FIELDS.includes(key)) return key;
    const hit = findAnswerField(entry, depth + 1);
    if (hit) return hit;
  }
  return null;
}

/** Keeps only the allowlisted keys, and refuses anything else by name. */
export function pickAllowed(
  payload: Record<string, unknown>,
  allowed: Set<string>,
  label: string
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    if (!allowed.has(key)) bad(`${key} is not yours to set on the ${label}.`);
    out[key] = value;
  }
  return out;
}

interface KeyQuestion {
  id: string;
  type: string;
  text: string;
  timeLimit?: number;
  correctAnswer?: string;
  incorrectAnswers?: string[];
  matchingDistractors?: string[];
  points?: number;
  placeholder?: string;
  minWords?: number;
  maxWords?: number;
  enforceWordLimit?: boolean;
  stimulusIds?: string[];
}

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Server mirror of the student-safe projection in `toPublicQuestion`
 * (`hooks/useQuizSession.ts`), minus translations, learning targets and
 * recording: a sub-launched run has no reviewed locales and no media gate, so
 * those are simply absent rather than mirrored.
 */
export function publicQuestionFromKey(q: KeyQuestion): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: q.id,
    type: q.type,
    text: q.text,
    timeLimit: typeof q.timeLimit === 'number' ? q.timeLimit : 30,
  };
  if (q.type === 'MC') {
    const english = [q.correctAnswer ?? '', ...(q.incorrectAnswers ?? [])];
    base.choices = shuffled(english.filter(Boolean));
  } else if (q.type === 'Matching') {
    // Only the first colon separates term from definition, so a definition
    // containing one survives intact.
    const pairs = (q.correctAnswer ?? '').split('|').map((p) => {
      const sep = p.indexOf(':');
      return sep < 0
        ? { left: p, right: '' }
        : { left: p.slice(0, sep), right: p.slice(sep + 1) };
    });
    base.matchingLeft = pairs.map((p) => p.left);
    // Shuffled with the distractors mixed in, and the distractor list itself
    // never travels — otherwise a student reads the wrong options off devtools.
    base.matchingRight = shuffled([
      ...pairs.map((p) => p.right),
      ...(q.matchingDistractors ?? []).filter(Boolean),
    ]);
  } else if (q.type === 'Ordering') {
    base.orderingItems = shuffled((q.correctAnswer ?? '').split('|'));
  } else if (q.type === 'free-response') {
    if (q.placeholder) base.placeholder = q.placeholder;
    if (q.minWords && q.minWords > 0) base.minWords = q.minWords;
    if (q.maxWords && q.maxWords > 0) base.maxWords = q.maxWords;
    if (q.enforceWordLimit && (base.minWords || base.maxWords)) {
      base.enforceWordLimit = true;
    }
    if (q.points && q.points > 0) base.points = q.points;
  }
  if (q.stimulusIds?.length) base.stimulusIds = [...q.stimulusIds];
  return base;
}

/** The whole shared quiz, student-safe, in the key's own order. */
export function publicQuestionsFromKey(
  keyQuestions: unknown
): Record<string, unknown>[] {
  if (!Array.isArray(keyQuestions) || keyQuestions.length === 0) {
    denied('The shared quiz has no questions.');
  }
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const raw of keyQuestions) {
    if (!raw || typeof raw !== 'object') continue;
    const q = raw as KeyQuestion;
    if (typeof q.id !== 'string' || !q.id || seen.has(q.id)) continue;
    if (typeof q.type !== 'string' || typeof q.text !== 'string') continue;
    seen.add(q.id);
    out.push(publicQuestionFromKey(q));
  }
  if (out.length === 0) denied('The shared quiz has no usable questions.');
  return out;
}

export interface SubLaunchTargeting {
  classIds: string[];
  classPeriodByClassId: Record<string, string>;
}

/**
 * Resolves the rosters the sub picked into the class ids a session targets.
 * A sub can only name rosters the share itself lists — the only ids they can
 * see — and the class ids come from the host's own roster docs, so there is no
 * class id for a caller to guess or supply.
 */
export async function resolveTargeting(
  db: admin.firestore.Firestore,
  hostUid: string,
  sharedRosters: unknown,
  picked: string[]
): Promise<SubLaunchTargeting> {
  const shared = new Set(
    (Array.isArray(sharedRosters) ? sharedRosters : [])
      .map((r) =>
        r && typeof r === 'object' ? (r as { id?: unknown }).id : undefined
      )
      .filter((id): id is string => typeof id === 'string' && !id.includes('/'))
  );
  for (const id of picked) {
    if (!shared.has(id)) denied('That class is not one the share covers.');
  }
  const snaps = await Promise.all(
    picked.map((id) => db.doc(`users/${hostUid}/rosters/${id}`).get())
  );
  const classIds: string[] = [];
  const classPeriodByClassId: Record<string, string> = {};
  for (const snap of snaps) {
    const data = snap.data();
    if (!data) continue;
    const classId: unknown = data.classlinkClassId ?? data.testClassId;
    if (typeof classId !== 'string' || !classId) continue;
    if (classIds.includes(classId)) continue;
    classIds.push(classId);
    // SSO students read this at join time to stamp their own class period.
    if (typeof data.name === 'string' && data.name) {
      classPeriodByClassId[classId] = data.name;
    }
  }
  if (classIds.length === 0) {
    denied('Those rosters have no class a student can sign in to.');
  }
  return { classIds, classPeriodByClassId };
}

/**
 * Server mirror of `allocateJoinCode` (`hooks/useQuizAssignments.ts`): a code
 * is global across every teacher, so a candidate is rejected while any session
 * still carrying it is joinable. Falls back to an unchecked code rather than
 * refusing the launch, as the teacher's own path does.
 */
export async function allocateJoinCode(
  db: admin.firestore.Firestore,
  newCode: () => string
): Promise<string> {
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const candidate = newCode();
    const pointers = await db
      .collection('quiz_join_codes')
      .doc(candidate)
      .collection('sessions')
      .limit(MAX_POINTERS_PER_CODE)
      .get();
    if (pointers.empty) return candidate;
    const sessions = await Promise.all(
      pointers.docs.map((d) => db.doc(`quiz_sessions/${d.id}`).get())
    );
    const live = sessions.some((snap) => {
      const status: unknown = snap.data()?.status;
      return typeof status === 'string' && JOINABLE_STATUSES.has(status);
    });
    if (!live) return candidate;
  }
  return newCode();
}

function approxBytes(value: unknown): number {
  return JSON.stringify(value ?? null).length;
}

export interface SubLaunchDeps {
  now: () => number;
  newId: () => string;
  newCode: () => string;
}

/** The teacher client's own shape: six uppercase alphanumerics. */
function randomJoinCode(): string {
  return Math.random()
    .toString(36)
    .substring(2, 8)
    .toUpperCase()
    .padEnd(6, '0');
}

export const liveSubLaunchDeps: SubLaunchDeps = {
  now: () => Date.now(),
  newId: () => randomUUID(),
  newCode: randomJoinCode,
};

export async function handleLaunchSubAssignment(
  db: admin.firestore.Firestore,
  caller: SubLaunchCaller | null,
  data: unknown,
  deps: SubLaunchDeps = liveSubLaunchDeps
): Promise<LaunchSubAssignmentResult> {
  if (!caller) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (caller.anonymous || caller.studentRole) {
    denied('This is for staff accounts.');
  }
  const email = (caller.email ?? '').toLowerCase();
  if (!caller.emailVerified || !DISTRICT_EMAIL.test(email)) {
    denied('A verified district account is required.');
  }

  const input = (data ?? {}) as Partial<LaunchSubAssignmentInput>;
  const shareId = shortId(input.shareId, 'shareId');
  const boardId = shortId(input.boardId, 'boardId');
  const widgetId = shortId(input.widgetId, 'widgetId');
  const itemId = shortId(input.itemId, 'itemId');
  const kind = input.kind as LaunchKind;
  if (!LAUNCHABLE_KINDS.includes(kind)) {
    bad('That activity cannot be started from a share yet.');
  }
  const pickedRosters = Array.isArray(input.rosterIds) ? input.rosterIds : [];
  if (pickedRosters.length === 0) bad('Pick at least one class.');
  if (pickedRosters.length > MAX_ROSTERS) bad('Too many classes.');
  for (const id of pickedRosters) shortId(id, 'rosterIds');
  const rawSession = input.session;
  const rawAssignment = input.assignment;
  if (!rawSession || typeof rawSession !== 'object')
    bad('session is required.');
  if (!rawAssignment || typeof rawAssignment !== 'object') {
    bad('assignment is required.');
  }
  if (
    approxBytes(rawSession) + approxBytes(rawAssignment) >
    MAX_PAYLOAD_BYTES
  ) {
    bad('That activity is too large to start from a share.');
  }

  const settings = await db.doc('admin_settings/sub_launch_as_teacher').get();
  if (settings.data()?.enabled !== true) {
    denied('Starting an activity from a share is turned off.');
  }

  const shareSnap = await db.doc(`shared_collections/${shareId}`).get();
  const share = shareSnap.data();
  if (!shareSnap.exists || !share) denied('That share no longer exists.');
  if (share.intendedMode !== 'substitute') {
    denied('That share is not a substitute share.');
  }
  const expiresAt =
    typeof share.expiresAt === 'number' ? share.expiresAt : null;
  if (expiresAt === null || expiresAt <= deps.now()) {
    denied('That share has expired.');
  }
  const subEmails = Array.isArray(share.subEmails) ? share.subEmails : [];
  if (!subEmails.some((e: unknown) => String(e).toLowerCase() === email)) {
    denied('This share does not name you as a substitute.');
  }
  const hostUid = typeof share.hostUid === 'string' ? share.hostUid : '';
  if (!hostUid) denied('That share has no teacher.');

  const boardSnap = await db
    .doc(`shared_collections/${shareId}/boards/${boardId}`)
    .get();
  const board = boardSnap.data();
  if (!boardSnap.exists || !board) denied('That board is not in the share.');
  // The share stores the frozen board under `dashboard`, not flat.
  const dashboard = (board as { dashboard?: { widgets?: unknown } }).dashboard;
  const widgets: unknown[] = Array.isArray(dashboard?.widgets)
    ? dashboard.widgets
    : [];
  const onBoard = widgets.some(
    (w) =>
      !!w && typeof w === 'object' && (w as { id?: unknown }).id === widgetId
  );
  if (!onBoard) denied('That widget is not on the shared board.');

  // A session is visible to students purely by `classIds`, so the caller names
  // rosters the share lists and the class ids are resolved here (plan §3.6
  // step 4). A sub never supplies a class id at all.
  const targeting = await resolveTargeting(
    db,
    hostUid,
    share.sharedRosters,
    pickedRosters
  );

  const keySnap = await db
    .doc(`shared_collections/${shareId}/keys/${kind}_${itemId}`)
    .get();
  const keyPayload = keySnap.data()?.payload as
    | {
        quiz?: {
          id?: string;
          title?: string;
          questions?: unknown;
          stimuli?: unknown;
          language?: string;
        };
      }
    | undefined;
  const keyQuiz = keyPayload?.quiz;
  if (!keySnap.exists || !keyQuiz) {
    denied('The teacher did not leave this activity for a substitute.');
  }
  if (keyQuiz.id !== itemId) denied('That activity does not match the share.');

  const session = pickAllowed(rawSession, ALLOWED_SESSION_FIELDS, 'session');
  const assignment = pickAllowed(
    rawAssignment,
    ALLOWED_ASSIGNMENT_FIELDS,
    'assignment'
  );
  // Belt and braces: the allowlists already exclude every answer-bearing
  // field, so a hit here means one has been added without being reviewed.
  const answerField = findAnswerField(session) ?? findAnswerField(assignment);
  if (answerField) bad(`${answerField} must not reach a student session.`);

  // The teacher's own record is the authority for the Drive file the monitor
  // hydrates from; the caller never names it.
  const quizSnap = await db.doc(`users/${hostUid}/quizzes/${itemId}`).get();
  const quizDriveFileId: unknown = quizSnap.data()?.driveFileId;
  if (typeof quizDriveFileId !== 'string' || !quizDriveFileId) {
    denied('That quiz is no longer in the teacher’s library.');
  }

  // Minted here, not accepted: a code is global across every teacher, so a
  // caller's own code could eclipse another teacher's live session.
  const code = await allocateJoinCode(db, deps.newCode);
  const publicQuestions = publicQuestionsFromKey(keyQuiz.questions);
  const quizTitle =
    typeof keyQuiz.title === 'string' && keyQuiz.title ? keyQuiz.title : 'Quiz';
  const sessionId = deps.newId();
  const now = deps.now();
  const stamp = {
    teacherUid: hostUid,
    launchedBy: { uid: caller.uid, email, shareId },
    subMonitorUids: [caller.uid],
    subMonitorUntil: expiresAt,
  };
  // Derived from the key, so a sub cannot change what students see. Media
  // response and learning targets stay off: neither gate travels in a share.
  const content = {
    code,
    quizId: itemId,
    quizTitle,
    publicQuestions,
    totalQuestions: publicQuestions.length,
    mediaResponseEnabled: false,
    showLearningTargets: false,
    ...(Array.isArray(keyQuiz.stimuli) ? { stimuli: keyQuiz.stimuli } : {}),
    ...(typeof keyQuiz.language === 'string'
      ? { language: keyQuiz.language }
      : {}),
  };
  const batch = db.batch();
  batch.set(db.doc(`quiz_sessions/${sessionId}`), {
    ...session,
    ...content,
    ...stamp,
    ...targeting,
    classId: targeting.classIds[0],
    id: sessionId,
    assignmentId: sessionId,
  });
  batch.set(db.doc(`users/${hostUid}/quiz_assignments/${sessionId}`), {
    ...assignment,
    ...stamp,
    ...targeting,
    classId: targeting.classIds[0],
    rosterIds: pickedRosters,
    id: sessionId,
    quizId: itemId,
    quizTitle,
    quizDriveFileId,
    code,
    targetMode: 'class',
    mediaResponseEnabled: false,
    createdAt: now,
    updatedAt: now,
  });
  batch.set(db.doc(`quiz_join_codes/${code}/sessions/${sessionId}`), {
    sessionId,
    teacherUid: hostUid,
    createdAt: now,
  });
  await batch.commit();

  return { sessionId, code };
}

export const launchSubAssignmentV1 = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 120,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  async (request) =>
    handleLaunchSubAssignment(
      admin.firestore(),
      request.auth
        ? {
            uid: request.auth.uid,
            email: request.auth.token.email ?? null,
            emailVerified: request.auth.token.email_verified === true,
            anonymous:
              request.auth.token.firebase?.sign_in_provider === 'anonymous',
            studentRole: request.auth.token.studentRole === true,
          }
        : null,
      request.data
    )
);
