// Default goal-coach rubric (docs/plans/TEAMS_REDESIGN.md T22); mirrored in functions/src/plcGoalCoachRubric.ts.

import type { GoalCoachCriterion } from '@/types';

export type { GoalCoachCriterion };

/** Admin override lives at `admin_settings/team_type_defaults` in this field. */
export const GOAL_COACH_RUBRIC_FIELD = 'goalCoachRubric';

export const GOAL_COACH_MAX_CRITERIA = 10;

export const DEFAULT_GOAL_COACH_RUBRIC: readonly GoalCoachCriterion[] = [
  {
    id: 'student-focused',
    label: 'Focuses on students, not a teacher task',
    description:
      'The goal names a change in student learning, not a task the teachers will complete.',
  },
  {
    id: 'named-measure',
    label: 'Names the assessment or measure',
    description:
      'The goal is tied to a named assessment or measure the team will use to check progress.',
  },
  {
    id: 'baseline-target',
    label: 'States a baseline and a target',
    description:
      'The goal states where students are now and the result the team is aiming for.',
  },
  {
    id: 'time-frame',
    label: 'Has a time frame',
    description: 'The goal says by when the target should be reached.',
  },
  {
    id: 'practice-change',
    label: 'Names a practice the team will change',
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
