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
});

describe('rubricMaxPoints', () => {
  it('counts a legacy criterion with no levels as zero', () => {
    const criteria = [{ levels: [{ points: 3 }] }, {}] as unknown as Parameters<
      typeof rubricMaxPoints
    >[0];
    expect(rubricMaxPoints(criteria)).toBe(3);
  });
});
