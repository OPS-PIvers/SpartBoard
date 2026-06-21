/**
 * Regression test for the Video Activity `gradingStateFrom` bug.
 *
 * The `video-activity` KIND_CONFIG entry had `gradingStateFrom: () =>
 * 'not-graded'` — hardcoded, ignoring the session doc entirely. This meant
 * that even after a teacher published scores (writing `scoreVisibility` +
 * `scorePublishedAt` to the session doc), every student's `/my-assignments`
 * row was permanently stuck on "Not graded".
 *
 * Quiz and Guided Learning both call `parsePublicationFields(kind, data)` and
 * work correctly. VA must do the same.
 *
 * The companion fix in `useVideoActivityAssignments.publishAssignmentScores`
 * adds `scorePublishedAt: now` to the session doc patch — required because
 * `parsePublicationFields` gates on BOTH fields. Without that write the
 * session doc would have `scoreVisibility` but no `scorePublishedAt`, so
 * `gradingStateFrom` would still return 'not-graded' even with the correct
 * KIND_CONFIG wiring.
 */

import { describe, it, expect } from 'vitest';
import { KIND_CONFIG } from '@/hooks/useStudentAssignments';

describe('video-activity KIND_CONFIG gradingStateFrom', () => {
  const { gradingStateFrom } = KIND_CONFIG['video-activity'];

  it("returns 'graded' when session doc has scoreVisibility + scorePublishedAt", () => {
    // This was the failing case: after a teacher publishes scores the session
    // doc carries both fields, but the hardcoded `() => 'not-graded'` ignored
    // them — the student always saw "Not graded".
    expect(
      gradingStateFrom({
        scoreVisibility: 'score-only',
        scorePublishedAt: 1234567890,
      })
    ).toBe('graded');

    expect(
      gradingStateFrom({
        scoreVisibility: 'score-responses-and-answers',
        scorePublishedAt: 1,
      })
    ).toBe('graded');
  });

  it("returns 'not-graded' when scorePublishedAt is missing", () => {
    // Mirrors the quiz/GL parsePublicationFields contract: both fields
    // must be present for the student to see their results.
    expect(
      gradingStateFrom({
        scoreVisibility: 'score-only',
      })
    ).toBe('not-graded');
  });

  it("returns 'not-graded' when scoreVisibility is 'none'", () => {
    expect(
      gradingStateFrom({
        scoreVisibility: 'none',
        scorePublishedAt: 1234,
      })
    ).toBe('not-graded');
  });

  it("returns 'not-graded' for an unpublished session (no publication fields)", () => {
    // New or in-progress session: neither field is present.
    expect(
      gradingStateFrom({ status: 'active', activityTitle: 'Test VA' })
    ).toBe('not-graded');
  });

  it("returns 'not-graded' for null/undefined data without crashing", () => {
    expect(
      gradingStateFrom(
        null as unknown as Parameters<typeof gradingStateFrom>[0]
      )
    ).toBe('not-graded');
    expect(
      gradingStateFrom(
        undefined as unknown as Parameters<typeof gradingStateFrom>[0]
      )
    ).toBe('not-graded');
  });
});
