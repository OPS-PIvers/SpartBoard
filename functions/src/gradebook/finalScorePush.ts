// AB-389: every LMS grade push sends the gradebook final score, computed here from the grade index, marks and class settings.
import type * as admin from '../firebaseAdmin';
import {
  GRADEBOOK_SESSION_COLLECTIONS,
  buildGradebookPushPlan,
  newColumnConfig,
  resolveFinalScore,
  schoologyMaxPoints,
  type FinalScore,
  type GradebookColumnConfig,
  type GradebookMark,
  type GradebookPushPlan,
} from '../gradebookCore';
import { sessionClassPredicate } from '../sessionClassFilter';
import { recomputeSession } from './gradeIndex';
import { legacyRowId } from './gradeRowMath';
import {
  GRADEBOOK_COLUMNS,
  GRADEBOOK_MARKS,
  loadClassSettings,
  parseColumn,
  parseMark,
  rowsForSession,
  type ClassSettings,
} from './gradeProjection';
import type { IndexRow } from './types';

type Firestore = admin.firestore.Firestore;

/** The push callables' session kinds; `va` is the Video Activity session. */
export type PushSessionKind = 'quiz' | 'va';

export const pushGradebookKind = (
  kind: PushSessionKind
): 'quiz' | 'video-activity' => (kind === 'va' ? 'video-activity' : 'quiz');

export interface FinalScorePushInput {
  kind: PushSessionKind;
  sessionId: string;
  /** The session's teacher; only their rows, marks and column count. */
  ownerUid: string;
  /** The LMS scale (Classroom's frozen total); null uses Schoology's rule from the column. */
  maxPoints: number | null;
  /** Session doc, already read by the caller, for the removed-class filter. */
  session: Record<string, unknown> | undefined;
  now?: number;
}

export interface FinalScorePushResult {
  plan: GradebookPushPlan;
  maxPoints: number | null;
  /** Students with work in this session, for checking a client's Missing list. */
  studentUids: string[];
}

export interface FinalScorePushDeps {
  /** Rebuilds the session's rows first so a grade saved a moment ago is pushed. */
  refresh: (
    db: Firestore,
    kind: 'quiz' | 'video-activity',
    sessionId: string
  ) => Promise<unknown>;
}

const defaultDeps: FinalScorePushDeps = {
  refresh: (db, kind, sessionId) => recomputeSession(db, kind, sessionId),
};

/** Each student's final score for one session, as the gradebook shows it, turned into an LMS push plan. */
export async function finalScorePushPlan(
  db: Firestore,
  input: FinalScorePushInput,
  deps: FinalScorePushDeps = defaultDeps
): Promise<FinalScorePushResult> {
  const kind = pushGradebookKind(input.kind);
  const now = input.now ?? Date.now();
  try {
    await deps.refresh(db, kind, input.sessionId);
  } catch (err) {
    // A failed refresh still pushes what the gradebook already shows.
    console.warn(
      `[finalScorePush] refresh failed session=${input.sessionId}:`,
      err instanceof Error ? err.message : String(err)
    );
  }
  const keepClass = sessionClassPredicate(input.session);
  const rows = (await rowsForSession(db, input.sessionId).get()).docs
    .map((d) => d.data() as IndexRow)
    .filter(
      (r) =>
        (r.kind ?? kind) === kind &&
        r.ownerUid === input.ownerUid &&
        typeof r.studentUid === 'string' &&
        r.studentUid !== '' &&
        keepClass({ classId: r.classId ?? undefined })
    );

  const columnSnap = await db
    .collection(GRADEBOOK_COLUMNS)
    .doc(input.sessionId)
    .get();
  const parsedColumn = parseColumn(columnSnap.data());
  const column: GradebookColumnConfig | null =
    parsedColumn?.ownerUid === input.ownerUid ? parsedColumn : null;

  const marks = new Map<string, GradebookMark>();
  const markSnap = await db
    .collection(GRADEBOOK_MARKS)
    .where('sessionId', '==', input.sessionId)
    .get();
  for (const d of markSnap.docs) {
    const mark = parseMark(d.data());
    if (
      mark &&
      mark.ownerUid === input.ownerUid &&
      mark.studentUid !== '' &&
      d.id === legacyRowId(input.sessionId, mark.studentUid)
    )
      marks.set(mark.studentUid, mark);
  }

  const settingsByRoster = new Map<string, Promise<ClassSettings>>();
  const settingsFor = (rosterId: string | null): Promise<ClassSettings> => {
    const key = rosterId ?? '';
    let p = settingsByRoster.get(key);
    if (!p) {
      p = loadClassSettings(db, input.ownerUid, rosterId);
      settingsByRoster.set(key, p);
    }
    return p;
  };

  // A row with no max (nothing answered yet) borrows the column's max so a valued flag can score it, as the grid does.
  const columnMax = rows.reduce<number | null>(
    (m, r) =>
      r.max !== null && r.max > 0 && (m === null || r.max > m) ? r.max : m,
    null
  );
  const cells: { student: { uid: string }; final: FinalScore }[] = [];
  const rowUids = new Set(rows.map((r) => r.studentUid));
  const baseConfig =
    column ??
    newColumnConfig({
      kind,
      sessionId: input.sessionId,
      ownerUid: input.ownerUid,
    });
  const borrowMax = (hasOwnMax: boolean): GradebookColumnConfig =>
    columnMax && !baseConfig.maxPointsOverride && !hasOwnMax
      ? { ...baseConfig, maxPointsOverride: columnMax }
      : baseConfig;
  for (const row of rows) {
    const { settings } = await settingsFor(row.rosterId);
    const config = borrowMax(!!row.max);
    cells.push({
      student: { uid: row.studentUid },
      final: resolveFinalScore(row, marks.get(row.studentUid) ?? null, config, {
        flagDefs: settings.flags,
        autoFlags: settings.autoFlags,
        now,
      }),
    });
  }
  // A student with no work but a teacher mark (an override or a flag) still has a final score in the grid.
  for (const [uid, mark] of marks) {
    if (rowUids.has(uid) || (mark.kind && mark.kind !== kind)) continue;
    const { settings } = await settingsFor(mark.rosterIds[0] ?? null);
    const config = borrowMax(false);
    cells.push({
      student: { uid },
      final: resolveFinalScore(null, mark, config, {
        flagDefs: settings.flags,
        autoFlags: settings.autoFlags,
        now,
      }),
    });
  }

  const maxPoints =
    input.maxPoints !== null && input.maxPoints > 0
      ? input.maxPoints
      : schoologyMaxPoints(cells, column);
  if (maxPoints === null || !(maxPoints > 0)) {
    return {
      plan: { entries: [], missing: [], awaiting: 0, excluded: 0 },
      maxPoints: null,
      studentUids: [...rowUids],
    };
  }
  return {
    plan: buildGradebookPushPlan(cells, maxPoints),
    maxPoints,
    studentUids: [...rowUids],
  };
}

/** Reads the session a push targets; null when it is missing or belongs to someone else. */
export async function readOwnedPushSession(
  db: Firestore,
  kind: PushSessionKind,
  sessionId: string,
  callerUid: string
): Promise<Record<string, unknown> | null> {
  if (!sessionId || sessionId.includes('/') || !callerUid) return null;
  const snap = await db
    .collection(GRADEBOOK_SESSION_COLLECTIONS[pushGradebookKind(kind)])
    .doc(sessionId)
    .get();
  const data = snap.data();
  if (!snap.exists || !data || data.teacherUid !== callerUid) return null;
  return data;
}

/** The request asks the server to build the grades from final scores. */
export function wantsFinalScores(data: unknown): data is {
  source: 'final-scores';
  sessionId: string;
  kind?: unknown;
} {
  const d = (data ?? {}) as Record<string, unknown>;
  return (
    d.source === 'final-scores' &&
    typeof d.sessionId === 'string' &&
    d.sessionId !== ''
  );
}

export const parsePushKind = (raw: unknown): PushSessionKind =>
  raw === 'va' ? 'va' : 'quiz';
