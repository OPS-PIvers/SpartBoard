// Writes the student-readable projection `student_grades/{studentUid}/classes/{classId}` (docs/plans/GRADEBOOK.md D35-D37).
import type * as admin from '../firebaseAdmin';
import {
  DEFAULT_ATTEMPT_POLICY,
  DEFAULT_GRADEBOOK_SETTINGS,
  DEFAULT_PROFICIENCY_SCALE,
  GRADEBOOK_COLLECTIONS,
  ORG_GRADEBOOK_SETTINGS_ID,
  PLC_GRADEBOOK_META_ID,
  buildStudentGradeEntry,
  buildStudentStandards,
  flagsRemovedByScore,
  parseScale,
  resolveScale,
  storedScale,
  type AttemptPolicy,
  type GradebookColumnConfig,
  type GradebookMark,
  type GradebookSettingsBody,
  type ProficiencyScale,
  type StudentGradeEntry,
  type StudentStandardEntry,
} from '../gradebookCore';
import { legacyRowId } from './gradeRowMath';
import { GRADE_INDEX, stableStringify } from './gradeIndex';
import type { IndexRow } from './types';
import type { ClassStudents } from './projectMemberAuthority';
import { RosterUnavailableError } from './rosterUnavailable';

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
      .doc(legacyRowId(row.sessionId, row.studentUid))
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
  return buildStudentStandards(inputs, settings, scale, now);
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
  /** Owners a roster no longer vouches for in this class; their unstamped entries and class-level fields go. */
  untrusted?: ReadonlySet<string>;
}

// Set on entries written while a roster vouched for the owner, so a later roster change keeps them.
const isVouched = (e: unknown): boolean => asRecord(e).vouched === true;

const cutoffsOf = (s: ProficiencyScale) => {
  const { proficient, approaching } = storedScale(s);
  return { proficient, approaching };
};

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
    const docOwner = asString(data.ownerUid);
    // An entry with no ownerUid predates per-entry owners; any owner may claim it.
    const ownerOf = (e: unknown): string => asString(asRecord(e).ownerUid);
    const entries = { ...asRecord(data.entries) };
    let changed = false;
    const untrusted = extra.untrusted ?? new Set<string>();
    for (const [id, e] of Object.entries(entries)) {
      if (!untrusted.has(ownerOf(e)) || isVouched(e)) continue;
      delete entries[id];
      changed = true;
    }
    const prev = entries[sessionId] as Doc | undefined;
    // Another owner's entry under this session id is theirs to change.
    if (prev && ownerOf(prev) && ownerOf(prev) !== target.ownerUid)
      return changed ? commitEntries(tx, ref, entries, now) : false;
    if (entry === null) {
      if (prev) {
        delete entries[sessionId];
        changed = true;
      }
    } else {
      const owned = { ...entry, ownerUid: target.ownerUid, vouched: true };
      const { updatedAt: _u, ...prevRest } = prev ?? {};
      void _u;
      // An entry stored before per-entry owners existed is not a change.
      const prevBody = {
        ...prevRest,
        ownerUid: ownerOf(prev) || target.ownerUid,
        vouched: true,
      };
      if (!prev || stableStringify(prevBody) !== stableStringify(owned)) {
        // `updatedAt` moves only when what the student sees changes, which drives the New badge (D36).
        entries[sessionId] = { ...owned, updatedAt: now };
        changed = true;
      } else if (prev && (!ownerOf(prev) || !isVouched(prev))) {
        // Claim and stamp a legacy entry without moving what the student sees.
        entries[sessionId] = {
          ...prev,
          ownerUid: target.ownerUid,
          vouched: true,
        };
        changed = true;
      }
    }
    // The class-level standards and scale stay with the owner who set them while they still have entries.
    const keepOwner =
      snap.exists &&
      docOwner !== '' &&
      docOwner !== target.ownerUid &&
      !untrusted.has(docOwner) &&
      Object.values(entries).some((e) => ownerOf(e) === docOwner);
    if (
      !keepOwner &&
      snap.exists &&
      (docOwner !== target.ownerUid ||
        stableStringify(data.standards ?? null) !==
          stableStringify(extra.standards))
    )
      changed = true;
    if (
      !keepOwner &&
      snap.exists &&
      (stableStringify(data.cutoffs ?? null) !==
        stableStringify(cutoffsOf(extra.scale)) ||
        stableStringify(data.levels ?? null) !==
          stableStringify(extra.scale.levels))
    )
      changed = true;
    if (!changed) return false;
    if (Object.keys(entries).length === 0) tx.delete(ref);
    else if (keepOwner) tx.update(ref, { entries, updatedAt: now });
    else
      tx.set(ref, {
        studentUid: target.studentUid,
        classId: target.classId,
        ownerUid: target.ownerUid,
        entries,
        standards: extra.standards,
        levelNames: storedScale(extra.scale).levelNames,
        levels: extra.scale.levels,
        cutoffs: cutoffsOf(extra.scale),
        updatedAt: now,
      });
    return true;
  });
}

/** Writes only the entries map, leaving the class-level fields as they are; true when it wrote. */
function commitEntries(
  tx: admin.firestore.Transaction,
  ref: admin.firestore.DocumentReference,
  entries: Doc,
  now: number
): true {
  if (Object.keys(entries).length === 0) tx.delete(ref);
  else tx.update(ref, { entries, updatedAt: now });
  return true;
}

/** Removes this owner's entry for one session without touching any class-level field. */
export async function dropProjectionEntry(
  db: Firestore,
  target: ProjectionTarget,
  sessionId: string,
  now: number,
  keepVouched = false
): Promise<boolean> {
  const ref = db.doc(projectionPath(target.studentUid, target.classId));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const entries = { ...asRecord(snap.data()?.entries) };
    const prev = entries[sessionId];
    if (asString(asRecord(prev).ownerUid) !== target.ownerUid) return false;
    if (keepVouched && isVouched(prev)) return false;
    delete entries[sessionId];
    return commitEntries(tx, ref, entries, now);
  });
}

/** True when a server-trusted roster shows `ownerUid` teaches `classId` and `studentUid` is in it. */
export type ClassEnrollmentCheck = (
  ownerUid: string,
  classId: string,
  studentUid: string
) => Promise<boolean>;

const ENROLLMENT_CACHE_MS = 90_000;
const enrollmentCache = new Map<
  string,
  { at: number; students: Promise<ClassStudents> }
>();
let enrollmentOverride: ClassEnrollmentCheck | null = null;

export function __resetClassEnrollmentCache(): void {
  enrollmentCache.clear();
}

/** Tests only: replaces the roster lookup every projection uses; null restores it. */
export function __setClassEnrollmentCheck(
  check: ClassEnrollmentCheck | null
): void {
  enrollmentOverride = check;
}

/** Looks each owner and class up once per 90 s; a failed or degraded lookup is not cached. */
export function defaultClassEnrollment(db: Firestore): ClassEnrollmentCheck {
  if (enrollmentOverride) return enrollmentOverride;
  return async (ownerUid, classId, studentUid) => {
    const key = `${ownerUid}\n${classId}`;
    const now = Date.now();
    let entry = enrollmentCache.get(key);
    if (!entry || now - entry.at > ENROLLMENT_CACHE_MS) {
      const students = import('./projectMemberAuthority').then((m) =>
        m.loadTaughtClassStudentUids(db, ownerUid, classId)
      );
      const stored = { at: now, students };
      entry = stored;
      enrollmentCache.set(key, stored);
      void students.catch(() => {
        if (enrollmentCache.get(key) === stored) enrollmentCache.delete(key);
      });
    }
    const { uids, degraded } = await entry.students;
    if (degraded && enrollmentCache.get(key) === entry)
      enrollmentCache.delete(key);
    if (uids.has(studentUid)) return true;
    // ClassLink could not answer, so retry rather than drop a real grade.
    if (degraded) throw degraded;
    return false;
  };
}

/** Other owners on this student's class doc that the roster no longer vouches for. */
async function untrustedOwners(
  db: Firestore,
  row: IndexRow & { classId: string },
  enrolled: ClassEnrollmentCheck
): Promise<Set<string>> {
  const snap = await db.doc(projectionPath(row.studentUid, row.classId)).get();
  const data = snap.data() ?? {};
  const owners = new Set([
    asString(data.ownerUid),
    ...Object.values(asRecord(data.entries)).map((e) =>
      asString(asRecord(e).ownerUid)
    ),
  ]);
  owners.delete('');
  owners.delete(row.ownerUid);
  const out = new Set<string>();
  for (const owner of owners) {
    // A lookup that fails leaves what is there; it never adds anything.
    const ok = await enrolled(owner, row.classId, row.studentUid).catch(
      () => true
    );
    if (!ok) out.add(owner);
  }
  return out;
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

/** A row that just got its first score drops the class's Remove when scored flags from its mark, logged in the mark's history. */
export async function removeFlagsOnScore(
  db: Firestore,
  rowId: string,
  after: IndexRow | null,
  before: IndexRow | null,
  now = Date.now()
): Promise<void> {
  if (after?.state !== 'scored' || before?.state === 'scored') return;
  const ref = db.collection(GRADEBOOK_MARKS).doc(rowId);
  const first = parseMark((await ref.get()).data());
  if (!first || first.flags.length === 0) return;
  const { settings } = await loadClassSettings(
    db,
    after.ownerUid,
    after.rosterId
  );
  await db.runTransaction(async (tx) => {
    const mark = parseMark((await tx.get(ref)).data());
    if (!mark || mark.ownerUid !== after.ownerUid) return;
    const removed = flagsRemovedByScore(mark, settings.flags);
    if (removed.length === 0) return;
    const flags = mark.flags.filter((f) => !removed.includes(f));
    tx.update(ref, { flags, updatedAt: now });
    tx.set(ref.collection(GRADEBOOK_COLLECTIONS.history).doc(), {
      ownerUid: mark.ownerUid,
      byUid: 'system',
      at: now,
      field: 'flags',
      before: { flags: mark.flags, suppressedAuto: mark.suppressedAuto },
      after: { flags, suppressedAuto: mark.suppressedAuto },
      batchId: null,
    });
  });
}

/** Any failed roster lookup retries the event rather than dropping the update. */
const retryable = (err: unknown): RosterUnavailableError =>
  err instanceof RosterUnavailableError ? err : new RosterUnavailableError(err);

/** Re-projects one row (or clears it when the row is gone). */
export async function projectRow(
  db: Firestore,
  after: IndexRow | null,
  before: IndexRow | null,
  now = Date.now(),
  lookup: ClassEnrollmentCheck = defaultClassEnrollment(db)
): Promise<void> {
  const enrolled: ClassEnrollmentCheck = (owner, classId, student) =>
    lookup(owner, classId, student).catch((err: unknown) => {
      throw retryable(err);
    });
  const targetOf = (r: IndexRow & { classId: string }): ProjectionTarget => ({
    studentUid: r.studentUid,
    classId: r.classId,
    ownerUid: r.ownerUid,
  });
  if (
    before?.classId &&
    (!after ||
      after.classId !== before.classId ||
      after.ownerUid !== before.ownerUid)
  ) {
    const left = { ...before, classId: before.classId };
    if (!(await enrolled(left.ownerUid, left.classId, left.studentUid))) {
      await dropProjectionEntry(db, targetOf(left), left.sessionId, now);
    } else {
      await removeEntry(db, left, now);
    }
  }
  if (!after?.classId) return;
  const row = { ...after, classId: after.classId };
  // Session classIds and response fields are teacher-written, so only a roster vouches for the class and student.
  if (!(await enrolled(row.ownerUid, row.classId, row.studentUid))) {
    // Refuse anything new but keep what was shown while the roster vouched (a sub swap or roster change).
    await dropProjectionEntry(db, targetOf(row), row.sessionId, now, true);
    return;
  }
  const untrusted = await untrustedOwners(db, row, enrolled);
  const [inputs, { settings, scale }] = await Promise.all([
    loadRowInputs(db, row),
    loadClassSettings(db, row.ownerUid, row.rosterId),
  ]);
  const entry = buildStudentGradeEntry(
    row,
    inputs.mark,
    inputs.column,
    settings,
    now
  );
  const standards = await classStandards(db, row, settings, scale, inputs, now);
  await writeProjectionEntry(
    db,
    targetOf(row),
    row.sessionId,
    entry,
    { standards, scale, untrusted },
    now
  );
}

/** Clears a vouched row's entry and recomputes the class standards without it. */
async function removeEntry(
  db: Firestore,
  before: IndexRow & { classId: string },
  now: number
): Promise<void> {
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

const REPROJECT_CHUNK = 10;

/** Re-projects every row a query returns, optionally narrowed in memory. */
export async function reprojectRows(
  db: Firestore,
  query: admin.firestore.Query,
  keep: (row: IndexRow) => boolean = () => true,
  enrolled: ClassEnrollmentCheck = defaultClassEnrollment(db)
): Promise<number> {
  const snap = await query.get();
  const rows = snap.docs.map((d) => d.data() as IndexRow).filter(keep);
  // One student's rows share a projection doc, so they run in order; students run in parallel.
  const byStudent = new Map<string, IndexRow[]>();
  for (const r of rows) {
    byStudent.set(r.studentUid, [...(byStudent.get(r.studentUid) ?? []), r]);
  }
  const groups = [...byStudent.values()];
  for (let i = 0; i < groups.length; i += REPROJECT_CHUNK) {
    await Promise.all(
      groups.slice(i, i + REPROJECT_CHUNK).map(async (group) => {
        for (const r of group)
          await projectRow(db, r, null, Date.now(), enrolled);
      })
    );
  }
  return rows.length;
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
