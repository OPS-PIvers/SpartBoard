// Writes the student-readable projection `student_grades/{studentUid}/classes/{classId}` (docs/plans/GRADEBOOK.md D35-D37).
import type * as admin from 'firebase-admin';
import {
  DEFAULT_COLUMN,
  DEFAULT_CONFIG,
  DEFAULT_FLAGS,
  EXCUSED_FLAG_ID,
  resolveFinalScore,
} from './resolveFinalScore';
import { rowId } from './gradeRowMath';
import { GRADE_INDEX, stableStringify } from './gradeIndex';
import type {
  AttemptPolicy,
  FlagVisibility,
  GradeIndexRow,
  GradebookColumnMirror,
  GradebookConfigMirror,
  GradebookFlagMirror,
  GradebookMarkMirror,
  TargetEvidence,
} from './types';

type Firestore = admin.firestore.Firestore;
type Doc = Record<string, unknown>;

export const STUDENT_GRADES = 'student_grades';
export const GRADEBOOK_MARKS = 'gradebook_marks';
export const GRADEBOOK_COLUMNS = 'gradebook_columns';

const asRecord = (v: unknown): Doc =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Doc) : {};
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');
const asStrings = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : [];
const finite = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

export function parseMark(raw: unknown): GradebookMarkMirror | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = asRecord(raw);
  const override = asRecord(r.override);
  const comment = asRecord(r.comment);
  const points = finite(override.points);
  const text = asString(comment.text);
  return {
    override: points !== null ? { points } : null,
    comment: text ? { text, shared: comment.shared === true } : null,
    flags: asStrings(r.flags),
    suppressedAuto: asStrings(r.suppressedAuto),
    publishOverride:
      typeof r.publishOverride === 'boolean' ? r.publishOverride : null,
  };
}

const POLICIES: AttemptPolicy[] = ['latest', 'highest', 'average'];

export function parseColumn(raw: unknown): GradebookColumnMirror | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = asRecord(raw);
  const policy = asString(r.attemptPolicy) as AttemptPolicy;
  const max = finite(r.maxPointsOverride);
  return {
    maxPointsOverride: max !== null && max > 0 ? max : null,
    attemptPolicy: POLICIES.includes(policy) ? policy : 'latest',
    countsTowardOverall: r.countsTowardOverall !== false,
  };
}

function parseVisibility(v: unknown, fallback: FlagVisibility): FlagVisibility {
  if (v === 'off' || v === 'hidden' || v === 'none' || v === false)
    return 'off';
  if (v === 'teacher' || v === 'teacher-only' || v === 'teacherOnly')
    return 'teacher';
  if (
    v === 'students' ||
    v === 'teachers-and-students' ||
    v === 'all' ||
    v === true
  )
    return 'students';
  return fallback;
}

function parseFlag(raw: unknown): GradebookFlagMirror | null {
  const r = asRecord(raw);
  const key = asString(r.key);
  const name = asString(r.name);
  const id = asString(r.id) || name.toLowerCase();
  if (!id) return null;
  const builtin = DEFAULT_FLAGS.find((f) => f.id === id);
  return {
    id,
    key: key || builtin?.key || '',
    name: name || builtin?.name || id,
    color: asString(r.color) || builtin?.color || 'slate',
    value: finite(r.value),
    excludes:
      r.excludes === true || r.value === 'excluded' || id === EXCUSED_FLAG_ID,
    visibility: parseVisibility(r.visibility, builtin?.visibility ?? 'teacher'),
  };
}

/** Tolerant parse of a settings configuration; anything missing falls back to the built-in defaults. */
export function parseConfig(raw: unknown): GradebookConfigMirror {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_CONFIG;
  const r = asRecord(raw);
  const flags = Array.isArray(r.flags)
    ? r.flags.map(parseFlag).filter((f): f is GradebookFlagMirror => f !== null)
    : DEFAULT_CONFIG.flags;
  const vis = asRecord(r.studentVisibility);
  const d = DEFAULT_CONFIG.studentVisibility;
  const bool = (v: unknown, fallback: boolean): boolean =>
    typeof v === 'boolean' ? v : fallback;
  return {
    flags,
    autoFlags: bool(r.autoFlags, DEFAULT_CONFIG.autoFlags),
    studentVisibility: {
      scores: bool(vis.scores, d.scores),
      flags: bool(vis.flags, d.flags),
      comments: bool(vis.comments, d.comments),
      standards: bool(vis.standards, d.standards),
    },
  };
}

/** `gradebook_classes/{rosterId}.configRef`: a personal id, or `{ kind, id }` for personal, district or PLC. */
export function configPathFor(
  ownerUid: string,
  configRef: unknown
): string | null {
  if (typeof configRef === 'string' && configRef)
    return `users/${ownerUid}/gradebook_settings/${configRef}`;
  const r = asRecord(configRef);
  const kind = asString(r.kind) || asString(r.type);
  const id = asString(r.id) || asString(r.configId) || asString(r.plcId);
  if (!id || id.includes('/')) return null;
  if (kind === 'district') return `gradebook_district_configs/${id}`;
  if (kind === 'plc') return `plcs/${id}/meta/gradebookSettings`;
  return `users/${ownerUid}/gradebook_settings/${id}`;
}

export async function loadClassConfig(
  db: Firestore,
  ownerUid: string,
  rosterId: string | null
): Promise<GradebookConfigMirror> {
  if (!rosterId) return DEFAULT_CONFIG;
  const cls = await db
    .doc(`users/${ownerUid}/gradebook_classes/${rosterId}`)
    .get();
  const path = configPathFor(ownerUid, cls.data()?.configRef);
  if (!path) return DEFAULT_CONFIG;
  const cfg = await db.doc(path).get();
  return cfg.exists ? parseConfig(cfg.data()) : DEFAULT_CONFIG;
}

export interface ProjectionFlag {
  id: string;
  key: string;
  name: string;
  color: string;
  auto: boolean;
}

/** One assignment on the student's Grades tab; holds only what D35 lets a student see. */
export interface ProjectionEntry {
  kind: string;
  title: string;
  ownerUid: string;
  dueAt: number | null;
  submittedAt: number | null;
  published: boolean;
  status: string | null;
  pct: number | null;
  points: number | null;
  max: number | null;
  flags: ProjectionFlag[];
  comment: string | null;
  targets?: Array<
    Pick<
      TargetEvidence,
      'targetId' | 'kind' | 'label' | 'code' | 'earned' | 'possible'
    >
  >;
}

/** Null when the student would see nothing for this assignment. */
export function buildProjectionEntry(
  row: GradeIndexRow,
  mark: GradebookMarkMirror | null,
  column: GradebookColumnMirror | null,
  config: GradebookConfigMirror,
  now: number
): ProjectionEntry | null {
  if (!row.assigned) return null;
  const final = resolveFinalScore(row, mark, column, config, now);
  const published = mark?.publishOverride ?? row.published;
  const vis = config.studentVisibility;
  const flagById = new Map(config.flags.map((f) => [f.id, f]));
  const flags: ProjectionFlag[] = vis.flags
    ? final.flags
        .map((id) => flagById.get(id))
        .filter(
          (f): f is GradebookFlagMirror =>
            f !== undefined && f.visibility === 'students'
        )
        .map((f) => ({
          id: f.id,
          key: f.key,
          name: f.name,
          color: f.color,
          auto: final.autoFlags.includes(f.id),
        }))
    : [];
  const showScore = published && vis.scores;
  const comment =
    published && vis.comments && mark?.comment?.shared
      ? mark.comment.text
      : null;
  if (!showScore && flags.length === 0 && comment === null) return null;
  const entry: ProjectionEntry = {
    kind: row.kind,
    title: row.title,
    ownerUid: row.ownerUid,
    dueAt: row.dueAt,
    submittedAt: row.submittedAt,
    published: showScore,
    status: showScore ? final.status : null,
    pct: showScore ? final.pct : null,
    points: showScore ? final.points : null,
    max: showScore ? final.max : null,
    flags,
    comment,
  };
  // Flag-valued and excused scores are never proficiency evidence (D17).
  if (
    showScore &&
    vis.standards &&
    final.source !== 'flag' &&
    final.status === 'scored'
  ) {
    entry.targets = row.targetEvidence.map((t) => ({
      targetId: t.targetId,
      kind: t.kind,
      label: t.label,
      ...(t.code ? { code: t.code } : {}),
      earned: t.earned,
      possible: t.possible,
    }));
  }
  return entry;
}

const projectionPath = (studentUid: string, classId: string): string =>
  `${STUDENT_GRADES}/${studentUid}/classes/${classId}`;

/** Sets or removes one entry; the doc is deleted when its last entry goes. */
export async function writeProjectionEntry(
  db: Firestore,
  studentUid: string,
  classId: string,
  sessionId: string,
  entry: ProjectionEntry | null,
  now: number
): Promise<boolean> {
  const ref = db.doc(projectionPath(studentUid, classId));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() ?? {};
    const entries = { ...asRecord(data.entries) };
    const prev = entries[sessionId] as Doc | undefined;
    if (entry === null) {
      if (!prev) return false;
      delete entries[sessionId];
    } else {
      const { updatedAt: _u, ...prevBody } = prev ?? {};
      void _u;
      if (prev && stableStringify(prevBody) === stableStringify(entry))
        return false;
      // `updatedAt` moves only when what the student sees changes, which drives the New badge.
      entries[sessionId] = { ...entry, updatedAt: now };
    }
    if (Object.keys(entries).length === 0) tx.delete(ref);
    else tx.set(ref, { studentUid, classId, entries, updatedAt: now });
    return true;
  });
}

/** Re-projects one row (or clears it when the row is gone). */
export async function projectRow(
  db: Firestore,
  after: GradeIndexRow | null,
  before: GradeIndexRow | null,
  now = Date.now()
): Promise<void> {
  if (before?.classId && (!after || after.classId !== before.classId)) {
    await writeProjectionEntry(
      db,
      before.studentUid,
      before.classId,
      before.sessionId,
      null,
      now
    );
  }
  if (!after?.classId) return;
  const id = rowId(after.sessionId, after.studentUid);
  const [markSnap, columnSnap, config] = await Promise.all([
    db.collection(GRADEBOOK_MARKS).doc(id).get(),
    db.collection(GRADEBOOK_COLUMNS).doc(after.sessionId).get(),
    loadClassConfig(db, after.ownerUid, after.rosterId),
  ]);
  const entry = buildProjectionEntry(
    after,
    parseMark(markSnap.data()),
    parseColumn(columnSnap.data()) ?? DEFAULT_COLUMN,
    config,
    now
  );
  await writeProjectionEntry(
    db,
    after.studentUid,
    after.classId,
    after.sessionId,
    entry,
    now
  );
}

/** Re-projects every row a query returns (a column, a class's settings). */
export async function reprojectRows(
  db: Firestore,
  query: admin.firestore.Query
): Promise<number> {
  const snap = await query.get();
  for (const doc of snap.docs) {
    await projectRow(db, doc.data() as GradeIndexRow, null);
  }
  return snap.docs.length;
}

export const rowsForSession = (
  db: Firestore,
  sessionId: string
): admin.firestore.Query =>
  db.collection(GRADE_INDEX).where('sessionId', '==', sessionId);

export const rowsForClass = (
  db: Firestore,
  ownerUid: string,
  rosterId: string
): admin.firestore.Query =>
  db
    .collection(GRADE_INDEX)
    .where('ownerUid', '==', ownerUid)
    .where('rosterId', '==', rosterId);
