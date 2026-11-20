// D21 / ADR 0010: each 1 August, delete the edit log of every Writing piece with no writing since 1 July.
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import {
  FieldPath,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
import * as admin from './firebaseAdmin';
import './functionsInit';
import {
  WRITING_LOG,
  WRITING_RESPONSES,
  WRITING_SESSIONS,
} from './writingResponses';
import { safeErr } from './safeLog';

type Data = Record<string, unknown>;

const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** 1 July, midnight Central, of the year the purge runs in. */
export function purgeCutoff(now: number): number {
  const year = new Date(now).getUTCFullYear();
  return Date.UTC(year, 6, 1, 5);
}

/** The ADR keeps each paste and untyped addition with its text; every other edit goes. */
export function compactPurgedLog(log: string): string {
  return log
    .split(';')
    .filter((t) => t[0] === 'P' || t[0] === 'S')
    .join(';');
}

export interface PurgeChunk {
  id: string;
  log: unknown;
}

export interface PurgePlan {
  rewrite: { id: string; log: string }[];
  remove: string[];
  patch: Data;
}

/** What one response's purge writes, or null when it keeps its log this year. `lastWriteAt` is server time. */
export function planLogPurge(
  response: Data,
  chunks: readonly PurgeChunk[],
  lastWriteAt: number,
  cutoff: number,
  now: number
): PurgePlan | null {
  if (isNum(response.logPurgedAt) || chunks.length === 0) return null;
  // A piece written since 1 July keeps its log until the next 1 August.
  if (lastWriteAt >= cutoff) return null;
  const summary = (
    typeof response.summary === 'object' && response.summary !== null
      ? response.summary
      : {}
  ) as Data;
  const plan: PurgePlan = {
    rewrite: [],
    remove: [],
    patch: {
      logPurgedAt: now,
      ...(isNum(summary.logStoppedAt) ? {} : { 'summary.logStoppedAt': now }),
    },
  };
  for (const c of chunks) {
    const kept = typeof c.log === 'string' ? compactPurgedLog(c.log) : '';
    if (kept === '') plan.remove.push(c.id);
    else plan.rewrite.push({ id: c.id, log: kept });
  }
  return plan;
}

const SESSION_PAGE = 100;
/** Responses purged at once; each is one batch of at most eleven writes. */
const PARALLEL = 20;

const ms = (t: { toMillis: () => number } | undefined): number =>
  t ? t.toMillis() : 0;

const CHUNK_IDS = Array.from({ length: 10 }, (_, i) => String(i));

/** Deletes log docs a save could never have made (ids other than 0 to 9), reading ids only. */
export async function deleteStrayChunks(ref: DocumentReference): Promise<void> {
  // Capped per pass; the next run clears any left over.
  const ids = await ref.collection(WRITING_LOG).select().limit(1000).get();
  const stray = ids.docs.filter((d) => !CHUNK_IDS.includes(d.id));
  for (let i = 0; i < stray.length; i += 400) {
    const batch = ref.firestore.batch();
    for (const d of stray.slice(i, i + 400)) batch.delete(d.ref);
    await batch.commit();
  }
}

/** One response, in a transaction: a save that lands meanwhile retries it with fresh write times. */
export async function purgeResponse(
  db: Firestore,
  ref: DocumentReference,
  cutoff: number,
  now: number
): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    // Only chunks 0 to 9 exist for a save; stray ids are cleared outside this transaction.
    const logs = (
      await tx.getAll(
        ...CHUNK_IDS.map((id) => ref.collection(WRITING_LOG).doc(id))
      )
    ).filter((d) => d.exists);
    const lastWriteAt = Math.max(
      ms(snap.updateTime),
      ...logs.map((d) => ms(d.updateTime))
    );
    const plan = planLogPurge(
      snap.data() ?? {},
      logs.map((d) => ({ id: d.id, log: d.get('log') as unknown })),
      lastWriteAt,
      cutoff,
      now
    );
    if (!plan) return false;
    for (const c of plan.rewrite)
      tx.update(ref.collection(WRITING_LOG).doc(c.id), {
        log: c.log,
        updatedAt: now,
      });
    for (const id of plan.remove)
      tx.delete(ref.collection(WRITING_LOG).doc(id));
    tx.update(ref, plan.patch);
    return true;
  });
}

/** Where this August's scan stands, so a run cut short resumes instead of starting over. Server only. */
const PURGE_RUNS = 'writing_log_purge_runs';

export async function runWritingLogPurge(
  db: Firestore,
  now: number,
  deadline: number
): Promise<{ purged: number; checked: number; done: boolean }> {
  const cutoff = purgeCutoff(now);
  const runRef = db
    .collection(PURGE_RUNS)
    .doc(String(new Date(now).getUTCFullYear()));
  const run = await runRef.get();
  if (run.get('done') === true) return { purged: 0, checked: 0, done: true };
  let after: string | null =
    typeof run.get('after') === 'string' ? (run.get('after') as string) : null;
  let purged = 0;
  let checked = 0;
  let failed = 0;
  for (;;) {
    let q = db
      .collection(WRITING_SESSIONS)
      .orderBy(FieldPath.documentId())
      .select()
      .limit(SESSION_PAGE);
    if (after) q = q.startAfter(after);
    const sessions = await q.get();
    if (sessions.empty) break;
    for (const s of sessions.docs) {
      // Near the time limit: save the place; the next day's run goes on from here.
      if (Date.now() > deadline) {
        await runRef.set({ after, done: false, updatedAt: now });
        return { purged, checked, done: false };
      }
      const responses = await s.ref
        .collection(WRITING_RESPONSES)
        .select('logPurgedAt')
        .get();
      const todo = responses.docs.filter((r) => !isNum(r.get('logPurgedAt')));
      checked += responses.size;
      for (let i = 0; i < todo.length; i += PARALLEL) {
        const results = await Promise.allSettled(
          todo.slice(i, i + PARALLEL).map(async (r) => {
            await deleteStrayChunks(r.ref);
            return purgeResponse(db, r.ref, cutoff, now);
          })
        );
        for (const res of results) {
          if (res.status === 'fulfilled') purged += res.value ? 1 : 0;
          else {
            failed += 1;
            logger.error('purgeWritingLogs response', safeErr(res.reason));
          }
        }
      }
      after = s.id;
    }
    if (sessions.size < SESSION_PAGE) break;
  }
  // A piece that failed sends the next day's run over every session again.
  await runRef.set({ after: null, done: failed === 0, updatedAt: now });
  return { purged, checked, done: failed === 0 };
}

// D21: daily through the first week of August, so a run cut short carries on the next day.
export const purgeWritingLogs = onSchedule(
  {
    schedule: '0 3 1-7 8 *',
    timeZone: 'America/Chicago',
    timeoutSeconds: 540,
    memory: '512MiB',
    region: 'us-central1',
  },
  async () => {
    const started = Date.now();
    const result = await runWritingLogPurge(
      admin.firestore(),
      started,
      started + 480_000
    );
    logger.info('purgeWritingLogs', result);
  }
);
