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

/** One response: its log and its stamp in a single batch, so a failed write never stamps a log it left whole. */
async function purgeResponse(
  db: Firestore,
  ref: DocumentReference,
  data: Data,
  writtenAt: number,
  cutoff: number,
  now: number
): Promise<boolean> {
  const logs = await ref.collection(WRITING_LOG).get();
  const lastWriteAt = Math.max(
    writtenAt,
    ...logs.docs.map((d) => ms(d.updateTime))
  );
  const plan = planLogPurge(
    data,
    logs.docs.map((d) => ({ id: d.id, log: d.get('log') as unknown })),
    lastWriteAt,
    cutoff,
    now
  );
  if (!plan) return false;
  const batch = db.batch();
  for (const c of plan.rewrite)
    batch.update(ref.collection(WRITING_LOG).doc(c.id), {
      log: c.log,
      updatedAt: now,
    });
  for (const id of plan.remove)
    batch.delete(ref.collection(WRITING_LOG).doc(id));
  batch.update(ref, plan.patch);
  await batch.commit();
  return true;
}

export async function runWritingLogPurge(
  db: Firestore,
  now: number,
  deadline: number
): Promise<{ purged: number; checked: number; done: boolean }> {
  const cutoff = purgeCutoff(now);
  let purged = 0;
  let checked = 0;
  let after: string | null = null;
  for (;;) {
    // A run that nears its time limit stops; the next day's run picks up the pieces not yet stamped.
    if (Date.now() > deadline) return { purged, checked, done: false };
    let q = db
      .collection(WRITING_SESSIONS)
      .orderBy(FieldPath.documentId())
      .select()
      .limit(SESSION_PAGE);
    if (after) q = q.startAfter(after);
    const sessions = await q.get();
    if (sessions.empty) break;
    for (const s of sessions.docs) {
      const responses = await s.ref.collection(WRITING_RESPONSES).get();
      const todo = responses.docs.filter((r) => !isNum(r.get('logPurgedAt')));
      checked += responses.size;
      for (let i = 0; i < todo.length; i += PARALLEL) {
        const results = await Promise.allSettled(
          todo
            .slice(i, i + PARALLEL)
            .map((r) =>
              purgeResponse(db, r.ref, r.data(), ms(r.updateTime), cutoff, now)
            )
        );
        for (const res of results) {
          if (res.status === 'fulfilled') purged += res.value ? 1 : 0;
          else logger.error('purgeWritingLogs response', res.reason);
        }
      }
    }
    after = sessions.docs[sessions.docs.length - 1].id;
    if (sessions.size < SESSION_PAGE) break;
  }
  return { purged, checked, done: true };
}

// D21: the first week of August, daily, so a run cut short or a failed piece is picked up the next day.
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
