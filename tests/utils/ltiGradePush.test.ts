import { describe, it, expect } from 'vitest';
import {
  bucketLtiPushResults,
  formatLtiPushToast,
  ltiPushErrorMessage,
  LTI_PUSH_SKIP_REASON,
  type LtiPushGradesData,
} from '@/utils/ltiGradePush';

const data = (
  results: { pseudonymUid: string; ok: boolean; reason?: string }[],
  pushed: number
): LtiPushGradesData => ({ results, pushed, total: results.length });

describe('bucketLtiPushResults', () => {
  it('separates pushed / skipped (not launched) / failed (real errors)', () => {
    const b = bucketLtiPushResults(
      data(
        [
          { pseudonymUid: 'a', ok: true },
          { pseudonymUid: 'b', ok: false, reason: LTI_PUSH_SKIP_REASON },
          { pseudonymUid: 'c', ok: false, reason: 'no line item for student' },
          { pseudonymUid: 'd', ok: false }, // network/non-2xx → failure
        ],
        1
      )
    );
    expect(b).toEqual({ pushed: 1, skipped: 1, failed: 2 });
  });

  it('does not mislabel a real failure as a skip', () => {
    const b = bucketLtiPushResults(
      data([{ pseudonymUid: 'a', ok: false, reason: 'invalid entry' }], 0)
    );
    expect(b).toEqual({ pushed: 0, skipped: 0, failed: 1 });
  });
});

describe('formatLtiPushToast', () => {
  it('reports only the pushed count when nothing was skipped/failed', () => {
    expect(formatLtiPushToast({ pushed: 3, skipped: 0, failed: 0 })).toBe(
      'Pushed 3 grades to Schoology.'
    );
  });

  it('appends skipped + failed clauses with correct singular/plural', () => {
    expect(formatLtiPushToast({ pushed: 1, skipped: 1, failed: 2 })).toBe(
      'Pushed 1 grade to Schoology. 1 skipped — not opened in Schoology yet. ' +
        '2 failed to push — check your connection and try again.'
    );
  });
});

describe('ltiPushErrorMessage', () => {
  it('surfaces the server message for non-connectivity errors (retry would not help)', () => {
    expect(
      ltiPushErrorMessage({
        code: 'functions/failed-precondition',
        message: 'This assignment is not linked to Schoology for grade push.',
      })
    ).toBe('This assignment is not linked to Schoology for grade push.');
    expect(
      ltiPushErrorMessage({
        code: 'functions/permission-denied',
        message: 'Not the teacher of this session.',
      })
    ).toBe('Not the teacher of this session.');
  });

  it('uses the generic retry copy for connectivity/unknown errors', () => {
    expect(
      ltiPushErrorMessage({ code: 'functions/unavailable', message: 'x' })
    ).toBe(
      'Could not push grades to Schoology — check your connection and try again.'
    );
    expect(ltiPushErrorMessage(new Error('boom'))).toContain(
      'check your connection'
    );
  });
});
