/**
 * Client seam for Schoology gradebook columns SpartBoard creates
 * (docs/plans/SCHOOLOGY_TOOL_COLUMNS.md D8–D9, D12–D13): the callable wrappers,
 * Missing entries for students with no submission, and the push toast.
 */
import { httpsCallable, type Functions } from 'firebase/functions';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { StudentTargetRef } from '@/types';
import { studentTargetRefKey } from '@/utils/studentTargetRef';

export type ToolColumnKind = 'quiz' | 'va';

/** A score, or Schoology's Missing flag for a student with no submission. */
export type ToolColumnGradeEntry =
  | { pseudonymUid: string; pointsEarned: number }
  | { pseudonymUid: string; missing: true };

export interface ToolColumnCategory {
  id: string;
  title: string;
  weight: number;
}

export interface ToolColumnSectionInfo {
  contextId: string;
  title: string | null;
  hasColumn: boolean;
  /** A new column, or one Schoology hides because it sits in no category. */
  needsCategory: boolean;
  /** Null when categories couldn't be read; the push then goes ahead without one. */
  categories: ToolColumnCategory[] | null;
  defaultCategoryId: string | null;
}

export interface RecommendedCategory {
  title: string;
  weight: number;
}

export interface ToolColumnCategoriesData {
  sections: ToolColumnSectionInfo[];
  recommended: RecommendedCategory[];
}

export interface ToolColumnPushResult {
  pseudonymUid: string;
  ok: boolean;
  status?: number;
  reason?: string;
  missing?: boolean;
  missingComment?: boolean;
}

export interface ToolColumnPushData {
  results: ToolColumnPushResult[];
  pushed: number;
  total: number;
  sections: {
    contextId: string;
    title: string | null;
    status: 'pushed' | 'needs-category' | 'no-column' | 'busy' | 'failed';
    columnCreated: boolean;
    needsCategory: boolean;
  }[];
}

export interface ToolColumnPushRequest {
  sessionId: string;
  kind: ToolColumnKind;
  maxPoints: number;
  grades: ToolColumnGradeEntry[];
  /** Only an explicit "Push to Schoology" creates the column. */
  create: boolean;
  /** Picked category per section id. */
  categories?: Record<string, string>;
}

export async function fetchToolColumnCategories(
  functions: Functions,
  sessionId: string,
  kind: ToolColumnKind
): Promise<ToolColumnCategoriesData> {
  const call = httpsCallable<
    { sessionId: string; kind: ToolColumnKind },
    ToolColumnCategoriesData
  >(functions, 'ltiToolColumnCategoriesV1');
  return (await call({ sessionId, kind })).data;
}

export async function createToolColumnCategories(
  functions: Functions,
  args: {
    sessionId: string;
    kind: ToolColumnKind;
    contextId: string;
    categories: RecommendedCategory[];
  }
): Promise<{ categories: ToolColumnCategory[]; weightingOff: boolean }> {
  const call = httpsCallable<
    typeof args,
    { categories: ToolColumnCategory[]; weightingOff: boolean }
  >(functions, 'ltiCreateToolColumnCategoriesV1');
  return (await call(args)).data;
}

export async function pushToolColumn(
  functions: Functions,
  req: ToolColumnPushRequest
): Promise<ToolColumnPushData> {
  const call = httpsCallable<ToolColumnPushRequest, ToolColumnPushData>(
    functions,
    'ltiPushToolColumnV1'
  );
  return (await call(req)).data;
}

export async function deleteToolColumns(
  functions: Functions,
  sessionId: string
): Promise<{ deleted: number; notFound: number; failed: number }> {
  const call = httpsCallable<
    { sessionId: string },
    { deleted: number; notFound: number; failed: number }
  >(functions, 'ltiDeleteToolColumnsV1');
  return (await call({ sessionId })).data;
}

/** Students the teacher excused in the Gradebook, who must never be marked Missing. */
export async function fetchExcusedStudentUids(
  sessionId: string,
  ownerUid: string
): Promise<Set<string>> {
  const snap = await getDocs(
    query(
      collection(db, 'gradebook_marks'),
      where('ownerUid', '==', ownerUid),
      where('sessionId', '==', sessionId)
    )
  );
  const out = new Set<string>();
  for (const d of snap.docs) {
    const mark = d.data() as { studentUid?: unknown; flags?: unknown };
    if (
      typeof mark.studentUid === 'string' &&
      Array.isArray(mark.flags) &&
      mark.flags.includes('excused')
    ) {
      out.add(mark.studentUid);
    }
  }
  return out;
}

/** Add a Missing entry for each targeted student with no score, unless excused or a PIN joiner. */
export function withMissingEntries(
  scored: { pseudonymUid: string; pointsEarned: number }[],
  rosterUids: Iterable<string>,
  excused: ReadonlySet<string>,
  submittedUids: ReadonlySet<string> = new Set()
): ToolColumnGradeEntry[] {
  const out: ToolColumnGradeEntry[] = [...scored];
  const have = new Set(scored.map((g) => g.pseudonymUid));
  for (const uid of rosterUids) {
    if (
      !uid ||
      uid.startsWith('pin-') ||
      have.has(uid) ||
      submittedUids.has(uid) ||
      excused.has(uid)
    ) {
      continue;
    }
    out.push({ pseudonymUid: uid, missing: true });
    have.add(uid);
  }
  return out;
}

/** Targeted student ref keys for a per-student assignment; null when it targets whole classes. */
async function fetchTargetedRefKeys(
  kind: ToolColumnKind,
  ownerUid: string,
  assignmentId: string
): Promise<Set<string> | null> {
  const snap = await getDoc(
    doc(
      db,
      'users',
      ownerUid,
      kind === 'va' ? 'video_activity_assignments' : 'quiz_assignments',
      assignmentId
    )
  );
  const a = snap.data() as
    | { targetMode?: string; targetStudents?: StudentTargetRef[] }
    | undefined;
  if (a?.targetMode !== 'students') return null;
  return new Set((a.targetStudents ?? []).map(studentTargetRefKey));
}

/**
 * Scores plus Missing for targeted students with no submission (D12). Any lookup
 * failure sends the scores alone, so nobody is marked Missing by mistake.
 */
export async function buildToolColumnGrades(args: {
  kind: ToolColumnKind;
  ownerUid: string | null | undefined;
  sessionId: string;
  assignmentId: string | null | undefined;
  scored: { pseudonymUid: string; pointsEarned: number }[];
  /** Every student on the targeted class rosters. */
  rosterUids: Iterable<string>;
  refKeyByUid: ReadonlyMap<string, string>;
  submittedUids: ReadonlySet<string>;
}): Promise<ToolColumnGradeEntry[]> {
  if (!args.ownerUid) return args.scored;
  try {
    const [excused, targeted] = await Promise.all([
      fetchExcusedStudentUids(args.sessionId, args.ownerUid),
      args.assignmentId
        ? fetchTargetedRefKeys(args.kind, args.ownerUid, args.assignmentId)
        : Promise.resolve(null),
    ]);
    const roster = [...args.rosterUids].filter((uid) => {
      if (!targeted) return true;
      const key = args.refKeyByUid.get(uid);
      return !!key && targeted.has(key);
    });
    return withMissingEntries(args.scored, roster, excused, args.submittedUids);
  } catch {
    return args.scored;
  }
}

/** Skip reasons that are expected, not failures to retry. */
export const TOOL_COLUMN_BENIGN_REASONS: ReadonlySet<string> = new Set([
  'not in Schoology section',
  'pin student',
  'unchanged',
  'flagged in Schoology',
  'graded in Schoology',
  'duplicate student',
  'no Schoology category',
  'no Schoology column',
]);

const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

/** D12 toast, e.g. "Pushed 3 grades to Schoology (2 marked Missing). 19 unchanged." */
export function formatToolColumnPushToast(data: ToolColumnPushData): {
  message: string;
  failed: number;
} {
  const ok = data.results.filter((r) => r.ok);
  const count = (reason: string) =>
    data.results.filter((r) => !r.ok && r.reason === reason).length;
  const failed = data.results.filter(
    (r) => !r.ok && !(r.reason && TOOL_COLUMN_BENIGN_REASONS.has(r.reason))
  ).length;
  const missing = ok.filter((r) => r.missing).length;
  const parts = [
    `Pushed ${plural(ok.length - missing, 'grade', 'grades')} to Schoology${
      missing > 0 ? ` (${missing} marked Missing)` : ''
    }.`,
  ];
  const unchanged = count('unchanged');
  if (unchanged > 0) parts.push(`${unchanged} unchanged.`);
  const keptFlags =
    count('flagged in Schoology') + count('graded in Schoology');
  if (keptFlags > 0) {
    parts.push(
      `${plural(keptFlags, 'cell', 'cells')} kept as set in Schoology.`
    );
  }
  const outside = count('not in Schoology section');
  if (outside > 0) {
    parts.push(
      outside === 1
        ? "1 student isn't in the Schoology section."
        : `${outside} students aren't in the Schoology section.`
    );
  }
  const pin = count('pin student');
  if (pin > 0) {
    parts.push(
      `${plural(pin, 'PIN student', 'PIN students')} can't be matched.`
    );
  }
  const blocked = data.sections.filter((s) => s.status === 'needs-category');
  if (blocked.length > 0) {
    parts.push(
      'Add a grading category to the Schoology course, then push again.'
    );
  } else if (data.sections.some((s) => s.needsCategory)) {
    parts.push(
      'A column has no grading category, so Schoology hides it. Push again to pick one.'
    );
  }
  if (data.sections.some((s) => s.status === 'busy')) {
    parts.push('A column is still being created. Try again in a minute.');
  }
  if (ok.some((r) => r.missingComment)) {
    parts.push('Some Missing marks were added as comments.');
  }
  if (failed > 0) {
    parts.push(`${failed} failed to push. Try again.`);
  }
  return { message: parts.join(' '), failed };
}

/** True when SpartBoard made a Schoology column for this session; read before the session is deleted. */
export async function sessionHasToolColumn(
  kind: ToolColumnKind,
  sessionId: string
): Promise<boolean> {
  try {
    const snap = await getDoc(
      doc(
        db,
        kind === 'va' ? 'video_activity_sessions' : 'quiz_sessions',
        sessionId
      )
    );
    return snap.data()?.ltiToolColumn === true;
  } catch {
    return false;
  }
}

/** D6: after a delete, ask whether to remove the assignment's Schoology columns too (default keeps them). */
export async function offerToolColumnRemoval(args: {
  functions: Functions;
  sessionId: string;
  showConfirm: (
    message: string,
    options?: { title?: string; confirmLabel?: string; cancelLabel?: string }
  ) => Promise<boolean>;
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
}): Promise<void> {
  const remove = await args.showConfirm(
    'Also remove its column from Schoology? Scores in that column are deleted too.',
    {
      title: 'Schoology column',
      confirmLabel: 'Remove column',
      cancelLabel: 'Keep column',
    }
  );
  if (!remove) return;
  try {
    const res = await deleteToolColumns(args.functions, args.sessionId);
    args.addToast(
      res.failed > 0
        ? "Some Schoology columns couldn't be removed. Delete them in Schoology."
        : 'Removed the column from Schoology.',
      res.failed > 0 ? 'error' : 'success'
    );
  } catch {
    args.addToast(
      "Couldn't remove the Schoology column. Delete it in Schoology.",
      'error'
    );
  }
}
