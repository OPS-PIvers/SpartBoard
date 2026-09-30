// Writes the student-readable projection `student_grades/{studentUid}/classes/{classId}` (docs/plans/GRADEBOOK.md D35-D37).
import type * as admin from 'firebase-admin';
import {
  DEFAULT_ATTEMPT_POLICY,
  DEFAULT_GRADEBOOK_SETTINGS,
  DEFAULT_PROFICIENCY_SCALE,
  GRADEBOOK_COLLECTIONS,
  ORG_GRADEBOOK_SETTINGS_ID,
  PLC_GRADEBOOK_META_ID,
  buildStudentGradeEntry,
  combineEvidence,
  evidenceForCell,
  isPublishedFor,
  proficiencyLevel,
  resolveFinalScore,
  resolveScale,
  type AttemptPolicy,
  type GradebookColumnConfig,
  type GradebookMark,
  type GradebookSettingsBody,
  type ProficiencyScale,
  type StudentGradeEntry,
  type StudentStandardEntry,
} from '../gradebookCore';
import { rowId } from './gradeRowMath';
import { GRADE_INDEX, stableStringify } from './gradeIndex';
import type { IndexRow } from './types';

type Firestore = admin.firestore.Firestore;
type Doc = Record<string, unknown>;

export const STUDENT_GRADES = GRADEBOOK_COLLECTIONS.studentGrades;
export const GRADEBOOK_MARKS = GRADEBOOK_COLLECTIONS.marks;
export const GRADEBOOK_COLUMNS = GRADEBOOK_COLLECTIONS.columns;

const asRecord = (v: unknown): Doc =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Doc) : {};
const asString = (v: unknown): string => (typeof v === 'string' ? v : '');
const asStrings = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : [];
const finite = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** Tolerant read of a teacher-written mark; malformed fields drop to their empty value. */
export function parseMark(raw: unknown): GradebookMark | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = asRecord(raw);
  const override = asRecord(r.override);
  const comment = asRecord(r.comment);
  const points = finite(override.points);
  const text = asString(comment.text);
  const publish = r.publishOverride;
  return {
    kind: r.kind as GradebookMark['kind'],
    sessionId: asString(r.sessionId),
    studentUid: asString(r.studentUid),
    ownerUid: asString(r.ownerUid),
    editorUids: asStrings(r.editorUids),
    rosterIds: asStrings(r.rosterIds),
    override: points !== null ? { points, at: finite(override.at) ?? 0 } : null,
    comment: text
      ? { text, shared: comment.shared === true, at: finite(comment.at) ?? 0 }
      : null,
    flags: asStrings(r.flags),
    suppressedAuto: asStrings(r.suppressedAuto),
    publishOverride:
      publish === 'published' || publish === 'unpublished' ? publish : null,
    updatedAt: finite(r.updatedAt) ?? 0,
  };
}

const POLICIES: AttemptPolicy[] = ['latest', 'highest', 'average'];

export function parseColumn(raw: unknown): GradebookColumnConfig | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = asRecord(raw);
  const policy = asString(r.attemptPolicy) as AttemptPolicy;
  const max = finite(r.maxPointsOverride);
  return {
    kind: r.kind as GradebookColumnConfig['kind'],
    sessionId: asString(r.sessionId),
    ownerUid: asString(r.ownerUid),
    editorUids: asStrings(r.editorUids),
    category: asString(r.category) || null,
    countsTowardOverall: r.countsTowardOverall !== false,
    maxPointsOverride: max !== null && max > 0 ? max : null,
    attemptPolicy: POLICIES.includes(policy) ? policy : DEFAULT_ATTEMPT_POLICY,
    targets: Array.isArray(r.targets)
      ? (r.targets as GradebookColumnConfig['targets'])
      : [],
    hiddenInRosterIds: asStrings(r.hiddenInRosterIds),
    updatedAt: finite(r.updatedAt) ?? 0,
  };
}

/** A settings configuration with every missing field filled from the defaults. */
export function parseSettings(raw: unknown): GradebookSettingsBody {
  if (typeof raw !== 'object' || raw === null)
    return DEFAULT_GRADEBOOK_SETTINGS;
  const r = asRecord(raw);
  const d = DEFAULT_GRADEBOOK_SETTINGS;
  const vis = asRecord(r.studentVisibility);
  const bool = (v: unknown, fallback: boolean): boolean =>
    typeof v === 'boolean' ? v : fallback;
  return {
    ...d,
    ...(r as Partial<GradebookSettingsBody>),
    flags: Array.isArray(r.flags)
      ? (r.flags as GradebookSettingsBody['flags'])
      : d.flags,
    autoFlags: bool(r.autoFlags, d.autoFlags),
    studentVisibility: {
      scores: bool(vis.scores, d.studentVisibility.scores),
      flags: bool(vis.flags, d.studentVisibility.flags),
      comments: bool(vis.comments, d.studentVisibility.comments),
      standards: bool(vis.standards, d.studentVisibility.standards),
    },
  };
}

const isId = (v: string): boolean => v.length > 0 && !v.includes('/');

/** The doc a class's `configRef` points at; null for the built-in defaults. */
export function configPathFor(
  ownerUid: string,
  configRef: unknown
): string | null {
  const r = asRecord(configRef);
  const source = asString(r.source);
  const configId = asString(r.configId);
  const plcId = asString(r.plcId);
  if (source === 'personal' && isId(configId))
    return `users/${ownerUid}/${GRADEBOOK_COLLECTIONS.userSettings}/${configId}`;
  if (source === 'district' && isId(configId))
    return `${GRADEBOOK_COLLECTIONS.districtConfigs}/${configId}`;
  if (source === 'plc' && isId(plcId))
    return `plcs/${plcId}/meta/${PLC_GRADEBOOK_META_ID}`;
  return null;
}

function parseScale(raw: unknown): ProficiencyScale | null {
  const r = asRecord(raw);
  const proficient = finite(r.proficient);
  const approaching = finite(r.approaching);
  const names = asStrings(r.levelNames);
  if (proficient === null || approaching === null) return null;
  return {
    proficient,
    approaching,
    levelNames:
      names.length === 3
        ? [names[0], names[1], names[2]]
        : DEFAULT_PROFICIENCY_SCALE.levelNames,
  };
}

export interface ClassSettings {
  settings: GradebookSettingsBody;
  scale: ProficiencyScale;
}

/** The class's configuration and the proficiency scale it names (D16, D17). */
export async function loadClassSettings(
  db: Firestore,
  ownerUid: string,
  rosterId: string | null
): Promise<ClassSettings> {
  let settings = DEFAULT_GRADEBOOK_SETTINGS;
  if (rosterId) {
    const cls = await db
      .doc(`users/${ownerUid}/${GRADEBOOK_COLLECTIONS.userClasses}/${rosterId}`)
      .get();
    const path = configPathFor(ownerUid, cls.data()?.configRef);
    if (path) {
      const cfg = await db.doc(path).get();
      if (cfg.exists) settings = parseSettings(cfg.data());
    }
  }
  if (!settings.studentVisibility.standards)
    return { settings, scale: DEFAULT_PROFICIENCY_SCALE };
  const org = await db.doc(`admin_settings/${ORG_GRADEBOOK_SETTINGS_ID}`).get();
  const district = parseScale(org.data()) ?? DEFAULT_PROFICIENCY_SCALE;
  let plcCutoffs: { proficient: number; approaching: number } | null = null;
  if (settings.scale.source === 'plc' && isId(settings.scale.plcId)) {
    const lt = await db
      .doc(`plcs/${settings.scale.plcId}/meta/learningTargets`)
      .get();
    const c = asRecord(lt.data()?.masteryCutoffs);
    const proficient = finite(c.proficient);
    const approaching = finite(c.approaching);
    if (proficient !== null && approaching !== null)
      plcCutoffs = { proficient, approaching };
  }
  return {
    settings,
    scale: resolveScale(settings.scale, district, plcCutoffs),
  };
}

interface RowInputs {
  row: IndexRow;
  mark: GradebookMark | null;
  column: GradebookColumnConfig | null;
}

async function loadRowInputs(db: Firestore, row: IndexRow): Promise<RowInputs> {
  const [markSnap, columnSnap] = await Promise.all([
    db
      .collection(GRADEBOOK_MARKS)
      .doc(rowId(row.sessionId, row.studentUid))
      .get(),
    db.collection(GRADEBOOK_COLUMNS).doc(row.sessionId).get(),
  ]);
  const mark = parseMark(markSnap.data());
  const column = parseColumn(columnSnap.data());
  // Only the session's teacher's own mark and column count.
  return {
    row,
    mark: mark?.ownerUid === row.ownerUid ? mark : null,
    column: column?.ownerUid === row.ownerUid ? column : null,
  };
}

/** Per-target proficiency from this student's published work in the class only. */
export function studentStandards(
  inputs: RowInputs[],
  settings: GradebookSettingsBody,
  scale: ProficiencyScale,
  now: number
): StudentStandardEntry[] {
  const byTarget = new Map<string, { pct: number; at: number }[]>();
  for (const { row, mark, column } of inputs) {
    if (!row.assigned || !isPublishedFor(row, mark)) continue;
    const final = resolveFinalScore(row, mark, column, {
      flagDefs: settings.flags,
      autoFlags: settings.autoFlags,
      now,
    });
    for (const e of evidenceForCell(row, final, column)) {
      const list = byTarget.get(e.targetId) ?? [];
      list.push({ pct: e.pct, at: e.at });
      byTarget.set(e.targetId, list);
    }
  }
  const out: StudentStandardEntry[] = [];
  for (const [targetId, points] of byTarget) {
    const pct = combineEvidence(points, settings.method);
    const level = proficiencyLevel(pct, scale);
    if (pct !== null && level !== null)
      out.push({ targetId, pct: Math.round(pct * 100) / 100, level });
  }
  return out.sort((a, b) => (a.targetId < b.targetId ? -1 : 1));
}

const projectionPath = (studentUid: string, classId: string): string =>
  `${STUDENT_GRADES}/${studentUid}/${GRADEBOOK_COLLECTIONS.studentClasses}/${classId}`;

interface ProjectionTarget {
  studentUid: string;
  classId: string;
  ownerUid: string;
}

interface ProjectionExtra {
  standards: StudentStandardEntry[] | null;
  scale: ProficiencyScale;
}

/** Sets or removes one entry; the doc is deleted when its last entry goes. */
export async function writeProjectionEntry(
  db: Firestore,
  target: ProjectionTarget,
  sessionId: string,
  entry: StudentGradeEntry | null,
  extra: ProjectionExtra,
  now: number
): Promise<boolean> {
  const ref = db.doc(projectionPath(target.studentUid, target.classId));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() ?? {};
    const entries = { ...asRecord(data.entries) };
    const prev = entries[sessionId] as Doc | undefined;
    let changed = false;
    if (entry === null) {
      if (prev) {
        delete entries[sessionId];
        changed = true;
      }
    } else {
      const { updatedAt: _u, ...prevBody } = prev ?? {};
      void _u;
      if (!prev || stableStringify(prevBody) !== stableStringify(entry)) {
        // `updatedAt` moves only when what the student sees changes, which drives the New badge (D36).
        entries[sessionId] = { ...entry, updatedAt: now };
        changed = true;
      }
    }
    if (
      snap.exists &&
      stableStringify(data.standards ?? null) !==
        stableStringify(extra.standards)
    )
      changed = true;
    if (!changed) return false;
    if (Object.keys(entries).length === 0) tx.delete(ref);
    else
      tx.set(ref, {
        studentUid: target.studentUid,
        classId: target.classId,
        ownerUid: target.ownerUid,
        entries,
        standards: extra.standards,
        levelNames: extra.scale.levelNames,
        updatedAt: now,
      });
    return true;
  });
}

/** This student's standards in one class, from every row but `skipSessionId` plus `own`. */
async function classStandards(
  db: Firestore,
  row: IndexRow,
  settings: GradebookSettingsBody,
  scale: ProficiencyScale,
  own: RowInputs | null,
  now: number
): Promise<StudentStandardEntry[] | null> {
  if (!settings.studentVisibility.standards) return null;
  const rows = await db
    .collection(GRADE_INDEX)
    .where('studentUid', '==', row.studentUid)
    .get();
  const classRows = rows.docs
    .map((d) => d.data() as IndexRow)
    .filter(
      (r) =>
        r.classId === row.classId &&
        r.ownerUid === row.ownerUid &&
        r.sessionId !== row.sessionId
    );
  const others = await Promise.all(classRows.map((r) => loadRowInputs(db, r)));
  return studentStandards(
    own ? [own, ...others] : others,
    settings,
    scale,
    now
  );
}

/** Re-projects one row (or clears it when the row is gone). */
export async function projectRow(
  db: Firestore,
  after: IndexRow | null,
  before: IndexRow | null,
  now = Date.now()
): Promise<void> {
  if (before?.classId && (!after || after.classId !== before.classId)) {
    const { settings, scale } = await loadClassSettings(
      db,
      before.ownerUid,
      before.rosterId
    );
    await writeProjectionEntry(
      db,
      {
        studentUid: before.studentUid,
        classId: before.classId,
        ownerUid: before.ownerUid,
      },
      before.sessionId,
      null,
      {
        standards: await classStandards(db, before, settings, scale, null, now),
        scale,
      },
      now
    );
  }
  if (!after?.classId) return;
  const [inputs, { settings, scale }] = await Promise.all([
    loadRowInputs(db, after),
    loadClassSettings(db, after.ownerUid, after.rosterId),
  ]);
  const entry = buildStudentGradeEntry(
    after,
    inputs.mark,
    inputs.column,
    settings,
    now
  );
  const standards = await classStandards(
    db,
    after,
    settings,
    scale,
    inputs,
    now
  );
  await writeProjectionEntry(
    db,
    {
      studentUid: after.studentUid,
      classId: after.classId,
      ownerUid: after.ownerUid,
    },
    after.sessionId,
    entry,
    { standards, scale },
    now
  );
}

/** Re-projects every row a query returns, optionally narrowed in memory. */
export async function reprojectRows(
  db: Firestore,
  query: admin.firestore.Query,
  keep: (row: IndexRow) => boolean = () => true
): Promise<number> {
  const snap = await query.get();
  let n = 0;
  for (const doc of snap.docs) {
    const row = doc.data() as IndexRow;
    if (!keep(row)) continue;
    await projectRow(db, row, null);
    n++;
  }
  return n;
}

export const rowsForSession = (
  db: Firestore,
  sessionId: string
): admin.firestore.Query =>
  db.collection(GRADE_INDEX).where('sessionId', '==', sessionId);

/** Uses the (ownerUid, rosterIds CONTAINS) index the teacher grid query also needs. */
export const rowsForClass = (
  db: Firestore,
  ownerUid: string,
  rosterId: string
): admin.firestore.Query =>
  db
    .collection(GRADE_INDEX)
    .where('ownerUid', '==', ownerUid)
    .where('rosterIds', 'array-contains', rosterId);

/** The query above matches any row whose session targets the roster; keep this class's rows. */
export const inRoster =
  (rosterId: string) =>
  (row: IndexRow): boolean =>
    row.rosterId === rosterId;
