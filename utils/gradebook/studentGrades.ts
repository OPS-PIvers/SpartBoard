// Student Grades tab view model (docs/plans/GRADEBOOK.md D35, D36) and the teacher's Preview as student builder.
import {
  buildStudentGradeEntry,
  buildStudentStandards,
  type GradeIndexRow,
  type GradebookColumnConfig,
  type GradebookKind,
  type GradebookMark,
  type GradebookSettingsBody,
  type ProficiencyScale,
  type StudentGradeEntry,
  type ProficiencyLevel,
  type StudentStandardEntry,
} from './gradebookCore';

export const STUDENT_GRADE_KIND_LABELS: Record<GradebookKind, string> = {
  quiz: 'Quiz',
  'video-activity': 'Video',
  'guided-learning': 'Guided',
  flashcards: 'Flashcards',
  projects: 'Project',
  'mini-app': 'Mini-app',
  'activity-wall': 'Wall',
};

/** What the Grades tab renders; the student's projection doc or a teacher preview. */
export interface StudentGradesData {
  entries: Record<string, StudentGradeEntry & { updatedAt?: number }>;
  standards: StudentStandardEntry[] | null;
  levelNames: [string, string, string];
  cutoffs: { proficient: number; approaching: number };
}

export interface StudentGradeRow extends StudentGradeEntry {
  sessionId: string;
  updatedAt: number;
}

/** Rows with something to show, newest due date first. */
export function studentGradeRows(data: StudentGradesData): StudentGradeRow[] {
  return Object.entries(data.entries)
    .map(([sessionId, e]) => ({
      ...e,
      sessionId,
      updatedAt: e.updatedAt ?? 0,
    }))
    .filter(
      (r) => r.status !== 'hidden' || r.flags.length > 0 || r.comment !== null
    )
    .sort(
      (a, b) =>
        (b.dueAt ?? b.updatedAt) - (a.dueAt ?? a.updatedAt) ||
        a.title.localeCompare(b.title)
    );
}

/** The parts of a row whose change earns a New badge (D36). */
export interface SeenMark {
  score: string | null;
  comment: string | null;
  missing: boolean;
}

export type SeenMarks = Record<string, SeenMark>;

export function seenMarkOf(row: StudentGradeEntry): SeenMark {
  return {
    score: row.status === 'scored' ? `${row.points}/${row.max}` : null,
    comment: row.comment,
    missing: row.flags.some((f) => f.id === 'missing'),
  };
}

/** A new published score, a new shared comment or a new Missing flag since last viewed. */
export function isNewRow(row: StudentGradeRow, seen: SeenMarks): boolean {
  const prev = seen[row.sessionId];
  const now = seenMarkOf(row);
  return (
    (now.score !== null && now.score !== prev?.score) ||
    (now.comment !== null && now.comment !== prev?.comment) ||
    (now.missing && !prev?.missing)
  );
}

export function seenMarksFor(rows: StudentGradeRow[]): SeenMarks {
  return Object.fromEntries(rows.map((r) => [r.sessionId, seenMarkOf(r)]));
}

const seenKey = (studentUid: string, classId: string): string =>
  `sb_grades_seen:${studentUid}:${classId}`;

export function readSeenMarks(studentUid: string, classId: string): SeenMarks {
  try {
    const raw = window.localStorage.getItem(seenKey(studentUid, classId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? (parsed as SeenMarks) : {};
  } catch {
    return {};
  }
}

export function writeSeenMarks(
  studentUid: string,
  classId: string,
  marks: SeenMarks
): void {
  try {
    window.localStorage.setItem(
      seenKey(studentUid, classId),
      JSON.stringify(marks)
    );
  } catch {
    // Storage may be blocked; badges then show until the next visit.
  }
}

export function formatDueDate(dueAt: number | null): string | null {
  if (dueAt === null) return null;
  return new Date(dueAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function formatPoints(points: number): string {
  return String(Math.round(points * 10) / 10);
}

export interface PreviewInputs {
  /** One student's index rows in one class. */
  rows: GradeIndexRow[];
  marksBySession: Record<string, GradebookMark | undefined>;
  columnsBySession: Record<string, GradebookColumnConfig | undefined>;
  settings: GradebookSettingsBody;
  scale: ProficiencyScale;
  now: number;
}

/** D26 Preview as student: the same projection the server writes, built from the teacher's data. */
export function buildStudentGradesPreview(
  input: PreviewInputs
): StudentGradesData {
  const entries: StudentGradesData['entries'] = {};
  const standardInputs = input.rows.map((row) => {
    const mark = input.marksBySession[row.sessionId];
    const column = input.columnsBySession[row.sessionId];
    return {
      row,
      mark: mark?.ownerUid === row.ownerUid ? mark : null,
      column: column?.ownerUid === row.ownerUid ? column : null,
    };
  });
  for (const { row, mark, column } of standardInputs) {
    const entry = buildStudentGradeEntry(
      row,
      mark,
      column,
      input.settings,
      input.now
    );
    if (entry) entries[row.sessionId] = { ...entry, updatedAt: row.updatedAt };
  }
  return {
    entries,
    standards: input.settings.studentVisibility.standards
      ? buildStudentStandards(
          standardInputs,
          input.settings,
          input.scale,
          input.now
        )
      : null,
    levelNames: input.scale.levelNames,
    cutoffs: {
      proficient: input.scale.proficient,
      approaching: input.scale.approaching,
    },
  };
}

export interface TargetEvidenceView {
  sessionId: string;
  title: string;
  pct: number;
  at: number;
}

export interface TargetView {
  targetId: string;
  code?: string;
  label?: string;
  pct: number;
  level: ProficiencyLevel;
  evidence: TargetEvidenceView[];
}

/** Learning targets view rows, with each piece of evidence named after its assignment. */
export function studentTargets(data: StudentGradesData): TargetView[] {
  return (data.standards ?? []).map((s) => ({
    targetId: s.targetId,
    code: s.code,
    label: s.label,
    pct: s.pct,
    level: s.level,
    evidence: (s.evidence ?? []).map((e) => ({
      ...e,
      title: data.entries[e.sessionId]?.title ?? 'Assignment',
    })),
  }));
}

export function levelForPct(
  pct: number,
  cutoffs: StudentGradesData['cutoffs']
): ProficiencyLevel {
  if (pct >= cutoffs.proficient) return 0;
  if (pct >= cutoffs.approaching) return 1;
  return 2;
}
