import { describe, it, expect } from 'vitest';
import { shouldClearPlcDirectoryOnScopeChange } from './plcDirectorySubscriptionKey';

describe('shouldClearPlcDirectoryOnScopeChange', () => {
  it('clears when the subscription turns off', () => {
    expect(
      shouldClearPlcDirectoryOnScopeChange(
        { shouldSubscribe: false, orgId: null, buildingId: null },
        { shouldSubscribe: true, orgId: 'org-a', buildingId: 'bldg-a' }
      )
    ).toBe(true);
  });

  it('clears when staying subscribed but the orgId changes', () => {
    expect(
      shouldClearPlcDirectoryOnScopeChange(
        { shouldSubscribe: true, orgId: 'org-b', buildingId: 'bldg-a' },
        { shouldSubscribe: true, orgId: 'org-a', buildingId: 'bldg-a' }
      )
    ).toBe(true);
  });

  it('clears when staying subscribed but the buildingId changes', () => {
    expect(
      shouldClearPlcDirectoryOnScopeChange(
        { shouldSubscribe: true, orgId: 'org-a', buildingId: 'bldg-b' },
        { shouldSubscribe: true, orgId: 'org-a', buildingId: 'bldg-a' }
      )
    ).toBe(true);
  });

  it('does NOT clear when the scope is unchanged', () => {
    expect(
      shouldClearPlcDirectoryOnScopeChange(
        { shouldSubscribe: true, orgId: 'org-a', buildingId: 'bldg-a' },
        { shouldSubscribe: true, orgId: 'org-a', buildingId: 'bldg-a' }
      )
    ).toBe(false);
  });

  it('does NOT clear when re-subscribing to the same org/building after being off', () => {
    expect(
      shouldClearPlcDirectoryOnScopeChange(
        { shouldSubscribe: true, orgId: 'org-a', buildingId: 'bldg-a' },
        { shouldSubscribe: false, orgId: 'org-a', buildingId: 'bldg-a' }
      )
    ).toBe(false);
  });
});
