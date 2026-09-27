// launchSubAssignmentV1 — a substitute starts an activity in the teacher's own
// account (docs/plans/shipped/SUB_SHARE_COLLECTIONS.md §3.6, D7, D14). The substitute
// cannot write `users/{hostUid}/*` and the session must carry
// `teacherUid = host`, so the write runs here as admin once the caller is
// proven. Everything students can read is derived here from the answer key the
// share bundled; the caller supplies only run settings, from a closed
// allowlist. Rationale for not re-deriving the whole session: see the PR.

import { onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { randomUUID } from 'crypto';
import './functionsInit';
import { ALLOWED_ORIGINS } from './classlinkShared';
import {
  dedupeById,
  toVaPublicQuestion,
  type VaKeyQuestion,
} from './videoActivityGrade';
import {
  bad,
  denied,
  requireSubLaunchEnabled,
  shortId,
  verifySubCaller,
  verifySubShare,
  type SubShareCaller,
} from './subShareAccess';
import {
  dedupeGlStepsById,
  toGlPublicStep,
  type GlKeyStep,
} from './guidedLearningPublicStep';

/** Only the kinds D8 puts in v1; Poll and Activity Wall stay unlaunchable. */
const LAUNCHABLE_KINDS = [
  'quiz',
  'videoActivity',
  'guidedLearning',
  'flashcards',
] as const;
type LaunchKind = (typeof LAUNCHABLE_KINDS)[number];

const MAX_ROSTERS = 20;
/** A session doc is capped at ~1 MiB by Firestore; stay well inside it. */
const MAX_PAYLOAD_BYTES = 700_000;

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
  'tabAwayLimitSeconds',
  'tabAwayAutoSubmit',
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
/**
 * The same boundary for a video activity. `settings` and `sessionOptions` are
 * nested behaviour bags (skipping, require-correct, score visibility); neither
 * carries a question or an answer.
 */
const ALLOWED_VA_SESSION_FIELDS = new Set([
  'status',
  'mode',
  'settings',
  'sessionOptions',
  'assignmentName',
  'periodNames',
  'openAt',
  'closeAt',
  'dueAt',
]);

const ALLOWED_VA_ASSIGNMENT_FIELDS = new Set([
  'className',
  'status',
  'mode',
  'sessionSettings',
  'sessionOptions',
  'scoreVisibility',
  'periodNames',
  'dueAt',
  'updatedAt',
]);

/**
 * The same for a guided activity, which has no pacing and no join code to
 * choose. `periodNames` is derived from the rosters here rather than accepted,
 * and `scoreVisibility` is not offered at all: publishing scores reveals the
 * answers and stays the teacher's own decision.
 */
const ALLOWED_GL_SESSION_FIELDS = new Set([
  'assignmentMode',
  'openAt',
  'closeAt',
  'dueAt',
]);

const ALLOWED_GL_ASSIGNMENT_FIELDS = new Set([
  'status',
  'assignmentMode',
  'openAt',
  'closeAt',
  'dueAt',
  'updatedAt',
]);

/**
 * The same for a flashcard set. `kind` is not offered: a sub starts a Study
 * run, which is the teacher's own default, and the Check kind brings grading,
 * a mastery threshold and a score-visibility setting that reveals answers.
 */
const ALLOWED_FC_SESSION_FIELDS = new Set([
  'status',
  'openAt',
  'closeAt',
  'dueAt',
]);

const ALLOWED_FC_ASSIGNMENT_FIELDS = new Set([
  'status',
  'openAt',
  'closeAt',
  'dueAt',
  'updatedAt',
]);

const ANSWER_FIELDS = [
  'correctAnswer',
  'incorrectAnswers',
  'matchingDistractors',
  'acceptableVariants',
  'alternateAnswers',
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
  /** Quiz only. A video activity or guided activity is reached by class. */
  code?: string;
}

/** Kept as the callable's own name for its caller; see `SubShareCaller`. */
export type SubLaunchCaller = SubShareCaller;

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
  } else if (q.type === 'MA') {
    // Right options then wrong (utils/quizMultiAnswer multiAnswerOptions), shuffled so neither side shows.
    const nonBlank = (s: string) => s.trim().length > 0;
    base.choices = shuffled([
      ...(q.correctAnswer ?? '').split('|').filter(nonBlank),
      ...(q.incorrectAnswers ?? []).filter((s) => !!s && nonBlank(s)),
    ]);
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

/**
 * The question set a sub-launched video activity runs on: the teacher's own
 * key, deduped so "Question X of N" can't be inflated by a repeated id, and
 * the student-safe projection of it. `toVaPublicQuestion` is the same mirror
 * the scrub trigger uses, so a sub-launched run grades like any other.
 */
export function vaQuestionsFromKey(keyQuestions: unknown): {
  key: VaKeyQuestion[];
  publicQuestions: Record<string, unknown>[];
} {
  if (!Array.isArray(keyQuestions) || keyQuestions.length === 0) {
    denied('The shared video activity has no questions.');
  }
  const usable = keyQuestions.filter(
    (q): q is VaKeyQuestion =>
      !!q &&
      typeof q === 'object' &&
      typeof (q as VaKeyQuestion).id === 'string' &&
      !!(q as VaKeyQuestion).id
  );
  const key = dedupeById(usable);
  if (key.length === 0) {
    denied('The shared video activity has no usable questions.');
  }
  return {
    key,
    publicQuestions: key.map(
      (q) => toVaPublicQuestion(q) as unknown as Record<string, unknown>
    ),
  };
}

const GL_MODES = new Set(['structured', 'guided', 'explore']);

interface GlKeySet {
  id?: unknown;
  title?: unknown;
  mode?: unknown;
  imageUrls?: unknown;
  imageKinds?: unknown;
  videoTrims?: unknown;
  steps?: unknown;
  schemaVersion?: unknown;
  hotspotPulse?: unknown;
  imageTransition?: unknown;
  welcomeEnabled?: unknown;
  welcomeMessage?: unknown;
  watchPace?: unknown;
}

/**
 * The steps a sub-launched guided activity runs on: deduped so a repeated id
 * cannot inflate "Step X of N", then projected through the same mirror the
 * teacher's own `createSession` uses.
 */
export function glPublicStepsFromKey(
  steps: unknown
): Record<string, unknown>[] {
  if (!Array.isArray(steps) || steps.length === 0) {
    denied('The shared guided activity has no steps.');
  }
  const usable = steps.filter(
    (s): s is GlKeyStep =>
      !!s &&
      typeof s === 'object' &&
      typeof (s as GlKeyStep).id === 'string' &&
      !!(s as GlKeyStep).id
  );
  const out = dedupeGlStepsById(usable).map(toGlPublicStep);
  if (out.length === 0) {
    denied('The shared guided activity has no usable steps.');
  }
  return out;
}

/**
 * The display settings the student player reads, mirrored on the same terms
 * the teacher's own `createSession` mirrors them: only when they differ from
 * the default, so a sub-launched session doc looks like any other.
 */
export function glSessionPresentation(set: GlKeySet): Record<string, unknown> {
  const imageUrls = Array.isArray(set.imageUrls) ? set.imageUrls : [];
  const kinds = Array.isArray(set.imageKinds) ? set.imageKinds : null;
  const trims = Array.isArray(set.videoTrims) ? set.videoTrims : null;
  const welcome =
    set.welcomeEnabled === true &&
    typeof set.welcomeMessage === 'string' &&
    set.welcomeMessage.trim()
      ? { welcomeEnabled: true, welcomeMessage: set.welcomeMessage }
      : {};
  return {
    imageUrls,
    ...(kinds?.some((k) => k === 'video')
      ? { imageKinds: kinds.slice(0, imageUrls.length) }
      : {}),
    ...(trims?.some(Boolean)
      ? { videoTrims: trims.slice(0, imageUrls.length) }
      : {}),
    ...(typeof set.schemaVersion === 'number'
      ? { schemaVersion: set.schemaVersion }
      : {}),
    ...(typeof set.hotspotPulse === 'string' &&
    set.hotspotPulse !== 'consistent'
      ? { hotspotPulse: set.hotspotPulse }
      : {}),
    ...(typeof set.imageTransition === 'string' &&
    set.imageTransition !== 'none'
      ? { imageTransition: set.imageTransition }
      : {}),
    ...welcome,
    ...(set.watchPace === 'calm' ? { watchPace: set.watchPace } : {}),
  };
}

interface FcCard {
  id: string;
  term: string;
  definition: string;
}

/**
 * The deck a sub-launched run studies. Field by field rather than a spread:
 * `content/` is broadly readable, so whatever else a bundled card picked up
 * does not travel onto a session doc the world can read. Deduped by id for
 * the same reason every other kind is — a repeated id miscounts the deck.
 */
export function fcCardsFromBundle(cards: unknown): FcCard[] {
  if (!Array.isArray(cards) || cards.length === 0) {
    denied('The shared flashcard set has no cards.');
  }
  const seen = new Set<string>();
  const out: FcCard[] = [];
  for (const raw of cards) {
    if (!raw || typeof raw !== 'object') continue;
    const card = raw as Partial<FcCard>;
    if (typeof card.id !== 'string' || !card.id || seen.has(card.id)) continue;
    if (typeof card.term !== 'string') continue;
    if (typeof card.definition !== 'string') continue;
    seen.add(card.id);
    out.push({ id: card.id, term: card.term, definition: card.definition });
  }
  if (out.length === 0) {
    denied('The shared flashcard set has no usable cards.');
  }
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

interface VaLaunchArgs {
  db: admin.firestore.Firestore;
  hostUid: string;
  itemId: string;
  keyData: admin.firestore.DocumentData | undefined;
  rawSession: unknown;
  rawAssignment: unknown;
  targeting: SubLaunchTargeting;
  pickedRosters: string[];
  sessionId: string;
  now: number;
  stamp: Record<string, unknown>;
}

/**
 * A video activity has no join code: students reach it by class, the same way
 * the teacher's own assign does. The key rides in the session's own
 * `key/answers` doc, which is where the grading callable already looks.
 */
async function launchVideoActivity(
  args: VaLaunchArgs
): Promise<LaunchSubAssignmentResult> {
  const { db, hostUid, itemId, keyData, targeting, sessionId, now, stamp } =
    args;
  const payload = keyData?.payload as
    | {
        activity?: {
          id?: string;
          title?: string;
          youtubeUrl?: string;
          questions?: unknown;
        };
      }
    | undefined;
  const activity = payload?.activity;
  if (!keyData || !activity) {
    denied('The teacher did not leave this activity for a substitute.');
  }
  if (activity.id !== itemId) denied('That activity does not match the share.');

  const session = pickAllowed(
    args.rawSession as Record<string, unknown>,
    ALLOWED_VA_SESSION_FIELDS,
    'session'
  );
  const assignment = pickAllowed(
    args.rawAssignment as Record<string, unknown>,
    ALLOWED_VA_ASSIGNMENT_FIELDS,
    'assignment'
  );
  const answerField = findAnswerField(session) ?? findAnswerField(assignment);
  if (answerField) bad(`${answerField} must not reach a student session.`);

  const activitySnap = await db
    .doc(`users/${hostUid}/video_activities/${itemId}`)
    .get();
  const activityDriveFileId: unknown = activitySnap.data()?.driveFileId;
  if (typeof activityDriveFileId !== 'string' || !activityDriveFileId) {
    denied('That activity is no longer in the teacher’s library.');
  }

  const youtubeUrl =
    typeof activity.youtubeUrl === 'string' ? activity.youtubeUrl : '';
  if (!youtubeUrl) denied('The shared video activity has no video.');
  const activityTitle =
    typeof activity.title === 'string' && activity.title
      ? activity.title
      : 'Video activity';
  const { key, publicQuestions } = vaQuestionsFromKey(activity.questions);

  const batch = db.batch();
  batch.set(db.doc(`video_activity_sessions/${sessionId}`), {
    ...session,
    ...stamp,
    ...targeting,
    classId: targeting.classIds[0],
    id: sessionId,
    activityId: itemId,
    activityTitle,
    youtubeUrl,
    // The key never rides the session doc; it goes in `key/answers` below.
    questions: [],
    publicQuestions,
    allowedPins: [],
    createdAt: now,
  });
  batch.set(db.doc(`video_activity_sessions/${sessionId}/key/answers`), {
    questions: key,
  });
  batch.set(
    db.doc(`users/${hostUid}/video_activity_assignments/${sessionId}`),
    {
      ...assignment,
      ...stamp,
      ...targeting,
      classId: targeting.classIds[0],
      rosterIds: args.pickedRosters,
      id: sessionId,
      activityId: itemId,
      activityTitle,
      activityDriveFileId,
      createdAt: now,
      updatedAt: now,
    }
  );
  await batch.commit();

  return { sessionId };
}

interface GlLaunchArgs {
  db: admin.firestore.Firestore;
  hostUid: string;
  itemId: string;
  keyData: admin.firestore.DocumentData | undefined;
  rawSession: unknown;
  rawAssignment: unknown;
  targeting: SubLaunchTargeting;
  pickedRosters: string[];
  sessionId: string;
  now: number;
  stamp: Record<string, unknown>;
}

/**
 * A guided activity has no join code and no answer-key doc of its own: the
 * session carries only `publicSteps`, and grading happens against the
 * teacher's own set, which the share already bundled for the sub.
 */
async function launchGuidedLearning(
  args: GlLaunchArgs
): Promise<LaunchSubAssignmentResult> {
  const { hostUid, itemId, keyData, targeting, sessionId, now, stamp } = args;
  const set = (keyData?.payload as { set?: GlKeySet } | undefined)?.set;
  if (!keyData || !set) {
    denied('The teacher did not leave this activity for a substitute.');
  }
  if (set.id !== itemId) denied('That activity does not match the share.');

  const session = pickAllowed(
    args.rawSession as Record<string, unknown>,
    ALLOWED_GL_SESSION_FIELDS,
    'session'
  );
  const assignment = pickAllowed(
    args.rawAssignment as Record<string, unknown>,
    ALLOWED_GL_ASSIGNMENT_FIELDS,
    'assignment'
  );
  const answerField = findAnswerField(session) ?? findAnswerField(assignment);
  if (answerField) bad(`${answerField} must not reach a student session.`);

  // The teacher's own library is the authority that the set still exists; a
  // share outlives a delete, and a row pointing at nothing grades nothing.
  const setSnap = await args.db
    .doc(`users/${hostUid}/guided_learning/${itemId}`)
    .get();
  if (!setSnap.exists) {
    denied('That activity is no longer in the teacher’s library.');
  }

  const setTitle =
    typeof set.title === 'string' && set.title ? set.title : 'Guided activity';
  const publicSteps = glPublicStepsFromKey(set.steps);
  // The post-PIN period picker reads these; the sub never supplies them.
  const periodNames = Array.from(
    new Set(Object.values(targeting.classPeriodByClassId))
  );

  const sessionDoc = {
    ...session,
    ...glSessionPresentation(set),
    ...stamp,
    classIds: targeting.classIds,
    classId: targeting.classIds[0],
    ...(periodNames.length > 0 ? { periodNames } : {}),
    rosterIds: args.pickedRosters,
    id: sessionId,
    title: setTitle,
    // GL's own `mode` is the play mode, not the assignment mode.
    mode: GL_MODES.has(String(set.mode)) ? set.mode : 'guided',
    publicSteps,
    createdAt: now,
  };
  if (approxBytes(sessionDoc) > MAX_PAYLOAD_BYTES) {
    denied('That guided activity is too large to start from a share.');
  }

  const batch = args.db.batch();
  batch.set(args.db.doc(`guided_learning_sessions/${sessionId}`), sessionDoc);
  batch.set(
    args.db.doc(`users/${hostUid}/guided_learning_assignments/${sessionId}`),
    {
      ...assignment,
      ...stamp,
      rosterIds: args.pickedRosters,
      id: sessionId,
      sessionId,
      setId: itemId,
      setTitle,
      // A bundled set always came from the teacher's Drive; a building set is
      // never bundled, so it can't be launched from a share.
      source: 'personal',
      targetMode: 'class',
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    }
  );
  await batch.commit();

  return { sessionId };
}

interface FcLaunchArgs {
  db: admin.firestore.Firestore;
  hostUid: string;
  itemId: string;
  bundle: admin.firestore.DocumentData | undefined;
  rawSession: unknown;
  rawAssignment: unknown;
  targeting: SubLaunchTargeting;
  pickedRosters: string[];
  sessionId: string;
  now: number;
  stamp: Record<string, unknown>;
}

/**
 * A flashcard set has no answer to withhold — the back of a card is what the
 * student is learning — so it bundles into `content/` rather than `keys/`, and
 * this is the one kind whose deck is read from there. The run is a Study one:
 * see `ALLOWED_FC_SESSION_FIELDS`.
 */
async function launchFlashcards(
  args: FcLaunchArgs
): Promise<LaunchSubAssignmentResult> {
  const { hostUid, itemId, bundle, targeting, sessionId, now, stamp } = args;
  const set = (
    bundle?.payload as
      | {
          set?: {
            id?: unknown;
            title?: unknown;
            termLanguage?: unknown;
            definitionLanguage?: unknown;
            cards?: unknown;
          };
        }
      | undefined
  )?.set;
  if (!bundle || !set) {
    denied('The teacher did not leave this activity for a substitute.');
  }
  if (set.id !== itemId) denied('That activity does not match the share.');

  const session = pickAllowed(
    args.rawSession as Record<string, unknown>,
    ALLOWED_FC_SESSION_FIELDS,
    'session'
  );
  const assignment = pickAllowed(
    args.rawAssignment as Record<string, unknown>,
    ALLOWED_FC_ASSIGNMENT_FIELDS,
    'assignment'
  );
  const answerField = findAnswerField(session) ?? findAnswerField(assignment);
  if (answerField) bad(`${answerField} must not reach a student session.`);

  const setSnap = await args.db
    .doc(`users/${hostUid}/flashcard_sets/${itemId}`)
    .get();
  if (!setSnap.exists) {
    denied('That set is no longer in the teacher’s library.');
  }

  const setTitle =
    typeof set.title === 'string' && set.title ? set.title : 'Flashcards';
  const cards = fcCardsFromBundle(set.cards);
  const periodNames = Array.from(
    new Set(Object.values(targeting.classPeriodByClassId))
  );
  // The teacher's own assign form defaults to collecting no submission, which
  // is this kind; a graded Check stays theirs to set up.
  const kind = 'study';

  const sessionDoc = {
    ...session,
    ...stamp,
    id: sessionId,
    setId: itemId,
    title: setTitle,
    kind,
    termLanguage:
      typeof set.termLanguage === 'string' ? set.termLanguage : 'en',
    definitionLanguage:
      typeof set.definitionLanguage === 'string'
        ? set.definitionLanguage
        : 'en',
    cards,
    classIds: targeting.classIds,
    classId: targeting.classIds[0],
    ...(periodNames.length > 0 ? { periodNames } : {}),
    rosterIds: args.pickedRosters,
    createdAt: now,
  };
  if (approxBytes(sessionDoc) > MAX_PAYLOAD_BYTES) {
    denied('That set is too large to start from a share.');
  }

  const batch = args.db.batch();
  batch.set(args.db.doc(`flashcard_sessions/${sessionId}`), sessionDoc);
  batch.set(
    args.db.doc(`users/${hostUid}/flashcard_assignments/${sessionId}`),
    {
      ...assignment,
      ...stamp,
      id: sessionId,
      sessionId,
      setId: itemId,
      setTitle,
      kind,
      rosterIds: args.pickedRosters,
      classIds: targeting.classIds,
      periodNames,
      targetMode: 'class',
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    }
  );
  await batch.commit();

  return { sessionId };
}

export async function handleLaunchSubAssignment(
  db: admin.firestore.Firestore,
  caller: SubLaunchCaller | null,
  data: unknown,
  deps: SubLaunchDeps = liveSubLaunchDeps
): Promise<LaunchSubAssignmentResult> {
  const { caller: sub, email } = verifySubCaller(caller ?? null);

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

  await requireSubLaunchEnabled(
    db,
    'Starting an activity from a share is turned off.'
  );
  const { share, hostUid, expiresAt } = await verifySubShare(
    db,
    shareId,
    email,
    deps.now()
  );

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

  // Flashcards are the one kind bundled into `content/` rather than `keys/`:
  // a card's back is the thing being learned, so there is no key to withhold.
  const bundlePath =
    kind === 'flashcards'
      ? `shared_collections/${shareId}/content/flashcards_${itemId}`
      : `shared_collections/${shareId}/keys/${kind}_${itemId}`;
  const keySnap = await db.doc(bundlePath).get();
  const sessionId = deps.newId();
  const now = deps.now();
  // Ownership, the ids and the monitor window are written here or not at all.
  const stamp = {
    teacherUid: hostUid,
    launchedBy: { uid: sub.uid, email, shareId },
    subMonitorUids: [sub.uid],
    subMonitorUntil: expiresAt,
  };

  if (kind === 'flashcards') {
    return launchFlashcards({
      db,
      hostUid,
      itemId,
      bundle: keySnap.exists ? keySnap.data() : undefined,
      rawSession,
      rawAssignment,
      targeting,
      pickedRosters,
      sessionId,
      now,
      stamp,
    });
  }

  if (kind === 'guidedLearning') {
    return launchGuidedLearning({
      db,
      hostUid,
      itemId,
      keyData: keySnap.exists ? keySnap.data() : undefined,
      rawSession,
      rawAssignment,
      targeting,
      pickedRosters,
      sessionId,
      now,
      stamp,
    });
  }

  if (kind === 'videoActivity') {
    return launchVideoActivity({
      db,
      hostUid,
      itemId,
      keyData: keySnap.exists ? keySnap.data() : undefined,
      rawSession,
      rawAssignment,
      targeting,
      pickedRosters,
      sessionId,
      now,
      stamp,
    });
  }

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
