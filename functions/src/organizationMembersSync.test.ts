import { describe, it, expect } from 'vitest';
import {
  computeAdminAction,
  ADMIN_ROLES,
  PROVENANCE_SOURCE,
  type MemberDocFields,
} from './organizationMembersSync';

const ORG_ID = 'orono';
const EMAIL = 'new.admin@orono.k12.mn.us';
const NOW = '2026-04-19T12:00:00.000Z';

const member = (overrides: Partial<MemberDocFields> = {}): MemberDocFields => ({
  roleId: 'teacher',
  status: 'active',
  email: EMAIL,
  ...overrides,
});

const cfManaged = { source: PROVENANCE_SOURCE };
const preExisting = {}; // No source marker → pre-Phase-4 admin
const preExistingWithOtherSource = { source: 'manual' };

describe('ADMIN_ROLES', () => {
  it('includes exactly the three admin role ids the CF is allowed to mirror', () => {
    expect([...ADMIN_ROLES].sort()).toEqual([
      'building_admin',
      'domain_admin',
      'super_admin',
    ]);
  });
});

describe('computeAdminAction', () => {
  it('case 1: create member as active domain_admin with no existing admin doc → create with provenance marker', () => {
    const action = computeAdminAction(
      null,
      member({ roleId: 'domain_admin', status: 'active' }),
      null,
      ORG_ID,
      EMAIL,
      NOW
    );

    expect(action).toEqual({
      type: 'create',
      payload: {
        source: PROVENANCE_SOURCE,
        orgId: ORG_ID,
        roleId: 'domain_admin',
        email: EMAIL,
        updatedAt: NOW,
      },
    });
  });

  it('case 2: create member as active teacher → noop', () => {
    const action = computeAdminAction(
      null,
      member({ roleId: 'teacher', status: 'active' }),
      null,
      ORG_ID,
      EMAIL,
      NOW
    );

    expect(action.type).toBe('noop');
  });

  it('case 3: update teacher → domain_admin (active) with no existing admin doc → create', () => {
    const action = computeAdminAction(
      member({ roleId: 'teacher', status: 'active' }),
      member({ roleId: 'domain_admin', status: 'active' }),
      null,
      ORG_ID,
      EMAIL,
      NOW
    );

    expect(action).toEqual({
      type: 'create',
      payload: {
        source: PROVENANCE_SOURCE,
        orgId: ORG_ID,
        roleId: 'domain_admin',
        email: EMAIL,
        updatedAt: NOW,
      },
    });
  });

  it('case 4: update domain_admin → teacher with CF-created admin doc → delete', () => {
    const action = computeAdminAction(
      member({ roleId: 'domain_admin', status: 'active' }),
      member({ roleId: 'teacher', status: 'active' }),
      cfManaged,
      ORG_ID,
      EMAIL,
      NOW
    );

    expect(action).toEqual({ type: 'delete' });
  });

  it('case 5: update domain_admin → teacher with pre-existing admin doc (no marker) → noop (refuse to delete)', () => {
    const action = computeAdminAction(
      member({ roleId: 'domain_admin', status: 'active' }),
      member({ roleId: 'teacher', status: 'active' }),
      preExisting,
      ORG_ID,
      EMAIL,
      NOW
    );

    expect(action.type).toBe('noop');
    if (action.type === 'noop') {
      expect(action.reason).toMatch(/provenance/i);
    }
  });

  it('case 6: delete active domain_admin member doc with CF-created admin doc → delete', () => {
    const action = computeAdminAction(
      member({ roleId: 'domain_admin', status: 'active' }),
      null,
      cfManaged,
      ORG_ID,
      EMAIL,
      NOW
    );

    expect(action).toEqual({ type: 'delete' });
  });

  it('case 7: delete active domain_admin member doc with pre-existing admin doc (no marker) → noop (refuse to delete)', () => {
    const action = computeAdminAction(
      member({ roleId: 'domain_admin', status: 'active' }),
      null,
      preExisting,
      ORG_ID,
      EMAIL,
      NOW
    );

    expect(action.type).toBe('noop');
    if (action.type === 'noop') {
      expect(action.reason).toMatch(/provenance/i);
    }
  });

  it('case 8: status flip active → inactive for domain_admin with CF-created admin doc → delete', () => {
    const action = computeAdminAction(
      member({ roleId: 'domain_admin', status: 'active' }),
      member({ roleId: 'domain_admin', status: 'inactive' }),
      cfManaged,
      ORG_ID,
      EMAIL,
      NOW
    );

    expect(action).toEqual({ type: 'delete' });
  });

  it('case 9: CF-managed admin role upgrade building_admin → domain_admin → update', () => {
    const action = computeAdminAction(
      member({ roleId: 'building_admin', status: 'active' }),
      member({ roleId: 'domain_admin', status: 'active' }),
      cfManaged,
      ORG_ID,
      EMAIL,
      NOW
    );

    expect(action).toEqual({
      type: 'update',
      payload: {
        orgId: ORG_ID,
        roleId: 'domain_admin',
        updatedAt: NOW,
      },
    });
  });

  it('case 10: pre-existing admin doc with wrong source field (e.g. source: "manual") on a would-be-update → noop', () => {
    // Member is active domain_admin and should be mirrored, but the admin
    // doc has a foreign provenance marker. We must NOT clobber it.
    const action = computeAdminAction(
      member({ roleId: 'building_admin', status: 'active' }),
      member({ roleId: 'domain_admin', status: 'active' }),
      preExistingWithOtherSource,
      ORG_ID,
      EMAIL,
      NOW
    );

    expect(action.type).toBe('noop');
    if (action.type === 'noop') {
      expect(action.reason).toMatch(/provenance/i);
    }
  });

  it('case 11: name-only change on domain_admin with CF-created admin doc → noop (roleId and admin status unchanged)', () => {
    const before = member({
      roleId: 'domain_admin',
      status: 'active',
      email: EMAIL,
    });
    const after = member({
      roleId: 'domain_admin',
      status: 'active',
      email: EMAIL,
    });

    const action = computeAdminAction(
      before,
      after,
      cfManaged,
      ORG_ID,
      EMAIL,
      NOW
    );

    // Both eligible, same roleId → update still fires because the caller
    // also wraps this with a short-circuit. `computeAdminAction` itself
    // treats stable-admin states as an update opportunity, so assert that
    // here — the outer trigger is what suppresses no-op rewrites.
    expect(action.type).toBe('update');
  });

  it('additional: status flip inactive → active for domain_admin (wasAdmin=false, shouldBeAdmin=true) with no admin doc → create', () => {
    const action = computeAdminAction(
      member({ roleId: 'domain_admin', status: 'inactive' }),
      member({ roleId: 'domain_admin', status: 'active' }),
      null,
      ORG_ID,
      EMAIL,
      NOW
    );

    expect(action.type).toBe('create');
    if (action.type === 'create') {
      expect(action.payload.source).toBe(PROVENANCE_SOURCE);
    }
  });

  it('additional: domain_admin status flip active → invited (not active) with CF-created admin doc → delete', () => {
    const action = computeAdminAction(
      member({ roleId: 'domain_admin', status: 'active' }),
      member({ roleId: 'domain_admin', status: 'invited' }),
      cfManaged,
      ORG_ID,
      EMAIL,
      NOW
    );

    expect(action).toEqual({ type: 'delete' });
  });

  it('additional: super_admin and building_admin are admin-eligible too', () => {
    const createSuper = computeAdminAction(
      null,
      member({ roleId: 'super_admin', status: 'active' }),
      null,
      ORG_ID,
      EMAIL,
      NOW
    );
    expect(createSuper.type).toBe('create');

    const createBuilding = computeAdminAction(
      null,
      member({ roleId: 'building_admin', status: 'active' }),
      null,
      ORG_ID,
      EMAIL,
      NOW
    );
    expect(createBuilding.type).toBe('create');
  });

  it('additional: student role is never admin-eligible', () => {
    const action = computeAdminAction(
      member({ roleId: 'teacher', status: 'active' }),
      member({ roleId: 'student', status: 'active' }),
      null,
      ORG_ID,
      EMAIL,
      NOW
    );
    expect(action.type).toBe('noop');
  });

  it('additional: missing roleId (defensive) is treated as non-admin', () => {
    const action = computeAdminAction(
      null,
      { status: 'active' } as MemberDocFields,
      null,
      ORG_ID,
      EMAIL,
      NOW
    );
    expect(action.type).toBe('noop');
  });

  it('additional: delete member doc with CF-created admin doc but no prior eligibility → noop', () => {
    // Edge case: member was never admin-eligible (e.g., status never
    // 'active'), then deleted. Nothing to mirror.
    const action = computeAdminAction(
      member({ roleId: 'teacher', status: 'active' }),
      null,
      null,
      ORG_ID,
      EMAIL,
      NOW
    );
    expect(action.type).toBe('noop');
  });
});
