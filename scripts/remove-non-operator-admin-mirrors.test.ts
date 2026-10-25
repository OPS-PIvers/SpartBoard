import { describe, expect, it } from 'vitest';
import {
  operatorAdminRole,
  staleMirrors,
} from './remove-non-operator-admin-mirrors.mjs';

const doc = (id: string, data: Record<string, unknown>) => ({ id, data });

describe('staleMirrors', () => {
  it('selects only synced docs mirrored from a non-operator org', () => {
    const docs = [
      doc('a', { source: 'organizationMembersSync', orgId: 'other-org' }),
      doc('b', { source: 'organizationMembersSync', orgId: 'orono' }),
      doc('c', { orgId: 'other-org' }),
      doc('d', { source: 'manual', orgId: 'other-org' }),
      doc('e', { source: 'organizationMembersSync' }),
    ];
    expect(staleMirrors(docs).map((d: { id: string }) => d.id)).toEqual(['a']);
  });
});

describe('operatorAdminRole', () => {
  it('keeps an active orono admin role and drops anything else', () => {
    expect(
      operatorAdminRole({ roleId: 'building_admin', status: 'active' })
    ).toBe('building_admin');
    expect(
      operatorAdminRole({ roleId: 'domain_admin', status: 'inactive' })
    ).toBeNull();
    expect(
      operatorAdminRole({ roleId: 'teacher', status: 'active' })
    ).toBeNull();
    expect(operatorAdminRole(null)).toBeNull();
  });
});
