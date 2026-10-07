import { describe, it, expect } from 'vitest';
import * as client from '@/config/goalCoachRubric';
import * as server from '@/functions/src/plcGoalCoachRubric';

describe('goal coach rubric client/server parity', () => {
  it('shares the default rubric and admin field', () => {
    expect(server.DEFAULT_GOAL_COACH_RUBRIC).toEqual(
      client.DEFAULT_GOAL_COACH_RUBRIC
    );
    expect(server.GOAL_COACH_RUBRIC_FIELD).toBe(client.GOAL_COACH_RUBRIC_FIELD);
    expect(server.GOAL_COACH_MAX_CRITERIA).toBe(client.GOAL_COACH_MAX_CRITERIA);
  });

  it('covers the five T22 criteria', () => {
    expect(client.DEFAULT_GOAL_COACH_RUBRIC.map((c) => c.id)).toEqual([
      'student-focused',
      'named-measure',
      'baseline-target',
      'time-frame',
      'practice-change',
    ]);
  });
});
