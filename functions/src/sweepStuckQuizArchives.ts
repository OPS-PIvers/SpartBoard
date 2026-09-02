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
  QUIZ_MEDIA_ARCHIVE_SECRETS,
} from './quizMediaArchive';
import './functionsInit';

type Firestore = admin.firestore.Firestore;

/** Hours, not days — the owner constraint that supersedes the map's 7-day text. */
export const STUCK_ARCHIVE_AGE_MS = 2 * 60 * 60 * 1000;
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
  getTeacherEmail: (teacherUid: string) => Promise<string | null>;
  now: () => number;
}

export interface SweepSummary {
  scanned: number;
  retried: number;
  recovered: number;
  stillStuck: number;
  mailQueued: number;
}

interface ArchiveEntry {
  archiveStatus?: unknown;
  archiveStartedAt?: unknown;
}

/** Stuck = still syncing/failed AND older than the threshold. */
export function isStuckArchiveEntry(
  entry: ArchiveEntry | undefined,
  now: number
): boolean {
  const status = entry?.archiveStatus;
  if (status !== 'syncing' && status !== 'failed') return false;
  const startedAt =
    typeof entry?.archiveStartedAt === 'number' ? entry.archiveStartedAt : 0;
  return now - startedAt >= STUCK_ARCHIVE_AGE_MS;
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

export function buildStragglerEmail(
  items: { quizTitle: string; questionId: string }[]
): { subject: string; text: string } {
  const listed = items.slice(0, MAX_LISTED_STRAGGLERS);
  const overflow = items.length - listed.length;
  const lines = listed.map((i) => `- ${i.quizTitle}: question ${i.questionId}`);
  if (overflow > 0) lines.push(`- ...and ${overflow} more`);
  return {
    subject: `SpartBoard: ${items.length} student recording${
      items.length === 1 ? '' : 's'
    } could not be saved to Drive`,
    text: [
      'SpartBoard could not archive the following student recordings to your Google Drive.',
      'The students still see these questions as not yet submitted, and SpartBoard will keep retrying.',
      'If this persists, reconnect Google Drive from the SpartBoard sidebar.',
      '',
      ...lines,
    ].join('\n'),
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
    mailQueued: 0,
  };

  const stragglersByTeacher = new Map<
    string,
    { quizTitle: string; questionId: string }[]
  >();
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

      for (const [artifactId, entry] of Object.entries(archive)) {
        if (!isStuckArchiveEntry(entry, now)) continue;
        const questionId = findQuestionIdForArtifact(data.answers, artifactId);
        if (!questionId) continue;
        summary.retried++;
        try {
          await deps.archiveOne({
            sessionId,
            responseKey: docSnap.id,
            questionId,
            artifactId,
          });
          summary.recovered++;
        } catch {
          summary.stillStuck++;
          if (!session.teacherUid) continue;
          const list = stragglersByTeacher.get(session.teacherUid) ?? [];
          list.push({ quizTitle: session.quizTitle, questionId });
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
    const summary = await runSweepStuckQuizArchives(db, {
      archiveOne: async (input) => {
        await archiveQuizArtifactCore(
          { ...input, callerUid: null },
          archiveDeps
        );
      },
      getTeacherEmail: async (teacherUid) => {
        try {
          return (await admin.auth().getUser(teacherUid)).email ?? null;
        } catch {
          return null;
        }
      },
      now: () => Date.now(),
    });
    console.log('[sweepStuckQuizArchives]', JSON.stringify(summary));
  }
);
