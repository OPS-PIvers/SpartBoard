// Handwritten paper answers: crop reads, transcript edits, "Use new scan" and "Not blank? Transcribe" (plan D35, D36, D38).
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import type {
  DocumentReference,
  Firestore,
  Transaction,
} from 'firebase-admin/firestore';
import './functionsInit';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { refreshGoogleAccessTokenForUid } from './googleOAuth';
import { QUIZ_MEDIA_GOOGLE_SECRETS } from './quizMediaArchive';
import { downloadDriveFileById } from './getQuizArtifactPlaybackUrl';
import { MAX_TRANSCRIPT_CHARS, transcriptToHtml } from './paperTranscribe';
import { parseJob } from './paperTranscriptionWorker';
import { studentMaySeeHandwriting } from './quizResultsVisibilityServer';
import {
  PAPER_PRIVATE_SUBCOLLECTION,
  PAPER_TRANSCRIPTION_JOBS,
  PAPER_WRITTEN_CROP_PREFIX,
  paperCropStoragePath,
  paperTranscriptionJobId,
  type PaperPrivateAnswer,
  type PaperTranscriptionJob,
} from './paperWrittenTypes';

/** Crops are capped at 2 MB on upload; the slack covers Drive's copy. */
export const MAX_CROP_BYTES = 3 * 1024 * 1024;

export type CropMimeType = 'image/webp' | 'image/png';

export type CropUnavailableReason =
  | 'no-crop'
  | 'missing'
  | 'archiving'
  | 'deleted'
  | 'failed'
  | 'too-large';

export type CropResult =
  | {
      status: 'ready';
      mimeType: CropMimeType;
      data: string;
      source: 'storage' | 'drive';
    }
  | { status: 'not-available'; reason: CropUnavailableReason };

export interface Caller {
  uid: string;
  anonymous: boolean;
  studentRole: boolean;
}

export interface StoredObject {
  data: Buffer;
  contentType?: string;
}

export interface PaperWrittenDeps {
  db: Firestore;
  now: () => number;
  /** null when the object does not exist. */
  readObject: (storagePath: string) => Promise<StoredObject | null>;
  /** null when the object does not exist. */
  statObject: (
    storagePath: string
  ) => Promise<{ contentType?: string; size: number } | null>;
  getAccessToken: (uid: string) => Promise<string>;
  downloadDriveFile: (accessToken: string, fileId: string) => Promise<Buffer>;
}

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const cropMime = (contentType: unknown): CropMimeType =>
  contentType === 'image/png' ? 'image/png' : 'image/webp';

function readId(data: Rec, key: string, max = 300): string {
  const v = data[key];
  if (typeof v !== 'string' || !v || v.length > max || v.includes('/')) {
    throw new HttpsError('invalid-argument', `${key} is required.`);
  }
  return v;
}

interface AnswerTarget {
  sessionId: string;
  responseKey: string;
  questionId: string;
}

function parseTarget(raw: unknown): AnswerTarget {
  const data = isRec(raw) ? raw : {};
  return {
    sessionId: readId(data, 'sessionId', 200),
    responseKey: readId(data, 'responseKey'),
    questionId: readId(data, 'questionId', 200),
  };
}

function requireCaller(caller: Caller | null): Caller {
  if (!caller) throw new HttpsError('unauthenticated', 'Sign in required.');
  return caller;
}

function requireTeacherCaller(caller: Caller | null): Caller {
  const c = requireCaller(caller);
  if (c.anonymous || c.studentRole) {
    throw new HttpsError('permission-denied', 'Teachers only.');
  }
  return c;
}

/** A crop path under this teacher's own prefix: `paper_written_crops/{uid}/{scanId}/{seat}/{file}`. */
export function isTeacherCropPath(storagePath: string, uid: string): boolean {
  const parts = storagePath.split('/');
  return (
    parts.length === 5 &&
    parts[0] === PAPER_WRITTEN_CROP_PREFIX &&
    parts[1] === uid &&
    parts.every((p) => p.length > 0 && p !== '.' && p !== '..')
  );
}

function answersOf(response: Rec | undefined): Rec[] {
  return Array.isArray(response?.answers)
    ? (response.answers as unknown[]).filter(isRec)
    : [];
}

function handwritingArtifactOf(answer: Rec | undefined): Rec | null {
  const list = Array.isArray(answer?.artifacts)
    ? (answer.artifacts as unknown[]).filter(isRec)
    : [];
  return list.find((a) => a.kind === 'handwriting') ?? null;
}

function isPaperWritten(answer: Rec): boolean {
  return (
    typeof answer.paperScanId === 'string' ||
    handwritingArtifactOf(answer) !== null
  );
}

/** The printed seat: the response's `paperSeat`, else the seat segment of its crop path. */
function seatOf(response: Rec | undefined, answer: Rec | undefined): number {
  if (typeof response?.paperSeat === 'number') return response.paperSeat;
  const path = handwritingArtifactOf(answer)?.storagePath;
  const seat = typeof path === 'string' ? Number(path.split('/')[3]) : NaN;
  if (!Number.isInteger(seat) || seat < 1) {
    throw new HttpsError('failed-precondition', 'This answer has no seat.');
  }
  return seat;
}

function sessionRefOf(db: Firestore, sessionId: string) {
  return db.collection('quiz_sessions').doc(sessionId);
}

function responseRefOf(db: Firestore, t: AnswerTarget) {
  return sessionRefOf(db, t.sessionId)
    .collection('responses')
    .doc(t.responseKey);
}

function privateRefOf(responseRef: DocumentReference, questionId: string) {
  return responseRef.collection(PAPER_PRIVATE_SUBCOLLECTION).doc(questionId);
}

function jobsOf(db: Firestore, uid: string) {
  return db.collection('users').doc(uid).collection(PAPER_TRANSCRIPTION_JOBS);
}

/** Only the teacher who owns the session passes. */
async function requireSessionTeacher(
  db: Firestore,
  sessionId: string,
  uid: string
): Promise<void> {
  const snap = await sessionRefOf(db, sessionId).get();
  if (!snap.exists || snap.data()?.teacherUid !== uid) {
    throw new HttpsError(
      'permission-denied',
      'Only the teacher who imported these answers can change them.'
    );
  }
}

// ── Crop reads ────────────────────────────────────────────────────────────

async function cropFromStorage(
  deps: PaperWrittenDeps,
  storagePath: string
): Promise<CropResult | null> {
  const object = await deps.readObject(storagePath);
  if (!object) return null;
  if (object.data.byteLength > MAX_CROP_BYTES) {
    return { status: 'not-available', reason: 'too-large' };
  }
  return {
    status: 'ready',
    mimeType: cropMime(object.contentType),
    data: object.data.toString('base64'),
    source: 'storage',
  };
}

const missing: CropResult = { status: 'not-available', reason: 'missing' };

/** The Storage copy while it exists, else the teacher's archived Drive copy. */
async function cropForArtifact(
  deps: PaperWrittenDeps,
  teacherUid: string,
  response: Rec,
  artifact: Rec
): Promise<CropResult> {
  const storagePath = artifact.storagePath;
  if (
    typeof storagePath !== 'string' ||
    !isTeacherCropPath(storagePath, teacherUid)
  ) {
    return { status: 'not-available', reason: 'no-crop' };
  }
  const archive = isRec(response.artifactArchive)
    ? response.artifactArchive
    : {};
  const rawEntry =
    typeof artifact.id === 'string' ? archive[artifact.id] : undefined;
  const entry: Rec | undefined = isRec(rawEntry) ? rawEntry : undefined;
  const archiveStatus = entry?.archiveStatus;
  if (
    archiveStatus === 'deleting' ||
    archiveStatus === 'deleted' ||
    archiveStatus === 'delete-failed'
  ) {
    return { status: 'not-available', reason: 'deleted' };
  }
  const stored = await cropFromStorage(deps, storagePath);
  if (stored) return stored;
  if (archiveStatus === 'failed' || archiveStatus === 'lost') {
    return { status: 'not-available', reason: 'failed' };
  }
  if (archiveStatus === 'syncing') {
    return { status: 'not-available', reason: 'archiving' };
  }
  if (archiveStatus !== 'archived' || typeof entry?.driveFileId !== 'string') {
    return missing;
  }
  let bytes: Buffer;
  try {
    const token = await deps.getAccessToken(teacherUid);
    bytes = await deps.downloadDriveFile(token, entry.driveFileId);
  } catch (error) {
    console.error('[paperWrittenCallables] Drive crop fetch failed', error);
    throw new HttpsError('unavailable', 'Could not load this answer image.');
  }
  if (bytes.byteLength > MAX_CROP_BYTES) {
    return { status: 'not-available', reason: 'too-large' };
  }
  return {
    status: 'ready',
    mimeType: cropMime(artifact.mimeType),
    data: bytes.toString('base64'),
    source: 'drive',
  };
}

export async function handleGetPaperWrittenCrop(
  deps: PaperWrittenDeps,
  rawCaller: Caller | null,
  raw: unknown
): Promise<CropResult> {
  const caller = requireCaller(rawCaller);
  const data = isRec(raw) ? raw : {};

  if (typeof data.storagePath === 'string') {
    // Resuming an import review before any response exists: own prefix only.
    if (caller.anonymous || caller.studentRole) {
      throw new HttpsError('permission-denied', 'Teachers only.');
    }
    if (!isTeacherCropPath(data.storagePath, caller.uid)) {
      throw new HttpsError('permission-denied', 'Not your answer image.');
    }
    return (await cropFromStorage(deps, data.storagePath)) ?? missing;
  }

  const target = parseTarget(data);
  const scan = data.scan ?? 'current';
  if (scan !== 'current' && scan !== 'newer') {
    throw new HttpsError('invalid-argument', 'Unknown scan.');
  }
  const sessionSnap = await sessionRefOf(deps.db, target.sessionId).get();
  if (!sessionSnap.exists) {
    throw new HttpsError('not-found', 'Quiz session not found.');
  }
  const session = sessionSnap.data() ?? {};
  const teacherUid =
    typeof session.teacherUid === 'string' ? session.teacherUid : '';
  const responseRef = responseRefOf(deps.db, target);
  const responseSnap = await responseRef.get();
  const response = responseSnap.data();
  const isTeacher = !!teacherUid && teacherUid === caller.uid;

  if (!isTeacher) {
    // A forged key dies here: the doc's own studentUid is the only ownership fact trusted.
    if (
      !response ||
      typeof response.studentUid !== 'string' ||
      response.studentUid !== caller.uid ||
      scan !== 'current' ||
      !studentMaySeeHandwriting(session, response, deps.now())
    ) {
      throw new HttpsError(
        'permission-denied',
        'This answer image is not available to you.'
      );
    }
  }
  if (!response) throw new HttpsError('not-found', 'Quiz response not found.');

  const answer = answersOf(response).find(
    (a) => a.questionId === target.questionId
  );
  if (scan === 'newer') {
    const priv = (
      await privateRefOf(responseRef, target.questionId).get()
    ).data();
    const newer = isRec(priv?.newerScan) ? priv.newerScan : null;
    if (
      !newer ||
      typeof newer.scanId !== 'string' ||
      !newer.scanId ||
      newer.scanId.includes('/')
    ) {
      return { status: 'not-available', reason: 'no-crop' };
    }
    const path = paperCropStoragePath(
      teacherUid,
      newer.scanId,
      seatOf(response, answer),
      target.questionId
    );
    return (await cropFromStorage(deps, path)) ?? missing;
  }

  const artifact = handwritingArtifactOf(answer);
  if (!artifact) return { status: 'not-available', reason: 'no-crop' };
  if (!isTeacher) {
    // Students can edit their answers, so rebuild the path from server-written fields.
    const priv = (
      await privateRefOf(responseRef, target.questionId).get()
    ).data();
    if (
      typeof priv?.scanId !== 'string' ||
      typeof response.paperSeat !== 'number' ||
      artifact.storagePath !==
        paperCropStoragePath(
          teacherUid,
          priv.scanId,
          response.paperSeat,
          target.questionId
        )
    ) {
      return { status: 'not-available', reason: 'no-crop' };
    }
  }
  return cropForArtifact(deps, teacherUid, response, artifact);
}

// ── Job queueing shared by "Use new scan" and "Not blank? Transcribe" ─────

interface LatestJob {
  id: string;
  attempt: number;
}

/** The page's highest-attempt job for this seat, read before the transaction. */
async function findLatestPageJob(
  db: Firestore,
  uid: string,
  scanId: string,
  seat: number,
  page: number
): Promise<LatestJob | null> {
  const prefix = `${scanId}_${seat}_${page}_`;
  const snap = await jobsOf(db, uid).where('scanId', '==', scanId).get();
  let latest: LatestJob | null = null;
  for (const doc of snap.docs) {
    if (!doc.id.startsWith(prefix)) continue;
    const attempt = Number(doc.id.slice(prefix.length));
    if (!Number.isInteger(attempt) || attempt < 0) continue;
    if (!latest || attempt > latest.attempt) latest = { id: doc.id, attempt };
  }
  return latest;
}

/** The page of the job that already lists this box, so a blank box re-queues on its own page. */
async function findBoxPage(
  db: Firestore,
  uid: string,
  scanId: string,
  seat: number,
  responseKey: string,
  questionId: string
): Promise<number | null> {
  const snap = await jobsOf(db, uid).where('scanId', '==', scanId).get();
  for (const doc of snap.docs) {
    if (!doc.id.startsWith(`${scanId}_${seat}_`)) continue;
    const job = parseJob(doc.data());
    if (
      job &&
      job.responseKey === responseKey &&
      job.boxes.some((b) => b.questionId === questionId)
    ) {
      return job.page;
    }
  }
  return null;
}

/**
 * Creates the page's next-attempt job holding this box, folding in the latest job's boxes
 * when that job has not finished, so the highest attempt stays the only open job and a
 * later retry never collides with this one.
 */
async function queueBoxJob(
  tx: Transaction,
  db: Firestore,
  uid: string,
  latest: LatestJob | null,
  job: {
    sessionId: string;
    responseKey: string;
    scanId: string;
    seat: number;
    page: number;
    box: { questionId: string; storagePath: string };
  },
  now: number
): Promise<{ write: () => void; jobId: string }> {
  const attempt = latest ? latest.attempt + 1 : 0;
  const jobId = paperTranscriptionJobId(
    job.scanId,
    job.seat,
    job.page,
    attempt
  );
  const nextRef = jobsOf(db, uid).doc(jobId);
  const latestRef = latest ? jobsOf(db, uid).doc(latest.id) : null;
  const [nextSnap, latestSnap] = await Promise.all([
    tx.get(nextRef),
    latestRef ? tx.get(latestRef) : Promise.resolve(null),
  ]);
  if (nextSnap.exists) {
    throw new HttpsError('aborted', 'This page changed. Try again.');
  }
  const prev = latestSnap ? parseJob(latestSnap.data()) : null;
  const leaseLive =
    prev?.status === 'running' &&
    typeof prev.leaseUntil === 'number' &&
    prev.leaseUntil > now;
  if (leaseLive) {
    throw new HttpsError(
      'aborted',
      'This page is being transcribed right now. Try again in a minute.'
    );
  }
  const open =
    prev &&
    (prev.status === 'queued' ||
      prev.status === 'running' ||
      prev.status === 'failed' ||
      prev.status === 'over-quota');
  const carried = open
    ? prev.boxes.filter((b) => b.questionId !== job.box.questionId)
    : [];
  const fresh: PaperTranscriptionJob = {
    sessionId: job.sessionId,
    responseKey: job.responseKey,
    scanId: job.scanId,
    page: job.page,
    boxes: [...carried, job.box],
    status: 'queued',
    attempt,
    charged: false,
    createdAt: now,
    updatedAt: now,
  };
  return {
    jobId,
    write: () => {
      tx.create(nextRef, fresh as unknown as Rec);
      if (open && latestRef) {
        tx.update(latestRef, {
          status: 'superseded',
          supersededBy: jobId,
          updatedAt: now,
        });
      }
    },
  };
}

/** Grades anchored to the old text lose their snapshot and highlights; points, comment and rubric stay. */
function withoutSnapshot(grade: Rec, snapshot?: string): Rec {
  const next: Rec = { ...grade };
  delete next.annotations;
  delete next.annotationUnit;
  if (snapshot === undefined) delete next.gradingSnapshot;
  else next.gradingSnapshot = snapshot;
  return next;
}

// ── updatePaperTranscriptV1 (D36) ─────────────────────────────────────────

export interface UpdateTranscriptResult {
  answer: string;
  snapshotRewritten: boolean;
}

export async function handleUpdatePaperTranscript(
  deps: PaperWrittenDeps,
  rawCaller: Caller | null,
  raw: unknown
): Promise<UpdateTranscriptResult> {
  const caller = requireTeacherCaller(rawCaller);
  const target = parseTarget(raw);
  const data = raw as Rec;
  if (typeof data.text !== 'string') {
    throw new HttpsError('invalid-argument', 'text is required.');
  }
  if (data.text.length > MAX_TRANSCRIPT_CHARS) {
    throw new HttpsError('invalid-argument', 'This transcript is too long.');
  }
  const expectedScanId =
    typeof data.expectedScanId === 'string' ? data.expectedScanId : undefined;
  const confirm = data.confirmSnapshotRewrite === true;
  const html = transcriptToHtml(data.text);

  await requireSessionTeacher(deps.db, target.sessionId, caller.uid);
  const responseRef = responseRefOf(deps.db, target);
  const privateRef = privateRefOf(responseRef, target.questionId);
  const now = deps.now();

  return deps.db.runTransaction(async (tx) => {
    const [responseSnap, privateSnap] = await Promise.all([
      tx.get(responseRef),
      tx.get(privateRef),
    ]);
    const response = responseSnap.data();
    if (!response) {
      throw new HttpsError('not-found', 'Quiz response not found.');
    }
    const answers = answersOf(response);
    const index = answers.findIndex((a) => a.questionId === target.questionId);
    if (index < 0 || !isPaperWritten(answers[index])) {
      throw new HttpsError(
        'failed-precondition',
        'Only handwritten paper answers can be edited here.'
      );
    }
    const scanId = answers[index].paperScanId;
    if (expectedScanId !== undefined && scanId !== expectedScanId) {
      throw new HttpsError('aborted', 'A newer scan replaced this answer.');
    }
    const grading = isRec(response.grading) ? response.grading : {};
    const grade = grading[target.questionId];
    const hasSnapshot =
      isRec(grade) && typeof grade.gradingSnapshot === 'string';
    if (hasSnapshot && !confirm) {
      throw new HttpsError(
        'failed-precondition',
        'Editing replaces the graded text and removes its highlights.',
        { reason: 'confirm-snapshot-rewrite' }
      );
    }

    const nextAnswers = answers.map((a, i) =>
      i === index ? { ...a, answer: html, paperTranscript: 'done' } : a
    );
    tx.update(responseRef, {
      answers: nextAnswers,
      ...(hasSnapshot
        ? {
            grading: {
              ...grading,
              [target.questionId]: withoutSnapshot(grade, html),
            },
          }
        : {}),
    });
    const prev = privateSnap.data() ?? {};
    tx.set(privateRef, {
      ...prev,
      scanId: typeof prev.scanId === 'string' ? prev.scanId : (scanId ?? ''),
      status: 'done',
      attempts: typeof prev.attempts === 'number' ? prev.attempts : 0,
      charged: prev.charged === true,
      editedBy: caller.uid,
      editedAt: now,
      updatedAt: now,
    });
    return { answer: html, snapshotRewritten: hasSnapshot };
  });
}

// ── applyPaperNewerScanV1 ("Use new scan") ────────────────────────────────

export interface ApplyNewerScanResult {
  scanId: string;
  paperTranscript: 'pending' | 'blank';
  jobId: string;
}

export async function handleApplyPaperNewerScan(
  deps: PaperWrittenDeps,
  rawCaller: Caller | null,
  raw: unknown
): Promise<ApplyNewerScanResult> {
  const caller = requireTeacherCaller(rawCaller);
  const target = parseTarget(raw);
  await requireSessionTeacher(deps.db, target.sessionId, caller.uid);
  const responseRef = responseRefOf(deps.db, target);
  const privateRef = privateRefOf(responseRef, target.questionId);

  // Read once outside the transaction for the seat, Storage metadata and job lookup.
  const [responseSnap, privateSnap] = await Promise.all([
    responseRef.get(),
    privateRef.get(),
  ]);
  const newer = isRec(privateSnap.data()?.newerScan)
    ? (privateSnap.data()?.newerScan as Rec)
    : null;
  if (
    !newer ||
    typeof newer.scanId !== 'string' ||
    !newer.scanId ||
    newer.scanId.includes('/') ||
    typeof newer.page !== 'number' ||
    (newer.state !== 'ink' && newer.state !== 'blank')
  ) {
    throw new HttpsError('failed-precondition', 'There is no newer scan.');
  }
  const newScanId = newer.scanId;
  const page = newer.page;
  const state = newer.state;
  const response = responseSnap.data();
  const answer = answersOf(response).find(
    (a) => a.questionId === target.questionId
  );
  const seat = seatOf(response, answer);
  const storagePath = paperCropStoragePath(
    caller.uid,
    newScanId,
    seat,
    target.questionId
  );
  const stat = await deps.statObject(storagePath);
  if (!stat) {
    throw new HttpsError(
      'failed-precondition',
      'The newer scan of this answer is no longer available.'
    );
  }
  const latest = await findLatestPageJob(
    deps.db,
    caller.uid,
    newScanId,
    seat,
    page
  );
  const now = deps.now();
  const transcript: 'pending' | 'blank' =
    state === 'blank' ? 'blank' : 'pending';

  return deps.db.runTransaction(async (tx) => {
    const [fresh, freshPrivate] = await Promise.all([
      tx.get(responseRef),
      tx.get(privateRef),
    ]);
    const freshNewer = freshPrivate.data()?.newerScan as Rec | undefined;
    if (freshNewer?.scanId !== newScanId) {
      throw new HttpsError('aborted', 'This answer changed. Try again.');
    }
    const data = fresh.data();
    const answers = answersOf(data);
    const index = answers.findIndex((a) => a.questionId === target.questionId);
    if (index < 0 || !isPaperWritten(answers[index])) {
      throw new HttpsError(
        'failed-precondition',
        'Only handwritten paper answers can use a new scan.'
      );
    }
    const queued = await queueBoxJob(
      tx,
      deps.db,
      caller.uid,
      latest,
      {
        sessionId: target.sessionId,
        responseKey: target.responseKey,
        scanId: newScanId,
        seat,
        page,
        box: { questionId: target.questionId, storagePath },
      },
      now
    );

    const old = answers[index];
    const otherArtifacts = Array.isArray(old.artifacts)
      ? (old.artifacts as unknown[]).filter(
          (a) => isRec(a) && a.kind !== 'handwriting'
        )
      : [];
    const nextAnswers = answers.map((a, i) =>
      i === index
        ? {
            ...a,
            answer: '',
            answeredAt: now,
            paperScanId: newScanId,
            paperTranscript: transcript,
            artifacts: [
              {
                id: `hw_${newScanId}_${target.questionId}`,
                slot: 'primary',
                kind: 'handwriting',
                storagePath,
                mimeType: cropMime(stat.contentType),
                uploadState: 'uploaded',
              },
              ...otherArtifacts,
            ],
          }
        : a
    );
    const grading = isRec(data?.grading) ? data.grading : {};
    const grade = grading[target.questionId];
    tx.update(responseRef, {
      answers: nextAnswers,
      ...(isRec(grade)
        ? {
            grading: {
              ...grading,
              [target.questionId]: withoutSnapshot(grade),
            },
          }
        : {}),
    });
    const privateDoc: PaperPrivateAnswer = {
      scanId: newScanId,
      status: transcript,
      attempts: 0,
      charged: false,
      updatedAt: now,
    };
    tx.set(privateRef, privateDoc as unknown as Rec);
    queued.write();
    return {
      scanId: newScanId,
      paperTranscript: transcript,
      jobId: queued.jobId,
    };
  });
}

// ── transcribePaperBlankV1 ("Not blank? Transcribe") ─────────────────────

export async function handleTranscribePaperBlank(
  deps: PaperWrittenDeps,
  rawCaller: Caller | null,
  raw: unknown
): Promise<{ jobId: string }> {
  const caller = requireTeacherCaller(rawCaller);
  const target = parseTarget(raw);
  await requireSessionTeacher(deps.db, target.sessionId, caller.uid);
  const responseRef = responseRefOf(deps.db, target);
  const privateRef = privateRefOf(responseRef, target.questionId);

  const response = (await responseRef.get()).data();
  const answer = answersOf(response).find(
    (a) => a.questionId === target.questionId
  );
  const scanId = answer?.paperScanId;
  const artifact = handwritingArtifactOf(answer);
  const storagePath = artifact?.storagePath;
  if (
    typeof scanId !== 'string' ||
    typeof storagePath !== 'string' ||
    !isTeacherCropPath(storagePath, caller.uid)
  ) {
    throw new HttpsError(
      'failed-precondition',
      'Only handwritten paper answers can be transcribed.'
    );
  }
  const seat = seatOf(response, answer);
  const page = await findBoxPage(
    deps.db,
    caller.uid,
    scanId,
    seat,
    target.responseKey,
    target.questionId
  );
  if (page === null) {
    throw new HttpsError(
      'failed-precondition',
      'Could not find the page this answer was scanned on.'
    );
  }
  const latest = await findLatestPageJob(
    deps.db,
    caller.uid,
    scanId,
    seat,
    page
  );
  const now = deps.now();

  return deps.db.runTransaction(async (tx) => {
    const [fresh, freshPrivate] = await Promise.all([
      tx.get(responseRef),
      tx.get(privateRef),
    ]);
    const answers = answersOf(fresh.data());
    const index = answers.findIndex((a) => a.questionId === target.questionId);
    const prev = freshPrivate.data();
    if (
      index < 0 ||
      answers[index].paperScanId !== scanId ||
      prev?.status !== 'blank' ||
      (prev.scanId !== undefined && prev.scanId !== scanId)
    ) {
      throw new HttpsError(
        'failed-precondition',
        'This answer is not marked blank.'
      );
    }
    const queued = await queueBoxJob(
      tx,
      deps.db,
      caller.uid,
      latest,
      {
        sessionId: target.sessionId,
        responseKey: target.responseKey,
        scanId,
        seat,
        page,
        box: { questionId: target.questionId, storagePath },
      },
      now
    );
    tx.update(responseRef, {
      answers: answers.map((a, i) =>
        i === index ? { ...a, paperTranscript: 'pending' } : a
      ),
    });
    tx.set(privateRef, { ...prev, status: 'pending', updatedAt: now });
    queued.write();
    return { jobId: queued.jobId };
  });
}

// ── Deploy targets ────────────────────────────────────────────────────────

export function buildDefaultPaperWrittenDeps(): PaperWrittenDeps {
  const bucket = () => admin.storage().bucket();
  return {
    db: admin.firestore(),
    now: () => Date.now(),
    readObject: async (storagePath) => {
      const file = bucket().file(storagePath);
      const [exists] = await file.exists();
      if (!exists) return null;
      const [[data], [metadata]] = await Promise.all([
        file.download(),
        file.getMetadata(),
      ]);
      return { data, contentType: metadata.contentType };
    },
    statObject: async (storagePath) => {
      const file = bucket().file(storagePath);
      const [exists] = await file.exists();
      if (!exists) return null;
      const [metadata] = await file.getMetadata();
      return {
        contentType: metadata.contentType,
        size: Number(metadata.size ?? 0),
      };
    },
    getAccessToken: async (uid) =>
      (await refreshGoogleAccessTokenForUid(uid)).accessToken,
    downloadDriveFile: downloadDriveFileById,
  };
}

function callerOf(
  auth:
    | {
        uid: string;
        token: {
          studentRole?: unknown;
          firebase?: { sign_in_provider?: string };
        };
      }
    | undefined
): Caller | null {
  if (!auth) return null;
  return {
    uid: auth.uid,
    studentRole: auth.token.studentRole === true,
    anonymous: auth.token.firebase?.sign_in_provider === 'anonymous',
  };
}

const CALLABLE_OPTS = {
  memory: '256MiB' as const,
  timeoutSeconds: 60,
  cors: ALLOWED_ORIGINS,
  invoker: 'public' as const,
};

export const getPaperWrittenCropV1 = onCall(
  { ...CALLABLE_OPTS, memory: '512MiB', secrets: QUIZ_MEDIA_GOOGLE_SECRETS },
  (request) =>
    handleGetPaperWrittenCrop(
      buildDefaultPaperWrittenDeps(),
      callerOf(request.auth),
      request.data
    )
);

export const updatePaperTranscriptV1 = onCall(CALLABLE_OPTS, (request) =>
  handleUpdatePaperTranscript(
    buildDefaultPaperWrittenDeps(),
    callerOf(request.auth),
    request.data
  )
);

export const applyPaperNewerScanV1 = onCall(CALLABLE_OPTS, (request) =>
  handleApplyPaperNewerScan(
    buildDefaultPaperWrittenDeps(),
    callerOf(request.auth),
    request.data
  )
);

export const transcribePaperBlankV1 = onCall(CALLABLE_OPTS, (request) =>
  handleTranscribePaperBlank(
    buildDefaultPaperWrittenDeps(),
    callerOf(request.auth),
    request.data
  )
);
