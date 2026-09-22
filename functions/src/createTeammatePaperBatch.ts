/**
 * createTeammatePaperBatchV1 / withdrawTeammatePaperBatchV1 — the write half of
 * delegated printing (docs/plans/PLC_DELEGATED_PAPER_PRINTING.md §5.2, §5.3).
 *
 * Both run as admin AFTER `authorizeDelegatedPrint` proves the caller may act,
 * so `users/{uid}/paper_batches` stays owner-only in `firestore.rules`.
 *
 * The caller sends selections, never a seat map: the batch is re-derived here
 * from the target's own rosters (D16), so a peer cannot hand-craft seats that
 * point at arbitrary students. Student names reach the printed sheet; `pin`
 * and `email` never leave this file (D5).
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import axios from 'axios';
import { randomUUID } from 'crypto';
import './functionsInit';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { handleJoinPlcQuizSyncGroup } from './plcQuizSyncJoin';
import {
  authorizeDelegatedPrint,
  buildLiveDeps,
  type DelegatedPrintCaller,
  type TeammatePrintDeps,
} from './getTeammatePrintContext';
import {
  analyzePaperQuiz,
  planPaperBatch,
  type PaperBatchDoc,
  type PaperBatchSelection,
  type PaperQuestion,
  type PaperSheetPlan,
} from './paperBatchPlan';
import {
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  GOOGLE_OAUTH_REFRESH_TOKEN_KEY,
} from './secrets';

const OFFLINE_GRANT_SECRETS = [
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  GOOGLE_OAUTH_REFRESH_TOKEN_KEY,
];

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const DRIVE_TIMEOUT_MS = 20000;
const APP_DRIVE_FOLDER = 'SpartBoard';
const QUIZ_DRIVE_FOLDER = 'Quizzes';

const MAX_ID_LENGTH = 128;
const MAX_ROSTERS = 40;
const MAX_STUDENTS_PER_ROSTER = 300;
const MAX_SPARES = 20;
const MAX_QUESTIONS = 500;
const ROSTER_READ_CONCURRENCY = 4;
/** Paper administrations for one quiz; bounds the "already imported?" scan. */
const ASSIGNMENT_SCAN_LIMIT = 50;

/** The feed entry D21 stamps on the PLC; mirrors `PlcActivityType` in root `types.ts`. */
const PAPER_PRINTED_ACTIVITY = 'paper_printed';

export interface TeammatePrintSelectionInput {
  rosterId: string;
  /** Students to seat. Ignored for a roster whose names could not be read. */
  studentIds: string[];
}

export interface CreateTeammatePaperBatchInput {
  plcId: string;
  targetUid: string;
  plcQuizId: string;
  selections: TeammatePrintSelectionInput[];
  spareCount: number;
}

export interface WithdrawTeammatePaperBatchInput {
  plcId: string;
  targetUid: string;
  plcQuizId: string;
  batchId: string;
}

/** One row of the test paper, lettered in the order this batch printed. */
export interface TeammateTestPaperRow {
  row: number;
  text: string;
  choices: string[];
}

/** Deferred library copy the owner's client materializes on next sign-in (D20). */
export interface PendingQuizCopy {
  groupId: string;
  plcId: string;
  plcQuizId: string;
  title: string;
  requestedByName: string;
  requestedAt: number;
}

export interface CreateTeammatePaperBatchResult {
  batch: PaperBatchDoc & {
    printedByUid: string;
    printedByName: string;
    printedAt: number;
    pendingQuizCopy?: PendingQuizCopy;
  };
  sheets: PaperSheetPlan[];
  quizTitle: string;
  /** Printed on every sheet so a stack cannot be handed to the wrong class (D17). */
  printedForTeacherName: string;
  testPaper: TeammateTestPaperRow[];
  /** True when this run created the target's copy and joined it to the group (D9). */
  createdCopy: boolean;
  /** True when their copy is deferred to their next sign-in instead (D20). */
  pendingCopy: boolean;
}

/** Drive writes as the target, seamed like the read path so tests need no HTTP. */
export interface TeammatePrintWriteDeps extends TeammatePrintDeps {
  writeDriveJson: (
    accessToken: string,
    fileName: string,
    content: string
  ) => Promise<string>;
  trashDriveFile: (accessToken: string, fileId: string) => Promise<void>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function invalid(message: string): never {
  throw new HttpsError('invalid-argument', message);
}

const parseId = (value: unknown, label: string): string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= MAX_ID_LENGTH &&
  !value.includes('/')
    ? value
    : invalid(`${label} is required.`);

function parseSelection(raw: unknown): TeammatePrintSelectionInput {
  if (!isRecord(raw)) return invalid('Malformed class selection.');
  const studentIds = Array.isArray(raw.studentIds) ? raw.studentIds : [];
  if (studentIds.length > MAX_STUDENTS_PER_ROSTER)
    invalid('Too many students in one class.');
  return {
    rosterId: parseId(raw.rosterId, 'rosterId'),
    studentIds: studentIds.map((id) => parseId(id, 'studentId')),
  };
}

export function parseCreateTeammatePaperBatchInput(
  raw: unknown
): CreateTeammatePaperBatchInput {
  if (!isRecord(raw)) return invalid('Malformed request.');
  const selections = Array.isArray(raw.selections) ? raw.selections : [];
  if (selections.length > MAX_ROSTERS) invalid('Too many classes selected.');
  const spareCount = typeof raw.spareCount === 'number' ? raw.spareCount : 0;
  if (
    !Number.isInteger(spareCount) ||
    spareCount < 0 ||
    spareCount > MAX_SPARES
  )
    invalid(`spareCount must be a whole number from 0 to ${MAX_SPARES}.`);
  return {
    plcId: parseId(raw.plcId, 'plcId'),
    targetUid: parseId(raw.targetUid, 'targetUid'),
    plcQuizId: parseId(raw.plcQuizId, 'plcQuizId'),
    selections: selections.map(parseSelection),
    spareCount,
  };
}

export function parseWithdrawTeammatePaperBatchInput(
  raw: unknown
): WithdrawTeammatePaperBatchInput {
  if (!isRecord(raw)) return invalid('Malformed request.');
  return {
    plcId: parseId(raw.plcId, 'plcId'),
    targetUid: parseId(raw.targetUid, 'targetUid'),
    plcQuizId: parseId(raw.plcQuizId, 'plcQuizId'),
    batchId: parseId(raw.batchId, 'batchId'),
  };
}

// ---------------------------------------------------------------------------
// Reads shared with the context callable
// ---------------------------------------------------------------------------

async function mapLimited<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    out.push(...(await Promise.all(items.slice(i, i + limit).map(fn))));
  }
  return out;
}

interface ResolvedRoster {
  id: string;
  name: string;
  studentCount: number;
  /** Empty when the Drive roster could not be read — the run falls back to spares (D19). */
  students: Array<{ id: string; firstName: string; lastName: string }>;
}

/** Rebuilt field by field so `pin` and `email` cannot ride along (D5). */
function toPrintStudent(
  raw: unknown
): { id: string; firstName: string; lastName: string } | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || !raw.id) return null;
  return {
    id: raw.id,
    firstName: typeof raw.firstName === 'string' ? raw.firstName : '',
    lastName: typeof raw.lastName === 'string' ? raw.lastName : '',
  };
}

function studentsFromRosterFile(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (isRecord(parsed) && Array.isArray(parsed.students))
    return parsed.students;
  throw new Error('Roster Drive file is not a recognized roster payload');
}

async function readTargetRosters(
  targetRef: admin.firestore.DocumentReference,
  accessToken: string | null,
  deps: TeammatePrintWriteDeps
): Promise<ResolvedRoster[]> {
  const snaps = await targetRef.collection('rosters').limit(MAX_ROSTERS).get();
  return mapLimited(
    snaps.docs,
    ROSTER_READ_CONCURRENCY,
    async (snap): Promise<ResolvedRoster> => {
      const data = snap.data() ?? {};
      const base = {
        id: snap.id,
        name: typeof data.name === 'string' ? data.name : '',
        studentCount:
          typeof data.studentCount === 'number' ? data.studentCount : 0,
      };
      const fileId =
        typeof data.driveFileId === 'string' ? data.driveFileId : null;
      if (!accessToken || !fileId) return { ...base, students: [] };
      try {
        const body = await deps.readDriveJson(accessToken, fileId);
        return {
          ...base,
          students: studentsFromRosterFile(body)
            .slice(0, MAX_STUDENTS_PER_ROSTER)
            .map(toPrintStudent)
            .filter((s): s is NonNullable<typeof s> => s !== null),
        };
      } catch {
        return { ...base, students: [] };
      }
    }
  );
}

function toPaperQuestion(raw: unknown): PaperQuestion | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || !raw.id) return null;
  return {
    id: raw.id,
    type: typeof raw.type === 'string' ? raw.type : '',
    text: typeof raw.text === 'string' ? raw.text : '',
    correctAnswer:
      typeof raw.correctAnswer === 'string' ? raw.correctAnswer : '',
    incorrectAnswers: Array.isArray(raw.incorrectAnswers)
      ? raw.incorrectAnswers.filter((c): c is string => typeof c === 'string')
      : [],
  };
}

interface QuizContent {
  title: string;
  questions: unknown[];
  stimuli?: unknown[];
  /** Items the owner's answer sheet prints beside the bubbles (D14). */
  paperSheetStimuli?: unknown[];
  language?: string;
  /** `synced_quizzes/{groupId}.version`; absent on a copy read from Drive. */
  version?: number;
}

function toQuizContent(raw: Record<string, unknown>): QuizContent {
  return {
    title: typeof raw.title === 'string' ? raw.title : '',
    questions: Array.isArray(raw.questions)
      ? raw.questions.slice(0, MAX_QUESTIONS)
      : [],
    ...(Array.isArray(raw.stimuli) ? { stimuli: raw.stimuli } : {}),
    ...(Array.isArray(raw.paperSheetStimuli)
      ? { paperSheetStimuli: raw.paperSheetStimuli }
      : {}),
    ...(typeof raw.language === 'string' ? { language: raw.language } : {}),
    ...(typeof raw.version === 'number' ? { version: raw.version } : {}),
  };
}

const sanitizeDriveFileName = (title: string): string =>
  title.replace(/[/\\:*?"<>|]/g, '_').trim() || 'untitled';

// ---------------------------------------------------------------------------
// createTeammatePaperBatchV1
// ---------------------------------------------------------------------------

/**
 * Create the target's copy and join it to the PLC group (D9, D10).
 *
 * The most intrusive step in the feature: it writes a file into a colleague's
 * Drive and joins them to a sync group while they are out.
 *
 * The copy is claimed in a transaction whose query IS the dedup key — two
 * teammates printing for the same absent colleague at once cannot both add a
 * copy to their library. The loser trashes its own Drive file and prints
 * against the winner's copy, so `quizId` is returned rather than assumed.
 */
async function createCopyForTarget(
  db: admin.firestore.Firestore,
  targetUid: string,
  plcId: string,
  plcQuizId: string,
  groupId: string,
  quizId: string,
  content: QuizContent,
  accessToken: string,
  deps: TeammatePrintWriteDeps,
  now: number
): Promise<{ quizId: string; created: boolean }> {
  const fileName = `${sanitizeDriveFileName(content.title)}.${quizId.slice(
    0,
    8
  )}.quiz.json`;
  const payload = {
    id: quizId,
    title: content.title,
    questions: content.questions,
    ...(content.stimuli?.length ? { stimuli: content.stimuli } : {}),
    ...(content.paperSheetStimuli?.length
      ? { paperSheetStimuli: content.paperSheetStimuli }
      : {}),
    ...(content.language ? { language: content.language } : {}),
    createdAt: now,
    updatedAt: now,
  };

  let driveFileId: string;
  try {
    driveFileId = await deps.writeDriveJson(
      accessToken,
      fileName,
      JSON.stringify(payload, null, 2)
    );
  } catch {
    throw new HttpsError(
      'failed-precondition',
      'Could not save a copy of this quiz to their Google Drive.'
    );
  }

  const quizzesRef = db
    .collection('users')
    .doc(targetUid)
    .collection('quizzes');
  const quizRef = quizzesRef.doc(quizId);

  const claimedId = await db.runTransaction(async (tx) => {
    const existing = await tx.get(
      quizzesRef.where('sync.groupId', '==', groupId).limit(1)
    );
    const found = existing.docs[0];
    if (found) return found.id;
    tx.set(quizRef, {
      id: quizId,
      title: content.title,
      driveFileId,
      questionCount: content.questions.length,
      createdAt: now,
      updatedAt: now,
      ...(content.language ? { language: content.language } : {}),
      // Written inside the claim: this linkage is what a concurrent run
      // collides on, so it cannot be deferred until after the join.
      sync: { groupId, lastSyncedVersion: content.version ?? 1 },
    });
    return quizId;
  });

  if (claimedId !== quizId) {
    await deps.trashDriveFile(accessToken, driveFileId).catch(() => undefined);
    return { quizId: claimedId, created: false };
  }

  try {
    const join = await handleJoinPlcQuizSyncGroup(
      db,
      targetUid,
      plcId,
      plcQuizId
    );
    // The copy is already valid and joined by this point, so a failure to
    // refine the version only leaves it stale — which the next pull corrects.
    // Undoing the doc here would strand them in the participants map instead.
    await quizRef
      .update({
        sync: {
          groupId: join.groupId,
          lastSyncedVersion: Math.max(join.version, content.version ?? 1),
        },
      })
      .catch(() => undefined);
  } catch (err) {
    await quizRef.delete().catch(() => undefined);
    await deps.trashDriveFile(accessToken, driveFileId).catch(() => undefined);
    throw err;
  }

  return { quizId, created: true };
}

/** Best-effort feed entry (D21); never fails the print that already happened. */
async function writePaperPrintedActivity(
  db: admin.firestore.Firestore,
  plcId: string,
  plcQuizId: string,
  actorUid: string,
  actorName: string,
  quizTitle: string,
  targetName: string
): Promise<void> {
  try {
    const ref = db.collection('plcs').doc(plcId).collection('activity').doc();
    await ref.set({
      id: ref.id,
      type: PAPER_PRINTED_ACTIVITY,
      actorUid,
      actorName,
      targetType: 'paperBatch',
      targetId: plcQuizId,
      targetTitle: `${quizTitle} — ${targetName}`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch {
    // The paper exists either way; an unlogged print is better than a failed one.
  }
}

export async function handleCreateTeammatePaperBatch(
  db: admin.firestore.Firestore,
  caller: DelegatedPrintCaller | null,
  raw: unknown,
  deps: TeammatePrintWriteDeps,
  now: number = Date.now()
): Promise<CreateTeammatePaperBatchResult> {
  const input = parseCreateTeammatePaperBatchInput(raw);
  const { groupId, targetName, callerName } = await authorizeDelegatedPrint(
    db,
    caller,
    input
  );
  // `authorizeDelegatedPrint` rejects an absent caller before this point.
  const actor = caller as DelegatedPrintCaller;

  const targetRef = db.collection('users').doc(input.targetUid);
  const copySnap = await targetRef
    .collection('quizzes')
    .where('sync.groupId', '==', groupId)
    .limit(1)
    .get();
  const copy = copySnap.docs[0];

  let accessToken: string | null = null;
  try {
    accessToken = await deps.getAccessToken(input.targetUid);
  } catch {
    accessToken = null;
  }

  // The PLC's shared copy is the fallback source, so it is only fetched when
  // there is no readable copy of their own to print from.
  let canonicalContent: QuizContent | null = null;
  const canonical = async (): Promise<QuizContent> => {
    if (canonicalContent) return canonicalContent;
    const snap = await db.collection('synced_quizzes').doc(groupId).get();
    if (!snap.exists)
      throw new HttpsError('not-found', 'Synced quiz group not found.');
    canonicalContent = toQuizContent(
      (snap.data() ?? {}) as Record<string, unknown>
    );
    return canonicalContent;
  };

  // Nothing below this point writes until the whole run is known to be
  // printable: a rejected print must never leave a quiz — or a sync-group
  // membership — behind in someone else's account (§9).
  // No copy and no Drive: reserve the id here and let their own client build
  // the copy on next sign-in (D20), rather than making the print wait on their
  // account being reachable — they open SpartBoard to scan the stack anyway.
  const copyToken = !copy && accessToken ? accessToken : null;
  const deferCopy = !copy && !accessToken;
  const quizId = copy ? copy.id : randomUUID();
  const driveFileId =
    copy && typeof copy.data().driveFileId === 'string'
      ? (copy.data().driveFileId as string)
      : null;

  // Their copy is what their assignment grades against; the group is the net (D11).
  let content: QuizContent | null = null;
  if (accessToken && driveFileId) {
    try {
      const body = await deps.readDriveJson(accessToken, driveFileId);
      if (isRecord(body)) content = toQuizContent(body);
    } catch {
      content = null;
    }
  }
  if (!content) content = await canonical();

  const questions = content.questions
    .map(toPaperQuestion)
    .filter((q): q is PaperQuestion => q !== null);
  const analysis = analyzePaperQuiz(questions);
  if (analysis.rows.length === 0)
    throw new HttpsError(
      'failed-precondition',
      'This quiz has no multiple-choice questions to bubble.'
    );
  const questionsById = new Map(questions.map((q) => [q.id, q]));
  const sheetQuestions = analysis.rows.flatMap((r) => {
    const q = questionsById.get(r.questionId);
    return q ? [q] : [];
  });

  // Selections are re-derived against their real rosters — the caller's ids are
  // a filter, never a source of students (D16).
  const rosters = await readTargetRosters(targetRef, accessToken, deps);
  const rosterById = new Map(rosters.map((r) => [r.id, r]));
  const selections: PaperBatchSelection[] = [];
  let unnamedSpares = 0;
  for (const selection of input.selections) {
    const roster = rosterById.get(selection.rosterId);
    if (!roster)
      throw new HttpsError(
        'not-found',
        'One of those classes no longer exists.'
      );
    if (roster.students.length === 0) {
      // Names unavailable: the class still gets its sheets, unnamed (D19).
      unnamedSpares += Math.max(0, roster.studentCount);
      selections.push({
        roster: { id: roster.id, name: roster.name },
        students: [],
      });
      continue;
    }
    const wanted = new Set(selection.studentIds);
    selections.push({
      roster: { id: roster.id, name: roster.name },
      students: roster.students.filter((s) => wanted.has(s.id)),
    });
  }
  const spareCount = input.spareCount + unnamedSpares;
  if (selections.every((s) => s.students.length === 0) && spareCount === 0)
    throw new HttpsError(
      'failed-precondition',
      'Pick at least one student or spare sheet.'
    );

  const batchId = randomUUID();
  let planned: ReturnType<typeof planPaperBatch>;
  try {
    planned = planPaperBatch({
      batchId,
      quizId,
      selections,
      questionCount: analysis.rows.length,
      choiceCount: analysis.sheetChoiceCount,
      spareCount,
      // An authored quiz already has its key, so a delegated run never bubbles
      // one (plan §2.5).
      includeKeySheet: false,
      questions: sheetQuestions,
      // Sheet stimuli need the page's right half, so the stack drops to one
      // answer column — the same rule the owner's own print follows.
      ...(content.paperSheetStimuli?.length
        ? { columnsPerPage: 1 as const }
        : {}),
      createdAt: now,
    });
  } catch (err) {
    throw new HttpsError(
      'failed-precondition',
      err instanceof RangeError
        ? err.message
        : 'Could not lay out that print run.'
    );
  }

  // First write of the call. Creating their copy and joining the sync group is
  // the most intrusive thing this feature does (D9), so it happens only once
  // there is a stack to bind to it.
  let effectiveQuizId = quizId;
  let createdCopy = false;
  if (copyToken) {
    const claim = await createCopyForTarget(
      db,
      input.targetUid,
      input.plcId,
      input.plcQuizId,
      groupId,
      quizId,
      content,
      copyToken,
      deps,
      now
    );
    // A concurrent run may have created their copy first; bind to whichever
    // copy their library actually holds. The seat map does not depend on it.
    effectiveQuizId = claim.quizId;
    createdCopy = claim.created;
  }

  const batch = {
    ...planned.batch,
    quizId: effectiveQuizId,
    printedByUid: actor.uid,
    printedByName: callerName,
    printedAt: now,
    ...(deferCopy
      ? {
          pendingQuizCopy: {
            groupId,
            plcId: input.plcId,
            plcQuizId: input.plcQuizId,
            title: content.title,
            requestedByName: callerName,
            requestedAt: now,
          },
        }
      : {}),
  };
  await targetRef.collection('paper_batches').doc(batchId).set(batch);

  await writePaperPrintedActivity(
    db,
    input.plcId,
    input.plcQuizId,
    actor.uid,
    callerName,
    content.title,
    targetName
  );

  return {
    batch,
    sheets: planned.sheets,
    quizTitle: content.title,
    printedForTeacherName: targetName,
    testPaper: analysis.rows.flatMap((r) => {
      const q = questionsById.get(r.questionId);
      if (!q) return [];
      return [
        {
          row: r.row,
          text: q.text ?? '',
          choices: planned.batch.choiceOrder?.[q.id] ?? [
            q.correctAnswer,
            ...(q.incorrectAnswers ?? []),
          ],
        },
      ];
    }),
    createdCopy,
    pendingCopy: deferCopy,
  };
}

// ---------------------------------------------------------------------------
// withdrawTeammatePaperBatchV1
// ---------------------------------------------------------------------------

/**
 * Has anything been scanned from this batch yet? Scoped to the target's own
 * paper administrations for the quiz, so no collection-group index is needed.
 */
async function batchHasResponses(
  db: admin.firestore.Firestore,
  targetUid: string,
  quizId: string,
  batchId: string
): Promise<boolean> {
  const assignments = await db
    .collection('users')
    .doc(targetUid)
    .collection('quiz_assignments')
    .where('quizId', '==', quizId)
    .limit(ASSIGNMENT_SCAN_LIMIT)
    .get();
  for (const assignment of assignments.docs) {
    const hit = await db
      .collection('quiz_sessions')
      .doc(assignment.id)
      .collection('responses')
      .where('paperBatchId', '==', batchId)
      .limit(1)
      .get();
    if (!hit.empty) return true;
  }
  return false;
}

export async function handleWithdrawTeammatePaperBatch(
  db: admin.firestore.Firestore,
  caller: DelegatedPrintCaller | null,
  raw: unknown
): Promise<{ deleted: true }> {
  const input = parseWithdrawTeammatePaperBatchInput(raw);
  const { targetName } = await authorizeDelegatedPrint(db, caller, input);
  const actor = caller as DelegatedPrintCaller;

  const batchRef = db
    .collection('users')
    .doc(input.targetUid)
    .collection('paper_batches')
    .doc(input.batchId);
  const batchSnap = await batchRef.get();
  if (!batchSnap.exists)
    throw new HttpsError('not-found', 'That print run no longer exists.');
  const batch = batchSnap.data() ?? {};

  // The owner deletes their own batches through their own library; a helper may
  // only take back the stack they printed, and only before it is scanned (D22).
  if (batch.printedByUid !== actor.uid)
    throw new HttpsError(
      'permission-denied',
      `${targetName} can always remove this print run; you can only take back a stack you printed yourself.`
    );
  // A batch with no quiz on it cannot be checked for scans, so it is never
  // deleted from here — the owner still can, from their own library.
  if (typeof batch.quizId !== 'string' || !batch.quizId)
    throw new HttpsError(
      'failed-precondition',
      'That print run is missing its quiz, so only its owner can remove it.'
    );
  if (await batchHasResponses(db, input.targetUid, batch.quizId, input.batchId))
    throw new HttpsError(
      'failed-precondition',
      `${targetName} has already scanned sheets from this run, so it cannot be removed.`
    );

  await batchRef.delete();
  return { deleted: true };
}

// ---------------------------------------------------------------------------
// Live Drive writes
// ---------------------------------------------------------------------------

async function getOrCreateFolder(
  accessToken: string,
  name: string,
  parentId?: string
): Promise<string> {
  const escaped = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const q = [
    `name = '${escaped}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false',
    ...(parentId ? [`'${parentId}' in parents`] : []),
  ].join(' and ');
  const list = await axios.get<{ files?: Array<{ id: string }> }>(
    `${DRIVE_API}/files`,
    {
      params: { q, fields: 'files(id)' },
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: DRIVE_TIMEOUT_MS,
    }
  );
  const existing = list.data.files?.[0]?.id;
  if (existing) return existing;

  const created = await axios.post<{ id: string }>(
    `${DRIVE_API}/files`,
    {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    },
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: DRIVE_TIMEOUT_MS,
    }
  );
  return created.data.id;
}

export function buildLiveWriteDeps(): TeammatePrintWriteDeps {
  return {
    ...buildLiveDeps(),
    writeDriveJson: async (accessToken, fileName, content) => {
      const appFolder = await getOrCreateFolder(accessToken, APP_DRIVE_FOLDER);
      const folderId = await getOrCreateFolder(
        accessToken,
        QUIZ_DRIVE_FOLDER,
        appFolder
      );
      const created = await axios.post<{ id: string }>(
        `${DRIVE_API}/files`,
        { name: fileName, parents: [folderId], mimeType: 'application/json' },
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: DRIVE_TIMEOUT_MS,
        }
      );
      await axios.patch(
        `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(created.data.id)}`,
        content,
        {
          params: { uploadType: 'media' },
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: DRIVE_TIMEOUT_MS,
        }
      );
      return created.data.id;
    },
    trashDriveFile: async (accessToken, fileId) => {
      await axios.patch(
        `${DRIVE_API}/files/${encodeURIComponent(fileId)}`,
        { trashed: true },
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: DRIVE_TIMEOUT_MS,
        }
      );
    },
  };
}

export const createTeammatePaperBatchV1 = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 300,
    cors: ALLOWED_ORIGINS,
    secrets: OFFLINE_GRANT_SECRETS,
    invoker: 'public',
  },
  async (request) =>
    handleCreateTeammatePaperBatch(
      admin.firestore(),
      request.auth
        ? {
            uid: request.auth.uid,
            studentRole: request.auth.token.studentRole === true,
            anonymous:
              request.auth.token.firebase?.sign_in_provider === 'anonymous',
          }
        : null,
      request.data,
      buildLiveWriteDeps()
    )
);

export const withdrawTeammatePaperBatchV1 = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 120,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  async (request) =>
    handleWithdrawTeammatePaperBatch(
      admin.firestore(),
      request.auth
        ? {
            uid: request.auth.uid,
            studentRole: request.auth.token.studentRole === true,
            anonymous:
              request.auth.token.firebase?.sign_in_provider === 'anonymous',
          }
        : null,
      request.data
    )
);
