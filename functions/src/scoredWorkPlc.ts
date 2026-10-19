// Scored paper work shared to a PLC: pooled, anonymized results only (see PlcScoredWorkAggregate in types.ts).
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { createHash } from 'crypto';
import './functionsInit';
import { ALLOWED_ORIGINS } from './classlinkShared';
import { isGlobalFeatureGranted } from './quizMediaArchive';
import { assertViewAsAllowed } from './viewAsGuard';

type Firestore = admin.firestore.Firestore;
type Data = Record<string, unknown>;

export const SCORED_WORK_FEATURE_IDS = [
  'paper-answer-sheets',
  'paper-scored-work',
] as const;
const MAX_LABEL = 80;
const MAX_SCORES = 2000;
const BANDS = 10;

interface RubricLevel {
  label: string;
  points: number;
}
interface RubricCriterion {
  id: string;
  name: string;
  levels: RubricLevel[];
}
export interface WorkDoc {
  title: string;
  rubric: { criteria: RubricCriterion[] };
}
export interface ScoreDoc {
  levels: Record<string, number>;
  points: number;
  max: number;
}
export interface CriterionRow {
  name: string;
  studentCount: number;
  averagePercent: number;
  levelLabels?: string[];
  levelCounts?: number[];
}
interface Band {
  min: number;
  max: number;
  count: number;
}
export interface SourceDoc {
  teacherUid: string;
  workId: string;
  seriesKey: string;
  seriesLabel: string;
  studentCount: number;
  criteria: Array<
    CriterionRow & { levelLabels: string[]; levelCounts: number[] }
  >;
  scoreDistribution: Band[];
  publishedAt: number;
}

export const normalizeSeriesLabel = (raw: unknown): string =>
  (typeof raw === 'string' ? raw : '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LABEL);

/** Doc id shared by every teacher who types the same series name. */
export const seriesKeyOf = (label: string): string =>
  createHash('sha256').update(label.toLowerCase()).digest('hex').slice(0, 24);

const topPoints = (c: RubricCriterion): number =>
  c.levels.reduce((m, l) => Math.max(m, l.points), 0);

const emptyBands = (): Band[] =>
  Array.from({ length: BANDS }, (_, i) => ({
    min: i * 10,
    max: i === BANDS - 1 ? 100 : i * 10 + 9,
    count: 0,
  }));

/** One teacher's scores reduced to counts; never a seat or a name. */
export function buildSource(
  work: WorkDoc,
  scores: readonly ScoreDoc[],
  ids: { teacherUid: string; workId: string; seriesLabel: string },
  now: number
): SourceDoc {
  const criteria = work.rubric.criteria.map((c) => {
    const levelCounts = c.levels.map(() => 0);
    const top = topPoints(c);
    let percentSum = 0;
    let n = 0;
    for (const s of scores) {
      const pick = s.levels[c.id];
      if (!Number.isInteger(pick) || pick < 0 || pick >= c.levels.length) {
        continue;
      }
      levelCounts[pick] += 1;
      percentSum += top > 0 ? (c.levels[pick].points / top) * 100 : 0;
      n += 1;
    }
    return {
      name: c.name,
      studentCount: n,
      averagePercent: n ? Math.round(percentSum / n) : 0,
      levelLabels: c.levels.map((l) => l.label),
      levelCounts,
    };
  });
  const bands = emptyBands();
  for (const s of scores) {
    const pct = s.max > 0 ? Math.round((s.points / s.max) * 100) : 0;
    bands[Math.min(BANDS - 1, Math.floor(pct / 10))].count += 1;
  }
  return {
    teacherUid: ids.teacherUid,
    workId: ids.workId,
    seriesKey: seriesKeyOf(ids.seriesLabel),
    seriesLabel: ids.seriesLabel,
    studentCount: scores.length,
    criteria,
    scoreDistribution: bands,
    publishedAt: now,
  };
}

export interface AggregateDoc {
  seriesKey: string;
  seriesLabel: string;
  teacherCount: number;
  studentCount: number;
  averagePercent: number;
  criteria: CriterionRow[];
  scoreDistribution: Band[];
  firstPublishedAt: number;
  lastPublishedAt: number;
  ranAt: number;
}

interface Pooling {
  label: string;
  n: number;
  sum: number;
  labels: string[][];
  counts: number[][];
}

/** Pool every source of one series. Criteria merge by name; levels only when every rubric agrees. */
export function poolSources(
  sources: readonly SourceDoc[],
  now: number
): AggregateDoc | null {
  if (sources.length === 0) return null;
  const byName = new Map<string, Pooling>();
  for (const s of sources) {
    for (const c of s.criteria) {
      const key = c.name.trim().toLowerCase();
      const row = byName.get(key) ?? {
        label: c.name,
        n: 0,
        sum: 0,
        labels: [],
        counts: [],
      };
      row.n += c.studentCount;
      row.sum += c.averagePercent * c.studentCount;
      row.labels.push(c.levelLabels);
      row.counts.push(c.levelCounts);
      byName.set(key, row);
    }
  }
  const criteria: CriterionRow[] = [...byName.values()].map((r) => {
    const first = r.labels[0];
    const sameLevels = r.labels.every(
      (l) => l.length === first.length && l.every((x, i) => x === first[i])
    );
    return {
      name: r.label,
      studentCount: r.n,
      averagePercent: r.n ? Math.round(r.sum / r.n) : 0,
      ...(sameLevels
        ? {
            levelLabels: first,
            levelCounts: first.map((_, i) =>
              r.counts.reduce((sum, c) => sum + (c[i] ?? 0), 0)
            ),
          }
        : {}),
    };
  });
  const scoreDistribution = emptyBands().map((band, i) => ({
    ...band,
    count: sources.reduce(
      (n, s) => n + (s.scoreDistribution[i]?.count ?? 0),
      0
    ),
  }));
  const students = sources.reduce((n, s) => n + s.studentCount, 0);
  // Band midpoints, so the pooled mean never needs a per-student figure.
  const midpointSum = scoreDistribution.reduce(
    (sum, b) => sum + b.count * Math.min(100, b.min + 5),
    0
  );
  const times = sources.map((s) => s.publishedAt);
  return {
    seriesKey: sources[0].seriesKey,
    seriesLabel: sources[0].seriesLabel,
    teacherCount: new Set(sources.map((s) => s.teacherUid)).size,
    studentCount: students,
    averagePercent: students ? Math.round(midpointSum / students) : 0,
    criteria,
    scoreDistribution,
    firstPublishedAt: Math.min(...times),
    lastPublishedAt: Math.max(...times),
    ranAt: now,
  };
}

/** Mirrors the contributor test in firestore.rules: a live member who is not a viewer. */
export function canContribute(plc: Data | undefined, uid: string): boolean {
  if (!plc) return false;
  const memberUids = Array.isArray(plc.memberUids) ? plc.memberUids : [];
  if (!memberUids.includes(uid)) return false;
  const entry = ((plc.members ?? {}) as Record<string, Data>)[uid];
  if (!entry) return true;
  return entry.role !== 'viewer' && entry.status !== 'removed';
}

const readId = (v: unknown): string => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s || s.includes('/') || s.length > 200) {
    throw new HttpsError('invalid-argument', 'Malformed identifier.');
  }
  return s;
};

async function featureAllowed(
  db: Firestore,
  uid: string,
  email: string | null
): Promise<boolean> {
  for (const id of SCORED_WORK_FEATURE_IDS) {
    if (!(await isGlobalFeatureGranted(db, id, email, uid))) return false;
  }
  return true;
}

const plcDoc = (db: Firestore, plcId: string) =>
  db.collection('plcs').doc(plcId);

async function rebuildAggregate(
  db: Firestore,
  plcId: string,
  seriesKey: string,
  now: number
): Promise<void> {
  const sources = await plcDoc(db, plcId)
    .collection('scored_work_sources')
    .where('seriesKey', '==', seriesKey)
    .get();
  const ref = plcDoc(db, plcId)
    .collection('scored_work_aggregates')
    .doc(seriesKey);
  const pooled = poolSources(
    sources.docs.map((d) => d.data() as SourceDoc),
    now
  );
  if (pooled) await ref.set(pooled);
  else await ref.delete();
}

const sourceRef = (db: Firestore, plcId: string, uid: string, workId: string) =>
  plcDoc(db, plcId).collection('scored_work_sources').doc(`${uid}__${workId}`);

const workDoc = (db: Firestore, uid: string, workId: string) =>
  db.collection('users').doc(uid).collection('scored_work').doc(workId);

interface PlcLink {
  plcId?: string;
  seriesLabel?: string;
}

export async function publishScoredWork(
  data: unknown,
  uid: string,
  email: string | null,
  db: Firestore = admin.firestore(),
  now: number = Date.now()
): Promise<{ seriesKey: string; studentCount: number }> {
  const d = (data ?? {}) as Data;
  const plcId = readId(d.plcId);
  const workId = readId(d.workId);
  const seriesLabel = normalizeSeriesLabel(d.seriesLabel);
  if (!seriesLabel)
    throw new HttpsError('invalid-argument', 'Name the series.');
  if (!(await featureAllowed(db, uid, email))) {
    throw new HttpsError(
      'permission-denied',
      'Scored paper work is not available.'
    );
  }
  const plcSnap = await plcDoc(db, plcId).get();
  if (!canContribute(plcSnap.data(), uid)) {
    throw new HttpsError(
      'permission-denied',
      'You cannot share to this group.'
    );
  }
  const workRef = workDoc(db, uid, workId);
  const workSnap = await workRef.get();
  if (!workSnap.exists) {
    throw new HttpsError('not-found', 'Scored work not found.');
  }
  const scoreSnap = await workRef.collection('scores').limit(MAX_SCORES).get();
  const scores = scoreSnap.docs.map((s) => s.data() as ScoreDoc);
  if (scores.length === 0) {
    throw new HttpsError(
      'failed-precondition',
      'Score at least one student first.'
    );
  }
  const previous = (workSnap.data() as { plc?: PlcLink }).plc;
  const source = buildSource(
    workSnap.data() as WorkDoc,
    scores,
    { teacherUid: uid, workId, seriesLabel },
    now
  );
  await sourceRef(db, plcId, uid, workId).set(source);
  await rebuildAggregate(db, plcId, source.seriesKey, now);
  if (previous?.plcId === plcId && previous.seriesLabel) {
    const oldKey = seriesKeyOf(previous.seriesLabel);
    if (oldKey !== source.seriesKey) {
      await rebuildAggregate(db, plcId, oldKey, now);
    }
  }
  await workRef.update({
    plc: { plcId, seriesLabel, publishedAt: now },
    updatedAt: now,
  });
  return { seriesKey: source.seriesKey, studentCount: source.studentCount };
}

export async function withdrawScoredWork(
  data: unknown,
  uid: string,
  db: Firestore = admin.firestore(),
  now: number = Date.now()
): Promise<void> {
  const workId = readId(((data ?? {}) as Data).workId);
  const workRef = workDoc(db, uid, workId);
  const link = ((await workRef.get()).data() as { plc?: PlcLink } | undefined)
    ?.plc;
  if (!link?.plcId || !link.seriesLabel) return;
  await sourceRef(db, link.plcId, uid, workId).delete();
  await rebuildAggregate(db, link.plcId, seriesKeyOf(link.seriesLabel), now);
  await workRef.update({
    plc: admin.firestore.FieldValue.delete(),
    updatedAt: now,
  });
}

const callableOptions = {
  memory: '256MiB' as const,
  timeoutSeconds: 60,
  cors: ALLOWED_ORIGINS,
  invoker: 'public' as const,
};

export const publishScoredWorkToPlcV1 = onCall(
  callableOptions,
  async (request) => {
    assertViewAsAllowed(request);
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const email =
      typeof request.auth.token.email === 'string'
        ? request.auth.token.email
        : null;
    return publishScoredWork(request.data, request.auth.uid, email);
  }
);

export const withdrawScoredWorkFromPlcV1 = onCall(
  callableOptions,
  async (request) => {
    assertViewAsAllowed(request);
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    await withdrawScoredWork(request.data, request.auth.uid);
    return { ok: true };
  }
);
