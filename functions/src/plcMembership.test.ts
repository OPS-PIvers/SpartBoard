// Unit tests for server-side PLC membership changes: planner, payload parsing and the transaction runner.
import { describe, it, expect, vi } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldValue: { serverTimestamp: () => 'TS' },
  }),
}));
vi.mock('firebase-functions/v2/https', () => {
  class FakeHttpsError extends Error {
    code: string;
    details: unknown;
    constructor(code: string, message: string, details?: unknown) {
      super(message);
      this.code = code;
      this.details = details;
    }
  }
  return { onCall: (_o: unknown, h: unknown) => h, HttpsError: FakeHttpsError };
});

import type * as admin from './firebaseAdmin';
import {
  MembershipError,
  parseMembershipAction,
  planAcceptInvite,
  planPlcChange,
  readMembersForWrite,
  runMembershipAction,
  type Caller,
} from './plcMembership';
import { makeStubFirestore, type StubData } from './testing/stubFirestore';

const TS = 'TS';
const m = (uid: string, role: string, extra: StubData = {}) => ({
  uid,
  email: `${uid}@x.edu`,
  displayName: uid.toUpperCase(),
  role,
  status: 'active',
  joinedAt: 1,
  ...extra,
});

const plc = (overrides: StubData = {}): StubData => ({
  orgId: 'orono',
  leadUid: 'lead',
  memberUids: ['lead', 'co', 'mem'],
  memberEmails: { lead: 'lead@x.edu', co: 'co@x.edu', mem: 'mem@x.edu' },
  members: {
    lead: m('lead', 'lead'),
    co: m('co', 'coLead'),
    mem: m('mem', 'member', { mentorRole: 'mentee' }),
  },
  ...overrides,
});

const legacy = (): StubData => ({
  orgId: 'orono',
  leadUid: 'lead',
  memberUids: ['lead', 'mem'],
  memberEmails: { lead: 'Lead@x.edu', mem: 'mem@x.edu' },
});

const ctx = (callerUid: string, callerIsOrgAdmin = false) => ({
  callerUid,
  callerIsOrgAdmin,
  ts: TS,
});

const reasonOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    if (e instanceof MembershipError) return e.reason;
    throw e;
  }
  return 'no error';
};

describe('readMembersForWrite', () => {
  it('synthesizes legacy members from the arrays when the map is empty', () => {
    const out = readMembersForWrite(legacy(), TS);
    expect(out.lead).toMatchObject({ role: 'lead', email: 'lead@x.edu' });
    expect(out.mem).toMatchObject({ role: 'member', displayName: 'mem' });
  });

  it('adds array-only members only when asked', () => {
    const data = plc({ memberUids: ['lead', 'co', 'mem', 'joiner'] });
    expect(readMembersForWrite(data, TS).joiner).toBeUndefined();
    expect(
      readMembersForWrite(data, TS, { includeArrayOnly: true }).joiner
    ).toMatchObject({ role: 'member', status: 'active' });
  });
});

describe('planPlcChange', () => {
  it('leave marks the caller removed and drops them from the indexes', () => {
    const { update } = planPlcChange(
      plc(),
      { action: 'leave', plcId: 'p' },
      ctx('mem')
    );
    expect(update?.memberUids).toEqual(['lead', 'co']);
    expect(update?.memberEmails).not.toHaveProperty('mem');
    expect((update?.members as StubData).mem).toMatchObject({
      status: 'removed',
    });
  });

  it('leave by an array-only member touches only the indexes', () => {
    const data = plc({ memberUids: ['lead', 'co', 'mem', 'joiner'] });
    const { update } = planPlcChange(
      data,
      { action: 'leave', plcId: 'p' },
      ctx('joiner')
    );
    expect(update).not.toHaveProperty('members');
    expect(update?.memberUids).toEqual(['lead', 'co', 'mem']);
  });

  it('the lead cannot leave, and a non-member gets notAMember', () => {
    expect(
      reasonOf(() =>
        planPlcChange(plc(), { action: 'leave', plcId: 'p' }, ctx('lead'))
      )
    ).toBe('leadCannotLeave');
    expect(
      reasonOf(() =>
        planPlcChange(plc(), { action: 'leave', plcId: 'p' }, ctx('nobody'))
      )
    ).toBe('notAMember');
  });

  it('only the lead removes members, and never the lead', () => {
    const act = { action: 'removeMember' as const, plcId: 'p', uid: 'mem' };
    expect(reasonOf(() => planPlcChange(plc(), act, ctx('co')))).toBe(
      'notAllowed'
    );
    const { update, result } = planPlcChange(plc(), act, ctx('lead'));
    expect(result).toEqual({ changed: true, targetName: 'MEM' });
    expect((update?.members as StubData).mem).toMatchObject({
      status: 'removed',
    });
    expect(
      reasonOf(() => planPlcChange(plc(), { ...act, uid: 'lead' }, ctx('lead')))
    ).toBe('leadCannotBeRemoved');
  });

  it('removes an array-only member by the indexes alone', () => {
    const data = plc({
      memberUids: ['lead', 'co', 'mem', 'joiner'],
      memberEmails: { lead: 'lead@x.edu', joiner: 'joiner@x.edu' },
    });
    const { update, result } = planPlcChange(
      data,
      { action: 'removeMember', plcId: 'p', uid: 'joiner' },
      ctx('lead')
    );
    expect(update).not.toHaveProperty('members');
    expect(update?.memberUids).toEqual(['lead', 'co', 'mem']);
    expect(result).toEqual({ changed: true, targetName: 'joiner@x.edu' });
  });

  it('setRole: managers only, never the lead, clears mentorRole off member', () => {
    const act = {
      action: 'setRole' as const,
      plcId: 'p',
      uid: 'mem',
      role: 'viewer' as const,
    };
    expect(reasonOf(() => planPlcChange(plc(), act, ctx('mem')))).toBe(
      'notAllowed'
    );
    const { update } = planPlcChange(plc(), act, ctx('co'));
    const mem = (update?.members as StubData).mem as StubData;
    expect(mem.role).toBe('viewer');
    expect(mem).not.toHaveProperty('mentorRole');
    expect(update).not.toHaveProperty('memberUids');
    expect(
      reasonOf(() => planPlcChange(plc(), { ...act, uid: 'lead' }, ctx('co')))
    ).toBe('cannotDemoteLead');
  });

  it('setRole backfills an array-only member and keeps the rest of the map', () => {
    const data = plc({
      memberUids: ['lead', 'co', 'mem', 'joiner'],
      memberEmails: { joiner: 'joiner@x.edu' },
    });
    const { update } = planPlcChange(
      data,
      { action: 'setRole', plcId: 'p', uid: 'joiner', role: 'coLead' },
      ctx('lead')
    );
    const members = update?.members as StubData;
    expect(Object.keys(members).sort()).toEqual([
      'co',
      'joiner',
      'lead',
      'mem',
    ]);
    expect(members.joiner).toMatchObject({
      role: 'coLead',
      email: 'joiner@x.edu',
    });
  });

  it('a removed co-lead is not a manager', () => {
    const data = plc({
      members: {
        ...(plc().members as StubData),
        co: m('co', 'coLead', { status: 'removed' }),
      },
    });
    expect(
      reasonOf(() =>
        planPlcChange(
          data,
          { action: 'setRole', plcId: 'p', uid: 'mem', role: 'viewer' },
          ctx('co')
        )
      )
    ).toBe('notAllowed');
  });

  it('transferLead swaps roles and the leadUid; a transfer to the current lead is a no-op', () => {
    const { update, result } = planPlcChange(
      plc(),
      { action: 'transferLead', plcId: 'p', uid: 'mem' },
      ctx('lead')
    );
    const members = update?.members as StubData;
    expect(update?.leadUid).toBe('mem');
    expect((members.lead as StubData).role).toBe('member');
    expect((members.mem as StubData).role).toBe('lead');
    expect(result.changed).toBe(true);
    expect(
      planPlcChange(
        plc(),
        { action: 'transferLead', plcId: 'p', uid: 'lead' },
        ctx('co')
      )
    ).toEqual({
      update: null,
      result: { changed: false },
    });
    expect(
      reasonOf(() =>
        planPlcChange(
          plc(),
          { action: 'transferLead', plcId: 'p', uid: 'ghost' },
          ctx('lead')
        )
      )
    ).toBe('targetNotActiveMember');
  });

  it('transferLead on a legacy map-less PLC writes a full members map', () => {
    const { update } = planPlcChange(
      legacy(),
      { action: 'transferLead', plcId: 'p', uid: 'mem' },
      ctx('lead')
    );
    expect(update?.members).toMatchObject({
      lead: { role: 'member' },
      mem: { role: 'lead' },
    });
  });

  it('admin actions need the org admin gate', () => {
    const acts = [
      { action: 'adminReassignLead' as const, plcId: 'p', uid: 'mem' },
      { action: 'adminRemoveMember' as const, plcId: 'p', uid: 'mem' },
      {
        action: 'adminSetMember' as const,
        plcId: 'p',
        target: { uid: 'new', email: 'new@x.edu', displayName: 'New' },
        role: 'member' as const,
      },
    ];
    for (const a of acts)
      expect(reasonOf(() => planPlcChange(plc(), a, ctx('lead')))).toBe(
        'notAllowed'
      );
  });

  it('adminSetMember adds a member and rebuilds the indexes, keeping array-only members', () => {
    const data = plc({
      memberUids: ['lead', 'co', 'mem', 'joiner'],
      memberEmails: { joiner: 'joiner@x.edu' },
    });
    const { update } = planPlcChange(
      data,
      {
        action: 'adminSetMember',
        plcId: 'p',
        target: { uid: 'new', email: 'New@x.edu', displayName: 'New' },
        role: 'coLead',
      },
      ctx('admin', true)
    );
    expect(update?.memberUids).toEqual(['lead', 'co', 'mem', 'joiner', 'new']);
    expect((update?.members as StubData).new).toMatchObject({
      role: 'coLead',
      email: 'new@x.edu',
      status: 'active',
    });
  });

  it('adminRemoveMember and adminReassignLead guard the lead', () => {
    expect(
      reasonOf(() =>
        planPlcChange(
          plc(),
          { action: 'adminRemoveMember', plcId: 'p', uid: 'lead' },
          ctx('a', true)
        )
      )
    ).toBe('leadCannotBeRemoved');
    expect(
      reasonOf(() =>
        planPlcChange(
          plc(),
          { action: 'adminRemoveMember', plcId: 'p', uid: 'ghost' },
          ctx('a', true)
        )
      )
    ).toBe('notActiveMember');
    expect(
      reasonOf(() =>
        planPlcChange(
          plc(),
          { action: 'adminReassignLead', plcId: 'p', uid: 'lead' },
          ctx('a', true)
        )
      )
    ).toBe('alreadyLead');
    const { update } = planPlcChange(
      plc(),
      { action: 'adminReassignLead', plcId: 'p', uid: 'co' },
      ctx('a', true)
    );
    expect(update?.leadUid).toBe('co');
    expect(update).not.toHaveProperty('memberUids');
    expect(update).not.toHaveProperty('memberEmails');
  });

  it('adminReassignLead keeps array-only members in the group', () => {
    const data = plc({
      memberUids: ['lead', 'co', 'mem', 'joiner'],
      memberEmails: { joiner: 'joiner@x.edu' },
    });
    const { update } = planPlcChange(
      data,
      { action: 'adminReassignLead', plcId: 'p', uid: 'co' },
      ctx('a', true)
    );
    expect(update).not.toHaveProperty('memberUids');
    expect(update).not.toHaveProperty('memberEmails');
  });

  it('adminReassignLead refuses a map entry missing from memberUids', () => {
    const data = plc({ memberUids: ['lead', 'mem'] });
    expect(
      reasonOf(() =>
        planPlcChange(
          data,
          { action: 'adminReassignLead', plcId: 'p', uid: 'co' },
          ctx('a', true)
        )
      )
    ).toBe('targetNotActiveMember');
  });

  it('adminReassignLead can promote a member who joined by invite', () => {
    const data = plc({
      memberUids: ['lead', 'co', 'mem', 'joiner'],
      memberEmails: { joiner: 'joiner@x.edu' },
    });
    const { update } = planPlcChange(
      data,
      { action: 'adminReassignLead', plcId: 'p', uid: 'joiner' },
      ctx('a', true)
    );
    expect(update?.leadUid).toBe('joiner');
    expect((update?.members as StubData).joiner).toMatchObject({
      role: 'lead',
      status: 'active',
    });
  });

  it('adminSetMember with no email sent keeps the stored one', () => {
    const { update } = planPlcChange(
      plc(),
      {
        action: 'adminSetMember',
        plcId: 'p',
        target: { uid: 'mem', email: '', displayName: '' },
        role: 'viewer',
      },
      ctx('a', true)
    );
    expect((update?.members as StubData).mem).toMatchObject({
      role: 'viewer',
      email: 'mem@x.edu',
    });
  });
});

describe('planAcceptInvite', () => {
  it('adds the arrays only, or resets a stale entry', () => {
    expect(planAcceptInvite(plc(), 'mem', 'mem@x.edu', 'Mem', TS)).toBeNull();
    const fresh = planAcceptInvite(plc(), 'new', 'new@x.edu', 'New', TS);
    expect(fresh).toMatchObject({
      memberUids: ['lead', 'co', 'mem', 'new'],
      memberEmails: { new: 'new@x.edu' },
    });
    expect(fresh).not.toHaveProperty('members');
    const data = plc({
      members: {
        ...(plc().members as StubData),
        old: m('old', 'coLead', { status: 'removed' }),
      },
    });
    const back = planAcceptInvite(data, 'old', 'old@x.edu', '', TS);
    expect((back?.members as StubData).old).toMatchObject({
      role: 'member',
      status: 'active',
      displayName: 'old',
    });
  });
});

describe('parseMembershipAction', () => {
  it('accepts each action and rejects bad input', () => {
    expect(parseMembershipAction({ action: 'leave', plcId: 'p' })).toEqual({
      action: 'leave',
      plcId: 'p',
    });
    expect(
      parseMembershipAction({
        action: 'setRole',
        plcId: 'p',
        uid: 'u',
        role: 'viewer',
      })
    ).toMatchObject({ role: 'viewer' });
    expect(() =>
      parseMembershipAction({
        action: 'setRole',
        plcId: 'p',
        uid: 'u',
        role: 'lead',
      })
    ).toThrow();
    expect(() =>
      parseMembershipAction({ action: 'leave', plcId: 'a/b' })
    ).toThrow();
    expect(
      parseMembershipAction({
        action: 'adminSetMember',
        plcId: 'p',
        target: { uid: 'u', email: '' },
        role: 'member',
      })
    ).toMatchObject({ target: { uid: 'u', email: '', displayName: '' } });
    expect(() => parseMembershipAction({ action: 'nuke' })).toThrow();
    expect(() => parseMembershipAction(null)).toThrow();
  });
});

describe('runMembershipAction', () => {
  const caller = (uid: string, over: Partial<Caller> = {}): Caller => ({
    uid,
    emailLower: `${uid}@x.edu`,
    emailVerified: true,
    displayName: uid,
    viewAs: false,
    ...over,
  });
  const setup = (seed: Record<string, StubData> = {}) => {
    const stub = makeStubFirestore({ 'plcs/p': plc(), ...seed });
    return { stub, db: stub.db as unknown as admin.firestore.Firestore };
  };
  const codeOf = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      return {
        code: (e as { code: string }).code,
        details: (e as { details?: unknown }).details,
      };
    }
    return null;
  };

  it('writes the planned change and returns the result', async () => {
    const { stub, db } = setup();
    const res = await runMembershipAction(
      db,
      caller('lead'),
      { action: 'removeMember', plcId: 'p', uid: 'mem' },
      TS
    );
    expect(res).toEqual({ changed: true, targetName: 'MEM' });
    expect(stub.get('plcs/p')?.memberUids).toEqual(['lead', 'co']);
  });

  it('maps a planner refusal to an HttpsError carrying the reason', async () => {
    const { db } = setup();
    expect(
      await codeOf(
        runMembershipAction(
          db,
          caller('lead'),
          { action: 'leave', plcId: 'p' },
          TS
        )
      )
    ).toEqual({
      code: 'failed-precondition',
      details: { reason: 'leadCannotLeave' },
    });
    expect(
      await codeOf(
        runMembershipAction(
          db,
          caller('lead'),
          { action: 'leave', plcId: 'missing' },
          TS
        )
      )
    ).toMatchObject({
      code: 'not-found',
    });
  });

  it('a deactivated caller changes nothing', async () => {
    const { stub, db } = setup({
      'organizations/orono/members/mem@x.edu': { status: 'revoked' },
    });
    expect(
      await codeOf(
        runMembershipAction(
          db,
          caller('mem'),
          { action: 'leave', plcId: 'p' },
          TS
        )
      )
    ).toMatchObject({
      code: 'permission-denied',
    });
    expect(stub.get('plcs/p')?.memberUids).toEqual(['lead', 'co', 'mem']);
  });

  it('admin actions need an admin doc, org membership and no View as', async () => {
    const act = {
      action: 'adminRemoveMember' as const,
      plcId: 'p',
      uid: 'mem',
    };
    const admins = { 'admins/boss@x.edu': { role: 'admin' } };
    const member = {
      'organizations/orono/members/boss@x.edu': { status: 'active' },
    };
    expect(
      await codeOf(
        runMembershipAction(setup(admins).db, caller('boss'), act, TS)
      )
    ).toMatchObject({ code: 'permission-denied' });
    expect(
      await codeOf(
        runMembershipAction(setup(member).db, caller('boss'), act, TS)
      )
    ).toMatchObject({ code: 'permission-denied' });
    expect(
      await codeOf(
        runMembershipAction(
          setup({ ...admins, ...member }).db,
          caller('boss', { viewAs: true }),
          act,
          TS
        )
      )
    ).toMatchObject({ code: 'permission-denied' });
    expect(
      await codeOf(
        runMembershipAction(
          setup({ ...admins, ...member }).db,
          caller('boss', { emailVerified: false }),
          act,
          TS
        )
      )
    ).toMatchObject({ code: 'permission-denied' });
    const { stub, db } = setup({ ...admins, ...member });
    await runMembershipAction(db, caller('boss'), act, TS);
    expect(stub.get('plcs/p')?.memberUids).toEqual(['lead', 'co']);
  });

  it('accepts an invite addressed to the caller and closes it', async () => {
    const { stub, db } = setup({
      'plc_invitations/i1': {
        plcId: 'p',
        inviteeEmailLower: 'new@x.edu',
        status: 'pending',
      },
    });
    const res = await runMembershipAction(
      db,
      caller('new'),
      { action: 'acceptInvite', inviteId: 'i1' },
      TS
    );
    expect(res).toEqual({ changed: true });
    expect(stub.get('plcs/p')?.memberUids).toEqual([
      'lead',
      'co',
      'mem',
      'new',
    ]);
    expect(stub.get('plc_invitations/i1')?.status).toBe('accepted');
  });

  it('refuses invites for another account, not pending, or unverified email', async () => {
    const seed = {
      'plc_invitations/i1': {
        plcId: 'p',
        inviteeEmailLower: 'new@x.edu',
        status: 'pending',
      },
    };
    const act = { action: 'acceptInvite' as const, inviteId: 'i1' };
    expect(
      await codeOf(
        runMembershipAction(setup(seed).db, caller('other'), act, TS)
      )
    ).toMatchObject({
      details: { reason: 'inviteWrongAccount' },
    });
    expect(
      await codeOf(
        runMembershipAction(
          setup(seed).db,
          caller('new', { emailVerified: false }),
          act,
          TS
        )
      )
    ).toMatchObject({
      details: { reason: 'inviteWrongAccount' },
    });
    const declined = {
      'plc_invitations/i1': {
        ...seed['plc_invitations/i1'],
        status: 'declined',
      },
    };
    expect(
      await codeOf(
        runMembershipAction(setup(declined).db, caller('new'), act, TS)
      )
    ).toMatchObject({
      details: { reason: 'inviteNotPending' },
    });
  });

  it('an already-member accepting just closes the invite', async () => {
    const { stub, db } = setup({
      'plc_invitations/i1': {
        plcId: 'p',
        inviteeEmailLower: 'mem@x.edu',
        status: 'pending',
      },
    });
    expect(
      await runMembershipAction(
        db,
        caller('mem'),
        { action: 'acceptInvite', inviteId: 'i1' },
        TS
      )
    ).toEqual({ changed: false });
    expect(stub.get('plc_invitations/i1')?.status).toBe('accepted');
  });
});
