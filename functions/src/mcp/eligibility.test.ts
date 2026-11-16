import { describe, expect, it } from 'vitest';
import { makeStubFirestore } from '../testing/stubFirestore';
import { isActiveOrgMemberOrAdmin } from './eligibility';
import { rubricMaxPoints } from './rubricShape';

const EMAIL = 'teacher@orono.k12.mn.us';
type Db = Parameters<typeof isActiveOrgMemberOrAdmin>[0];

describe('isActiveOrgMemberOrAdmin', () => {
  it('admits an admin with no operator-org member doc', async () => {
    const { db } = makeStubFirestore({ [`admins/${EMAIL}`]: {} });
    expect(
      (await isActiveOrgMemberOrAdmin(db as unknown as Db, EMAIL)).ok
    ).toBe(true);
  });

  it('refuses an admin whose operator-org member doc is deactivated', async () => {
    const { db } = makeStubFirestore({
      [`admins/${EMAIL}`]: {},
      [`organizations/orono/members/${EMAIL}`]: { status: 'inactive' },
    });
    expect(
      (await isActiveOrgMemberOrAdmin(db as unknown as Db, EMAIL)).ok
    ).toBe(false);
  });

  const DOMAIN = {
    [`organizations/orono/domains/d1`]: {
      domain: '@orono.k12.mn.us',
      status: 'verified',
    },
  };

  it('admits an active staff member doc', async () => {
    const { db } = makeStubFirestore({
      ...DOMAIN,
      [`organizations/orono/members/${EMAIL}`]: {
        roleId: 'teacher',
        status: 'active',
      },
    });
    expect(await isActiveOrgMemberOrAdmin(db as unknown as Db, EMAIL)).toEqual({
      ok: true,
      orgId: 'orono',
    });
  });

  it('refuses a student member doc', async () => {
    const { db } = makeStubFirestore({
      ...DOMAIN,
      [`organizations/orono/members/${EMAIL}`]: {
        roleId: 'student',
        status: 'active',
      },
    });
    expect(
      (await isActiveOrgMemberOrAdmin(db as unknown as Db, EMAIL)).ok
    ).toBe(false);
  });

  it('admits an admin whose org member doc is a student one', async () => {
    const { db } = makeStubFirestore({
      ...DOMAIN,
      [`admins/${EMAIL}`]: {},
      [`organizations/orono/members/${EMAIL}`]: {
        roleId: 'student',
        status: 'active',
      },
    });
    expect(
      (await isActiveOrgMemberOrAdmin(db as unknown as Db, EMAIL)).ok
    ).toBe(true);
  });
});

describe('rubricMaxPoints', () => {
  it('counts a legacy criterion with no levels as zero', () => {
    const criteria = [{ levels: [{ points: 3 }] }, {}] as unknown as Parameters<
      typeof rubricMaxPoints
    >[0];
    expect(rubricMaxPoints(criteria)).toBe(3);
  });
});
