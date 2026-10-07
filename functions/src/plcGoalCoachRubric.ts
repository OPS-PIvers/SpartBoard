// Server mirror of config/goalCoachRubric.ts; tests/config/goalCoachRubricParity.test.ts keeps them in sync.

export interface GoalCoachCriterion {
  id: string;
  label: string;
  description: string;
}

export const GOAL_COACH_RUBRIC_FIELD = 'goalCoachRubric';

export const GOAL_COACH_MAX_CRITERIA = 10;

export const DEFAULT_GOAL_COACH_RUBRIC: readonly GoalCoachCriterion[] = [
  {
    id: 'student-focused',
    label: 'Student-focused',
    description:
      'The goal names a change in student learning, not a task the teachers will complete.',
  },
  {
    id: 'named-measure',
    label: 'Named measure',
    description:
      'The goal is tied to a named assessment or measure the team will use to check progress.',
  },
  {
    id: 'baseline-target',
    label: 'Baseline and target',
    description:
      'The goal states where students are now and the result the team is aiming for.',
  },
  {
    id: 'time-frame',
    label: 'Time frame',
    description: 'The goal says by when the target should be reached.',
  },
  {
    id: 'practice-change',
    label: 'Practice change',
    description:
      'The goal names a teaching practice the team will change or start to reach the target.',
  },
];

const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

const text = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';

/** The admin override when it is a usable list, else the default rubric. */
export function resolveGoalCoachRubric(raw: unknown): GoalCoachCriterion[] {
  if (!Array.isArray(raw)) return [...DEFAULT_GOAL_COACH_RUBRIC];
  const seen = new Set<string>();
  const out: GoalCoachCriterion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const d = item as Record<string, unknown>;
    const id = text(d.id, 40);
    const label = text(d.label, 80);
    const description = text(d.description, 400);
    if (!ID_RE.test(id) || seen.has(id) || !label || !description) continue;
    seen.add(id);
    out.push({ id, label, description });
    if (out.length === GOAL_COACH_MAX_CRITERIA) break;
  }
  return out.length > 0 ? out : [...DEFAULT_GOAL_COACH_RUBRIC];
}
