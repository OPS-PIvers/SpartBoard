/**
 * importPaperResponsesV1 — writes scanned paper answer sheets as ordinary
 * `quiz_sessions/{id}/responses/*` docs (docs/plans/shipped/QUIZ_PAPER_ANSWER_SHEETS.md §7).
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
 * Handwritten answers (docs/plans/shipped/QUIZ_PAPER_HANDWRITTEN_RESPONSES.md D28-D30):
 * each seat merges per answer in its own transaction, and a `layoutVersion: 2`
 * import adds written answers, private subdocs and one transcription job per inked page.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from './firebaseAdmin';
import './functionsInit';
import {
  ALLOWED_ORIGINS,
  encodeResponseKeySegment,
  pinIndexKey,
  quizPinKeySegment,
} from './classlinkShared';
import { withQuizSessionContent } from './quizSessionContent';
import {
  PAPER_HANDWRITING_AI_FEATURE,
  PAPER_KEPT_PAGES_FEATURE,
  PAPER_PAGE_SCANS,
  PAPER_PRIVATE_SUBCOLLECTION,
  PAPER_TRANSCRIPTION_JOBS,
  paperCropStoragePath,
  paperPageArtifactId,
  paperPageStoragePath,
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
import { assertViewAsAllowed } from './viewAsGuard';

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
// Runaway guard on one chunk's kept pages; entries past it are dropped.
const MAX_KEPT_PAGES_PER_CALL = MAX_SHEETS_PER_CALL * 10;
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
  /** Set server-side from the batch map, never from the payload: a custom image box. */
  noTranscript?: true;
};

export interface ImportPaperResponsesInput {
  batchId: string;
  assignmentId: string;
  sheets: ImportPaperSheet[];
  layoutVersion?: 2;
  scanId?: string;
  /** `paper-kept-pages` entries, unvalidated until the batch and caller are known; absent imports as before. */
  pages?: unknown[];
}

/** One kept page that passed `selectKeptPages`. */
export interface KeptPage {
  seat: number;
  page: number;
  storagePath: string;
  mimeType: CropMime;
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
  /** Present only when kept pages were sent and the caller has `paper-kept-pages`. */
  keptPages?: { recorded: number; dropped: number };
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
    parsed.unresponded = raw.unresponded;
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
  const pages = Array.isArray(data.pages) ? (data.pages as unknown[]) : null;
  let scanId: string | undefined;
  if (v2) {
    if (typeof data.scanId !== 'string' || !SCAN_ID_PATTERN.test(data.scanId))
      invalid('scanId is required.');
    scanId = data.scanId;
  } else if (
    pages &&
    typeof data.scanId === 'string' &&
    SCAN_ID_PATTERN.test(data.scanId)
  ) {
    // Kept pages apply to every batch, so their scan id travels without layoutVersion.
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
    ...(pages ? { pages, ...(scanId ? { scanId } : {}) } : {}),
  };
}

export interface KeptPageScope {
  uid: string;
  scanId: string;
  /** Seats of this call's sheets. */
  seats: ReadonlySet<number>;
  keySheetSeat: unknown;
}

function parseKeptPage(raw: unknown, scope: KeptPageScope): KeptPage | null {
  if (!isRecord(raw)) return null;
  const { seat, page, storagePath } = raw;
  if (typeof seat !== 'number' || !Number.isInteger(seat)) return null;
  if (typeof page !== 'number' || !Number.isInteger(page)) return null;
  if (page < 1 || page > MAX_PAGE) return null;
  // K17: the key sheet is never a student's page.
  if (!scope.seats.has(seat) || seat === scope.keySheetSeat) return null;
  const mimeType = raw.mimeType ?? 'image/webp';
  if (!(CROP_MIMES as readonly unknown[]).includes(mimeType)) return null;
  // Compared to the path rebuilt from the caller's uid, never parsed from the client's string.
  if (storagePath !== paperPageStoragePath(scope.uid, scope.scanId, seat, page))
    return null;
  return { seat, page, storagePath, mimeType: mimeType as CropMime };
}

/** Valid kept pages by seat, sorted by page; anything invalid, repeated or over the cap is dropped and counted. */
export function selectKeptPages(
  raw: readonly unknown[],
  scope: KeptPageScope
): { bySeat: Map<number, KeptPage[]>; dropped: number } {
  const bySeat = new Map<number, KeptPage[]>();
  const seen = new Set<string>();
  let dropped = Math.max(0, raw.length - MAX_KEPT_PAGES_PER_CALL);
  for (const entry of raw.slice(0, MAX_KEPT_PAGES_PER_CALL)) {
    const page = parseKeptPage(entry, scope);
    const key = page ? `${page.seat}:${page.page}` : '';
    if (!page || seen.has(key)) {
      dropped += 1;
      continue;
    }
    seen.add(key);
    bySeat.set(page.seat, [...(bySeat.get(page.seat) ?? []), page]);
  }
  for (const list of bySeat.values()) list.sort((a, b) => a.page - b.page);
  return { bySeat, dropped };
}

interface BatchDoc {
  quizId?: unknown;
  seats?: Record<string, { rosterId?: unknown; studentId?: unknown }>;
  spareSeats?: unknown;
  keySheetSeat?: unknown;
  layoutVersion?: unknown;
  pageMaps?: unknown;
  /** Balanced versions dealt at print time (QUIZ_IMPORT_VERSIONS.md V24). */
  versions?: unknown;
  seatVersions?: unknown;
}

interface SeatVersion {
  servedQuestionIds: string[];
  swaps: Record<string, string>;
}

/** The version a seat printed; version 0 for the key or an unlisted seat, null when the batch has none. */
function seatVersion(batch: BatchDoc, seat: number): SeatVersion | null {
  if (!Array.isArray(batch.versions)) return null;
  const at = isRecord(batch.seatVersions)
    ? batch.seatVersions[String(seat)]
    : undefined;
  const raw: unknown = batch.versions[typeof at === 'number' ? at : 0];
  if (!isRecord(raw) || !Array.isArray(raw.servedQuestionIds)) return null;
  const swaps: Record<string, string> = {};
  if (isRecord(raw.swaps)) {
    for (const [from, to] of Object.entries(raw.swaps)) {
      if (typeof to === 'string') swaps[from] = to;
    }
  }
  return {
    servedQuestionIds: raw.servedQuestionIds.filter(
      (id: unknown): id is string => typeof id === 'string'
    ),
    swaps,
  };
}

/** The batch's map index as one seat's sheet printed it. */
function seatMapIndex(
  index: BatchMapIndex,
  version: SeatVersion | null
): BatchMapIndex {
  if (!version || Object.keys(version.swaps).length === 0) return index;
  const swap = (id: string) => version.swaps[id] ?? id;
  return {
    mc: new Set([...index.mc].map(swap)),
    written: new Map(
      [...index.written].map(([id, page]) => [swap(id), page] as const)
    ),
    image: new Set([...index.image].map(swap)),
  };
}

interface BatchMapIndex {
  mc: Set<string>;
  /** questionId -> the page its written box printed on. */
  written: Map<string, number>;
  /** Written boxes that printed a custom image: graded from the scan, never transcribed. */
  image: Set<string>;
}

function indexPageMaps(pageMaps: unknown): BatchMapIndex {
  const index: BatchMapIndex = {
    mc: new Set(),
    written: new Map(),
    image: new Set(),
  };
  if (!Array.isArray(pageMaps)) return index;
  for (const map of pageMaps as Partial<PaperPageMap>[]) {
    if (!isRecord(map) || !Array.isArray(map.items)) continue;
    for (const item of map.items) {
      if (!isRecord(item) || typeof item.questionId !== 'string') continue;
      if (item.kind === 'mc') index.mc.add(item.questionId);
      else if (item.kind === 'written' && typeof map.page === 'number') {
        index.written.set(item.questionId, map.page);
        if (item.style === 'image') index.image.add(item.questionId);
      }
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

/** The seat's quiz response key, as a device join on this seat writes it. */
const canonicalPinKey = (sheet: ImportPaperSheet): string =>
  `pin-${encodeResponseKeySegment(sheet.classPeriod)}-${quizPinKeySegment(sheet.pin)}`;

export async function handleImportPaperResponses(
  db: admin.firestore.Firestore,
  caller: ImportPaperCaller | null,
  raw: unknown,
  now: number,
  /** AI transcription (`paper-handwriting-ai`); off, inked pages are neither queued nor over quota. */
  transcriptionGranted: () => Promise<boolean> = () => Promise.resolve(true),
  /** `paper-kept-pages`; read only when the payload carries `pages`, and off ignores them. */
  keptPagesGranted: () => Promise<boolean> = () => Promise.resolve(false)
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
  const assignment = assignmentSnap.data() ?? {};
  if (batch.quizId !== assignment.quizId)
    throw new HttpsError(
      'failed-precondition',
      'This batch was printed for a different quiz.'
    );
  // Written answers on paper: this stack merges onto device responses instead of replacing them.
  const hybrid =
    assignment.writtenOnPaper === true &&
    assignment.paperBatchId === input.batchId;

  const questionIds = new Set(
    (Array.isArray(session.publicQuestions) ? session.publicQuestions : [])
      .map((q: unknown) => (isRecord(q) ? q.id : undefined))
      .filter((id: unknown): id is string => typeof id === 'string')
  );
  const mapIndex = batchV2 ? indexPageMaps(batch.pageMaps) : null;

  const versionBySeat = new Map<number, SeatVersion>();
  for (const sheet of input.sheets) {
    if (batch.keySheetSeat === sheet.seat)
      invalid(`Seat ${sheet.seat} is the answer key, not a student.`);
    const version = seatVersion(batch, sheet.seat);
    if (version) {
      if (!version.servedQuestionIds.every((id) => questionIds.has(id)))
        invalid('A sheet references a question not in this session.');
      versionBySeat.set(sheet.seat, version);
    }
    const seatIndex = mapIndex ? seatMapIndex(mapIndex, version) : null;
    const printedRoster = seatRoster(batch, sheet.seat);
    if (printedRoster === null && !isSpare(batch, sheet.seat))
      invalid(`Seat ${sheet.seat} was not printed in this batch.`);
    if (printedRoster !== null && printedRoster !== sheet.rosterId)
      invalid(`Seat ${sheet.seat} belongs to a different roster.`);
    for (const a of sheet.answers) {
      if (!questionIds.has(a.questionId))
        invalid('A sheet references a question not in this session.');
      if (seatIndex && !seatIndex.mc.has(a.questionId))
        invalid('A bubble answer is not a bubble row on this batch.');
    }
    for (const box of sheet.written ?? []) {
      if (!questionIds.has(box.questionId))
        invalid('A sheet references a question not in this session.');
      if (seatIndex?.written.get(box.questionId) !== box.page)
        invalid('A written answer is not a box on that page of this batch.');
      if (seatIndex?.image.has(box.questionId)) box.noTranscript = true;
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
  // A seat imported or joined before keys dropped leading zeros keeps its doc.
  const legacyPinKeys = await mapLimited(
    input.sheets,
    READ_CONCURRENCY,
    async (sheet) => {
      const raw = `pin-${encodeResponseKeySegment(sheet.classPeriod)}-${encodeResponseKeySegment(sheet.pin)}`;
      if (raw === canonicalPinKey(sheet)) return null;
      return (await responses.doc(raw).get()).exists ? raw : null;
    }
  );
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
    const responseKey = pseudonym ?? legacyPinKeys[i] ?? canonicalPinKey(sheet);
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

  // Kept pages are not AI work, so they never touch the handwriting quota below.
  const keptPagesOn = !!input.pages && (await keptPagesGranted());
  // Without a usable scan id no page can be proven, so none is recorded and nothing is replaced.
  const keptPages =
    keptPagesOn && input.pages && input.scanId
      ? selectKeptPages(input.pages, {
          uid: caller.uid,
          scanId: input.scanId,
          seats: new Set(input.sheets.map((s) => s.seat)),
          keySheetSeat: batch.keySheetSeat,
        })
      : null;
  if (keptPages && input.scanId && keptPages.bySeat.size > 0) {
    // Written before the responses, so the sweep and the read callable can trace each page to its response.
    await userRef
      .collection(PAPER_PAGE_SCANS)
      .doc(input.scanId)
      .set(
        {
          seats: Object.fromEntries(
            resolved
              .filter((r) => keptPages.bySeat.has(r.sheet.seat))
              .map((r) => [
                String(r.sheet.seat),
                { sessionId: input.assignmentId, responseKey: r.responseKey },
              ])
          ),
          updatedAt: now,
        },
        { merge: true }
      );
  }

  // Read-only quota check (D25), reported back as the page count; nothing is charged here.
  const inkPages = resolved.flatMap(({ sheet }) =>
    [
      ...new Set(
        (sheet.written ?? [])
          .filter((b) => b.state === 'ink' && !b.noTranscript)
          .map((b) => b.page)
      ),
    ]
      .sort((a, b) => a - b)
      .map((page) => `${sheet.seat}:${page}`)
  );
  const allowedPages = new Set<string>();
  const transcribe = inkPages.length > 0 && (await transcriptionGranted());
  if (transcribe) {
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
        servedQuestionIds:
          versionBySeat.get(r.sheet.seat)?.servedQuestionIds ?? null,
        hybrid,
        transcribe,
        keptPages: keptPages
          ? (keptPages.bySeat.get(r.sheet.seat) ?? [])
          : null,
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
  let pagesRecorded = 0;
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
    pagesRecorded += o.pagesRecorded;
    anyWritten ||= o.hasWritten;
  }
  if (written.length > 0) {
    // Recounted rather than incremented, so a rescan or a retried call never double counts.
    const scanned = hybrid
      ? (
          await responses
            .where('paperWrittenBatchId', '==', input.batchId)
            .count()
            .get()
        ).data().count
      : null;
    await userRef
      .collection('quiz_assignments')
      .doc(input.assignmentId)
      .set(
        {
          // A hybrid assignment already reaches its classes; publish needs no paper pointers.
          ...(hybrid ? {} : { hasPaperResponses: true }),
          ...(anyWritten ? { hasPaperWritten: true } : {}),
          ...(scanned !== null ? { paperWrittenScanned: scanned } : {}),
        },
        { merge: true }
      );
  }

  const kept = keptPagesOn
    ? {
        keptPages: {
          recorded: pagesRecorded,
          dropped: keptPages?.dropped ?? input.pages?.length ?? 0,
        },
      }
    : {};
  if (input.layoutVersion !== 2) return { written, collisions, ...kept };
  return {
    written,
    collisions,
    ...kept,
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
  /** The version this seat printed, saved so Results scores what the student saw (V24). */
  servedQuestionIds: string[] | null;
  /** Written-answers-only stack of a device assignment; see `hybridResponseFields`. */
  hybrid: boolean;
  /** Transcription is on, so inked pages count as queued or over quota. */
  transcribe: boolean;
  /** This seat's kept pages when they are on for this import; null clears any older scan's (K12). */
  keptPages: KeptPage[] | null;
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
  pagesRecorded: number;
}

type AnswerEntry = Record<string, unknown> & { questionId?: unknown };

// A replaced device attempt's own state must not follow the answers onto a paper response.
const DEVICE_ATTEMPT_FIELDS = [
  'unlocked',
  'unlockedAt',
  'autoSubmitted',
  'tabSwitchWarnings',
  'tabExits',
  'inputSignals',
  'resultsTabWarnings',
  'resultsLockedOut',
  'resultsLockedOutAt',
  'servedQuestionIds',
  'handRaisedAt',
  'stimulusPlays',
  'stimulusErrors',
  'preSyncVersion',
] as const;

// Hybrid: add written answers, keep the device attempt; a scan-first row starts unsubmitted, without lastWriteAt so the idle sweep skips it.
function hybridResponseFields(
  ctx: SeatContext,
  existing: admin.firestore.DocumentData | null,
  answers: AnswerEntry[]
): Record<string, unknown> {
  const { sheet, studentUid, classId } = ctx.resolved;
  const paper = {
    answers,
    paperWrittenBatchId: ctx.batchId,
    paperWrittenSeat: sheet.seat,
  };
  if (existing) return paper;
  return {
    studentUid,
    pin: sheet.pin,
    ...(sheet.classPeriod ? { classPeriod: sheet.classPeriod } : {}),
    ...(classId ? { classId } : {}),
    joinedAt: ctx.now,
    status: 'joined',
    score: null,
    submittedAt: null,
    completedAttempts: 0,
    preSyncVersion: 0,
    ...paper,
  };
}

// Archive bookkeeping a superseded page keeps: a Drive copy, or a compliance delete in progress.
const keepsArchiveEntry = (entry: Record<string, unknown>): boolean =>
  typeof entry.driveFileId === 'string' ||
  typeof entry.orphanedDriveFileId === 'string' ||
  entry.archiveStatus === 'deleting' ||
  entry.archiveStatus === 'deleted' ||
  entry.archiveStatus === 'delete-failed';

/** K12: every import leaves only this scan's pages; a superseded page's pending archive entry goes with it. */
async function keptPageFields(
  existing: admin.firestore.DocumentData | null,
  pages: readonly KeptPage[],
  scanId: string | null
): Promise<Record<string, unknown>> {
  const prior: Record<string, unknown>[] = Array.isArray(existing?.paperPages)
    ? (existing.paperPages as unknown[]).filter(isRecord)
    : [];
  // Today's data has no pages: no fields, and no archive module load.
  if (prior.length === 0 && (pages.length === 0 || !scanId)) return {};
  // Recorded as a crop is: `uploaded` at import, whether or not the background upload has landed.
  const next = scanId
    ? pages.map((p) => ({
        id: paperPageArtifactId(scanId, p.page),
        slot: 'primary',
        kind: 'paper-page',
        storagePath: p.storagePath,
        mimeType: p.mimeType,
        uploadState: 'uploaded',
      }))
    : [];
  const nextIds = new Set(next.map((a) => a.id));
  const archive: Record<string, Record<string, unknown>> = {};
  if (isRecord(existing?.artifactArchive)) {
    for (const [id, entry] of Object.entries(existing.artifactArchive)) {
      if (isRecord(entry)) archive[id] = entry;
    }
  }
  const cleared: string[] = [];
  for (const a of prior) {
    if (typeof a.id !== 'string' || nextIds.has(a.id)) continue;
    const entry = archive[a.id];
    if (!entry || keepsArchiveEntry(entry)) continue;
    delete archive[a.id];
    cleared.push(a.id);
  }
  const deleteField = admin.firestore.FieldValue.delete();
  const { computeHasStuckArchive } = cleared.length
    ? await import('./quizMediaArchive')
    : { computeHasStuckArchive: null };
  return {
    paperPages: next.length > 0 ? next : deleteField,
    ...(computeHasStuckArchive
      ? {
          artifactArchive: Object.fromEntries(
            cleared.map((id) => [id, deleteField])
          ),
          hasStuckArchive: computeHasStuckArchive(archive),
        }
      : {}),
  };
}

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
    pagesRecorded: 0,
  };
  const snap = await tx.get(ctx.ref);
  const existing = snap.exists ? (snap.data() ?? {}) : null;
  if (
    !ctx.hybrid &&
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
      paperTranscript: box.noTranscript
        ? 'image'
        : box.state === 'blank'
          ? 'blank'
          : 'pending',
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
      seat: sheet.seat,
      status: box.noTranscript
        ? 'image'
        : box.state === 'blank'
          ? 'blank'
          : 'pending',
      ...(box.noTranscript ? { noTranscript: true as const } : {}),
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
    if (box.state === 'ink' && !box.noTranscript) inkPages.add(box.page);
  });

  const answers = [
    ...prior.filter(
      (e) => typeof e.questionId !== 'string' || !replaced.has(e.questionId)
    ),
    ...fresh,
  ];
  // Same write as the answers, so a page is never recorded on a response that failed to import, and never outlives its scan.
  const pageFields = await keptPageFields(
    existing,
    ctx.keptPages ?? [],
    ctx.keptPages ? scanId : null
  );
  outcome.pagesRecorded = ctx.keptPages?.length ?? 0;
  tx.set(
    ctx.ref,
    ctx.hybrid
      ? {
          ...hybridResponseFields(ctx, existing, answers),
          ...pageFields,
          // New answers from a scan; the teacher picks which count again.
          countedChoices: admin.firestore.FieldValue.delete(),
        }
      : {
          ...pageFields,
          countedChoices: admin.firestore.FieldValue.delete(),
          studentUid,
          pin: sheet.pin,
          ...(sheet.classPeriod ? { classPeriod: sheet.classPeriod } : {}),
          ...(classId ? { classId } : {}),
          joinedAt:
            typeof existing?.joinedAt === 'number'
              ? existing.joinedAt
              : ctx.now,
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
          ...(ctx.servedQuestionIds
            ? { servedQuestionIds: ctx.servedQuestionIds }
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
    if (!inkPages.has(page) || !ctx.transcribe) continue;
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
    await assertViewAsAllowed(request, { outward: true });
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
    await assertViewAsAllowed(request);
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
      Date.now(),
      async () => {
        if (!caller) return false;
        const { isGlobalFeatureGranted } = await import('./quizMediaArchive');
        return isGlobalFeatureGranted(
          admin.firestore(),
          PAPER_HANDWRITING_AI_FEATURE,
          caller.email ?? null,
          caller.uid
        );
      },
      async () => {
        if (!caller) return false;
        const { isGlobalFeatureGranted } = await import('./quizMediaArchive');
        return isGlobalFeatureGranted(
          admin.firestore(),
          PAPER_KEPT_PAGES_FEATURE,
          caller.email ?? null,
          caller.uid
        );
      }
    );
  }
);
