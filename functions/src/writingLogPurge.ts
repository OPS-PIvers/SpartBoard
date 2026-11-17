// D21 / ADR 0010: each 1 August, delete the edit log of every Writing piece with no writing since 1 July.
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { FieldPath, type Firestore } from 'firebase-admin/firestore';
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
  updatedAt?: unknown;
}

export interface PurgePlan {
  rewrite: { id: string; log: string }[];
  remove: string[];
  patch: Data;
}

/** What one response's purge writes, or null when it keeps its log this year. */
export function planLogPurge(
  response: Data,
  chunks: readonly PurgeChunk[],
  cutoff: number,
  now: number
): PurgePlan | null {
  if (isNum(response.logPurgedAt) || chunks.length === 0) return null;
  const summary = (
    typeof response.summary === 'object' && response.summary !== null
      ? response.summary
      : {}
  ) as Data;
  // The last save or log write; a piece still being written keeps its log until the next 1 August.
  const last = Math.max(
    isNum(summary.savedAt) ? summary.savedAt : 0,
    ...chunks.map((c) => (isNum(c.updatedAt) ? c.updatedAt : 0))
  );
  if (last >= cutoff) return null;
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

const SESSION_PAGE = 200;

export async function runWritingLogPurge(
  db: Firestore,
  now: number
): Promise<{ purged: number; checked: number }> {
  const cutoff = purgeCutoff(now);
  const writer = db.bulkWriter();
  let purged = 0;
  let checked = 0;
  let after: string | null = null;
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
      const responses = await s.ref.collection(WRITING_RESPONSES).get();
      for (const r of responses.docs) {
        checked += 1;
        const data = r.data();
        if (isNum(data.logPurgedAt)) continue;
        const logs = await r.ref.collection(WRITING_LOG).get();
        const plan = planLogPurge(
          data,
          logs.docs.map((d) => ({
            id: d.id,
            log: d.get('log') as unknown,
            updatedAt: d.get('updatedAt') as unknown,
          })),
          cutoff,
          now
        );
        if (!plan) continue;
        for (const c of plan.rewrite)
          void writer.update(r.ref.collection(WRITING_LOG).doc(c.id), {
            log: c.log,
            updatedAt: now,
          });
        for (const id of plan.remove)
          void writer.delete(r.ref.collection(WRITING_LOG).doc(id));
        // Stamped last, so a run cut short tries this piece again next time.
        await writer.flush();
        await r.ref.update(plan.patch);
        purged += 1;
      }
    }
    after = sessions.docs[sessions.docs.length - 1].id;
    if (sessions.size < SESSION_PAGE) break;
  }
  await writer.close();
  return { purged, checked };
}

export const purgeWritingLogs = onSchedule(
  {
    schedule: '0 3 1 8 *',
    timeZone: 'America/Chicago',
    timeoutSeconds: 540,
    memory: '512MiB',
    region: 'us-central1',
  },
  async () => {
    const result = await runWritingLogPurge(admin.firestore(), Date.now());
    logger.info('purgeWritingLogs', result);
  }
);
