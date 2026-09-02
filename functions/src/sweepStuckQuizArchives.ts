/**
 * Hourly straggler sweep for quiz media archival.
 *
 * `archiveQuizMediaArtifact` runs on the critical path of every upload, but a
 * transient Drive/ffmpeg failure (or a student closing the tab mid-archive)
 * leaves an artifact parked at `'syncing'`/`'failed'`. Firebase Storage is only
 * a transit buffer, so those cannot sit for days: this sweep retries anything
 * older than `STUCK_ARCHIVE_AGE_MS` (2 hours) and emails the owning teacher
 * once per run about what is still stuck.
 *
 * `artifactArchive` is a map field, and Firestore cannot query into map values,
 * so responses carry a server-maintained `hasStuckArchive` boolean written by
 * the archival core. That keeps this a narrow indexed collection-group query
 * instead of a full scan. Paginated + capped, mirroring
 * `expireActivityWallShares.ts` / `finalizeIdleQuizAttempts.ts`.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import {
  archiveQuizArtifactCore,
  buildDefaultArchiveDeps,
  isLostArchiveError,
  retryStorageCleanup,
  QUIZ_MEDIA_ARCHIVE_SECRETS,
  STUCK_ARCHIVE_AGE_MS,
} from './quizMediaArchive';
import {
  buildDefaultOrgMediaDeps,
  finishStuckMediaDelete,
} from './deleteQuizMediaForOrgAdmin';
import './functionsInit';

type Firestore = admin.firestore.Firestore;

export { STUCK_ARCHIVE_AGE_MS };
/** Runaway guard, not an expected volume. */
export const MAX_RESPONSES_PER_RUN = 2000;
export const RESPONSE_PAGE_SIZE = 200;
/** Bounds one teacher's email body; the rest is summarized as a count. */
export const MAX_LISTED_STRAGGLERS = 25;

export interface StuckArtifact {
  sessionId: string;
  responseKey: string;
  questionId: string;
  artifactId: string;
}

export interface SweepDeps {
  archiveOne: (input: StuckArtifact) => Promise<void>;
  /** Second pass: the Drive copy exists, only the transit object is owed. */
  cleanUpStorage: (input: StuckArtifact) => Promise<void>;
  /** Third pass: a compliance delete still owes Drive or Storage bytes. */
  finishDelete: (input: StuckArtifact) => Promise<void>;
  /** True when the rejection settled the entry at the terminal 'lost'. */
  isPermanentFailure: (error: unknown) => boolean;
  getTeacherEmail: (teacherUid: string) => Promise<string | null>;
  /** Real name where the roster resolves it, else `Pin{pin}` — never a raw uid. */
  resolveStudentLabel: (
    teacherUid: string,
    studentUid: string,
    pin: string
  ) => Promise<string>;
  now: () => number;
}

export interface SweepSummary {
  scanned: number;
  retried: number;
  recovered: number;
  stillStuck: number;
  /** Retries that gave up for good this run; each is mailed exactly once. */
  lost: number;
  cleanedUp: number;
  deletesFinished: number;
  mailQueued: number;
}

interface ArchiveEntry {
  archiveStatus?: unknown;
  attemptCount?: unknown;
  archiveStartedAt?: unknown;
  lastAttemptAt?: unknown;
  storageCleanupPending?: unknown;
  deletedAt?: unknown;
  deleteAttemptedAt?: unknown;
  orphanedDriveFileId?: unknown;
}

/** Statuses a compliance delete owns; the sweep must never re-archive these. */
export function isDeleteOwnedEntry(entry: ArchiveEntry | undefined): boolean {
  const status = entry?.archiveStatus;
  return (
    status === 'deleting' || status === 'deleted' || status === 'delete-failed'
  );
}

/**
 * A delete that never confirmed its bytes. A `'deleting'` claim is retry-
 * eligible once it ages past the same window archives use; a settled tombstone
 * qualifies only while it still carries an orphaned Drive copy or an unswept
 * transit object.
 */
export function needsDeleteCompletion(
  entry: ArchiveEntry | undefined,
  now: number
): boolean {
  if (entry?.archiveStatus === 'deleting') {
    const started =
      typeof entry.deleteAttemptedAt === 'number' ? entry.deleteAttemptedAt : 0;
    const claimed = typeof entry.deletedAt === 'number' ? entry.deletedAt : 0;
    const lastTouched = Math.max(started, claimed);
    return lastTouched === 0 || now - lastTouched >= STUCK_ARCHIVE_AGE_MS;
  }
  if (!isDeleteOwnedEntry(entry)) return false;
  return (
    typeof entry?.orphanedDriveFileId === 'string' ||
    entry?.storageCleanupPending === true
  );
}

/**
 * Stuck = still syncing/failed AND untouched for longer than the threshold.
 * The window measures from the most recent of `archiveStartedAt` /
 * `lastAttemptAt`; an entry carrying neither has no timestamp to age against
 * and is left alone rather than retried on every run. A terminal `'lost'`
 * entry is never stuck — that is what stops the forever-retry loop.
 */
export function isStuckArchiveEntry(
  entry: ArchiveEntry | undefined,
  now: number
): boolean {
  const status = entry?.archiveStatus;
  if (status !== 'syncing' && status !== 'failed') return false;
  const started =
    typeof entry?.archiveStartedAt === 'number' ? entry.archiveStartedAt : null;
  const attempted =
    typeof entry?.lastAttemptAt === 'number' ? entry.lastAttemptAt : null;
  if (started === null && attempted === null) return false;
  const lastTouched = Math.max(started ?? 0, attempted ?? 0);
  return now - lastTouched >= STUCK_ARCHIVE_AGE_MS;
}

/** Locates the answer that owns an artifact so the retry can address it. */
export function findQuestionIdForArtifact(
  answers: unknown,
  artifactId: string
): string | null {
  if (!Array.isArray(answers)) return null;
  for (const answer of answers) {
    const questionId = (answer as { questionId?: unknown })?.questionId;
    const artifacts = (answer as { artifacts?: unknown })?.artifacts;
    if (typeof questionId !== 'string' || !Array.isArray(artifacts)) continue;
    if (artifacts.some((a) => (a as { id?: unknown })?.id === artifactId)) {
      return questionId;
    }
  }
  return null;
}

export interface StragglerItem {
  quizTitle: string;
  questionId: string;
  /** Roster name or `Pin{pin}` — resolved server-side, never a raw uid. */
  studentLabel: string;
  /** Archival gave up: this artifact will never appear in a later email. */
  permanent?: boolean;
}

/** Bounded list for one section of the email body. */
function stragglerLines(items: readonly StragglerItem[]): string[] {
  const listed = items.slice(0, MAX_LISTED_STRAGGLERS);
  const lines = listed.map(
    (i) => `- ${i.quizTitle} — ${i.studentLabel}: question ${i.questionId}`
  );
  const overflow = items.length - listed.length;
  if (overflow > 0) lines.push(`- ...and ${overflow} more`);
  return lines;
}

export function buildStragglerEmail(items: StragglerItem[]): {
  subject: string;
  text: string;
} {
  const retrying = items.filter((i) => !i.permanent);
  const lost = items.filter((i) => i.permanent);
  const body: string[] = [
    'SpartBoard could not archive the following student recordings to your Google Drive.',
  ];
  if (retrying.length > 0) {
    body.push(
      '',
      'Still retrying — the students see these questions as not yet submitted:',
      ...stragglerLines(retrying)
    );
  }
  if (lost.length > 0) {
    body.push(
      '',
      'SpartBoard has stopped retrying these; the recordings could not be saved:',
      ...stragglerLines(lost)
    );
  }
  body.push(
    '',
    'If this persists, reconnect Google Drive from the SpartBoard sidebar.'
  );
  return {
    subject: `SpartBoard: ${items.length} student recording${
      items.length === 1 ? '' : 's'
    } could not be saved to Drive`,
    text: body.join('\n'),
  };
}

export async function runSweepStuckQuizArchives(
  db: Firestore,
  deps: SweepDeps
): Promise<SweepSummary> {
  const now = deps.now();
  const summary: SweepSummary = {
    scanned: 0,
    retried: 0,
    recovered: 0,
    stillStuck: 0,
    lost: 0,
    cleanedUp: 0,
    deletesFinished: 0,
    mailQueued: 0,
  };

  const stragglersByTeacher = new Map<string, StragglerItem[]>();
  const sessionCache = new Map<
    string,
    { teacherUid: string; quizTitle: string }
  >();

  let cursor: admin.firestore.QueryDocumentSnapshot | null = null;
  while (summary.scanned < MAX_RESPONSES_PER_RUN) {
    let query = db
      .collectionGroup('responses')
      .where('hasStuckArchive', '==', true)
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(RESPONSE_PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;
    cursor = page.docs[page.docs.length - 1] ?? null;

    for (const docSnap of page.docs) {
      summary.scanned++;
      const sessionId = docSnap.ref.parent.parent?.id;
      if (!sessionId) continue;
      const data = docSnap.data() ?? {};
      const archive = (data.artifactArchive ?? {}) as Record<
        string,
        ArchiveEntry
      >;

      let session = sessionCache.get(sessionId);
      if (!session) {
        const sessionSnap = await db
          .collection('quiz_sessions')
          .doc(sessionId)
          .get();
        const sessionData = sessionSnap.data() ?? {};
        session = {
          teacherUid:
            typeof sessionData.teacherUid === 'string'
              ? sessionData.teacherUid
              : '',
          quizTitle:
            typeof sessionData.quizTitle === 'string'
              ? sessionData.quizTitle
              : 'Untitled quiz',
        };
        sessionCache.set(sessionId, session);
      }

      const studentUid =
        typeof data.studentUid === 'string' ? data.studentUid : '';
      const pin = typeof data.pin === 'string' ? data.pin : '';

      for (const [artifactId, entry] of Object.entries(archive)) {
        const target = { sessionId, responseKey: docSnap.id, artifactId };
        // A compliance delete owns this artifact; never re-archive it.
        if (isDeleteOwnedEntry(entry)) {
          if (!needsDeleteCompletion(entry, now)) continue;
          const questionId = findQuestionIdForArtifact(
            data.answers,
            artifactId
          );
          if (!questionId) continue;
          try {
            await deps.finishDelete({ ...target, questionId });
            summary.deletesFinished++;
          } catch {
            summary.stillStuck++;
          }
          continue;
        }
        // Second pass: archived to Drive, only the transit object is owed.
        if (entry?.storageCleanupPending === true) {
          const questionId = findQuestionIdForArtifact(
            data.answers,
            artifactId
          );
          if (!questionId) continue;
          try {
            await deps.cleanUpStorage({ ...target, questionId });
            summary.cleanedUp++;
          } catch {
            summary.stillStuck++;
          }
          continue;
        }
        if (!isStuckArchiveEntry(entry, now)) continue;
        const questionId = findQuestionIdForArtifact(data.answers, artifactId);
        if (!questionId) continue;
        summary.retried++;
        try {
          await deps.archiveOne({ ...target, questionId });
          summary.recovered++;
        } catch (error) {
          // A terminal failure is mailed on this run and never swept again.
          const permanent = deps.isPermanentFailure(error);
          if (permanent) summary.lost++;
          else summary.stillStuck++;
          if (!session.teacherUid) continue;
          const studentLabel = await deps.resolveStudentLabel(
            session.teacherUid,
            studentUid,
            pin
          );
          const list = stragglersByTeacher.get(session.teacherUid) ?? [];
          list.push({
            quizTitle: session.quizTitle,
            questionId,
            studentLabel,
            ...(permanent ? { permanent: true } : {}),
          });
          stragglersByTeacher.set(session.teacherUid, list);
        }
      }
    }

    if (page.size < RESPONSE_PAGE_SIZE) break;
  }

  // One /mail doc per affected teacher per run, never one per artifact.
  const runStamp = new Date(now).toISOString().slice(0, 13);
  for (const [teacherUid, items] of stragglersByTeacher) {
    const email = await deps.getTeacherEmail(teacherUid);
    if (!email) continue;
    await db
      .collection('mail')
      .doc(`quiz-archive-stuck-${teacherUid}-${runStamp}`)
      .set({ to: [email], message: buildStragglerEmail(items) });
    summary.mailQueued++;
  }

  return summary;
}

export const sweepStuckQuizArchives = onSchedule(
  {
    schedule: 'every 60 minutes',
    timeZone: 'America/Chicago',
    memory: '1GiB',
    timeoutSeconds: 540,
    secrets: QUIZ_MEDIA_ARCHIVE_SECRETS,
  },
  async () => {
    const db = admin.firestore();
    const archiveDeps = buildDefaultArchiveDeps();
    const orgMediaDeps = buildDefaultOrgMediaDeps();
    const summary = await runSweepStuckQuizArchives(db, {
      archiveOne: async (input) => {
        await archiveQuizArtifactCore(
          { ...input, callerUid: null },
          archiveDeps
        );
      },
      cleanUpStorage: (input) => retryStorageCleanup(input, archiveDeps),
      isPermanentFailure: isLostArchiveError,
      finishDelete: (input) => finishStuckMediaDelete(input, orgMediaDeps),
      getTeacherEmail: async (teacherUid) => {
        try {
          return (await admin.auth().getUser(teacherUid)).email ?? null;
        } catch {
          return null;
        }
      },
      resolveStudentLabel: async (teacherUid, studentUid, pin) => {
        const name = studentUid
          ? await archiveDeps
              .resolveStudentName(teacherUid, studentUid)
              .catch(() => null)
          : null;
        const full = name ? `${name.givenName} ${name.familyName}`.trim() : '';
        if (full) return full;
        return pin ? `Pin${pin}` : 'Unidentified student';
      },
      now: () => Date.now(),
    });
    console.log('[sweepStuckQuizArchives]', JSON.stringify(summary));
  }
);
