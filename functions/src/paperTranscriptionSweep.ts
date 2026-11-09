// Handwritten paper answers: re-queues stuck, failed and over-quota jobs, and clears held crops and kept pages (plan D27, D31, §3.5; K13).
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from './firebaseAdmin';
import type { Firestore } from 'firebase-admin/firestore';
import './functionsInit';
import {
  archiveQuizArtifactCore,
  buildDefaultArchiveDeps,
  retryStorageCleanup,
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
  PAPER_PAGE_PREFIX,
  PAPER_PAGE_SCANS,
  PAPER_PRIVATE_SUBCOLLECTION,
  PAPER_TRANSCRIPTION_JOBS,
  PAPER_WRITTEN_CROP_PREFIX,
  paperPageArtifactId,
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
/** Runaway guard on one pass, not an expected volume. */
export const MAX_JOBS_PER_PASS = 5000;

/** Crops and kept pages of a scan nothing imported are removed after this. */
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
  const base = db
    .collectionGroup(PAPER_TRANSCRIPTION_JOBS)
    .where('status', '==', status)
    .where(field, '<', before);
  const bounded = after === undefined ? base : base.where(field, '>', after);
  const docs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  // Skipped jobs never leave the window, so walk past them rather than re-reading the same first page.
  while (docs.length < MAX_JOBS_PER_PASS) {
    const ordered = bounded.orderBy(field).limit(JOB_QUERY_LIMIT);
    const page = (
      await (
        docs.length ? ordered.startAfter(docs[docs.length - 1]) : ordered
      ).get()
    ).docs;
    docs.push(...page);
    if (page.length < JOB_QUERY_LIMIT) break;
  }
  return docs;
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

// ── Crop and kept-page pass ───────────────────────────────────────────────

export interface ListedCrop {
  path: string;
  createdMs: number;
}

type ListObjects = (
  pageToken?: string
) => Promise<{ crops: ListedCrop[]; nextPageToken?: string }>;

export interface CropSweepDeps {
  db: Firestore;
  now: () => number;
  listCrops: ListObjects;
  /** Kept scan pages under `paper_pages/` (K13); absent skips the page pass. */
  listPages?: ListObjects;
  /** Deletes one crop or kept page object. */
  deleteCrop: (path: string) => Promise<void>;
  archive: (input: ArchiveArtifactRequest) => Promise<ArchiveResult>;
  /** Deletes the Storage copy an archived kept page still owes. */
  cleanUpStorage?: (input: ArchiveArtifactRequest) => Promise<void>;
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
  pagesListed: number;
  pagesUnimportedDeleted: number;
  pagesStaleDeleted: number;
  pagesArchived: number;
  pagesCleanedUp: number;
  pagesExpired: number;
  pagesWarned: number;
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

export interface ParsedPagePath {
  uid: string;
  scanId: string;
  seat: number;
  page: number;
}

/** `paper_pages/{uid}/{scanId}/{seat}/{page}.webp`, the only name the import records. */
export function parsePagePath(path: string): ParsedPagePath | null {
  const parts = path.split('/');
  if (parts.length !== 5 || parts[0] !== PAPER_PAGE_PREFIX) return null;
  const [, uid, scanId, seatText, file] = parts;
  const page = /^([1-9]\d?)\.webp$/.exec(file);
  if (!uid || !scanId || !page || !/^[1-9]\d*$/.test(seatText)) return null;
  return { uid, scanId, seat: Number(seatText), page: Number(page[1]) };
}

interface ExpiringItem {
  quizTitle: string;
  removeOn: number;
  /** Absent means a handwriting crop. */
  kind?: 'page';
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

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
  const pages = items.filter((i) => i.kind === 'page').length;
  const crops = n - pages;
  const subjectNoun =
    pages === 0
      ? plural(n, 'handwritten answer')
      : crops === 0
        ? plural(n, 'scanned page')
        : plural(n, 'scanned image');
  const held =
    pages === 0
      ? `${plural(n, 'handwritten answer image')} from scanned quizzes`
      : crops === 0
        ? `${plural(n, 'scanned page')} of students' paper quizzes`
        : `${plural(crops, 'handwritten answer image')} and ${plural(pages, 'scanned page')} from paper quizzes`;
  const keptNote =
    pages === 0
      ? 'Typed transcripts and grades are kept.'
      : crops === 0
        ? 'Scores and grades are kept.'
        : 'Scores, typed transcripts and grades are kept.';
  return {
    subject: `SpartBoard: ${subjectNoun} will be removed on ${date}`,
    text: [
      `SpartBoard is holding ${held} because Google Drive is not connected. ${
        n === 1 ? 'It' : 'They'
      } will be removed starting ${date}. ${keptNote}`,
      '',
      ...listed,
      '',
      'To keep the images, connect Google Drive in SpartBoard before then.',
    ].join('\n'),
  };
}

interface ScanTargets {
  bySeat: Map<number, { sessionId: string; responseKey: string }>;
}

type ArchiveMapData = Record<string, Record<string, unknown>>;

const archiveEntryOf = (
  data: Record<string, unknown> | undefined,
  artifactId: string
): Record<string, unknown> | undefined =>
  ((data?.artifactArchive ?? {}) as ArchiveMapData)[artifactId];

const isDeleteOwned = (status: unknown): boolean =>
  status === 'deleting' || status === 'deleted' || status === 'delete-failed';

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
    pagesListed: 0,
    pagesUnimportedDeleted: 0,
    pagesStaleDeleted: 0,
    pagesArchived: 0,
    pagesCleanedUp: 0,
    pagesExpired: 0,
    pagesWarned: 0,
  };

  const scanJobs = new Map<string, ScanTargets>();
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
  const pageScans = new Map<string, ScanTargets>();
  const loadPageScan = async (uid: string, scanId: string) => {
    const key = `${uid}/${scanId}`;
    let found = pageScans.get(key);
    if (found) return found;
    const seats: unknown = (
      await db
        .collection('users')
        .doc(uid)
        .collection(PAPER_PAGE_SCANS)
        .doc(scanId)
        .get()
    ).data()?.seats;
    found = { bySeat: new Map() };
    for (const [seat, target] of Object.entries(
      typeof seats === 'object' && seats !== null ? seats : {}
    )) {
      const t = target as { sessionId?: unknown; responseKey?: unknown };
      if (typeof t?.sessionId !== 'string' || typeof t.responseKey !== 'string')
        continue;
      found.bySeat.set(Number(seat), {
        sessionId: t.sessionId,
        responseKey: t.responseKey,
      });
    }
    pageScans.set(key, found);
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
  // A teacher still without Drive gets one archive attempt per run, not one per object.
  const noDrive = new Set<string>();
  // Crops and pages share one list per teacher, so one run sends one email.
  const expiring = new Map<string, ExpiringItem[]>();

  /** Archives a held object when Drive is back, expires it at 60 days and warns once from day 53. */
  async function holdForDrive(
    path: string,
    uid: string,
    request: ArchiveArtifactRequest,
    entry: Record<string, unknown>,
    kind: ExpiringItem['kind']
  ): Promise<'expired' | 'archived' | 'warned' | 'held'> {
    const { artifactId } = request;
    const responseRef = db
      .collection('quiz_sessions')
      .doc(request.sessionId)
      .collection('responses')
      .doc(request.responseKey);
    const since =
      typeof entry.awaitingDriveSince === 'number'
        ? entry.awaitingDriveSince
        : now;

    if (now - since >= AWAITING_DRIVE_HOLD_MS) {
      const expired = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(responseRef);
        const current = archiveEntryOf(fresh.data(), artifactId);
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
      if (!expired) return 'held';
      await deps.deleteCrop(path);
      return 'expired';
    }

    if (!noDrive.has(uid)) {
      const result = await deps.archive(request);
      if (result.archiveStatus === 'archived') return 'archived';
      if (result.archiveStatus !== 'awaiting-drive') return 'held';
      noDrive.add(uid);
    }

    if (
      now - since < AWAITING_DRIVE_WARN_MS ||
      typeof entry.expiryWarnedAt === 'number'
    ) {
      return 'held';
    }
    await responseRef.set(
      { artifactArchive: { [artifactId]: { expiryWarnedAt: now } } },
      { merge: true }
    );
    const list = expiring.get(uid) ?? [];
    list.push({
      quizTitle: await quizTitle(request.sessionId),
      removeOn: since + AWAITING_DRIVE_HOLD_MS,
      ...(kind ? { kind } : {}),
    });
    expiring.set(uid, list);
    return 'warned';
  }

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
      { scanId?: unknown } | undefined;
    const referenced =
      answer?.paperScanId === c.scanId || newerScan?.scanId === c.scanId;
    if (!referenced) {
      await deps.deleteCrop(path);
      summary.staleDeleted++;
      return;
    }
    const artifactId = findCropArtifactId(answers, c.questionId, path);
    if (!artifactId) return;
    const entry = archiveEntryOf(data, artifactId);
    if (entry?.archiveStatus !== 'awaiting-drive') return;
    const outcome = await holdForDrive(
      path,
      c.uid,
      {
        sessionId: target.sessionId,
        responseKey: target.responseKey,
        questionId: c.questionId,
        artifactId,
      },
      entry,
      undefined
    );
    if (outcome !== 'held') summary[outcome]++;
  }

  // Unimported and unreferenced pages wait out the same 7 days as crops; a referenced one archives on any run.
  async function sweepOnePage(
    path: string,
    p: ParsedPagePath | null,
    createdMs: number
  ): Promise<void> {
    const settled = now - createdMs >= UNIMPORTED_CROP_MS;
    const target = p
      ? (await loadPageScan(p.uid, p.scanId)).bySeat.get(p.seat)
      : undefined;
    if (!p || !target) {
      if (!settled) return;
      await deps.deleteCrop(path);
      summary.pagesUnimportedDeleted++;
      return;
    }
    const artifactId = paperPageArtifactId(p.scanId, p.page);
    const data = (
      await db
        .collection('quiz_sessions')
        .doc(target.sessionId)
        .collection('responses')
        .doc(target.responseKey)
        .get()
    ).data();
    const pages = Array.isArray(data?.paperPages)
      ? (data.paperPages as Array<Record<string, unknown>>)
      : [];
    // K12: only the live scan's page stays referenced; a rescan leaves the older one to this rule.
    const referenced = pages.some(
      (a) =>
        a?.id === artifactId &&
        a.kind === 'paper-page' &&
        a.storagePath === path
    );
    if (!referenced) {
      if (!settled) return;
      await deps.deleteCrop(path);
      summary.pagesStaleDeleted++;
      return;
    }
    const request: ArchiveArtifactRequest = {
      sessionId: target.sessionId,
      responseKey: target.responseKey,
      questionId: '',
      artifactId,
    };
    const entry = archiveEntryOf(data, artifactId);
    const status = entry?.archiveStatus;
    if (isDeleteOwned(status) || status === 'lost') return;
    if (typeof entry?.driveFileId === 'string') {
      // Archived, yet the transit copy survived: only its delete is owed.
      if (!deps.cleanUpStorage) return;
      await deps.cleanUpStorage(request);
      summary.pagesCleanedUp++;
      return;
    }
    if (status === 'awaiting-drive' && entry) {
      const outcome = await holdForDrive(path, p.uid, request, entry, 'page');
      if (outcome === 'expired') summary.pagesExpired++;
      if (outcome === 'archived') summary.pagesArchived++;
      if (outcome === 'warned') summary.pagesWarned++;
      return;
    }
    // Never archived, or a failed or abandoned attempt: the hourly archive sweep only reaches answer artifacts.
    if (noDrive.has(p.uid)) return;
    const result = await deps.archive(request);
    if (result.archiveStatus === 'archived') summary.pagesArchived++;
    if (result.archiveStatus === 'awaiting-drive') noDrive.add(p.uid);
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

  const listPages = deps.listPages;
  if (listPages) {
    let token: string | undefined;
    do {
      const page = await listPages(token);
      token = page.nextPageToken;
      for (const object of page.crops) {
        if (summary.pagesListed >= MAX_CROPS_PER_RUN) break;
        summary.pagesListed++;
        try {
          await sweepOnePage(
            object.path,
            parsePagePath(object.path),
            object.createdMs
          );
        } catch (error) {
          console.error('[paperTranscriptionSweep] page', object.path, error);
        }
      }
    } while (token && summary.pagesListed < MAX_CROPS_PER_RUN);
  }

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
    const listUnder = (prefix: string) => async (pageToken?: string) => {
      const [files, next] = await bucket.getFiles({
        prefix: `${prefix}/`,
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
    };
    const summary = await runPaperCropSweep({
      db: admin.firestore(),
      now: () => Date.now(),
      listCrops: listUnder(PAPER_WRITTEN_CROP_PREFIX),
      listPages: listUnder(PAPER_PAGE_PREFIX),
      deleteCrop: async (path) => {
        await bucket.file(path).delete({ ignoreNotFound: true });
      },
      archive: (input) =>
        archiveQuizArtifactCore({ ...input, callerUid: null }, archiveDeps),
      cleanUpStorage: (input) => retryStorageCleanup(input, archiveDeps),
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
