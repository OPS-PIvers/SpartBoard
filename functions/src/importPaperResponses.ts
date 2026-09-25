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
 *
 * Handwritten answers (docs/plans/QUIZ_PAPER_HANDWRITTEN_RESPONSES.md D28-D30):
 * each seat merges per answer in its own transaction, and a `layoutVersion: 2`
 * import adds written answers, private subdocs and one transcription job per inked page.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import './functionsInit';
import {
  ALLOWED_ORIGINS,
  encodeResponseKeySegment,
  pinIndexKey,
} from './classlinkShared';
import { withQuizSessionContent } from './quizSessionContent';
import {
  PAPER_PRIVATE_SUBCOLLECTION,
  PAPER_TRANSCRIPTION_JOBS,
  paperCropStoragePath,
  paperTranscriptionJobId,
  type PaperPageMap,
  type PaperPrivateAnswer,
  type PaperTranscriptionJob,
  type PaperWrittenImportResult,
  type PaperWrittenPayloadBox,
} from './paperWrittenTypes';
import {
  readPaperHandwritingQuota,
  splitPagesByQuota,
} from './paperHandwritingQuota';

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
const SEAT_TX_CONCURRENCY = 10;
// Keeps a seat's transaction (response, private docs, jobs) far below Firestore's 500 writes.
const MAX_WRITTEN_PER_SHEET = 100;
const MAX_PAGE = 63;
const SCAN_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
// Mirrors storage.rules for the crop path; older Safari uploads PNG under the same name.
const CROP_MIMES = ['image/webp', 'image/png'] as const;
type CropMime = (typeof CROP_MIMES)[number];

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
  /** Payload v2 only; the storage path is re-derived server-side, never trusted. */
  written?: ParsedWrittenBox[];
}

export type ParsedWrittenBox = Omit<PaperWrittenPayloadBox, 'storagePath'> & {
  mimeType: CropMime;
};

export interface ImportPaperResponsesInput {
  batchId: string;
  assignmentId: string;
  sheets: ImportPaperSheet[];
  layoutVersion?: 2;
  scanId?: string;
}

export interface ImportPaperCollision {
  seat: number;
  responseKey: string;
  /** The existing response came from a different paper batch, not a device. */
  fromOtherBatch: boolean;
  existingSubmittedAt: number | null;
}

export interface ImportPaperResponsesResult extends Partial<PaperWrittenImportResult> {
  written: number[];
  collisions: ImportPaperCollision[];
}

export interface ImportPaperCaller {
  uid: string;
  studentRole: boolean;
  anonymous: boolean;
  /** Lower-cased, and only when the token's email is verified; used for the admin quota check. */
  email?: string | null;
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

function parseWrittenBox(raw: unknown): ParsedWrittenBox {
  if (!isRecord(raw)) return invalid('Malformed written answer.');
  const page = raw.page;
  if (
    !Number.isInteger(page) ||
    (page as number) < 1 ||
    (page as number) > MAX_PAGE
  )
    invalid('Each written answer needs a page number.');
  if (raw.state !== 'ink' && raw.state !== 'blank')
    invalid('Unknown written answer state.');
  const mimeType = raw.mimeType ?? 'image/webp';
  if (!(CROP_MIMES as readonly unknown[]).includes(mimeType))
    invalid('Unsupported crop type.');
  return {
    questionId: parseId(raw.questionId, 'questionId'),
    page: page as number,
    state: raw.state,
    mimeType: mimeType as CropMime,
  };
}

function parseWritten(
  raw: unknown,
  v2: boolean,
  answers: ImportPaperAnswer[]
): ParsedWrittenBox[] | undefined {
  if (raw === undefined) return undefined;
  if (!v2) {
    if (Array.isArray(raw) && raw.length === 0) return undefined;
    return invalid('Written answers need layoutVersion 2.');
  }
  if (!Array.isArray(raw) || raw.length > MAX_WRITTEN_PER_SHEET)
    invalid(`written must be an array of at most ${MAX_WRITTEN_PER_SHEET}.`);
  const boxes = (raw as unknown[]).map(parseWrittenBox);
  const seen = new Set(answers.map((a) => a.questionId));
  for (const b of boxes) {
    if (seen.has(b.questionId)) invalid('A sheet repeats a question.');
    seen.add(b.questionId);
  }
  return boxes;
}

function parseSheet(raw: unknown, v2: boolean): ImportPaperSheet {
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
  const written = parseWritten(raw.written, v2, answers);
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
    ...(written ? { written } : {}),
  };
}

export function parseImportPaperResponsesInput(
  raw: unknown
): ImportPaperResponsesInput {
  const data = isRecord(raw) ? raw : {};
  if (data.layoutVersion !== undefined && data.layoutVersion !== 2)
    invalid('Unknown layoutVersion.');
  const v2 = data.layoutVersion === 2;
  let scanId: string | undefined;
  if (v2) {
    if (typeof data.scanId !== 'string' || !SCAN_ID_PATTERN.test(data.scanId))
      invalid('scanId is required.');
    scanId = data.scanId;
  }
  if (!Array.isArray(data.sheets) || data.sheets.length === 0)
    invalid('sheets must be a non-empty array.');
  if (data.sheets.length > MAX_SHEETS_PER_CALL)
    invalid(`Import at most ${MAX_SHEETS_PER_CALL} sheets per call.`);
  const sheets = (data.sheets as unknown[]).map((s) => parseSheet(s, v2));
  const seats = new Set<number>();
  for (const s of sheets) {
    if (seats.has(s.seat)) invalid('A seat appears twice.');
    seats.add(s.seat);
  }
  return {
    batchId: parseId(data.batchId, 'batchId'),
    assignmentId: parseId(data.assignmentId, 'assignmentId'),
    sheets,
    ...(v2 ? { layoutVersion: 2 as const, scanId } : {}),
  };
}

interface BatchDoc {
  quizId?: unknown;
  seats?: Record<string, { rosterId?: unknown; studentId?: unknown }>;
  spareSeats?: unknown;
  keySheetSeat?: unknown;
  layoutVersion?: unknown;
  pageMaps?: unknown;
}

interface BatchMapIndex {
  mc: Set<string>;
  /** questionId -> the page its written box printed on. */
  written: Map<string, number>;
}

function indexPageMaps(pageMaps: unknown): BatchMapIndex {
  const index: BatchMapIndex = { mc: new Set(), written: new Map() };
  if (!Array.isArray(pageMaps)) return index;
  for (const map of pageMaps as Partial<PaperPageMap>[]) {
    if (!isRecord(map) || !Array.isArray(map.items)) continue;
    for (const item of map.items) {
      if (!isRecord(item) || typeof item.questionId !== 'string') continue;
      if (item.kind === 'mc') index.mc.add(item.questionId);
      else if (item.kind === 'written' && typeof map.page === 'number')
        index.written.set(item.questionId, map.page);
    }
  }
  return index;
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
  const session = await withQuizSessionContent(
    sessionSnap.ref,
    sessionSnap.data() ?? {}
  );
  if (session.teacherUid !== caller.uid)
    throw new HttpsError('permission-denied', 'Not the owner of this session.');
  const batch = (batchSnap.data() ?? {}) as BatchDoc;
  const batchV2 = batch.layoutVersion === 2;
  if (batchV2 && input.layoutVersion !== 2)
    throw new HttpsError(
      'failed-precondition',
      'Refresh SpartBoard to import this batch.'
    );
  if (!batchV2 && input.layoutVersion === 2)
    invalid('This batch was not printed with a page map.');
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
  const mapIndex = batchV2 ? indexPageMaps(batch.pageMaps) : null;

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
      if (mapIndex && !mapIndex.mc.has(a.questionId))
        invalid('A bubble answer is not a bubble row on this batch.');
    }
    for (const box of sheet.written ?? []) {
      if (!questionIds.has(box.questionId))
        invalid('A sheet references a question not in this session.');
      if (mapIndex?.written.get(box.questionId) !== box.page)
        invalid('A written answer is not a box on that page of this batch.');
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

  // Read-only quota check (D25), reported back as the page count; nothing is charged here.
  const inkPages = resolved.flatMap(({ sheet }) =>
    [
      ...new Set(
        (sheet.written ?? [])
          .filter((b) => b.state === 'ink')
          .map((b) => b.page)
      ),
    ]
      .sort((a, b) => a - b)
      .map((page) => `${sheet.seat}:${page}`)
  );
  const allowedPages = new Set<string>();
  if (inkPages.length > 0) {
    const isAdmin = caller.email
      ? (await db.collection('admins').doc(caller.email).get()).exists
      : false;
    const quota = await readPaperHandwritingQuota(db, {
      uid: caller.uid,
      isAdmin,
      nowMs: now,
    });
    const { allowed } = splitPagesByQuota(quota, inkPages.length);
    inkPages.slice(0, allowed).forEach((key) => allowedPages.add(key));
  }

  const jobs = userRef.collection(PAPER_TRANSCRIPTION_JOBS);
  const outcomes = await mapLimited(resolved, SEAT_TX_CONCURRENCY, (r) =>
    db.runTransaction((tx) =>
      importSeat(tx, {
        ref: responses.doc(r.responseKey),
        jobs,
        resolved: r,
        batchId: input.batchId,
        sessionId: input.assignmentId,
        uid: caller.uid,
        scanId: input.scanId ?? null,
        allowedPages,
        now,
      })
    )
  );

  const written: number[] = [];
  const collisions: ImportPaperCollision[] = [];
  const keptWritten: PaperWrittenImportResult['keptWritten'] = [];
  let jobsCreated = 0;
  let pagesQueued = 0;
  let pagesOverQuota = 0;
  let anyWritten = false;
  for (const o of outcomes) {
    if (o.collision) {
      collisions.push(o.collision);
      continue;
    }
    written.push(o.seat);
    keptWritten.push(
      ...o.kept.map((questionId) => ({ seat: o.seat, questionId }))
    );
    jobsCreated += o.jobs;
    pagesQueued += o.queued;
    pagesOverQuota += o.overQuota;
    anyWritten ||= o.hasWritten;
  }
  if (written.length > 0) {
    await userRef
      .collection('quiz_assignments')
      .doc(input.assignmentId)
      .set(
        {
          hasPaperResponses: true,
          ...(anyWritten ? { hasPaperWritten: true } : {}),
        },
        { merge: true }
      );
  }

  if (input.layoutVersion !== 2) return { written, collisions };
  return {
    written,
    collisions,
    keptWritten,
    jobsCreated,
    pagesQueued,
    pagesOverQuota,
  };
}

interface SeatContext {
  ref: admin.firestore.DocumentReference;
  jobs: admin.firestore.CollectionReference;
  resolved: {
    sheet: ImportPaperSheet;
    responseKey: string;
    studentUid: string;
    classId: string | null;
  };
  batchId: string;
  sessionId: string;
  uid: string;
  scanId: string | null;
  allowedPages: ReadonlySet<string>;
  now: number;
}

interface SeatOutcome {
  seat: number;
  collision: ImportPaperCollision | null;
  kept: string[];
  jobs: number;
  queued: number;
  overQuota: number;
  hasWritten: boolean;
}

type AnswerEntry = Record<string, unknown> & { questionId?: unknown };

// A replaced device attempt's own state must not follow the answers onto a paper response.
const DEVICE_ATTEMPT_FIELDS = [
  'unlocked',
  'unlockedAt',
  'autoSubmitted',
  'tabSwitchWarnings',
  'tabExits',
  'resultsTabWarnings',
  'resultsLockedOut',
  'resultsLockedOutAt',
  'servedQuestionIds',
  'handRaisedAt',
  'stimulusPlays',
  'stimulusErrors',
  'preSyncVersion',
] as const;

// D28: MC answers always replace; a written answer replaces only when ungraded and unedited.
async function importSeat(
  tx: admin.firestore.Transaction,
  ctx: SeatContext
): Promise<SeatOutcome> {
  const { sheet, responseKey, studentUid, classId } = ctx.resolved;
  const outcome: SeatOutcome = {
    seat: sheet.seat,
    collision: null,
    kept: [],
    jobs: 0,
    queued: 0,
    overQuota: 0,
    hasWritten: (sheet.written ?? []).length > 0,
  };
  const snap = await tx.get(ctx.ref);
  const existing = snap.exists ? (snap.data() ?? {}) : null;
  if (
    existing &&
    existing.paperBatchId !== ctx.batchId &&
    !sheet.replaceExisting
  ) {
    outcome.collision = {
      seat: sheet.seat,
      responseKey,
      fromOtherBatch: typeof existing.paperBatchId === 'string',
      existingSubmittedAt:
        typeof existing.submittedAt === 'number' ? existing.submittedAt : null,
    };
    return outcome;
  }

  const prior: AnswerEntry[] = Array.isArray(existing?.answers)
    ? (existing.answers as unknown[]).filter(isRecord)
    : [];
  const grading = isRecord(existing?.grading) ? existing.grading : {};
  const written = sheet.written ?? [];
  const privateRef = (questionId: string) =>
    ctx.ref.collection(PAPER_PRIVATE_SUBCOLLECTION).doc(questionId);
  const privateSnaps =
    written.length > 0
      ? await tx.getAll(...written.map((b) => privateRef(b.questionId)))
      : [];

  const replaced = new Set<string>(sheet.answers.map((a) => a.questionId));
  const fresh: AnswerEntry[] = sheet.answers.map((a) => ({
    questionId: a.questionId,
    answer: a.unresponded ? '' : a.answer,
    answeredAt: ctx.now,
    status: 'submitted',
    ...(a.unresponded ? { unresponded: a.unresponded } : {}),
  }));
  const privateWrites: Array<{
    questionId: string;
    data: object;
    merge: boolean;
  }> = [];
  const jobBoxes = new Map<number, PaperTranscriptionJob['boxes']>();
  const inkPages = new Set<number>();
  const scanId = ctx.scanId;
  written.forEach((box, i) => {
    if (!scanId) return;
    const priorEntries = prior.filter((e) => e.questionId === box.questionId);
    // A replay of this same scan (a retried call) leaves its own answers and jobs alone.
    if (priorEntries.some((e) => e.paperScanId === scanId)) return;
    const privateData = privateSnaps[i]?.exists ? privateSnaps[i].data() : null;
    const graded = grading[box.questionId] != null;
    const edited = typeof privateData?.editedAt === 'number';
    if (graded || edited) {
      outcome.kept.push(box.questionId);
      if (privateData)
        privateWrites.push({
          questionId: box.questionId,
          data: {
            newerScan: { scanId, page: box.page, state: box.state },
            updatedAt: ctx.now,
          },
          merge: true,
        });
      return;
    }
    const storagePath = paperCropStoragePath(
      ctx.uid,
      scanId,
      sheet.seat,
      box.questionId
    );
    replaced.add(box.questionId);
    fresh.push({
      questionId: box.questionId,
      answer: '',
      answeredAt: ctx.now,
      status: 'submitted',
      paperScanId: scanId,
      paperTranscript: box.state === 'blank' ? 'blank' : 'pending',
      artifacts: [
        {
          id: `hw_${scanId}_${box.questionId}`,
          slot: 'primary',
          kind: 'handwriting',
          storagePath,
          mimeType: box.mimeType,
          uploadState: 'uploaded',
        },
      ],
    });
    const privateDoc: PaperPrivateAnswer = {
      scanId,
      status: box.state === 'blank' ? 'blank' : 'pending',
      attempts: 0,
      charged: false,
      updatedAt: ctx.now,
    };
    privateWrites.push({
      questionId: box.questionId,
      data: privateDoc,
      merge: false,
    });
    // Blank boxes ride along so the worker archives them; it skips Gemini for them.
    const boxes = jobBoxes.get(box.page) ?? [];
    boxes.push({ questionId: box.questionId, storagePath });
    jobBoxes.set(box.page, boxes);
    if (box.state === 'ink') inkPages.add(box.page);
  });

  const answers = [
    ...prior.filter(
      (e) => typeof e.questionId !== 'string' || !replaced.has(e.questionId)
    ),
    ...fresh,
  ];
  tx.set(
    ctx.ref,
    {
      studentUid,
      pin: sheet.pin,
      ...(sheet.classPeriod ? { classPeriod: sheet.classPeriod } : {}),
      ...(classId ? { classId } : {}),
      joinedAt:
        typeof existing?.joinedAt === 'number' ? existing.joinedAt : ctx.now,
      submittedAt: ctx.now,
      status: 'completed',
      score: null,
      answers,
      completedAttempts: 1,
      paperBatchId: ctx.batchId,
      paperSeat: sheet.seat,
      lastWriteAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(existing && existing.paperBatchId !== ctx.batchId
        ? Object.fromEntries(
            DEVICE_ATTEMPT_FIELDS.map((f) => [
              f,
              admin.firestore.FieldValue.delete(),
            ])
          )
        : {}),
    },
    { merge: true }
  );
  for (const w of privateWrites) {
    if (w.merge) tx.set(privateRef(w.questionId), w.data, { merge: true });
    else tx.set(privateRef(w.questionId), w.data);
  }
  for (const [page, boxes] of [...jobBoxes].sort((a, b) => a[0] - b[0])) {
    if (!scanId) break;
    const job: PaperTranscriptionJob = {
      sessionId: ctx.sessionId,
      responseKey,
      scanId,
      page,
      boxes,
      status: 'queued',
      attempt: 0,
      charged: false,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    };
    tx.create(
      ctx.jobs.doc(paperTranscriptionJobId(scanId, sheet.seat, page, 0)),
      job
    );
    outcome.jobs += 1;
    if (!inkPages.has(page)) continue;
    // The quota check is advisory; the worker re-checks before any Gemini call.
    if (ctx.allowedPages.has(`${sheet.seat}:${page}`)) outcome.queued += 1;
    else outcome.overQuota += 1;
  }
  return outcome;
}

export interface PublishPaperResultsResult {
  /** Students whose pointer was written or refreshed. */
  pointersWritten: number;
  /** Paper responses keyed `pin-…`, with no SSO identity to point at. */
  unlinked: number;
  /** Responses with a student identity but no class on the roster's pin index. */
  unplaced: number;
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
  const session = sessionSnap.data() ?? {};
  if (session.teacherUid !== caller.uid)
    throw new HttpsError('permission-denied', 'Not the owner of this session.');

  const responses = await db
    .collection('quiz_sessions')
    .doc(assignmentId)
    .collection('responses')
    .where('paperBatchId', '>', '')
    .get();
  const linked: Array<{ uid: string; classId: string }> = [];
  let unlinked = 0;
  let unplaced = 0;
  for (const d of responses.docs) {
    const r = d.data() ?? {};
    const uid = typeof r.studentUid === 'string' ? r.studentUid : '';
    const classId = typeof r.classId === 'string' ? r.classId : '';
    if (!uid || uid.startsWith('pin-')) {
      unlinked += 1;
      continue;
    }
    if (!classId) {
      unplaced += 1;
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
  // A paper-only administration (no class channel) is created paused so it
  // is never a live door; once results are published it ends, which is what
  // sends a pointer-holder straight to their review instead of a paused screen.
  const classIds = Array.isArray(session.classIds) ? session.classIds : [];
  if (session.status === 'paused' && classIds.length === 0) {
    writes.set(
      db.collection('quiz_sessions').doc(assignmentId),
      { status: 'ended', endedAt: now, autoProgressAt: null },
      { merge: true }
    );
    writes.set(
      userRef.collection('quiz_assignments').doc(assignmentId),
      { status: 'inactive', updatedAt: now },
      { merge: true }
    );
    pending += 2;
  }
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

  return { pointersWritten: linked.length, unlinked, unplaced };
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
          email:
            request.auth.token.email_verified === true &&
            typeof request.auth.token.email === 'string'
              ? request.auth.token.email.toLowerCase()
              : null,
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
