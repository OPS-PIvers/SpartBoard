import {
  proficiencyLevel,
  type ProficiencyScale,
} from '@/utils/gradebook/gradebookCore';
import {
  countedPct,
  missingColumns,
  type AnalysisColumn,
  type AnalysisData,
  type AnalysisStudent,
  type AnalysisTarget,
  type ProficiencyTable,
  targetName,
} from '@/utils/gradebook/gradebookAnalysis';

export type InsightKind = 'drop' | 'missing' | 'weak-target' | 'to-grade';

/** D31: a deterministic finding that links to the view that explains it. */
export interface GradebookInsight {
  id: string;
  kind: InsightKind;
  /** bad = a student at risk, warn = a class-wide gap, info = teacher work. */
  tone: 'bad' | 'warn' | 'info';
  text: string;
  /** True when the text names a student or shows a score (blurred in privacy mode). */
  sensitive: boolean;
  studentUid?: string;
  targetId?: string;
  sessionId?: string;
  /** Students in the suggested reteach group. */
  reteachUids?: string[];
}

export const DROP_POINTS = 15;
export const DROP_WINDOW = 3;
export const MISSING_THRESHOLD = 3;
export const WEAK_TARGET_SHARE = 0.4;

export interface InsightInput {
  data: AnalysisData;
  students: AnalysisStudent[];
  columns: AnalysisColumn[];
  /** Category whose columns count as assessments (the first category). */
  assessmentCategoryId: string | null;
  targets: AnalysisTarget[];
  proficiency: ProficiencyTable;
  scale: ProficiencyScale;
  /** Only this student's insights, as the student view shows them. */
  onlyUid?: string;
}

function firstName(name: string): string {
  const comma = name.indexOf(',');
  if (comma >= 0) return name.slice(comma + 1).trim() || name;
  return name.split(' ')[0] || name;
}

export function buildInsights(input: InsightInput): GradebookInsight[] {
  const { data, columns, scale, proficiency } = input;
  const students = input.onlyUid
    ? input.students.filter((s) => s.uid === input.onlyUid)
    : input.students;
  const out: GradebookInsight[] = [];
  const assessments = columns.filter(
    (c) =>
      input.assessmentCategoryId === null ||
      c.categoryId === input.assessmentCategoryId
  );

  for (const s of students) {
    const scored = assessments
      .map((c) => data.cell(c.sessionId, s.uid).final)
      .filter((f) => f.source !== 'flag' && countedPct(f) !== null)
      .map((f) => f.pct as number);
    const last = scored.slice(-DROP_WINDOW);
    if (last.length === DROP_WINDOW) {
      const drop = last[0] - last[last.length - 1];
      if (drop >= DROP_POINTS) {
        out.push({
          id: `drop:${s.uid}`,
          kind: 'drop',
          tone: 'bad',
          text: `${s.name} dropped ${Math.round(drop)} points over the last ${DROP_WINDOW} assessments`,
          sensitive: true,
          studentUid: s.uid,
        });
      }
    }
    const missing = missingColumns(data, columns, s.uid).length;
    if (missing >= MISSING_THRESHOLD) {
      out.push({
        id: `missing:${s.uid}`,
        kind: 'missing',
        tone: 'bad',
        text: `${s.name} has ${missing} missing assignments`,
        sensitive: true,
        studentUid: s.uid,
      });
    }
  }

  const bottom = scale.levelNames[2];
  if (input.onlyUid) {
    const mine = proficiency.get(input.onlyUid);
    for (const t of input.targets) {
      const p = mine?.get(t.id) ?? null;
      if (proficiencyLevel(p, scale) === 2) {
        out.push({
          id: `weak:${t.id}:${input.onlyUid}`,
          kind: 'weak-target',
          tone: 'warn',
          text: `${targetName(t)} is ${bottom} (${Math.round(p as number)}%)`,
          sensitive: true,
          targetId: t.id,
        });
      }
    }
    return out;
  }

  for (const t of input.targets) {
    const measured = students.filter((s) => proficiency.get(s.uid)?.has(t.id));
    if (measured.length === 0) continue;
    const low = measured.filter(
      (s) =>
        proficiencyLevel(proficiency.get(s.uid)?.get(t.id) ?? null, scale) === 2
    );
    const share = low.length / measured.length;
    if (share >= WEAK_TARGET_SHARE) {
      out.push({
        id: `weak:${t.id}`,
        kind: 'weak-target',
        tone: 'warn',
        text: `${targetName(t)}: ${Math.round(share * 100)}% of the class is ${bottom}. Reteach group: ${low.map((s) => firstName(s.name)).join(', ')}`,
        sensitive: true,
        targetId: t.id,
        reteachUids: low.map((s) => s.uid),
      });
    }
  }

  for (const c of columns) {
    const n = students.filter(
      (s) => data.cell(c.sessionId, s.uid).final.status === 'awaiting'
    ).length;
    if (n > 0) {
      out.push({
        id: `grade:${c.sessionId}`,
        kind: 'to-grade',
        tone: 'info',
        text: `${n} ${n === 1 ? 'response needs' : 'responses need'} grading on ${c.title}`,
        sensitive: false,
        sessionId: c.sessionId,
      });
    }
  }
  return out;
}
