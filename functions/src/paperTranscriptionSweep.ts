// Handwritten paper answers: re-queues stuck, failed and over-quota jobs, and clears held crops (plan D27, D31, §3.5).
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import type { Firestore } from 'firebase-admin/firestore';
import './functionsInit';
import {
  archiveQuizArtifactCore,
  buildDefaultArchiveDeps,
  QUIZ_MEDIA_ARCHIVE_SECRETS,
  type ArchiveArtifactRequest,
  type ArchiveResult,
} from './quizMediaArchive';
import { readPaperHandwritingQuota } from './paperHandwritingQuota';
import {
  MAX_JOB_ATTEMPTS,
  findCropArtifactId,
  isVerifiedAdmin,
  parseJob,
  requeuePaperJob,
  seatFromJobId,
  type RequeueOutcome,
} from './paperTranscriptionWorker';
import {
  PAPER_PRIVATE_SUBCOLLECTION,
  PAPER_TRANSCRIPTION_JOBS,
  PAPER_WRITTEN_CROP_PREFIX,
  type PaperTranscriptionJobStatus,
} from './paperWrittenTypes';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/** A queued job whose trigger never ran. */
export const QUEUED_STUCK_MS = 30 * MINUTE;
/** Failed jobs are retried after this pause, up to `MAX_AUTO_ATTEMPTS`. */
export const FAILED_RETRY_DELAY_MS = 30 * MINUTE;
/** Failures older than this are left for the teacher's "Transcribe now". */
export const FAILED_RETRY_WINDOW_MS = DAY;
export const MAX_AUTO_ATTEMPTS = 3;
/** Over-quota jobs are retried once a new quota day starts, for about a week. */
export const OVER_QUOTA_RETRY_WINDOW_MS = 8 * DAY;
export const JOB_QUERY_LIMIT = 200;

/** Crops of a scan nothing imported are removed after this. */
export const UNIMPORTED_CROP_MS = 7 * DAY;
/** Crops held for a teacher without Drive are removed after this (D27). */
export const AWAITING_DRIVE_HOLD_MS = 60 * DAY;
/** The teacher is warned this long before a held crop is removed. */
export const AWAITING_DRIVE_WARN_MS = AWAITING_DRIVE_HOLD_MS - 7 * DAY;
export const CROP_LIST_PAGE = 1000;
/** Runaway guard, not an expected volume. */
export const MAX_CROPS_PER_RUN = 10000;
export const MAX_LISTED_QUIZZES = 10;

// ── Job pass ──────────────────────────────────────────────────────────────

export interface JobSweepDeps {
  db: Firestore;
  now: () => number;
  isAdmin: (uid: string) => Promise<boolean>;
}

export interface JobSweepSummary {
  stuckRunning: number;
  stuckQueued: number;
  failed: number;
  overQuota: number;
  requeued: number;
  superseded: number;
  skipped: number;
}

function startOfUtcDay(nowMs: number): number {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** `users/{uid}/paper_transcription_jobs/{jobId}` → uid. */
function jobOwner(ref: admin.firestore.DocumentReference): string | null {
  return ref.parent.parent?.id ?? null;
}

async function jobsWhere(
  db: Firestore,
  status: PaperTranscriptionJobStatus,
  field: 'leaseUntil' | 'createdAt' | 'updatedAt',
  before: number,
  after?: number
) {
  let q = db
    .collectionGroup(PAPER_TRANSCRIPTION_JOBS)
    .where('status', '==', status)
    .where(field, '<', before);
  if (after !== undefined) q = q.where(field, '>', after);
  return (await q.limit(JOB_QUERY_LIMIT).get()).docs;
}

export async function runPaperJobSweep(
  deps: JobSweepDeps
): Promise<JobSweepSummary> {
  const { db } = deps;
  const now = deps.now();
  const summary: JobSweepSummary = {
    stuckRunning: 0,
    stuckQueued: 0,
    failed: 0,
    overQuota: 0,
    requeued: 0,
    superseded: 0,
    skipped: 0,
  };
  const tally = (outcome: RequeueOutcome) => {
    summary[outcome]++;
  };

  for (const doc of await jobsWhere(db, 'running', 'leaseUntil', now)) {
    const uid = jobOwner(doc.ref);
    if (!uid) continue;
    summary.stuckRunning++;
    tally(
      await requeuePaperJob(db, uid, doc.id, {
        now,
        maxAttempt: MAX_JOB_ATTEMPTS,
        allowStatuses: ['running'],
      })
    );
  }

  for (const doc of await jobsWhere(
    db,
    'queued',
    'createdAt',
    now - QUEUED_STUCK_MS
  )) {
    const uid = jobOwner(doc.ref);
    if (!uid) continue;
    summary.stuckQueued++;
    tally(
      await requeuePaperJob(db, uid, doc.id, {
        now,
        maxAttempt: MAX_JOB_ATTEMPTS,
        allowStatuses: ['queued'],
      })
    );
  }

  for (const doc of await jobsWhere(
    db,
    'failed',
    'updatedAt',
    now - FAILED_RETRY_DELAY_MS,
    now - FAILED_RETRY_WINDOW_MS
  )) {
    const uid = jobOwner(doc.ref);
    if (!uid) continue;
    summary.failed++;
    tally(
      await requeuePaperJob(db, uid, doc.id, {
        now,
        maxAttempt: MAX_AUTO_ATTEMPTS,
        allowStatuses: ['failed'],
      })
    );
  }

  // Re-queued only when the owner has pages left today, so a spent quota costs one read per teacher.
  const hasPagesLeft = new Map<string, boolean>();
  for (const doc of await jobsWhere(
    db,
    'over-quota',
    'updatedAt',
    startOfUtcDay(now),
    now - OVER_QUOTA_RETRY_WINDOW_MS
  )) {
    const uid = jobOwner(doc.ref);
    if (!uid) continue;
    summary.overQuota++;
    let left = hasPagesLeft.get(uid);
    if (left === undefined) {
      const quota = await readPaperHandwritingQuota(db, {
        uid,
        isAdmin: await deps.isAdmin(uid),
        nowMs: now,
      });
      left = !quota.geminiDisabled && quota.remaining >= 1;
      hasPagesLeft.set(uid, left);
    }
    if (!left) {
      summary.skipped++;
      continue;
    }
    tally(
      await requeuePaperJob(db, uid, doc.id, {
        now,
        maxAttempt: MAX_JOB_ATTEMPTS,
        allowStatuses: ['over-quota'],
      })
    );
  }

  return summary;
}

// ── Crop pass ─────────────────────────────────────────────────────────────

export interface ListedCrop {
  path: string;
  createdMs: number;
}

export interface CropSweepDeps {
  db: Firestore;
  now: () => number;
  listCrops: (
    pageToken?: string
  ) => Promise<{ crops: ListedCrop[]; nextPageToken?: string }>;
  deleteCrop: (path: string) => Promise<void>;
  archive: (input: ArchiveArtifactRequest) => Promise<ArchiveResult>;
  getTeacherEmail: (uid: string) => Promise<string | null>;
}

export interface CropSweepSummary {
  listed: number;
  unimportedDeleted: number;
  staleDeleted: number;
  archived: number;
  expired: number;
  warned: number;
  mailQueued: number;
}

export interface ParsedCropPath {
  uid: string;
  scanId: string;
  seat: number;
  questionId: string;
}

export function parseCropPath(path: string): ParsedCropPath | null {
  const parts = path.split('/');
  if (parts.length !== 5 || parts[0] !== PAPER_WRITTEN_CROP_PREFIX) return null;
  const [, uid, scanId, seatText, file] = parts;
  const seat = Number(seatText);
  const dot = file.lastIndexOf('.');
  const questionId = dot > 0 ? file.slice(0, dot) : '';
  if (!uid || !scanId || !questionId || !Number.isInteger(seat) || seat < 0)
    return null;
  return { uid, scanId, seat, questionId };
}

interface ExpiringItem {
  quizTitle: string;
  removeOn: number;
}

export function buildExpiryWarningEmail(items: readonly ExpiringItem[]): {
  subject: string;
  text: string;
} {
  const first = Math.min(...items.map((i) => i.removeOn));
  const date = new Date(first).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Chicago',
  });
  const titles = Array.from(new Set(items.map((i) => i.quizTitle)));
  const listed = titles.slice(0, MAX_LISTED_QUIZZES).map((t) => `- ${t}`);
  if (titles.length > listed.length) {
    listed.push(`- ...and ${titles.length - listed.length} more`);
  }
  const n = items.length;
  return {
    subject: `SpartBoard: ${n} handwritten answer${n === 1 ? '' : 's'} will be removed on ${date}`,
    text: [
      `SpartBoard is holding ${n} handwritten answer image${
        n === 1 ? '' : 's'
      } from scanned quizzes because Google Drive is not connected. ${
        n === 1 ? 'It' : 'They'
      } will be removed starting ${date}. Typed transcripts and grades are kept.`,
      '',
      ...listed,
      '',
      'To keep the images, connect Google Drive in SpartBoard before then.',
    ].join('\n'),
  };
}

interface ScanJobs {
  bySeat: Map<number, { sessionId: string; responseKey: string }>;
}

export async function runPaperCropSweep(
  deps: CropSweepDeps
): Promise<CropSweepSummary> {
  const { db } = deps;
  const now = deps.now();
  const summary: CropSweepSummary = {
    listed: 0,
    unimportedDeleted: 0,
    staleDeleted: 0,
    archived: 0,
    expired: 0,
    warned: 0,
    mailQueued: 0,
  };

  const scanJobs = new Map<string, ScanJobs>();
  const loadScanJobs = async (uid: string, scanId: string) => {
    const key = `${uid}/${scanId}`;
    let found = scanJobs.get(key);
    if (found) return found;
    const snap = await db
      .collection('users')
      .doc(uid)
      .collection(PAPER_TRANSCRIPTION_JOBS)
      .where('scanId', '==', scanId)
      .get();
    found = { bySeat: new Map() };
    for (const doc of snap.docs) {
      const job = parseJob(doc.data());
      const seat = job ? seatFromJobId(doc.id, scanId) : null;
      if (!job || seat === null) continue;
      found.bySeat.set(seat, {
        sessionId: job.sessionId,
        responseKey: job.responseKey,
      });
    }
    scanJobs.set(key, found);
    return found;
  };
  const newerScanQuestions = new Map<string, Set<string>>();
  const loadNewerScanQuestions = async (scanId: string) => {
    let found = newerScanQuestions.get(scanId);
    if (found) return found;
    const snap = await db
      .collectionGroup(PAPER_PRIVATE_SUBCOLLECTION)
      .where('newerScan.scanId', '==', scanId)
      .get();
    found = new Set(snap.docs.map((d) => d.id));
    newerScanQuestions.set(scanId, found);
    return found;
  };
  const titles = new Map<string, string>();
  const quizTitle = async (sessionId: string) => {
    let title = titles.get(sessionId);
    if (title === undefined) {
      const data = (
        await db.collection('quiz_sessions').doc(sessionId).get()
      ).data();
      title =
        typeof data?.quizTitle === 'string' && data.quizTitle.trim()
          ? data.quizTitle.trim()
          : 'Untitled quiz';
      titles.set(sessionId, title);
    }
    return title;
  };
  // A teacher still without Drive gets one archive attempt per run, not one per crop.
  const noDrive = new Set<string>();
  const expiring = new Map<string, ExpiringItem[]>();

  async function sweepOneCrop(path: string, c: ParsedCropPath): Promise<void> {
    const jobs = await loadScanJobs(c.uid, c.scanId);
    const target = jobs.bySeat.get(c.seat);
    if (!target) {
      // No job for this seat: only a kept answer's newer-scan crop is still wanted.
      const kept = await loadNewerScanQuestions(c.scanId);
      if (kept.has(c.questionId)) return;
      await deps.deleteCrop(path);
      summary.unimportedDeleted++;
      return;
    }
    const responseRef = db
      .collection('quiz_sessions')
      .doc(target.sessionId)
      .collection('responses')
      .doc(target.responseKey);
    const [response, privateDoc] = await Promise.all([
      responseRef.get(),
      responseRef
        .collection(PAPER_PRIVATE_SUBCOLLECTION)
        .doc(c.questionId)
        .get(),
    ]);
    const data = response.data();
    const answers = Array.isArray(data?.answers)
      ? (data.answers as Array<Record<string, unknown>>)
      : [];
    const answer = answers.find((a) => a?.questionId === c.questionId);
    const newerScan = privateDoc.data()?.newerScan as
      | { scanId?: unknown }
      | undefined;
    const referenced =
      answer?.paperScanId === c.scanId || newerScan?.scanId === c.scanId;
    if (!referenced) {
      await deps.deleteCrop(path);
      summary.staleDeleted++;
      return;
    }
    const artifactId = findCropArtifactId(answers, c.questionId, path);
    if (!artifactId) return;
    const entry = (
      (data?.artifactArchive ?? {}) as Record<string, Record<string, unknown>>
    )[artifactId];
    if (entry?.archiveStatus !== 'awaiting-drive') return;
    const since =
      typeof entry.awaitingDriveSince === 'number'
        ? entry.awaitingDriveSince
        : now;

    if (now - since >= AWAITING_DRIVE_HOLD_MS) {
      const expired = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(responseRef);
        const current = (
          (fresh.data()?.artifactArchive ?? {}) as Record<
            string,
            Record<string, unknown>
          >
        )[artifactId];
        if (current?.archiveStatus !== 'awaiting-drive') return false;
        tx.set(
          responseRef,
          {
            artifactArchive: {
              [artifactId]: {
                archiveStatus: 'lost',
                archiveError:
                  'Removed after 60 days without Google Drive connected.',
                lastAttemptAt: now,
              },
            },
          },
          { merge: true }
        );
        return true;
      });
      if (expired) {
        await deps.deleteCrop(path);
        summary.expired++;
      }
      return;
    }

    if (!noDrive.has(c.uid)) {
      const result = await deps.archive({
        sessionId: target.sessionId,
        responseKey: target.responseKey,
        questionId: c.questionId,
        artifactId,
      });
      if (result.archiveStatus === 'archived') {
        summary.archived++;
        return;
      }
      if (result.archiveStatus !== 'awaiting-drive') return;
      noDrive.add(c.uid);
    }

    if (
      now - since >= AWAITING_DRIVE_WARN_MS &&
      typeof entry.expiryWarnedAt !== 'number'
    ) {
      await responseRef.set(
        { artifactArchive: { [artifactId]: { expiryWarnedAt: now } } },
        { merge: true }
      );
      const list = expiring.get(c.uid) ?? [];
      list.push({
        quizTitle: await quizTitle(target.sessionId),
        removeOn: since + AWAITING_DRIVE_HOLD_MS,
      });
      expiring.set(c.uid, list);
      summary.warned++;
    }
  }

  let pageToken: string | undefined;
  do {
    const page = await deps.listCrops(pageToken);
    pageToken = page.nextPageToken;
    for (const crop of page.crops) {
      if (summary.listed >= MAX_CROPS_PER_RUN) break;
      summary.listed++;
      if (now - crop.createdMs < UNIMPORTED_CROP_MS) continue;
      const parsed = parseCropPath(crop.path);
      if (!parsed) continue;
      try {
        await sweepOneCrop(crop.path, parsed);
      } catch (error) {
        console.error('[paperTranscriptionSweep] crop', crop.path, error);
      }
    }
  } while (pageToken && summary.listed < MAX_CROPS_PER_RUN);

  const day = new Date(now).toISOString().slice(0, 10);
  for (const [uid, items] of expiring) {
    const email = await deps.getTeacherEmail(uid);
    if (!email) continue;
    await db
      .collection('mail')
      .doc(`paper-crops-expiring-${uid}-${day}`)
      .set({ to: [email], message: buildExpiryWarningEmail(items) });
    summary.mailQueued++;
  }

  return summary;
}

// ── Deploy targets ────────────────────────────────────────────────────────

export const sweepPaperTranscriptionJobs = onSchedule(
  {
    schedule: 'every 30 minutes',
    timeZone: 'America/Chicago',
    memory: '256MiB',
    maxInstances: 1,
    timeoutSeconds: 300,
  },
  async () => {
    const summary = await runPaperJobSweep({
      db: admin.firestore(),
      now: () => Date.now(),
      isAdmin: isVerifiedAdmin,
    });
    console.log('[sweepPaperTranscriptionJobs]', JSON.stringify(summary));
  }
);

export const sweepPaperWrittenCrops = onSchedule(
  {
    // Daily at 02:15 America/Chicago, outside classroom hours.
    schedule: '15 2 * * *',
    timeZone: 'America/Chicago',
    memory: '512MiB',
    maxInstances: 1,
    timeoutSeconds: 540,
    secrets: QUIZ_MEDIA_ARCHIVE_SECRETS,
  },
  async () => {
    const bucket = admin.storage().bucket();
    const archiveDeps = buildDefaultArchiveDeps();
    const summary = await runPaperCropSweep({
      db: admin.firestore(),
      now: () => Date.now(),
      listCrops: async (pageToken) => {
        const [files, next] = await bucket.getFiles({
          prefix: `${PAPER_WRITTEN_CROP_PREFIX}/`,
          maxResults: CROP_LIST_PAGE,
          autoPaginate: false,
          ...(pageToken ? { pageToken } : {}),
        });
        return {
          crops: files.map((f) => ({
            path: f.name,
            createdMs: Date.parse(String(f.metadata.timeCreated ?? '')) || 0,
          })),
          nextPageToken: (next as { pageToken?: string } | null)?.pageToken,
        };
      },
      deleteCrop: async (path) => {
        await bucket.file(path).delete({ ignoreNotFound: true });
      },
      archive: (input) =>
        archiveQuizArtifactCore({ ...input, callerUid: null }, archiveDeps),
      getTeacherEmail: async (uid) => {
        try {
          return (await admin.auth().getUser(uid)).email ?? null;
        } catch {
          return null;
        }
      },
    });
    console.log('[sweepPaperWrittenCrops]', JSON.stringify(summary));
  }
);
