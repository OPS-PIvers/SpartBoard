// Handwritten paper answers: the per-page transcription worker and the retry callable (plan D23-D31, §4).
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import type {
  DocumentReference,
  DocumentSnapshot,
  Firestore,
  Transaction,
} from 'firebase-admin/firestore';
import './functionsInit';
import { ALLOWED_ORIGINS } from './classlinkShared';
import {
  archiveQuizArtifactCore,
  buildDefaultArchiveDeps,
  isGlobalFeatureGranted,
  QUIZ_MEDIA_ARCHIVE_SECRETS,
  type ArchiveArtifactRequest,
  type ArchiveResult,
} from './quizMediaArchive';
import {
  preparePaperPageCharge,
  readPaperHandwritingQuota,
  type PaperModelTier,
} from './paperHandwritingQuota';
import {
  buildDefaultPaperTranscribeDeps,
  transcribePaperPage,
  type PaperPageTranscript,
  type PaperTranscribeBox,
  type PaperTranscribeDeps,
} from './paperTranscribe';
import {
  PAPER_HANDWRITTEN_FEATURE,
  PAPER_PRIVATE_SUBCOLLECTION,
  PAPER_TRANSCRIPTION_JOBS,
  PAPER_WRITTEN_CROP_PREFIX,
  paperTranscriptionJobId,
  type PaperPrivateStatus,
  type PaperTranscriptionJob,
  type PaperTranscriptionJobStatus,
} from './paperWrittenTypes';

/** Longer than the 300 s function timeout, so a live run never loses its lease. */
export const JOB_LEASE_MS = 6 * 60 * 1000;
/** A user retry past this many attempts is refused; the sweep stops sooner. */
export const MAX_JOB_ATTEMPTS = 10;
/** Runaway guard for one batch retry. */
export const MAX_RETRY_JOBS = 500;
const MAX_ERROR_CHARS = 300;

export type JobOutcome =
  | 'missing'
  | 'not-claimed'
  | 'superseded'
  | 'over-quota'
  | 'failed'
  | 'done';

export interface WorkerDeps {
  db: Firestore;
  now: () => number;
  /** Admin status from a verified email only. */
  isAdmin: (uid: string) => Promise<boolean>;
  /** Whether the teacher holds the handwritten-answers feature flag. */
  featureGranted: (uid: string) => Promise<boolean>;
  transcribe: (
    boxes: PaperTranscribeBox[],
    tier: PaperModelTier
  ) => Promise<PaperPageTranscript>;
  archive: (input: ArchiveArtifactRequest) => Promise<ArchiveResult>;
  cropExists: (storagePath: string) => Promise<boolean>;
}

interface StoredAnswer {
  questionId?: unknown;
  paperScanId?: unknown;
  artifacts?: unknown;
  [key: string]: unknown;
}

const RETRYABLE_PRIVATE: ReadonlySet<unknown> = new Set<PaperPrivateStatus>([
  'pending',
  'failed',
  'over-quota',
]);

export const RETRYABLE_JOB_STATUSES: readonly PaperTranscriptionJobStatus[] = [
  'failed',
  'over-quota',
  'running',
  'queued',
];

function jobsCollection(db: Firestore, uid: string) {
  return db.collection('users').doc(uid).collection(PAPER_TRANSCRIPTION_JOBS);
}

function responseRefFor(db: Firestore, job: PaperTranscriptionJob) {
  return db
    .collection('quiz_sessions')
    .doc(job.sessionId)
    .collection('responses')
    .doc(job.responseKey);
}

function privateRefFor(responseRef: DocumentReference, questionId: string) {
  return responseRef.collection(PAPER_PRIVATE_SUBCOLLECTION).doc(questionId);
}

function answersOf(data: Record<string, unknown> | undefined): StoredAnswer[] {
  return Array.isArray(data?.answers) ? (data.answers as StoredAnswer[]) : [];
}

function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.slice(0, MAX_ERROR_CHARS);
}

export function parseJob(
  data: Record<string, unknown> | undefined
): PaperTranscriptionJob | null {
  if (!data) return null;
  const { sessionId, responseKey, scanId, page, boxes, status, attempt } = data;
  if (
    typeof sessionId !== 'string' ||
    !sessionId ||
    typeof responseKey !== 'string' ||
    !responseKey ||
    typeof scanId !== 'string' ||
    !scanId ||
    typeof page !== 'number' ||
    typeof status !== 'string' ||
    typeof attempt !== 'number' ||
    !Array.isArray(boxes)
  ) {
    return null;
  }
  const cleanBoxes = boxes.filter(
    (b): b is { questionId: string; storagePath: string } =>
      !!b &&
      typeof (b as { questionId?: unknown }).questionId === 'string' &&
      typeof (b as { storagePath?: unknown }).storagePath === 'string'
  );
  return {
    sessionId,
    responseKey,
    scanId,
    page,
    boxes: cleanBoxes.map((b) => ({
      questionId: b.questionId,
      storagePath: b.storagePath,
    })),
    status: status as PaperTranscriptionJobStatus,
    attempt,
    leaseUntil:
      typeof data.leaseUntil === 'number' ? data.leaseUntil : undefined,
    charged: data.charged === true,
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
  };
}

/** `{scanId}_{seat}_{page}_{attempt}` → seat; null when the id is not in that shape. */
export function seatFromJobId(jobId: string, scanId: string): number | null {
  if (!jobId.startsWith(`${scanId}_`)) return null;
  const [seat] = jobId.slice(scanId.length + 1).split('_');
  const n = Number(seat);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** A crop path this teacher and scan own; anything else is never read or archived. */
export function isOwnCropPath(
  storagePath: string,
  uid: string,
  scanId: string
): boolean {
  const prefix = `${PAPER_WRITTEN_CROP_PREFIX}/${uid}/${scanId}/`;
  return (
    storagePath.startsWith(prefix) &&
    !storagePath.includes('..') &&
    storagePath.split('/').length === 5
  );
}

/**
 * A box is still this job's to write when the answer still carries the job's scan
 * and its private doc is unedited and not settled.
 */
export function isBoxLive(
  answers: readonly StoredAnswer[],
  privateData: Record<string, unknown> | undefined,
  questionId: string,
  scanId: string
): boolean {
  const answer = answers.find((a) => a?.questionId === questionId);
  if (!answer || answer.paperScanId !== scanId) return false;
  if (!privateData) return true;
  if (privateData.scanId !== undefined && privateData.scanId !== scanId)
    return false;
  if (typeof privateData.editedAt === 'number') return false;
  return RETRYABLE_PRIVATE.has(privateData.status ?? 'pending');
}

function attemptsOf(privateData: Record<string, unknown> | undefined): number {
  const n = privateData?.attempts;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;
}

/** Claims the job for this run; false when another run holds it or it is settled. */
async function claimJob(
  db: Firestore,
  jobRef: DocumentReference,
  now: number
): Promise<PaperTranscriptionJob | null> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(jobRef);
    const job = parseJob(snap.data());
    if (!job) return null;
    const leaseLive =
      job.status === 'running' &&
      typeof job.leaseUntil === 'number' &&
      job.leaseUntil > now;
    if (job.status !== 'queued' && (job.status !== 'running' || leaseLive))
      return null;
    tx.update(jobRef, {
      status: 'running',
      leaseUntil: now + JOB_LEASE_MS,
      updatedAt: now,
    });
    return job;
  });
}

async function readPrivates(
  read: (ref: DocumentReference) => Promise<DocumentSnapshot>,
  responseRef: DocumentReference,
  questionIds: readonly string[]
): Promise<Map<string, Record<string, unknown> | undefined>> {
  const snaps = await Promise.all(
    questionIds.map((q) => read(privateRefFor(responseRef, q)))
  );
  return new Map(questionIds.map((q, i) => [q, snaps[i].data()]));
}

/** Settles a job that wrote nothing: private docs of still-live boxes take `status`. */
async function settleWithoutTranscript(
  db: Firestore,
  jobRef: DocumentReference,
  job: PaperTranscriptionJob,
  status: 'failed' | 'over-quota',
  now: number,
  error?: string
): Promise<void> {
  const responseRef = responseRefFor(db, job);
  const questionIds = job.boxes.map((b) => b.questionId);
  await db.runTransaction(async (tx: Transaction) => {
    const response = await tx.get(responseRef);
    const privates = await readPrivates(
      (r) => tx.get(r),
      responseRef,
      questionIds
    );
    const answers = answersOf(response.data());
    for (const questionId of questionIds) {
      const prev = privates.get(questionId);
      if (!isBoxLive(answers, prev, questionId, job.scanId)) continue;
      tx.set(
        privateRefFor(responseRef, questionId),
        {
          scanId: job.scanId,
          status,
          attempts: attemptsOf(prev) + (status === 'failed' ? 1 : 0),
          charged: prev?.charged === true,
          updatedAt: now,
          ...(error ? { lastError: error } : {}),
        },
        { merge: true }
      );
    }
    tx.update(jobRef, {
      status,
      updatedAt: now,
      ...(error ? { lastError: error } : {}),
    });
  });
}

/** The handwriting artifact the import attached for this crop. */
export function findCropArtifactId(
  answers: readonly StoredAnswer[],
  questionId: string,
  storagePath: string
): string | null {
  const answer = answers.find((a) => a?.questionId === questionId);
  const list = Array.isArray(answer?.artifacts)
    ? (answer.artifacts as Array<Record<string, unknown>>)
    : [];
  const match = list.find(
    (a) => a?.kind === 'handwriting' && a.storagePath === storagePath
  );
  return typeof match?.id === 'string' ? match.id : null;
}

/** A crop missing from Storage fails its own box instead of the whole page, and never reaches Gemini. */
async function transcribePresentCrops(
  boxes: PaperTranscribeBox[],
  tier: PaperModelTier,
  deps: WorkerDeps
): Promise<PaperPageTranscript> {
  const exists = await Promise.all(
    boxes.map((b) => deps.cropExists(b.storagePath))
  );
  const present = boxes.filter((_, i) => exists[i]);
  const missing = boxes.filter((_, i) => !exists[i]);
  const page =
    present.length > 0
      ? await deps.transcribe(present, tier)
      : { model: '', boxes: [] };
  return {
    ...page,
    boxes: [
      ...page.boxes,
      ...missing.map((b) => ({
        questionId: b.questionId,
        ok: false as const,
        error: 'The answer image is missing from Storage.',
      })),
    ],
  };
}

/** A box the import read as blank, still on this scan; it is archived but never transcribed. */
export function isBlankBox(
  answers: readonly StoredAnswer[],
  privateData: Record<string, unknown> | undefined,
  questionId: string,
  scanId: string
): boolean {
  const answer = answers.find((a) => a?.questionId === questionId);
  return (
    answer?.paperScanId === scanId &&
    privateData?.status === 'blank' &&
    (privateData.scanId === undefined || privateData.scanId === scanId)
  );
}

// Archival never blocks the transcript: the archive core records its own failures for the hourly sweep.
async function archiveBoxes(
  deps: WorkerDeps,
  job: PaperTranscriptionJob,
  jobId: string,
  boxes: readonly PaperTranscribeBox[],
  answers: readonly StoredAnswer[]
): Promise<void> {
  for (const box of boxes) {
    const artifactId = findCropArtifactId(
      answers,
      box.questionId,
      box.storagePath
    );
    if (!artifactId) continue;
    try {
      await deps.archive({
        sessionId: job.sessionId,
        responseKey: job.responseKey,
        questionId: box.questionId,
        artifactId,
      });
    } catch (error) {
      console.error('[paperTranscriptionWorker] archive failed', jobId, error);
    }
  }
}

/** One job, start to finish. Never throws for an expected outcome, so the trigger does not retry. */
export async function runPaperTranscriptionJob(
  uid: string,
  jobId: string,
  deps: WorkerDeps
): Promise<JobOutcome> {
  const { db } = deps;
  const jobRef = jobsCollection(db, uid).doc(jobId);
  const job = await claimJob(db, jobRef, deps.now());
  if (!job) {
    const exists = (await jobRef.get()).exists;
    return exists ? 'not-claimed' : 'missing';
  }

  const sessionSnap = await db
    .collection('quiz_sessions')
    .doc(job.sessionId)
    .get();
  if (sessionSnap.data()?.teacherUid !== uid) {
    await settleWithoutTranscript(
      db,
      jobRef,
      job,
      'failed',
      deps.now(),
      'Session is not owned by this teacher.'
    );
    return 'failed';
  }

  const responseRef = responseRefFor(db, job);
  const [responseSnap, privates] = await Promise.all([
    responseRef.get(),
    readPrivates(
      (r) => r.get(),
      responseRef,
      job.boxes.map((b) => b.questionId)
    ),
  ]);
  const answers = answersOf(responseSnap.data());
  const owned = job.boxes.filter((b) =>
    isOwnCropPath(b.storagePath, uid, job.scanId)
  );
  const live = owned.filter((b) =>
    isBoxLive(answers, privates.get(b.questionId), b.questionId, job.scanId)
  );
  // Blank boxes are archived without an AI call (D22).
  const blanks = owned.filter((b) =>
    isBlankBox(answers, privates.get(b.questionId), b.questionId, job.scanId)
  );
  const archiveBlanks = () => archiveBoxes(deps, job, jobId, blanks, answers);
  if (live.length === 0) {
    const status = blanks.length > 0 ? 'done' : 'superseded';
    await jobRef.update({ status, updatedAt: deps.now() });
    await archiveBlanks();
    return status;
  }

  if (!(await deps.featureGranted(uid))) {
    await settleWithoutTranscript(
      db,
      jobRef,
      job,
      'failed',
      deps.now(),
      'Handwritten answers are not enabled for this teacher.'
    );
    await archiveBlanks();
    return 'failed';
  }

  const quota = await readPaperHandwritingQuota(db, {
    uid,
    isAdmin: await deps.isAdmin(uid),
    nowMs: deps.now(),
  });
  if (quota.geminiDisabled || quota.remaining < 1) {
    await settleWithoutTranscript(db, jobRef, job, 'over-quota', deps.now());
    await archiveBlanks();
    return 'over-quota';
  }

  let transcript: PaperPageTranscript;
  try {
    transcript = await transcribePresentCrops(live, quota.modelTier, deps);
  } catch (error) {
    console.error('[paperTranscriptionWorker] transcribe failed', jobId, error);
    await settleWithoutTranscript(
      db,
      jobRef,
      job,
      'failed',
      deps.now(),
      errorText(error)
    );
    await archiveBlanks();
    return 'failed';
  }

  const byQuestion = new Map(transcript.boxes.map((b) => [b.questionId, b]));
  const now = deps.now();
  const written = await db.runTransaction(async (tx: Transaction) => {
    const fresh = await tx.get(responseRef);
    const freshPrivates = await readPrivates(
      (r) => tx.get(r),
      responseRef,
      live.map((b) => b.questionId)
    );
    const charge = await preparePaperPageCharge(tx, db, {
      uid,
      jobRef,
      nowMs: now,
    });
    const freshAnswers = answersOf(fresh.data());
    const done: PaperTranscribeBox[] = [];
    let failedBoxes = 0;
    const nextAnswers = freshAnswers.map((a) => ({ ...a }));
    for (const box of live) {
      const prev = freshPrivates.get(box.questionId);
      if (!isBoxLive(freshAnswers, prev, box.questionId, job.scanId)) continue;
      const result = byQuestion.get(box.questionId);
      const privateRef = privateRefFor(responseRef, box.questionId);
      const attempts = attemptsOf(prev) + 1;
      if (!result || !result.ok) {
        failedBoxes++;
        tx.set(
          privateRef,
          {
            scanId: job.scanId,
            status: 'failed',
            attempts,
            charged: prev?.charged === true,
            lastError: result && !result.ok ? result.error : 'no result',
            updatedAt: now,
          },
          { merge: true }
        );
        continue;
      }
      const index = nextAnswers.findIndex(
        (a) => a?.questionId === box.questionId
      );
      nextAnswers[index] = {
        ...nextAnswers[index],
        answer: result.html,
        paperTranscript: 'done',
      };
      tx.set(
        privateRef,
        {
          scanId: job.scanId,
          status: 'done',
          rawTranscript: result.rawTranscript,
          uncertainSpans: result.uncertainSpans,
          illegibleCount: result.illegibleCount,
          attempts,
          charged: true,
          updatedAt: now,
        },
        { merge: true }
      );
      done.push(box);
    }
    if (done.length > 0) {
      tx.update(responseRef, { answers: nextAnswers });
      charge.apply();
    }
    const status: PaperTranscriptionJobStatus =
      failedBoxes > 0 ? 'failed' : done.length > 0 ? 'done' : 'superseded';
    tx.update(jobRef, {
      status,
      updatedAt: now,
      ...(failedBoxes > 0
        ? { lastError: `${failedBoxes} box(es) not transcribed` }
        : {}),
    });
    return { done, answers: nextAnswers, status };
  });

  await archiveBoxes(deps, job, jobId, written.done, written.answers);
  await archiveBlanks();

  if (written.status === 'done') return 'done';
  return written.status === 'failed' ? 'failed' : 'superseded';
}

// ── Re-queue (shared by the retry callable and the sweep) ─────────────────

export type RequeueOutcome = 'requeued' | 'superseded' | 'skipped';

/**
 * Replaces a failed, over-quota or stuck job with a new job one attempt higher,
 * carrying only boxes that still need a transcript. Creating the new doc is what
 * fires the worker; the deterministic id makes concurrent re-queues collide.
 */
export async function requeuePaperJob(
  db: Firestore,
  uid: string,
  jobId: string,
  opts: {
    now: number;
    maxAttempt: number;
    /** A stuck `'running'` job is re-queued only once its lease has run out. */
    allowStatuses?: readonly PaperTranscriptionJobStatus[];
  }
): Promise<RequeueOutcome> {
  const jobRef = jobsCollection(db, uid).doc(jobId);
  const allow = opts.allowStatuses ?? RETRYABLE_JOB_STATUSES;
  return db.runTransaction(async (tx: Transaction) => {
    const job = parseJob((await tx.get(jobRef)).data());
    if (!job || !allow.includes(job.status)) return 'skipped';
    if (
      job.status === 'running' &&
      typeof job.leaseUntil === 'number' &&
      job.leaseUntil > opts.now
    ) {
      return 'skipped';
    }
    if (job.attempt + 1 > opts.maxAttempt) {
      // A stuck run past the cap would otherwise match the stuck query forever.
      if (job.status === 'running' || job.status === 'queued') {
        tx.update(jobRef, {
          status: 'failed',
          lastError: `Stopped after ${job.attempt} attempts.`,
          updatedAt: opts.now,
        });
      }
      return 'skipped';
    }
    const seat = seatFromJobId(jobId, job.scanId);
    if (seat === null) return 'skipped';
    const nextRef = jobsCollection(db, uid).doc(
      paperTranscriptionJobId(job.scanId, seat, job.page, job.attempt + 1)
    );
    const responseRef = responseRefFor(db, job);
    const [next, response, privates] = await Promise.all([
      tx.get(nextRef),
      tx.get(responseRef),
      readPrivates(
        (r) => tx.get(r),
        responseRef,
        job.boxes.map((b) => b.questionId)
      ),
    ]);
    if (next.exists) return 'skipped';
    const answers = answersOf(response.data());
    const liveOf = (b: PaperTranscribeBox) =>
      isBoxLive(answers, privates.get(b.questionId), b.questionId, job.scanId);
    const live = job.boxes.filter(liveOf);
    // Blank boxes ride along so a job that never ran still gets its blank crops archived.
    const boxes = job.boxes.filter(
      (b) =>
        liveOf(b) ||
        isBlankBox(
          answers,
          privates.get(b.questionId),
          b.questionId,
          job.scanId
        )
    );
    if (live.length === 0) {
      tx.update(jobRef, { status: 'superseded', updatedAt: opts.now });
      return 'superseded';
    }
    const fresh: PaperTranscriptionJob = {
      sessionId: job.sessionId,
      responseKey: job.responseKey,
      scanId: job.scanId,
      page: job.page,
      boxes,
      status: 'queued',
      attempt: job.attempt + 1,
      charged: false,
      createdAt: opts.now,
      updatedAt: opts.now,
    };
    tx.create(nextRef, fresh as unknown as Record<string, unknown>);
    for (const box of live) {
      tx.set(
        privateRefFor(responseRef, box.questionId),
        { scanId: job.scanId, status: 'pending', updatedAt: opts.now },
        { merge: true }
      );
    }
    tx.update(jobRef, {
      status: 'superseded',
      supersededBy: nextRef.id,
      updatedAt: opts.now,
    });
    return 'requeued';
  });
}

// ── Retry callable ("Transcribe now", per answer, seat or batch) ──────────

export interface RetryRequest {
  sessionId: string;
  responseKey?: string;
  questionId?: string;
}

export function parseRetryRequest(data: unknown): RetryRequest {
  const d = (data ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) =>
    typeof v === 'string' && v.length > 0 && v.length <= max && !v.includes('/')
      ? v
      : undefined;
  const sessionId = str(d.sessionId, 200);
  if (!sessionId) {
    throw new HttpsError('invalid-argument', 'sessionId is required.');
  }
  const responseKey = str(d.responseKey, 300);
  const questionId = str(d.questionId, 200);
  if (questionId && !responseKey) {
    throw new HttpsError('invalid-argument', 'questionId needs a responseKey.');
  }
  return {
    sessionId,
    ...(responseKey ? { responseKey } : {}),
    ...(questionId ? { questionId } : {}),
  };
}

export interface RetryResult {
  requeued: number;
  superseded: number;
  skipped: number;
}

export async function handleRetryPaperTranscription(
  db: Firestore,
  caller: { uid: string; anonymous: boolean; studentRole: boolean } | null,
  data: unknown,
  now: number
): Promise<RetryResult> {
  if (!caller) throw new HttpsError('unauthenticated', 'Sign in required.');
  if (caller.anonymous || caller.studentRole) {
    throw new HttpsError('permission-denied', 'Teachers only.');
  }
  const req = parseRetryRequest(data);
  const session = await db.collection('quiz_sessions').doc(req.sessionId).get();
  if (!session.exists || session.data()?.teacherUid !== caller.uid) {
    throw new HttpsError(
      'permission-denied',
      'Only the teacher who imported these answers can retry them.'
    );
  }

  let query = jobsCollection(db, caller.uid).where(
    'sessionId',
    '==',
    req.sessionId
  );
  if (req.responseKey) {
    query = query.where('responseKey', '==', req.responseKey);
  }
  const snap = await query.limit(MAX_RETRY_JOBS * 4).get();
  const candidates = snap.docs.filter((d) => {
    const job = parseJob(d.data());
    if (!job || !RETRYABLE_JOB_STATUSES.includes(job.status)) return false;
    if (job.status === 'queued') return false;
    return (
      !req.questionId || job.boxes.some((b) => b.questionId === req.questionId)
    );
  });

  const result: RetryResult = { requeued: 0, superseded: 0, skipped: 0 };
  for (const doc of candidates.slice(0, MAX_RETRY_JOBS)) {
    const outcome = await requeuePaperJob(db, caller.uid, doc.id, {
      now,
      maxAttempt: MAX_JOB_ATTEMPTS,
      allowStatuses: ['failed', 'over-quota', 'running'],
    });
    result[outcome]++;
  }
  return result;
}

// ── Deploy targets ────────────────────────────────────────────────────────

/** Admin status from a verified email only, so a self-reported address never lifts the quota. */
export async function isVerifiedAdmin(uid: string): Promise<boolean> {
  try {
    const user = await admin.auth().getUser(uid);
    if (!user.emailVerified || !user.email) return false;
    const snap = await admin
      .firestore()
      .collection('admins')
      .doc(user.email.toLowerCase())
      .get();
    return snap.exists;
  } catch {
    return false;
  }
}

export function buildDefaultWorkerDeps(): WorkerDeps {
  const transcribeDeps: PaperTranscribeDeps = {
    ...buildDefaultPaperTranscribeDeps(),
    // The client uploads WebP or PNG under a .webp path, so the stored content type decides.
    loadCrop: async (storagePath) => {
      const file = admin.storage().bucket().file(storagePath);
      const [[data], [metadata]] = await Promise.all([
        file.download(),
        file.getMetadata(),
      ]);
      return {
        data,
        mimeType:
          metadata.contentType === 'image/png' ? 'image/png' : 'image/webp',
      };
    },
  };
  const archiveDeps = buildDefaultArchiveDeps();
  return {
    db: admin.firestore(),
    now: () => Date.now(),
    isAdmin: isVerifiedAdmin,
    featureGranted: async (uid) => {
      try {
        const user = await admin.auth().getUser(uid);
        return await isGlobalFeatureGranted(
          admin.firestore(),
          PAPER_HANDWRITTEN_FEATURE,
          user.emailVerified ? (user.email ?? null) : null,
          uid
        );
      } catch {
        return false;
      }
    },
    transcribe: (boxes, tier) =>
      transcribePaperPage(boxes, tier, transcribeDeps),
    archive: (input) =>
      archiveQuizArtifactCore({ ...input, callerUid: null }, archiveDeps),
    cropExists: async (storagePath) => {
      const [exists] = await admin
        .storage()
        .bucket()
        .file(storagePath)
        .exists();
      return exists;
    },
  };
}

export const transcribePaperWrittenPageV1 = onDocumentCreated(
  {
    document: `users/{uid}/${PAPER_TRANSCRIPTION_JOBS}/{jobId}`,
    memory: '1GiB' as const,
    timeoutSeconds: 300,
    maxInstances: 20,
    secrets: QUIZ_MEDIA_ARCHIVE_SECRETS,
  },
  async (event) => {
    const outcome = await runPaperTranscriptionJob(
      event.params.uid,
      event.params.jobId,
      buildDefaultWorkerDeps()
    );
    console.log(
      '[paperTranscriptionWorker]',
      event.params.jobId,
      JSON.stringify({ outcome })
    );
  }
);

export const retryPaperTranscriptionV1 = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 120,
    cors: ALLOWED_ORIGINS,
    invoker: 'public',
  },
  async (request) => {
    const caller = request.auth
      ? {
          uid: request.auth.uid,
          studentRole: request.auth.token.studentRole === true,
          anonymous:
            request.auth.token.firebase?.sign_in_provider === 'anonymous',
        }
      : null;
    return handleRetryPaperTranscription(
      admin.firestore(),
      caller,
      request.data,
      Date.now()
    );
  }
);
