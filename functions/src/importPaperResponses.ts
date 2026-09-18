/**
 * importPaperResponsesV1 — writes scanned paper answer sheets as ordinary
 * `quiz_sessions/{id}/responses/*` docs (docs/plans/QUIZ_PAPER_ANSWER_SHEETS.md §7).
 *
 * The only non-student writer of response docs. The Firestore rules that bind
 * a response to the auth uid that wrote it stay untouched: this runs as admin,
 * after proving the caller owns the batch, the assignment and the session.
 *
 * Identity (Q31/Q32): a seat resolves through the roster's `pin_index` sidecar
 * to the same pseudonym uid SSO login would mint, so those students see the
 * published result in My Assignments. Anyone the index cannot place is keyed
 * `pin-{period}-{pin}`, the anonymous-joiner shape every teacher view already
 * resolves to a name from the Drive roster. No name ever reaches this function.
 *
 * Idempotent per sheet (Q23): the response key is deterministic, so a rescan
 * replaces the earlier import. A response that is NOT from this batch already
 * at that key is a collision (Q25) and is reported, never overwritten, unless
 * the teacher resolved it in review and sent `replaceExisting`.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import './functionsInit';
import {
  ALLOWED_ORIGINS,
  encodeResponseKeySegment,
  pinIndexKey,
} from './classlinkShared';

/** Admin kill switch; mirrors `config/paperAnswerSheets.ts`. Absent == off. */
export const PAPER_SETTINGS_PATH = 'admin_settings/paper_answer_sheets';

const MAX_ID_LENGTH = 128;
const MAX_SHEETS_PER_CALL = 200;
const MAX_ANSWERS_PER_SHEET = 400;
const MAX_ANSWER_LENGTH = 2000;
const MAX_PIN_LENGTH = 32;
const MAX_PERIOD_LENGTH = 64;
const WRITE_CHUNK = 400;
const READ_CONCURRENCY = 25;

/** Local mirror of the `unresponded` reasons paper can emit (root `types.ts`). */
type PaperUnresponded = 'passed' | 'paper-unclear';

export interface ImportPaperAnswer {
  questionId: string;
  answer: string;
  unresponded?: PaperUnresponded;
}

export interface ImportPaperSheet {
  seat: number;
  rosterId: string;
  pin: string;
  classPeriod: string;
  answers: ImportPaperAnswer[];
  replaceExisting?: boolean;
}

export interface ImportPaperResponsesInput {
  batchId: string;
  assignmentId: string;
  sheets: ImportPaperSheet[];
}

export interface ImportPaperCollision {
  seat: number;
  responseKey: string;
  /** The existing response came from a different paper batch, not a device. */
  fromOtherBatch: boolean;
  existingSubmittedAt: number | null;
}

export interface ImportPaperResponsesResult {
  written: number[];
  collisions: ImportPaperCollision[];
}

export interface ImportPaperCaller {
  uid: string;
  studentRole: boolean;
  anonymous: boolean;
}

function invalid(message: string): never {
  throw new HttpsError('invalid-argument', message);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseId = (value: unknown, label: string): string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= MAX_ID_LENGTH &&
  !value.includes('/')
    ? value
    : invalid(`${label} is required.`);

const parseText = (value: unknown, max: number, label: string): string =>
  typeof value === 'string' && value.length <= max
    ? value
    : invalid(`${label} must be a string of at most ${max} characters.`);

function parseAnswer(raw: unknown): ImportPaperAnswer {
  if (!isRecord(raw)) return invalid('Malformed answer.');
  const parsed: ImportPaperAnswer = {
    questionId: parseId(raw.questionId, 'questionId'),
    answer: parseText(raw.answer ?? '', MAX_ANSWER_LENGTH, 'answer'),
  };
  if (raw.unresponded !== undefined) {
    if (raw.unresponded !== 'passed' && raw.unresponded !== 'paper-unclear')
      invalid('Unknown unresponded reason.');
    parsed.unresponded = raw.unresponded as PaperUnresponded;
  }
  return parsed;
}

function parseSheet(raw: unknown): ImportPaperSheet {
  if (!isRecord(raw)) return invalid('Malformed sheet.');
  const seat = raw.seat;
  if (!Number.isInteger(seat) || (seat as number) < 1)
    invalid('Each sheet needs a seat number.');
  if (!Array.isArray(raw.answers) || raw.answers.length > MAX_ANSWERS_PER_SHEET)
    invalid(`answers must be an array of at most ${MAX_ANSWERS_PER_SHEET}.`);
  const answers = (raw.answers as unknown[]).map(parseAnswer);
  const seen = new Set<string>();
  for (const a of answers) {
    if (seen.has(a.questionId)) invalid('A sheet repeats a question.');
    seen.add(a.questionId);
  }
  const pin = parseText(raw.pin, MAX_PIN_LENGTH, 'pin').trim();
  if (!pin) invalid('Each sheet needs a pin.');
  return {
    seat: seat as number,
    rosterId: parseId(raw.rosterId, 'rosterId'),
    pin,
    classPeriod: parseText(
      raw.classPeriod ?? '',
      MAX_PERIOD_LENGTH,
      'classPeriod'
    ),
    answers,
    ...(raw.replaceExisting === true ? { replaceExisting: true } : {}),
  };
}

export function parseImportPaperResponsesInput(
  raw: unknown
): ImportPaperResponsesInput {
  const data = isRecord(raw) ? raw : {};
  if (!Array.isArray(data.sheets) || data.sheets.length === 0)
    invalid('sheets must be a non-empty array.');
  if (data.sheets.length > MAX_SHEETS_PER_CALL)
    invalid(`Import at most ${MAX_SHEETS_PER_CALL} sheets per call.`);
  const sheets = (data.sheets as unknown[]).map(parseSheet);
  const seats = new Set<number>();
  for (const s of sheets) {
    if (seats.has(s.seat)) invalid('A seat appears twice.');
    seats.add(s.seat);
  }
  return {
    batchId: parseId(data.batchId, 'batchId'),
    assignmentId: parseId(data.assignmentId, 'assignmentId'),
    sheets,
  };
}

interface BatchDoc {
  quizId?: unknown;
  seats?: Record<string, { rosterId?: unknown; studentId?: unknown }>;
  spareSeats?: unknown;
  keySheetSeat?: unknown;
}

const seatRoster = (batch: BatchDoc, seat: number): string | null => {
  const entry = batch.seats?.[String(seat)];
  return entry && typeof entry.rosterId === 'string' ? entry.rosterId : null;
};

const isSpare = (batch: BatchDoc, seat: number): boolean =>
  Array.isArray(batch.spareSeats) && batch.spareSeats.includes(seat);

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

export async function handleImportPaperResponses(
  db: admin.firestore.Firestore,
  caller: ImportPaperCaller | null,
  raw: unknown,
  now: number
): Promise<ImportPaperResponsesResult> {
  if (!caller) throw new HttpsError('unauthenticated', 'Sign in required.');
  if (caller.studentRole || caller.anonymous)
    throw new HttpsError('permission-denied', 'Teacher account required.');
  const input = parseImportPaperResponsesInput(raw);

  const settings = await db.doc(PAPER_SETTINGS_PATH).get();
  if (settings.data()?.enabled !== true)
    throw new HttpsError(
      'failed-precondition',
      'Paper answer sheets are not enabled.'
    );

  const userRef = db.collection('users').doc(caller.uid);
  const [assignmentSnap, sessionSnap, batchSnap] = await Promise.all([
    userRef.collection('quiz_assignments').doc(input.assignmentId).get(),
    db.collection('quiz_sessions').doc(input.assignmentId).get(),
    userRef.collection('paper_batches').doc(input.batchId).get(),
  ]);
  if (!assignmentSnap.exists || !sessionSnap.exists)
    throw new HttpsError('not-found', 'Assignment not found.');
  if (!batchSnap.exists)
    throw new HttpsError('not-found', 'Paper batch not found.');
  const session = sessionSnap.data() ?? {};
  if (session.teacherUid !== caller.uid)
    throw new HttpsError('permission-denied', 'Not the owner of this session.');
  const batch = (batchSnap.data() ?? {}) as BatchDoc;
  if (batch.quizId !== assignmentSnap.data()?.quizId)
    throw new HttpsError(
      'failed-precondition',
      'This batch was printed for a different quiz.'
    );

  const questionIds = new Set(
    (Array.isArray(session.publicQuestions) ? session.publicQuestions : [])
      .map((q: unknown) => (isRecord(q) ? q.id : undefined))
      .filter((id: unknown): id is string => typeof id === 'string')
  );

  for (const sheet of input.sheets) {
    if (batch.keySheetSeat === sheet.seat)
      invalid(`Seat ${sheet.seat} is the answer key, not a student.`);
    const printedRoster = seatRoster(batch, sheet.seat);
    if (printedRoster === null && !isSpare(batch, sheet.seat))
      invalid(`Seat ${sheet.seat} was not printed in this batch.`);
    if (printedRoster !== null && printedRoster !== sheet.rosterId)
      invalid(`Seat ${sheet.seat} belongs to a different roster.`);
    for (const a of sheet.answers) {
      if (!questionIds.has(a.questionId))
        invalid('A sheet references a question not in this session.');
    }
  }

  // A spare may be assigned to any roster the caller owns.
  const spareRosterIds = [
    ...new Set(
      input.sheets
        .filter((s) => seatRoster(batch, s.seat) === null)
        .map((s) => s.rosterId)
    ),
  ];
  const rosterSnaps = await mapLimited(spareRosterIds, READ_CONCURRENCY, (id) =>
    userRef.collection('rosters').doc(id).get()
  );
  rosterSnaps.forEach((snap, i) => {
    if (!snap.exists) invalid(`Roster ${spareRosterIds[i]} not found.`);
  });

  const indexSnaps = await mapLimited(input.sheets, READ_CONCURRENCY, (sheet) =>
    userRef
      .collection('rosters')
      .doc(sheet.rosterId)
      .collection('pin_index')
      .doc(pinIndexKey(sheet.classPeriod, sheet.pin))
      .get()
  );

  const responses = db
    .collection('quiz_sessions')
    .doc(input.assignmentId)
    .collection('responses');
  const resolved = input.sheets.map((sheet, i) => {
    const entry = indexSnaps[i].exists ? (indexSnaps[i].data() ?? {}) : {};
    const pseudonym =
      typeof entry.pseudonym === 'string' && entry.pseudonym
        ? entry.pseudonym
        : null;
    const classId =
      pseudonym && typeof entry.classId === 'string' && entry.classId
        ? entry.classId
        : null;
    const responseKey =
      pseudonym ??
      `pin-${encodeResponseKeySegment(sheet.classPeriod)}-${encodeResponseKeySegment(sheet.pin)}`;
    return {
      sheet,
      responseKey,
      studentUid: pseudonym ?? responseKey,
      classId,
    };
  });

  // Two seats landing on one key would overwrite each other inside this call,
  // past the collision check below; refuse rather than pick a winner.
  const seatByKey = new Map<string, number>();
  for (const r of resolved) {
    const other = seatByKey.get(r.responseKey);
    if (other !== undefined)
      invalid(
        `Seats ${other} and ${r.sheet.seat} resolve to the same student.`
      );
    seatByKey.set(r.responseKey, r.sheet.seat);
  }

  const existingSnaps = await mapLimited(resolved, READ_CONCURRENCY, (r) =>
    responses.doc(r.responseKey).get()
  );

  const written: number[] = [];
  const collisions: ImportPaperCollision[] = [];
  let writes = db.batch();
  let pending = 0;
  for (let i = 0; i < resolved.length; i += 1) {
    const { sheet, responseKey, studentUid, classId } = resolved[i];
    const existing = existingSnaps[i].exists
      ? (existingSnaps[i].data() ?? {})
      : null;
    if (
      existing &&
      existing.paperBatchId !== input.batchId &&
      !sheet.replaceExisting
    ) {
      collisions.push({
        seat: sheet.seat,
        responseKey,
        fromOtherBatch: typeof existing.paperBatchId === 'string',
        existingSubmittedAt:
          typeof existing.submittedAt === 'number'
            ? existing.submittedAt
            : null,
      });
      continue;
    }
    const answers = sheet.answers.map((a) => ({
      questionId: a.questionId,
      answer: a.unresponded ? '' : a.answer,
      answeredAt: now,
      status: 'submitted',
      ...(a.unresponded ? { unresponded: a.unresponded } : {}),
    }));
    writes.set(responses.doc(responseKey), {
      studentUid,
      pin: sheet.pin,
      ...(sheet.classPeriod ? { classPeriod: sheet.classPeriod } : {}),
      ...(classId ? { classId } : {}),
      joinedAt: now,
      submittedAt: now,
      status: 'completed',
      score: null,
      answers,
      completedAttempts: 1,
      paperBatchId: input.batchId,
      paperSeat: sheet.seat,
      lastWriteAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    written.push(sheet.seat);
    pending += 1;
    if (pending >= WRITE_CHUNK) {
      await writes.commit();
      writes = db.batch();
      pending = 0;
    }
  }
  if (written.length > 0) {
    writes.set(
      userRef.collection('quiz_assignments').doc(input.assignmentId),
      { hasPaperResponses: true },
      { merge: true }
    );
    pending += 1;
  }
  if (pending > 0) await writes.commit();

  return { written, collisions };
}

export interface PublishPaperResultsResult {
  /** Students whose pointer was written or refreshed. */
  pointersWritten: number;
  /** Paper responses keyed `pin-…`, with no SSO identity to point at. */
  unlinked: number;
}

/**
 * Plan Q34: a paper administration is created without `classIds`, so it
 * never reaches a class channel. Once scores are published, give every paper
 * response that resolved to a real pseudonym its own
 * `/student_assignments/{uid}/items/{assignmentId}` pointer, the same doc
 * `setAssignmentTargetsV1` writes, so the result shows in My Assignments.
 */
export async function handlePublishPaperResults(
  db: admin.firestore.Firestore,
  caller: ImportPaperCaller | null,
  raw: unknown,
  now: number
): Promise<PublishPaperResultsResult> {
  if (!caller) throw new HttpsError('unauthenticated', 'Sign in required.');
  if (caller.studentRole || caller.anonymous)
    throw new HttpsError('permission-denied', 'Teacher account required.');
  const data = isRecord(raw) ? raw : {};
  const assignmentId = parseId(data.assignmentId, 'assignmentId');

  const settings = await db.doc(PAPER_SETTINGS_PATH).get();
  if (settings.data()?.enabled !== true)
    throw new HttpsError(
      'failed-precondition',
      'Paper answer sheets are not enabled.'
    );

  const userRef = db.collection('users').doc(caller.uid);
  const [assignmentSnap, sessionSnap] = await Promise.all([
    userRef.collection('quiz_assignments').doc(assignmentId).get(),
    db.collection('quiz_sessions').doc(assignmentId).get(),
  ]);
  if (!assignmentSnap.exists || !sessionSnap.exists)
    throw new HttpsError('not-found', 'Assignment not found.');
  if (sessionSnap.data()?.teacherUid !== caller.uid)
    throw new HttpsError('permission-denied', 'Not the owner of this session.');

  const responses = await db
    .collection('quiz_sessions')
    .doc(assignmentId)
    .collection('responses')
    .where('paperBatchId', '>', '')
    .get();
  const linked: Array<{ uid: string; classId: string }> = [];
  let unlinked = 0;
  for (const d of responses.docs) {
    const r = d.data() ?? {};
    const uid = typeof r.studentUid === 'string' ? r.studentUid : '';
    const classId = typeof r.classId === 'string' ? r.classId : '';
    if (!uid || uid.startsWith('pin-') || !classId) {
      unlinked += 1;
      continue;
    }
    linked.push({ uid, classId });
  }

  const pointerRef = (uid: string) =>
    db
      .collection('student_assignments')
      .doc(uid)
      .collection('items')
      .doc(assignmentId);
  const existing = await mapLimited(linked, READ_CONCURRENCY, (t) =>
    pointerRef(t.uid).get()
  );

  let writes = db.batch();
  let pending = 0;
  for (let i = 0; i < linked.length; i += 1) {
    const { uid, classId } = linked[i];
    const prior = existing[i].exists ? (existing[i].data() ?? {}) : null;
    writes.set(
      pointerRef(uid),
      {
        kind: 'quiz',
        sessionId: assignmentId,
        teacherUid: caller.uid,
        classId,
        createdAt: typeof prior?.createdAt === 'number' ? prior.createdAt : now,
        updatedAt: now,
      },
      { merge: true }
    );
    pending += 1;
    if (pending >= WRITE_CHUNK) {
      await writes.commit();
      writes = db.batch();
      pending = 0;
    }
  }
  if (pending > 0) await writes.commit();

  return { pointersWritten: linked.length, unlinked };
}

export const publishPaperResultsV1 = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 120,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  async (request) => {
    const caller: ImportPaperCaller | null = request.auth
      ? {
          uid: request.auth.uid,
          studentRole: request.auth.token.studentRole === true,
          anonymous:
            request.auth.token.firebase?.sign_in_provider === 'anonymous',
        }
      : null;
    return handlePublishPaperResults(
      admin.firestore(),
      caller,
      request.data,
      Date.now()
    );
  }
);

export const importPaperResponsesV1 = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 120,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  async (request) => {
    const caller: ImportPaperCaller | null = request.auth
      ? {
          uid: request.auth.uid,
          studentRole: request.auth.token.studentRole === true,
          anonymous:
            request.auth.token.firebase?.sign_in_provider === 'anonymous',
        }
      : null;
    return handleImportPaperResponses(
      admin.firestore(),
      caller,
      request.data,
      Date.now()
    );
  }
);
