/**
 * getTeammatePrintContextV1 — everything the "print for a teammate" picker
 * needs, read-only (docs/plans/PLC_DELEGATED_PAPER_PRINTING.md §5.1).
 *
 * Increment 1 of the delegated-printing stack. It answers "what WOULD print
 * for this colleague" and writes nothing, anywhere — the batch-creating half
 * lands separately once this one is proven.
 *
 * Every cross-user read here runs as admin AFTER `authorizeDelegatedPrint`
 * proves the caller may act, the same posture as `importPaperResponses.ts`.
 * No Firestore rule gains a PLC branch into `users/{uid}/**`.
 *
 * PII boundary (D5): student names come out of the target's Drive roster, but
 * `pin` is a join credential and `email` is PII — `toPrintStudent` rebuilds
 * each row from three fields so neither can ride along by accident.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import axios from 'axios';
import './functionsInit';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { refreshGoogleAccessTokenForUid } from './googleOAuth';
import {
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  GOOGLE_OAUTH_REFRESH_TOKEN_KEY,
} from './secrets';

/** All three legs of the offline grant, as `refreshGoogleAccessTokenForUid` requires. */
const OFFLINE_GRANT_SECRETS = [
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  GOOGLE_OAUTH_REFRESH_TOKEN_KEY,
];

/** Admin kill switches; both must be on. Mirrors `config/*` on the client. */
export const PAPER_SETTINGS_PATH = 'admin_settings/paper_answer_sheets';
export const DELEGATED_PRINTING_SETTINGS_PATH =
  'admin_settings/plc_delegated_printing';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_TIMEOUT_MS = 20000;

const MAX_ID_LENGTH = 128;
/** Far past any real teacher's class load; bounds the Drive fan-out. */
const MAX_ROSTERS = 40;
const MAX_STUDENTS_PER_ROSTER = 300;
const MAX_QUESTIONS = 500;
/** Matches `ROSTER_DRIVE_CONCURRENCY` in `hooks/useRosters.ts` — Drive 429s above this. */
const ROSTER_READ_CONCURRENCY = 4;
/** A duplicate warning only needs to prove earlier stacks exist (D18). */
const BATCH_SCAN_LIMIT = 50;

export interface DelegatedPrintCaller {
  uid: string;
  studentRole: boolean;
  anonymous: boolean;
  /** For `global_permissions` gates; absent where no gate is checked. */
  email?: string | null;
}

export interface GetTeammatePrintContextInput {
  plcId: string;
  targetUid: string;
  plcQuizId: string;
}

/** Name only — never `pin`, never `email` (D5). */
export interface TeammatePrintStudent {
  id: string;
  firstName: string;
  lastName: string;
}

export interface TeammatePrintRoster {
  id: string;
  name: string;
  /** Denormalized count from Firestore; survives a failed Drive read. */
  studentCount: number;
  students: TeammatePrintStudent[];
  /** Set when the student list could not be read; the count still shows. */
  loadError?: string;
}

export interface TeammatePrintQuiz {
  id: string;
  title: string;
  questions: unknown[];
  stimuli?: unknown[];
  /** Items the owner's answer sheet prints beside the bubbles. */
  paperSheetStimuli?: unknown[];
  /** Carried so the picker can refuse written questions in a choose-N section. */
  sections?: unknown[];
  order?: unknown[];
  language?: string;
}

export interface TeammatePrintBatchSummary {
  id: string;
  createdAt: number;
  sheetCount: number;
  /** Absent on a batch the owner printed themselves (D21). */
  printedByName: string | null;
}

export interface TeammatePrintContext {
  targetUid: string;
  targetName: string;
  /** The target already holds their own copy of this PLC quiz. */
  hasCopy: boolean;
  /** Their quiz id — what a batch would be bound to. `null` until a copy exists. */
  quizId: string | null;
  /** False when the target never granted offline Drive access, or Drive failed. */
  driveReachable: boolean;
  /** Which source the returned questions came from (D11). */
  contentSource: 'drive' | 'synced-group';
  quiz: TeammatePrintQuiz;
  rosters: TeammatePrintRoster[];
  existingBatches: TeammatePrintBatchSummary[];
  // Always null now (D20 defers instead); kept so a pre-release open tab still enables Print.
  blocked: null;
}

/** Drive/OAuth seam so the authorization ladder is testable without either. */
export interface TeammatePrintDeps {
  getAccessToken: (uid: string) => Promise<string>;
  readDriveJson: (accessToken: string, fileId: string) => Promise<unknown>;
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

export function parseGetTeammatePrintContextInput(
  raw: unknown
): GetTeammatePrintContextInput {
  if (!isRecord(raw)) return invalid('Malformed request.');
  return {
    plcId: parseId(raw.plcId, 'plcId'),
    targetUid: parseId(raw.targetUid, 'targetUid'),
    plcQuizId: parseId(raw.plcQuizId, 'plcQuizId'),
  };
}

// ---------------------------------------------------------------------------
// Authorization (plan §4) — shared with the write half of the stack.
// ---------------------------------------------------------------------------

interface PlcMemberRecord {
  role?: unknown;
  status?: unknown;
  displayName?: unknown;
  email?: unknown;
}

const memberRecord = (
  plcData: Record<string, unknown>,
  uid: string
): PlcMemberRecord | null => {
  const members = plcData.members;
  if (!isRecord(members)) return null;
  const entry = members[uid];
  return isRecord(entry) ? (entry as PlcMemberRecord) : null;
};

const legacyMemberUids = (plcData: Record<string, unknown>): string[] =>
  Array.isArray(plcData.memberUids)
    ? plcData.memberUids.filter((u): u is string => typeof u === 'string')
    : [];

/**
 * Current member of this PLC? Mirrors `getPlcMembers`: the canonical map wins,
 * and a legacy (map-less) PLC falls back to the denormalized index.
 */
export function isCurrentPlcMember(
  plcData: Record<string, unknown>,
  uid: string
): boolean {
  const entry = memberRecord(plcData, uid);
  if (entry) return entry.status !== 'removed';
  return legacyMemberUids(plcData).includes(uid);
}

/**
 * May this uid write PLC content? Mirrors `plcCanEditContent` in
 * `firestore.rules`: a keyed member whose role is not `viewer`, or any uid in
 * `memberUids` on a legacy PLC (which has no viewers).
 */
export function canEditPlcContent(
  plcData: Record<string, unknown>,
  uid: string
): boolean {
  const entry = memberRecord(plcData, uid);
  if (entry) return entry.status !== 'removed' && entry.role !== 'viewer';
  return legacyMemberUids(plcData).includes(uid);
}

/** Display-name snapshot from the PLC's own member record. */
const memberName = (
  plcData: Record<string, unknown>,
  uid: string,
  fallback: string
): string => {
  const entry = memberRecord(plcData, uid);
  return (
    (typeof entry?.displayName === 'string' && entry.displayName) ||
    (typeof entry?.email === 'string' && entry.email) ||
    fallback
  );
};

export interface DelegatedPrintAuthorization {
  /** `/synced_quizzes/{groupId}` — the canonical content for this PLC quiz. */
  groupId: string;
  targetName: string;
  /** Who is printing, as the stack and the activity feed will name them. */
  callerName: string;
}

/**
 * The plan's §4 ladder, in order, for every delegated-printing callable.
 * Membership is read server-side; the caller's word is never taken for it.
 */
export async function authorizeDelegatedPrint(
  db: admin.firestore.Firestore,
  caller: DelegatedPrintCaller | null,
  input: GetTeammatePrintContextInput
): Promise<DelegatedPrintAuthorization> {
  // 1. A real, live teacher account.
  if (!caller) throw new HttpsError('unauthenticated', 'Sign in required.');
  if (caller.studentRole || caller.anonymous)
    throw new HttpsError('permission-denied', 'Teacher account required.');
  if (caller.uid === input.targetUid)
    throw new HttpsError(
      'invalid-argument',
      'Use the quiz menu to print for your own classes.'
    );

  // 2. Both kill switches, re-read server-side (D6).
  const [paperSettings, delegatedSettings] = await Promise.all([
    db.doc(PAPER_SETTINGS_PATH).get(),
    db.doc(DELEGATED_PRINTING_SETTINGS_PATH).get(),
  ]);
  if (paperSettings.data()?.enabled !== true)
    throw new HttpsError(
      'failed-precondition',
      'Paper answer sheets are not enabled.'
    );
  if (delegatedSettings.data()?.enabled !== true)
    throw new HttpsError(
      'failed-precondition',
      'Printing for a teammate is not enabled.'
    );

  const plcRef = db.collection('plcs').doc(input.plcId);
  const [plcSnap, plcQuizSnap] = await Promise.all([
    plcRef.get(),
    plcRef.collection('quizzes').doc(input.plcQuizId).get(),
  ]);
  if (!plcSnap.exists) throw new HttpsError('not-found', 'PLC not found.');
  const plcData = (plcSnap.data() ?? {}) as Record<string, unknown>;

  // 3. The PLC allows it and the CALLER may act (non-viewer member).
  const features = isRecord(plcData.features) ? plcData.features : {};
  if (features.printForTeammates === false)
    throw new HttpsError(
      'failed-precondition',
      'This PLC has turned off printing for a teammate.'
    );
  if (!canEditPlcContent(plcData, caller.uid))
    throw new HttpsError(
      'permission-denied',
      'You are not an editing member of this PLC.'
    );

  // 4. The TARGET is a member of the same PLC.
  if (!isCurrentPlcMember(plcData, input.targetUid))
    throw new HttpsError(
      'not-found',
      'That teacher is not a member of this PLC.'
    );

  // 5. The quiz is shared into this PLC (D4) — never a private-library quiz.
  if (!plcQuizSnap.exists)
    throw new HttpsError('not-found', 'PLC quiz not found.');
  const groupId: unknown = (plcQuizSnap.data() ?? {}).syncGroupId;
  if (typeof groupId !== 'string' || groupId.length === 0)
    throw new HttpsError(
      'failed-precondition',
      'PLC quiz is not linked to a synced group.'
    );

  return {
    groupId,
    targetName: memberName(plcData, input.targetUid, 'your teammate'),
    callerName: memberName(plcData, caller.uid, 'A PLC teammate'),
  };
}

// ---------------------------------------------------------------------------
// Reads
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

/** Rebuilt field by field so `pin` and `email` cannot ride along (D5). */
function toPrintStudent(raw: unknown): TeammatePrintStudent | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || !raw.id) return null;
  return {
    id: raw.id,
    firstName: typeof raw.firstName === 'string' ? raw.firstName : '',
    lastName: typeof raw.lastName === 'string' ? raw.lastName : '',
  };
}

/** Accepts the v2 envelope and the legacy bare array, like `useRosters.ts`. */
function studentsFromRosterFile(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (isRecord(parsed) && Array.isArray(parsed.students))
    return parsed.students;
  throw new Error('Roster Drive file is not a recognized roster payload');
}

function quizFromContent(
  id: string,
  raw: Record<string, unknown>
): TeammatePrintQuiz {
  const questions = Array.isArray(raw.questions)
    ? raw.questions.slice(0, MAX_QUESTIONS)
    : [];
  return {
    id,
    title: typeof raw.title === 'string' ? raw.title : '',
    questions,
    ...(Array.isArray(raw.stimuli) ? { stimuli: raw.stimuli } : {}),
    ...(Array.isArray(raw.paperSheetStimuli)
      ? { paperSheetStimuli: raw.paperSheetStimuli }
      : {}),
    ...(Array.isArray(raw.sections) ? { sections: raw.sections } : {}),
    ...(Array.isArray(raw.order) ? { order: raw.order } : {}),
    ...(typeof raw.language === 'string' ? { language: raw.language } : {}),
  };
}

export async function handleGetTeammatePrintContext(
  db: admin.firestore.Firestore,
  caller: DelegatedPrintCaller | null,
  raw: unknown,
  deps: TeammatePrintDeps
): Promise<TeammatePrintContext> {
  const input = parseGetTeammatePrintContextInput(raw);
  const { groupId, targetName } = await authorizeDelegatedPrint(
    db,
    caller,
    input
  );

  const targetRef = db.collection('users').doc(input.targetUid);

  // The target's own copy of this PLC quiz — the only quiz id a batch may be
  // bound to, because `importPaperResponsesV1` asserts batch.quizId matches
  // THEIR assignment (plan §1.2).
  const copySnap = await targetRef
    .collection('quizzes')
    .where('sync.groupId', '==', groupId)
    .limit(1)
    .get();
  const copy = copySnap.docs[0];
  const hasCopy = copy !== undefined;
  const quizId = hasCopy ? copy.id : null;
  const copyDriveFileId =
    hasCopy && typeof copy.data().driveFileId === 'string'
      ? (copy.data().driveFileId as string)
      : null;

  // One token for the whole call. No grant is not an error — it downgrades the
  // run to a spares-only stack (D19), and defers their library copy to their
  // own next sign-in when they have none (D20).
  let accessToken: string | null = null;
  try {
    accessToken = await deps.getAccessToken(input.targetUid);
  } catch {
    accessToken = null;
  }
  const driveReachable = accessToken !== null;

  // Content: their Drive copy first, the synced group as the safety net (D11).
  let quiz: TeammatePrintQuiz | null = null;
  let contentSource: 'drive' | 'synced-group' = 'synced-group';
  if (accessToken && copyDriveFileId && quizId) {
    try {
      const body = await deps.readDriveJson(accessToken, copyDriveFileId);
      if (isRecord(body)) {
        quiz = quizFromContent(quizId, body);
        contentSource = 'drive';
      }
    } catch {
      quiz = null;
    }
  }
  if (!quiz) {
    const groupSnap = await db.collection('synced_quizzes').doc(groupId).get();
    if (!groupSnap.exists)
      throw new HttpsError('not-found', 'Synced quiz group not found.');
    quiz = quizFromContent(
      quizId ?? groupId,
      (groupSnap.data() ?? {}) as Record<string, unknown>
    );
    contentSource = 'synced-group';
  }

  // Rosters: metadata from Firestore, names from Drive. A roster whose Drive
  // file will not read still lists — its seat count is what drives the stack.
  const rosterSnaps = await targetRef
    .collection('rosters')
    .limit(MAX_ROSTERS)
    .get();
  const rosters = await mapLimited(
    rosterSnaps.docs,
    ROSTER_READ_CONCURRENCY,
    async (snap): Promise<TeammatePrintRoster> => {
      const data = snap.data() ?? {};
      const base = {
        id: snap.id,
        name: typeof data.name === 'string' ? data.name : '',
        studentCount:
          typeof data.studentCount === 'number' ? data.studentCount : 0,
      };
      const fileId =
        typeof data.driveFileId === 'string' ? data.driveFileId : null;
      if (!accessToken || !fileId)
        return { ...base, students: [], loadError: 'no-drive-access' };
      try {
        const body = await deps.readDriveJson(accessToken, fileId);
        const students = studentsFromRosterFile(body)
          .slice(0, MAX_STUDENTS_PER_ROSTER)
          .map(toPrintStudent)
          .filter((s): s is TeammatePrintStudent => s !== null);
        return { ...base, students };
      } catch {
        return { ...base, students: [], loadError: 'drive-read-failed' };
      }
    }
  );
  rosters.sort((a, b) => a.name.localeCompare(b.name));

  // Batches already printed for this teacher + quiz (D18). A bare equality
  // needs no composite index; `listPaperBatchesForQuiz` sorts the same way.
  // With no copy yet, a deferred run (D20) is only findable by the group it is
  // waiting on — without this a second helper would print a duplicate stack.
  const batchSnaps = quizId
    ? await targetRef
        .collection('paper_batches')
        .where('quizId', '==', quizId)
        .limit(BATCH_SCAN_LIMIT)
        .get()
    : await targetRef
        .collection('paper_batches')
        .where('pendingQuizCopy.groupId', '==', groupId)
        .limit(BATCH_SCAN_LIMIT)
        .get();
  const existingBatches: TeammatePrintBatchSummary[] = batchSnaps.docs
    .map((snap) => {
      const data = snap.data() ?? {};
      const seats = isRecord(data.seats) ? Object.keys(data.seats).length : 0;
      const spares = Array.isArray(data.spareSeats)
        ? data.spareSeats.length
        : 0;
      return {
        id: snap.id,
        createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
        sheetCount: seats + spares,
        printedByName:
          typeof data.printedByName === 'string' ? data.printedByName : null,
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);

  return {
    targetUid: input.targetUid,
    targetName,
    hasCopy,
    quizId,
    driveReachable,
    contentSource,
    quiz,
    rosters,
    existingBatches,
    blocked: null,
  };
}

export function buildLiveDeps(): TeammatePrintDeps {
  return {
    getAccessToken: async (uid) =>
      (await refreshGoogleAccessTokenForUid(uid)).accessToken,
    readDriveJson: async (accessToken, fileId) => {
      const res = await axios.get<unknown>(
        `${DRIVE_API}/files/${encodeURIComponent(fileId)}`,
        {
          params: { alt: 'media' },
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: DRIVE_TIMEOUT_MS,
        }
      );
      return res.data;
    },
  };
}

export const getTeammatePrintContextV1 = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 120,
    cors: ALLOWED_ORIGINS,
    secrets: OFFLINE_GRANT_SECRETS,
    invoker: 'public',
  },
  async (request) => {
    const caller: DelegatedPrintCaller | null = request.auth
      ? {
          uid: request.auth.uid,
          studentRole: request.auth.token.studentRole === true,
          anonymous:
            request.auth.token.firebase?.sign_in_provider === 'anonymous',
        }
      : null;
    return handleGetTeammatePrintContext(
      admin.firestore(),
      caller,
      request.data,
      buildLiveDeps()
    );
  }
);
