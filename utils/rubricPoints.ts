import type {
  Rubric,
  RubricCriterion,
  RubricLevel,
  RubricLevelOrder,
  WrittenAnswerGrade,
  WrittenAnswerRubricScore,
} from '@/types';

/** Sum of each criterion's highest level points — a rubric-scored question's max points. */
export const rubricMaxPoints = (rubric: Rubric): number =>
  rubric.criteria.reduce(
    (sum, c) => sum + c.levels.reduce((max, l) => Math.max(max, l.points), 0),
    0
  );

/** Running total of selected criterion levels; non-finite points count as 0. */
export const sumRubricScorePoints = (
  scores: WrittenAnswerRubricScore[] | undefined
): number =>
  (scores ?? []).reduce(
    (total, s) => total + (Number.isFinite(s.points) ? s.points : 0),
    0
  );

/** Levels in the teacher's order, by points; ties keep their saved order. */
export const orderRubricLevels = (
  levels: RubricLevel[],
  order: RubricLevelOrder
): RubricLevel[] => {
  const sign = order === 'high-first' ? -1 : 1;
  return levels
    .map((level, i) => ({ level, i }))
    .sort((a, b) => sign * (a.level.points - b.level.points) || a.i - b.i)
    .map((x) => x.level);
};

export const criterionMaxPoints = (criterion: RubricCriterion): number =>
  criterion.levels.reduce((max, l) => Math.max(max, l.points), 0);

// Same rubric and same criteria: a modified copy of one library rubric shares its id but renames criteria.
export const sameRubric = (a: Rubric | undefined, b: Rubric): boolean =>
  a?.id === b.id &&
  a.criteria.length === b.criteria.length &&
  a.criteria.every((c) => b.criteria.some((d) => d.id === c.id));

/** Swaps an edited rubric into every question that carries it, keeping a rubric question's points equal to its max. */
export const applyRubricEdit = <
  Q extends {
    rubricId?: string;
    rubricSnapshot?: Rubric;
    modifiedRubricId?: string;
    modifiedRubricSnapshot?: Rubric;
    points?: number;
  },
>(
  questions: Q[],
  rubric: Rubric
): {
  questions: Q[];
  changed: boolean;
  libraryIds: string[];
  before?: Rubric;
  requiredTotal?: number;
} => {
  let changed = false;
  let before: Rubric | undefined;
  let requiredTotal: number | undefined;
  const total = rubricMaxPoints(rubric);
  const libraryIds = new Set<string>();
  const next = questions.map((q) => {
    let out = q;
    const isMain = sameRubric(q.rubricSnapshot, rubric);
    const isModified = sameRubric(q.modifiedRubricSnapshot, rubric);
    if (isMain) {
      before ??= q.rubricSnapshot;
      out = { ...out, rubricSnapshot: rubric, points: total };
      // Only the main rubric goes back to the library; a modified copy shares its id.
      if (q.rubricId) libraryIds.add(q.rubricId);
    }
    if (isModified) {
      before ??= q.modifiedRubricSnapshot;
      out = { ...out, modifiedRubricSnapshot: rubric };
    }
    const other =
      isMain && !isModified
        ? q.modifiedRubricSnapshot
        : isModified && !isMain
          ? q.rubricSnapshot
          : undefined;
    if (other && rubricMaxPoints(other) !== total)
      requiredTotal ??= rubricMaxPoints(other);
    if (out !== q) changed = true;
    return out;
  });
  return {
    questions: next,
    changed,
    libraryIds: [...libraryIds],
    before,
    requiredTotal,
  };
};

const rubricContent = (r: Rubric): string =>
  JSON.stringify({
    title: r.title,
    description: r.description ?? '',
    criteria: r.criteria.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description ?? '',
      examples: c.guide?.examples ?? [],
      levels: c.levels.map((l) => [
        l.id,
        l.label,
        l.points,
        l.description ?? '',
      ]),
    })),
  });

/** Same title, criteria and levels, ignoring ids of the rubric itself and timestamps. */
export const sameRubricContent = (a: Rubric, b: Rubric): boolean =>
  rubricContent(a) === rubricContent(b);

/** Grades whose picked levels changed points; typed overrides (points not equal to the old level) are left alone. */
export const rescoreRubricGrades = (
  before: Rubric,
  after: Rubric,
  grading: Record<string, WrittenAnswerGrade>
): Array<[string, WrittenAnswerGrade]> => {
  const levelPoints = (r: Rubric) =>
    new Map(
      r.criteria.flatMap((c) =>
        c.levels.map((l): [string, number] => [`${c.id}|${l.id}`, l.points])
      )
    );
  const oldPoints = levelPoints(before);
  const newPoints = levelPoints(after);
  const newMax = new Map(
    after.criteria.map((c) => [c.id, criterionMaxPoints(c)])
  );
  const out: Array<[string, WrittenAnswerGrade]> = [];
  for (const [key, grade] of Object.entries(grading)) {
    if (!grade.rubricScores?.length) continue;
    let delta = 0;
    const rubricScores = grade.rubricScores.map((s) => {
      const id = `${s.criterionId}|${s.levelId}`;
      const was = oldPoints.get(id);
      const now = newPoints.get(id);
      const max = newMax.get(s.criterionId);
      // A score on a removed level stays as a typed score, capped at the row's new max.
      if (now === undefined && max !== undefined && s.points > max) {
        delta += max - s.points;
        return { ...s, points: max };
      }
      if (
        was === undefined ||
        now === undefined ||
        s.points !== was ||
        now === was
      )
        return s;
      delta += now - was;
      return { ...s, points: now };
    });
    if (
      delta === 0 &&
      rubricScores.every((s, i) => s === grade.rubricScores?.[i])
    )
      continue;
    out.push([
      key,
      {
        ...grade,
        rubricScores,
        pointsAwarded: Math.max(0, grade.pointsAwarded + delta),
      },
    ]);
  }
  return out;
};

export const RUBRIC_MIN_LEVELS = 2;
export const RUBRIC_MAX_LEVELS = 6;
