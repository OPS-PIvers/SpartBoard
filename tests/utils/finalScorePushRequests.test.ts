import { describe, it, expect } from 'vitest';
import { toolColumnRequestFields } from '@/hooks/useSchoologyToolColumnPush';
import { formatGradePushToast } from '@/utils/classroomGradePush';
import { bucketLtiPushResults, formatLtiPushToast } from '@/utils/ltiGradePush';
import { formatToolColumnPushToast } from '@/utils/schoologyToolColumns';

describe('toolColumnRequestFields', () => {
  const grades = [
    { pseudonymUid: 'a', pointsEarned: 4 },
    { pseudonymUid: 'b', missing: true as const },
  ];

  it('sends the client grades on the legacy path, narrowed for a Retry', () => {
    expect(toolColumnRequestFields({ maxPoints: 10, grades }, null)).toEqual({
      maxPoints: 10,
      grades,
    });
    expect(
      toolColumnRequestFields({ maxPoints: 10, grades }, new Set(['b']))
    ).toEqual({ maxPoints: 10, grades: [grades[1]] });
  });

  it('sends no grades with final scores, only the Missing hints and Retry list', () => {
    expect(
      toolColumnRequestFields(
        { maxPoints: 10, grades, finalScores: { includeMissing: true } },
        new Set(['a'])
      )
    ).toEqual({
      maxPoints: 10,
      grades: [],
      source: 'final-scores',
      includeMissing: true,
      missingWithoutWork: ['b'],
      onlyUids: ['a'],
    });
  });
});

describe('awaiting note on final-score pushes', () => {
  it('names the students left out in every push toast', () => {
    expect(
      formatGradePushToast({
        results: [],
        pushed: 2,
        skipped: 0,
        failed: 0,
        awaiting: 1,
      })
    ).toBe('Pushed 2 grades to Google Classroom. 1 awaiting grade skipped.');
    expect(
      formatLtiPushToast(
        bucketLtiPushResults({ results: [], pushed: 0, total: 0, awaiting: 3 })
      )
    ).toBe('Pushed 0 grades to Schoology. 3 awaiting grade skipped.');
    expect(
      formatToolColumnPushToast({
        results: [],
        pushed: 0,
        total: 0,
        sections: [],
        awaiting: 2,
      }).message
    ).toBe('No scores to push yet. 2 awaiting grade skipped.');
  });

  it('adds nothing on the legacy path', () => {
    expect(
      formatGradePushToast({ results: [], pushed: 1, skipped: 0, failed: 0 })
    ).toBe('Pushed 1 grade to Google Classroom.');
  });
});
