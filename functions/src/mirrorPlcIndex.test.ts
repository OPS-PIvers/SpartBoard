import { describe, it, expect } from 'vitest';
import { buildPlcIndexMirror } from './mirrorPlcIndex';

describe('buildPlcIndexMirror — slim, PII-free discovery mirror', () => {
  it('projects name / orgId / buildingId / memberUids + count (NO member PII)', () => {
    const mirror = buildPlcIndexMirror({
      name: 'Org-Stamped PLC',
      orgId: 'org-1',
      buildingId: 'bldg-oms',
      leadUid: 'u1',
      memberUids: ['u1', 'u2'],
      memberEmails: { u1: 'a@x.org', u2: 'b@x.org' },
      members: {
        u1: { uid: 'u1', email: 'a@x.org', displayName: 'A', role: 'lead' },
        u2: { uid: 'u2', email: 'b@x.org', displayName: 'B', role: 'member' },
      },
    });
    expect(mirror).toEqual({
      name: 'Org-Stamped PLC',
      orgId: 'org-1',
      buildingId: 'bldg-oms',
      memberUids: ['u1', 'u2'],
      memberCount: 2,
    });
    // Explicit: the mirror must never carry email / displayName / members map.
    const asRecord = mirror as unknown as Record<string, unknown>;
    expect(asRecord).not.toHaveProperty('memberEmails');
    expect(asRecord).not.toHaveProperty('members');
  });

  it('null orgId/buildingId when absent (legacy / un-tenanted PLC)', () => {
    const mirror = buildPlcIndexMirror({
      name: 'Legacy PLC',
      memberUids: ['u1'],
    });
    expect(mirror).toEqual({
      name: 'Legacy PLC',
      orgId: null,
      buildingId: null,
      memberUids: ['u1'],
      memberCount: 1,
    });
  });

  it('falls back to active members-map entries when memberUids is absent', () => {
    const mirror = buildPlcIndexMirror({
      name: 'Map-Only PLC',
      orgId: 'org-1',
      members: {
        u1: { uid: 'u1', role: 'lead', status: 'active' },
        u2: { uid: 'u2', role: 'member', status: 'removed' },
        u3: { uid: 'u3', role: 'member', status: 'active' },
      },
    });
    expect(mirror?.memberUids.sort()).toEqual(['u1', 'u3']);
    expect(mirror?.memberCount).toBe(2);
  });

  it('returns null for an unusable root (no name) so no index entry is written', () => {
    expect(
      buildPlcIndexMirror({ orgId: 'org-1', memberUids: ['u1'] })
    ).toBeNull();
  });

  it('ignores non-string uids in memberUids', () => {
    const mirror = buildPlcIndexMirror({
      name: 'PLC',
      memberUids: ['u1', 42, null, 'u2'],
    });
    expect(mirror?.memberUids).toEqual(['u1', 'u2']);
    expect(mirror?.memberCount).toBe(2);
  });
});
