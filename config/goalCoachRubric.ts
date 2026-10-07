// Default goal-coach rubric (docs/plans/TEAMS_REDESIGN.md T22); mirrored in functions/src/plcGoalCoachRubric.ts.

export interface GoalCoachCriterion {
  id: string;
  label: string;
  description: string;
}

/** Admin override lives at `admin_settings/team_type_defaults` in this field. */
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

export interface GoalCoachDraft {
  title: string;
  measure?: string;
  /** Practice wording; a routine-backed practice sends the routine's name. */
  practices?: string[];
}

export interface GoalCoachCriterionResult {
  id: string;
  label: string;
  met: boolean;
  reason: string;
}

export interface GoalCoachSuggestion {
  criterionId: string;
  suggestedEdit: string;
}

export interface GoalCoachResult {
  criteria: GoalCoachCriterionResult[];
  suggestions: GoalCoachSuggestion[];
}
