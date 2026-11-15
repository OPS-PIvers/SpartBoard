import { describe, it, expect, vi } from 'vitest';
import type { Plc } from '@/types';

vi.mock('@/config/firebase', () => ({ db: {} }));

import { describeSharer } from '@/utils/shareImportPeek';

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

describe('describeSharer', () => {
  it('names a PLC teammate with email and group, or by name only', () => {
    expect(describeSharer('mate', 'me', [plc])).toBe(
      'Jordan Lee (jordan.lee@orono.k12.mn.us) via 7th Grade Math'
    );
    expect(describeSharer('mate', 'me', [plc], true)).toBe('Jordan Lee');
  });

  it('says You for the importer', () => {
    expect(describeSharer('me', 'me', [plc], true)).toBe('You');
  });

  it('never shows an id for someone outside the PLCs', () => {
    expect(describeSharer('outsider-uid', 'me', [plc])).toBe(
      'Someone outside your PLCs'
    );
    expect(describeSharer('', 'me', [plc], true)).toBe(
      'Someone outside your PLCs'
    );
  });
});
