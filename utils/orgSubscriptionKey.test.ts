import { describe, it, expect } from 'vitest';
import {
  orgIdFromKey,
  orgSubscriptionKey,
  shouldClearOnOrgKeyChange,
} from './orgSubscriptionKey';

describe('orgSubscriptionKey', () => {
  it('builds a composite key from the subscribe flag and orgId', () => {
    expect(orgSubscriptionKey(true, 'org-a')).toBe('true:org-a');
    expect(orgSubscriptionKey(false, null)).toBe('false:');
  });
});

describe('orgIdFromKey', () => {
  it('recovers the orgId component', () => {
    expect(orgIdFromKey('true:org-a')).toBe('org-a');
    expect(orgIdFromKey('false:')).toBe('');
  });

  it('preserves a colon inside the orgId itself', () => {
    // Regression: split(':') would truncate at the first colon.
    expect(orgIdFromKey('true:weird:org')).toBe('weird:org');
  });
});

describe('shouldClearOnOrgKeyChange', () => {
  it('clears when the subscription turns off', () => {
    expect(shouldClearOnOrgKeyChange(false, null, 'true:org-a')).toBe(true);
  });

  it('does NOT clear when re-subscribing to the same org after being off', () => {
    // (unreachable in practice — orgId only changes via a param change — but
    // documents the boundary the orgId comparison alone would miss.)
    expect(shouldClearOnOrgKeyChange(true, 'org-a', 'false:org-a')).toBe(false);
  });

  /**
   * The bug this module fixes: a super admin switching between two foreign
   * orgs never flips `shouldSubscribe` (both keys are `true:<orgId>`), so a
   * clear condition of `!shouldSubscribe` alone — the code every one of
   * useOrgDomains/useOrgMembers/useOrgRoles/useOrgStudentPage/useOrganization/
   * useTestClasses shipped with before this fix — misses org-A -> org-B and
   * leaves org A's data rendered under org B's heading until org B's first
   * snapshot lands.
   */
  it('clears when staying subscribed but switching to a different org', () => {
    expect(shouldClearOnOrgKeyChange(true, 'org-b', 'true:org-a')).toBe(true);
  });

  it('does NOT clear when the key changes but the org stays the same', () => {
    // e.g. a re-render that recomputes the same shouldSubscribe/orgId pair
    // shouldn't reach this function at all in practice (the caller only
    // invokes it on an actual key change), but the org-identity check alone
    // must not misfire when orgId is unchanged.
    expect(shouldClearOnOrgKeyChange(true, 'org-a', 'true:org-a')).toBe(false);
  });
});
