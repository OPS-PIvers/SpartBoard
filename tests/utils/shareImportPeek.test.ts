import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { getDocs, where } from 'firebase/firestore';
import type { Plc } from '@/types';

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...path: string[]) => path.join('/')),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  query: vi.fn((col: string) => col),
  where: vi.fn(),
}));

import { describeSharer, lookupOrgSharer } from '@/utils/shareImportPeek';

const plc = {
  id: 'p1',
  name: '7th Grade Math',
  memberUids: ['me', 'mate'],
  members: {
    mate: {
      uid: 'mate',
      email: 'jordan.lee@orono.k12.mn.us',
      displayName: 'Jordan Lee',
      role: 'member',
      joinedAt: 0,
      status: 'active',
    },
  },
} as unknown as Plc;

const colleague = { name: 'Sam Rivera', email: 'sam.rivera@orono.k12.mn.us' };

describe('describeSharer', () => {
  it('names an org colleague outside my PLCs with name and email', () => {
    expect(describeSharer('sam', 'me', [plc], colleague)).toBe(
      'Sam Rivera (sam.rivera@orono.k12.mn.us)'
    );
    expect(describeSharer('sam', 'me', [plc], colleague, true)).toBe(
      'Sam Rivera'
    );
  });

  it('adds the PLC for a teammate, from the org record or the roster', () => {
    const fromOrg = { name: 'Jordan Lee', email: 'jordan.lee@orono.k12.mn.us' };
    const full = 'Jordan Lee (jordan.lee@orono.k12.mn.us) via 7th Grade Math';
    expect(describeSharer('mate', 'me', [plc], fromOrg)).toBe(full);
    expect(describeSharer('mate', 'me', [plc], null)).toBe(full);
    expect(describeSharer('mate', 'me', [plc], null, true)).toBe('Jordan Lee');
  });

  it('says You for the importer', () => {
    expect(describeSharer('me', 'me', [plc], null, true)).toBe('You');
  });

  it('never shows an id for someone outside the organization', () => {
    expect(describeSharer('outsider-uid', 'me', [plc], null)).toBe(
      'Someone outside your organization'
    );
    expect(describeSharer('', 'me', [plc], null, true)).toBe(
      'Someone outside your organization'
    );
  });
});

describe('lookupOrgSharer', () => {
  beforeEach(() => vi.clearAllMocks());

  const memberDoc = (id: string, data: Record<string, unknown>) => ({
    docs: [{ id, data: () => data }],
  });

  it('matches the server-linked uid and takes the email from the doc id', async () => {
    (getDocs as Mock).mockResolvedValue(
      memberDoc('sam.rivera@orono.k12.mn.us', {
        uid: 'sam',
        name: 'Sam Rivera',
        roleId: 'teacher',
        status: 'active',
      })
    );
    await expect(lookupOrgSharer('orono', 'sam')).resolves.toEqual(colleague);
    expect(where).toHaveBeenCalledWith('uid', '==', 'sam');
  });

  it('rejects students, inactive members and unknown uids', async () => {
    (getDocs as Mock).mockResolvedValueOnce(
      memberDoc('s@orono.k12.mn.us', { uid: 's', roleId: 'student' })
    );
    await expect(lookupOrgSharer('orono', 's')).resolves.toBeNull();
    (getDocs as Mock).mockResolvedValueOnce(
      memberDoc('x@orono.k12.mn.us', { uid: 'x', status: 'inactive' })
    );
    await expect(lookupOrgSharer('orono', 'x')).resolves.toBeNull();
    (getDocs as Mock).mockResolvedValueOnce({ docs: [] });
    await expect(lookupOrgSharer('orono', 'nobody')).resolves.toBeNull();
  });
});
