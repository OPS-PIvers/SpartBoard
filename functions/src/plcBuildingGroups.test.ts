// Unit tests for building groups: creation, auto-roster backfill and the profile trigger.
import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  auth: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldValue: { serverTimestamp: () => 'TS' },
  }),
}));
vi.mock('firebase-functions/v2/https', () => {
  class FakeHttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return { onCall: (_o: unknown, h: unknown) => h, HttpsError: FakeHttpsError };
});
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (_o: unknown, h: unknown) => h,
}));
vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import type * as admin from 'firebase-admin';
import {
  applyAutoRosterAdds,
  applyAutoRosterRemoval,
  applyProfileBuildingsChange,
  assertCallerIsOrgAdmin,
  createBuildingGroup,
  diffSelectedBuildings,
  isAutoRosterGroup,
  parseCreateBuildingGroupPayload,
  planAutoRosterAdds,
  rosterBuildingGroup,
  shouldAutoRemove,
  syncBuildingGroup,
  type AccountInfo,
  type BuildingGroupDeps,
} from './plcBuildingGroups';
import { buildingIdVariants } from './buildingIds';
import { makeStubFirestore, type StubData } from './testing/stubFirestore';

const ORG = 'orono';
const acct = (uid: string): AccountInfo => ({
  uid,
  email: `${uid}@orono.k12.mn.us`,
  displayName: uid.toUpperCase(),
});

function member(
  uid: string,
  role: string,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    uid,
    email: `${uid}@orono.k12.mn.us`,
    displayName: uid,
    role,
    joinedAt: 1,
    status: 'active',
    ...extra,
  };
}

function group(
  members: Record<string, Record<string, unknown>>,
  extra: Record<string, unknown> = {}
): StubData {
  const active = Object.values(members).filter((m) => m.status === 'active');
  return {
    name: 'Middle School',
    orgId: ORG,
    buildingId: 'middle',
    groupType: 'building',
    autoRoster: true,
    leadUid: 'lead',
    members,
    memberUids: active.map((m) => m.uid),
    memberEmails: Object.fromEntries(active.map((m) => [m.uid, m.email])),
    ...extra,
  };
}

const orgMember = (uid: string, extra: StubData = {}): StubData => ({
  uid,
  roleId: 'teacher',
  status: 'active',
  ...extra,
});

function makeDeps(seed: Record<string, StubData>) {
  const stub = makeStubFirestore(seed);
  const users: Record<string, { email?: string; displayName?: string }> = {};
  for (const path of Object.keys(seed)) {
    const segs = path.split('/');
    if (segs[0] === 'users' && segs[3] === 'profile') {
      users[segs[1]] = {
        email: `${segs[1]}@orono.k12.mn.us`,
        displayName: segs[1].toUpperCase(),
      };
    }
  }
  const deps: BuildingGroupDeps = {
    db: stub.db as unknown as admin.firestore.Firestore,
    getUser: (uid) => Promise.resolve(users[uid] ?? null),
    getUserByEmail: (email) => {
      const uid = Object.keys(users).find((u) => users[u].email === email);
      return Promise.resolve(
        uid ? { uid, displayName: users[uid].displayName } : null
      );
    },
    serverTimestamp: () => 'TS',
  };
  return { stub, deps, users };
}

describe('diffSelectedBuildings', () => {
  it('reports added and removed buildings', () => {
    expect(diffSelectedBuildings(['middle'], ['high', 'middle'])).toEqual({
      added: ['high'],
      removed: [],
    });
    expect(diffSelectedBuildings(['middle', 'high'], ['high'])).toEqual({
      added: [],
      removed: ['middle'],
    });
  });

  it('treats a legacy alias as the same building', () => {
    expect(diffSelectedBuildings(['orono-middle-school'], ['middle'])).toEqual({
      added: [],
      removed: [],
    });
    expect(diffSelectedBuildings(undefined, ['orono-high-school'])).toEqual({
      added: ['high'],
      removed: [],
    });
  });

  it('handles missing or malformed values', () => {
    expect(diffSelectedBuildings(null, 'middle')).toEqual({
      added: [],
      removed: [],
    });
    expect(diffSelectedBuildings(['middle', 7], undefined)).toEqual({
      added: [],
      removed: ['middle'],
    });
  });

  it('lists every alias variant of a building', () => {
    expect(buildingIdVariants('middle')).toEqual([
      'middle',
      'orono-middle-school',
    ]);
    expect(buildingIdVariants('district')).toEqual(['district']);
  });
});

describe('isAutoRosterGroup', () => {
  it('needs a building group with auto-roster on and tenancy set', () => {
    expect(isAutoRosterGroup(group({}))).toBe(true);
    expect(isAutoRosterGroup(group({}, { autoRoster: false }))).toBe(false);
    expect(isAutoRosterGroup(group({}, { groupType: 'plc' }))).toBe(false);
    expect(isAutoRosterGroup(group({}, { orgId: null }))).toBe(false);
    expect(isAutoRosterGroup(undefined)).toBe(false);
  });
});

describe('planAutoRosterAdds', () => {
  const data = group({
    lead: member('lead', 'lead', { addedBy: 'admin' }),
    a: member('a', 'viewer', { addedBy: 'autoRoster' }),
    gone: member('gone', 'viewer', {
      addedBy: 'autoRoster',
      status: 'removed',
    }),
    kicked: member('kicked', 'member', { status: 'removed' }),
  });

  it('adds only people without an active record', () => {
    const out = planAutoRosterAdds(
      data,
      [acct('lead'), acct('a'), acct('new'), acct('new')],
      'backfill'
    );
    expect(out.map((c) => c.uid)).toEqual(['new']);
  });

  it('backfill leaves removed records alone', () => {
    expect(
      planAutoRosterAdds(data, [acct('gone'), acct('kicked')], 'backfill')
    ).toEqual([]);
  });

  it('a building change brings back only auto-roster removals', () => {
    const out = planAutoRosterAdds(
      data,
      [acct('gone'), acct('kicked')],
      'trigger'
    );
    expect(out.map((c) => c.uid)).toEqual(['gone']);
  });

  it('respects legacy memberUids without a map entry', () => {
    const legacy = { ...group({}), memberUids: ['x'] };
    expect(planAutoRosterAdds(legacy, [acct('x')], 'backfill')).toEqual([]);
  });
});

describe('shouldAutoRemove', () => {
  const data = group({
    lead: member('lead', 'lead', { addedBy: 'autoRoster' }),
    co: member('co', 'coLead', { addedBy: 'autoRoster' }),
    auto: member('auto', 'viewer', { addedBy: 'autoRoster' }),
    promoted: member('promoted', 'member', { addedBy: 'autoRoster' }),
    hand: member('hand', 'viewer'),
    admin: member('admin', 'member', { addedBy: 'admin' }),
    invited: member('invited', 'member', { addedBy: 'invite' }),
    gone: member('gone', 'viewer', {
      addedBy: 'autoRoster',
      status: 'removed',
    }),
  });

  it('removes an active auto-added member', () => {
    expect(shouldAutoRemove(data, 'auto')).toBe(true);
    expect(shouldAutoRemove(data, 'promoted')).toBe(true);
  });

  it('never removes the lead or a co-lead', () => {
    expect(shouldAutoRemove(data, 'lead')).toBe(false);
    expect(shouldAutoRemove(data, 'co')).toBe(false);
  });

  it('never removes hand-added, admin-added or invited members', () => {
    expect(shouldAutoRemove(data, 'hand')).toBe(false);
    expect(shouldAutoRemove(data, 'admin')).toBe(false);
    expect(shouldAutoRemove(data, 'invited')).toBe(false);
  });

  it('is a no-op for removed or unknown uids', () => {
    expect(shouldAutoRemove(data, 'gone')).toBe(false);
    expect(shouldAutoRemove(data, 'nobody')).toBe(false);
  });
});

describe('applyAutoRosterAdds / applyAutoRosterRemoval', () => {
  it('adds viewers and keeps indexes in lockstep', () => {
    const data = group({ lead: member('lead', 'lead') });
    const next = applyAutoRosterAdds(data, [acct('a')], 'TS');
    expect(next.members.a).toEqual({
      uid: 'a',
      email: 'a@orono.k12.mn.us',
      displayName: 'A',
      role: 'viewer',
      joinedAt: 'TS',
      status: 'active',
      addedBy: 'autoRoster',
    });
    expect(next.memberUids).toEqual(['lead', 'a']);
    expect(next.memberEmails).toEqual({
      lead: 'lead@orono.k12.mn.us',
      a: 'a@orono.k12.mn.us',
    });
  });

  it('marks removed and drops from the indexes', () => {
    const data = group({
      lead: member('lead', 'lead'),
      a: member('a', 'viewer', { addedBy: 'autoRoster' }),
    });
    const next = applyAutoRosterRemoval(data, 'a');
    expect(next.members.a.status).toBe('removed');
    expect(next.members.a.addedBy).toBe('autoRoster');
    expect(next.memberUids).toEqual(['lead']);
    expect(next.memberEmails).toEqual({ lead: 'lead@orono.k12.mn.us' });
  });
});

describe('parseCreateBuildingGroupPayload', () => {
  it('normalizes emails, aliases and co-leads', () => {
    expect(
      parseCreateBuildingGroupPayload({
        orgId: ' orono ',
        buildingId: 'orono-middle-school',
        name: ' OMS Staff ',
        leadEmail: 'Lead@Orono.k12.mn.us',
        coLeadEmails: [
          'co@orono.k12.mn.us',
          'CO@orono.k12.mn.us',
          'lead@orono.k12.mn.us',
        ],
        autoRoster: true,
      })
    ).toEqual({
      orgId: 'orono',
      buildingId: 'middle',
      name: 'OMS Staff',
      leadEmail: 'lead@orono.k12.mn.us',
      coLeadEmails: ['co@orono.k12.mn.us'],
      autoRoster: true,
    });
  });

  it('rejects missing fields and bad emails', () => {
    const base = { orgId: 'o', buildingId: 'b', name: 'n', leadEmail: 'a@b.c' };
    expect(() => parseCreateBuildingGroupPayload(null)).toThrow();
    expect(() =>
      parseCreateBuildingGroupPayload({ ...base, orgId: '' })
    ).toThrow();
    expect(() =>
      parseCreateBuildingGroupPayload({ ...base, buildingId: '' })
    ).toThrow();
    expect(() =>
      parseCreateBuildingGroupPayload({ ...base, name: '' })
    ).toThrow();
    expect(() =>
      parseCreateBuildingGroupPayload({ ...base, leadEmail: 'x' })
    ).toThrow();
    expect(() =>
      parseCreateBuildingGroupPayload({ ...base, coLeadEmails: ['nope'] })
    ).toThrow();
    expect(parseCreateBuildingGroupPayload(base).autoRoster).toBe(false);
  });
});

describe('assertCallerIsOrgAdmin', () => {
  it('admits org super/domain admins and the operator super admin', async () => {
    const { deps } = makeDeps({
      'organizations/acme/members/boss@acme.org': {
        roleId: 'domain_admin',
        status: 'active',
      },
      'organizations/orono/members/root@orono.k12.mn.us': {
        roleId: 'super_admin',
      },
    });
    await expect(
      assertCallerIsOrgAdmin(deps.db, 'acme', 'boss@acme.org')
    ).resolves.toBeUndefined();
    await expect(
      assertCallerIsOrgAdmin(deps.db, 'acme', 'root@orono.k12.mn.us')
    ).resolves.toBeUndefined();
  });

  it('rejects teachers, building admins and inactive or removed admins', async () => {
    const { deps } = makeDeps({
      'organizations/acme/members/t@acme.org': { roleId: 'teacher' },
      'organizations/acme/members/b@acme.org': { roleId: 'building_admin' },
      'organizations/acme/members/x@acme.org': {
        roleId: 'domain_admin',
        status: 'inactive',
      },
      'organizations/acme/members/r@acme.org': {
        roleId: 'super_admin',
        status: 'removed',
      },
    });
    for (const email of [
      't@acme.org',
      'b@acme.org',
      'x@acme.org',
      'r@acme.org',
      'none@acme.org',
    ]) {
      await expect(
        assertCallerIsOrgAdmin(deps.db, 'acme', email)
      ).rejects.toMatchObject({
        code: 'permission-denied',
      });
    }
  });
});

function rosterSeed(): Record<string, StubData> {
  return {
    'organizations/orono/buildings/middle': { name: 'Middle School' },
    'organizations/orono/buildings/high': { name: 'High School' },
    'organizations/orono/members/lead@orono.k12.mn.us': orgMember('lead'),
    'organizations/orono/members/co@orono.k12.mn.us': orgMember('co'),
    'organizations/orono/members/t1@orono.k12.mn.us': orgMember('t1'),
    'organizations/orono/members/t2@orono.k12.mn.us': orgMember('t2'),
    'organizations/orono/members/off@orono.k12.mn.us': orgMember('off', {
      status: 'inactive',
    }),
    'users/lead/userProfile/profile': { selectedBuildings: ['middle'] },
    'users/co/userProfile/profile': { selectedBuildings: ['high'] },
    'users/t1/userProfile/profile': { selectedBuildings: ['middle', 'high'] },
    'users/t2/userProfile/profile': {
      selectedBuildings: ['orono-middle-school'],
    },
    'users/off/userProfile/profile': { selectedBuildings: ['middle'] },
    'users/outsider/userProfile/profile': { selectedBuildings: ['middle'] },
    'users/hs/userProfile/profile': { selectedBuildings: ['high'] },
    'users/t1/userProfile/other': { selectedBuildings: ['middle'] },
  };
}

describe('createBuildingGroup', () => {
  const payload = {
    orgId: ORG,
    buildingId: 'middle',
    name: 'OMS Staff',
    leadEmail: 'lead@orono.k12.mn.us',
    coLeadEmails: ['co@orono.k12.mn.us'],
    autoRoster: true,
  };

  it('writes the group and backfills signed-in org staff of the building', async () => {
    const { stub, deps } = makeDeps(rosterSeed());
    const { plcId, added } = await createBuildingGroup(deps, payload);
    const doc = stub.get(`plcs/${plcId}`)!;
    expect(doc).toMatchObject({
      name: 'OMS Staff',
      orgId: ORG,
      buildingId: 'middle',
      groupType: 'building',
      autoRoster: true,
      leadUid: 'lead',
      createdAt: 'TS',
      updatedAt: 'TS',
    });
    const members = doc.members as Record<string, Record<string, unknown>>;
    expect(members.lead).toMatchObject({
      role: 'lead',
      addedBy: 'admin',
      status: 'active',
    });
    expect(members.co).toMatchObject({ role: 'coLead', addedBy: 'admin' });
    // t1 and t2 (legacy alias) join; off is inactive, outsider has no org doc.
    expect(added).toBe(2);
    expect(members.t1).toMatchObject({ role: 'viewer', addedBy: 'autoRoster' });
    expect(members.t2).toMatchObject({ role: 'viewer', addedBy: 'autoRoster' });
    expect(members.off).toBeUndefined();
    expect(members.outsider).toBeUndefined();
    expect(members.hs).toBeUndefined();
    expect([...(doc.memberUids as string[])].sort()).toEqual([
      'co',
      'lead',
      't1',
      't2',
    ]);
    expect(Object.keys(doc.memberEmails as object).sort()).toEqual([
      'co',
      'lead',
      't1',
      't2',
    ]);
  });

  it('skips the backfill when auto-roster is off', async () => {
    const { stub, deps } = makeDeps(rosterSeed());
    const { plcId, added } = await createBuildingGroup(deps, {
      ...payload,
      autoRoster: false,
    });
    expect(added).toBe(0);
    expect(stub.get(`plcs/${plcId}`)!.memberUids).toEqual(['lead', 'co']);
  });

  it('rejects a lead or co-lead without an account', async () => {
    const { deps } = makeDeps(rosterSeed());
    await expect(
      createBuildingGroup(deps, {
        ...payload,
        leadEmail: 'ghost@orono.k12.mn.us',
      })
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(
      createBuildingGroup(deps, {
        ...payload,
        coLeadEmails: ['ghost@orono.k12.mn.us'],
      })
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects a building the org does not have', async () => {
    const { deps } = makeDeps(rosterSeed());
    await expect(
      createBuildingGroup(deps, { ...payload, buildingId: 'mars' })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

describe('rosterBuildingGroup', () => {
  it('is idempotent and keeps a lead-removed member out', async () => {
    const seed = rosterSeed();
    seed['plcs/g1'] = group({
      lead: member('lead', 'lead', { addedBy: 'admin' }),
      t1: member('t1', 'viewer', { addedBy: 'autoRoster', status: 'removed' }),
    });
    const { stub, deps } = makeDeps(seed);
    expect(await rosterBuildingGroup(deps, 'g1')).toBe(1);
    expect(await rosterBuildingGroup(deps, 'g1')).toBe(0);
    const doc = stub.get('plcs/g1')!;
    expect((doc.members as Record<string, { status: string }>).t1.status).toBe(
      'removed'
    );
    expect(doc.memberUids).toEqual(['lead', 't2']);
  });

  it('does nothing for a group without auto-roster', async () => {
    const seed = rosterSeed();
    seed['plcs/g1'] = group(
      { lead: member('lead', 'lead') },
      { autoRoster: false }
    );
    const { deps } = makeDeps(seed);
    expect(await rosterBuildingGroup(deps, 'g1')).toBe(0);
  });
});

describe('syncBuildingGroup', () => {
  it('turns auto-roster on and backfills', async () => {
    const seed = rosterSeed();
    seed['organizations/orono/members/boss@orono.k12.mn.us'] = orgMember(
      'boss',
      {
        roleId: 'domain_admin',
      }
    );
    seed['plcs/g1'] = group(
      { lead: member('lead', 'lead') },
      { autoRoster: false }
    );
    const { stub, deps } = makeDeps(seed);
    const out = await syncBuildingGroup(
      deps,
      'g1',
      'boss@orono.k12.mn.us',
      true
    );
    expect(out).toEqual({ added: 2, autoRoster: true });
    expect(stub.get('plcs/g1')!.autoRoster).toBe(true);
  });

  it('renames without touching auto-roster', async () => {
    const seed = rosterSeed();
    seed['organizations/orono/members/boss@orono.k12.mn.us'] = orgMember(
      'boss',
      { roleId: 'domain_admin' }
    );
    seed['plcs/g1'] = group(
      { lead: member('lead', 'lead') },
      { autoRoster: false }
    );
    const { stub, deps } = makeDeps(seed);
    const out = await syncBuildingGroup(
      deps,
      'g1',
      'boss@orono.k12.mn.us',
      undefined,
      'OHS Staff'
    );
    expect(out).toEqual({ added: 0, autoRoster: false });
    expect(stub.get('plcs/g1')!.name).toBe('OHS Staff');
  });

  it('rejects a non-admin and a non-building group', async () => {
    const seed = rosterSeed();
    seed['plcs/g1'] = group({ lead: member('lead', 'lead') });
    seed['plcs/p1'] = group(
      { lead: member('lead', 'lead') },
      { groupType: 'plc' }
    );
    const { deps } = makeDeps(seed);
    await expect(
      syncBuildingGroup(deps, 'g1', 't1@orono.k12.mn.us', undefined)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      syncBuildingGroup(deps, 'p1', 't1@orono.k12.mn.us', undefined)
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('applyProfileBuildingsChange', () => {
  function seedGroups(): Record<string, StubData> {
    const seed = rosterSeed();
    seed['plcs/mid'] = group({
      lead: member('lead', 'lead', { addedBy: 'admin' }),
      t1: member('t1', 'viewer', { addedBy: 'autoRoster' }),
      hand: member('hand', 'viewer'),
    });
    seed['plcs/hs'] = group(
      { co: member('co', 'lead', { addedBy: 'admin' }) },
      { buildingId: 'high', leadUid: 'co' }
    );
    seed['plcs/hsOff'] = group(
      { co: member('co', 'lead') },
      { buildingId: 'high', leadUid: 'co', autoRoster: false }
    );
    seed['plcs/plc'] = group(
      { co: member('co', 'lead') },
      { buildingId: 'high', leadUid: 'co', groupType: 'plc' }
    );
    seed['plcs/other'] = group(
      { co: member('co', 'lead') },
      { buildingId: 'high', leadUid: 'co', orgId: 'elsewhere' }
    );
    return seed;
  }

  it('moves an auto-added member between building groups', async () => {
    const { stub, deps } = makeDeps(seedGroups());
    const out = await applyProfileBuildingsChange(
      deps,
      't1',
      ['middle'],
      ['high']
    );
    expect(out).toEqual({ added: ['hs'], removed: ['mid'] });
    const mid = stub.get('plcs/mid')!;
    expect((mid.members as Record<string, { status: string }>).t1.status).toBe(
      'removed'
    );
    expect(mid.memberUids).toEqual(['lead', 'hand']);
    const hs = stub.get('plcs/hs')!;
    expect(hs.memberUids).toEqual(['co', 't1']);
    expect((hs.members as Record<string, { addedBy: string }>).t1.addedBy).toBe(
      'autoRoster'
    );
    // Off, non-building and other-org groups are untouched.
    expect(stub.get('plcs/hsOff')!.memberUids).toEqual(['co']);
    expect(stub.get('plcs/plc')!.memberUids).toEqual(['co']);
    expect(stub.get('plcs/other')!.memberUids).toEqual(['co']);
  });

  it('is idempotent', async () => {
    const { stub, deps } = makeDeps(seedGroups());
    await applyProfileBuildingsChange(deps, 't1', ['middle'], ['high']);
    const second = await applyProfileBuildingsChange(
      deps,
      't1',
      ['middle'],
      ['high']
    );
    expect(second).toEqual({ added: [], removed: [] });
    expect(stub.get('plcs/hs')!.memberUids).toEqual(['co', 't1']);
  });

  it('never removes the lead or a hand-added member', async () => {
    const { stub, deps } = makeDeps(seedGroups());
    expect(
      await applyProfileBuildingsChange(deps, 'lead', ['middle'], [])
    ).toEqual({
      added: [],
      removed: [],
    });
    expect(
      await applyProfileBuildingsChange(deps, 'hand', ['middle'], [])
    ).toEqual({
      added: [],
      removed: [],
    });
    expect(stub.get('plcs/mid')!.memberUids).toEqual(['lead', 't1', 'hand']);
  });

  it('ignores an alias-only change and a user outside the org', async () => {
    const { stub, deps } = makeDeps(seedGroups());
    expect(
      await applyProfileBuildingsChange(
        deps,
        't1',
        ['middle'],
        ['orono-middle-school']
      )
    ).toEqual({ added: [], removed: [] });
    expect(
      await applyProfileBuildingsChange(deps, 'outsider', [], ['high'])
    ).toEqual({
      added: [],
      removed: [],
    });
    expect(stub.get('plcs/hs')!.memberUids).toEqual(['co']);
  });

  it('brings back a member auto-removed earlier when they return', async () => {
    const { stub, deps } = makeDeps(seedGroups());
    await applyProfileBuildingsChange(deps, 't1', ['middle'], []);
    await applyProfileBuildingsChange(deps, 't1', [], ['middle']);
    const mid = stub.get('plcs/mid')!;
    expect((mid.members as Record<string, { status: string }>).t1.status).toBe(
      'active'
    );
    expect(mid.memberUids).toEqual(['lead', 't1', 'hand']);
  });
});
