import { describe, expect, it } from 'vitest';
import { autoRosteredMembers } from './remove-student-building-group-members.mjs';

const m = (role: string, extra: Record<string, unknown> = {}) => ({
  role,
  status: 'active',
  addedBy: 'autoRoster',
  email: 'X@orono.k12.mn.us',
  ...extra,
});

describe('autoRosteredMembers', () => {
  it('lists only active auto-rostered non-leads of a building group', () => {
    const plc = {
      groupType: 'building',
      orgId: 'orono',
      leadUid: 'lead',
      members: {
        a: m('viewer'),
        lead: m('viewer'),
        co: m('coLead'),
        gone: m('viewer', { status: 'removed' }),
        hand: m('viewer', { addedBy: 'admin' }),
        noEmail: m('viewer', { email: '' }),
      },
    };
    expect(autoRosteredMembers(plc)).toEqual([['a', 'x@orono.k12.mn.us']]);
  });

  it('ignores PLCs that are not building groups', () => {
    expect(
      autoRosteredMembers({
        groupType: 'plc',
        orgId: 'orono',
        members: { a: m('viewer') },
      })
    ).toEqual([]);
    expect(autoRosteredMembers(undefined)).toEqual([]);
  });
});
