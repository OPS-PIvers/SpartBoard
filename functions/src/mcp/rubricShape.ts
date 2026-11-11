// Stored rubric shape and the reads quiz and rubric tools share (mirrors Rubric in types.ts).
import { ToolError, type ToolContext } from './activity';

export interface RubricLevel {
  id: string;
  label: string;
  points: number;
  description?: string;
}
export interface RubricCriterion {
  id: string;
  name: string;
  description?: string;
  levels: RubricLevel[];
  /** Scoring-guide row: `description` holds the guidelines. */
  guide?: { examples?: string[] };
}
/** Rubric in types.ts; firestore.rules locks the doc to exactly these keys. */
export interface Rubric {
  id: string;
  title: string;
  description?: string;
  criteria: RubricCriterion[];
  createdAt: number;
  updatedAt: number;
}

export const rubricPath = (uid: string, id: string) =>
  `users/${uid}/rubrics/${id}`;

/** Exactly the keys firestore.rules allows, with undefined optionals dropped. */
export function rubricDoc(rubric: Rubric): Rubric {
  const out: Rubric = {
    id: rubric.id,
    title: rubric.title,
    criteria: rubric.criteria,
    createdAt: rubric.createdAt,
    updatedAt: rubric.updatedAt,
  };
  if (rubric.description) out.description = rubric.description;
  return out;
}

/** Mirrors rubricMaxPoints in utils/rubricPoints.ts. */
export const rubricMaxPoints = (criteria: RubricCriterion[]): number =>
  criteria.reduce(
    (sum, c) => sum + Math.max(0, ...(c.levels ?? []).map((l) => l.points)),
    0
  );

export async function readRubric(
  ctx: ToolContext,
  id: string
): Promise<Rubric> {
  const snap = await ctx.db.doc(rubricPath(ctx.uid, id)).get();
  if (!snap.exists) {
    throw new ToolError(
      'That rubric was not found. Use list_rubrics to find its id.'
    );
  }
  return { ...(snap.data() as Rubric), id };
}
