import { describe, it, expect } from 'vitest';
import { getPlcMemberEmails, getPlcTeammateEmails } from './plc';
import { Plc } from '@/types';

describe('plc helpers', () => {
  const mockPlc: Plc = {
    id: 'plc-123',
    name: 'Test PLC',
    leadUid: 'user-1',
    memberUids: ['user-1', 'user-2', 'user-3'],
    memberEmails: {
      'user-1': 'USER-1@example.com ',
      'user-2': 'user-2@example.com',
      'user-3': ' USER-1@example.com', // Duplicate email (normalized)
      'user-4': 'user-4@example.com', // UID not in memberUids
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  describe('getPlcMemberEmails', () => {
    it('returns normalized and de-duped member emails', () => {
      const emails = getPlcMemberEmails(mockPlc);
      // user-1: 'user-1@example.com'
      // user-2: 'user-2@example.com'
      // user-3: 'user-1@example.com' (duplicate)
      // user-4: 'user-4@example.com' (included because it uses Object.values(plc.memberEmails))
      expect(emails).toHaveLength(3);
      expect(emails).toContain('user-1@example.com');
      expect(emails).toContain('user-2@example.com');
      expect(emails).toContain('user-4@example.com');
    });

    it('handles missing memberEmails', () => {
      const emptyPlc = {
        ...mockPlc,
        memberEmails: undefined,
      } as unknown as Plc;
      expect(getPlcMemberEmails(emptyPlc)).toEqual([]);
    });

    it('skips non-string values and empty strings', () => {
      const weirdPlc = {
        ...mockPlc,
        memberEmails: {
          u1: ' a@b.com ',
          u2: '',
          u3: '  ',
          u4: 123 as unknown as string,
        },
      } as Plc;
      expect(getPlcMemberEmails(weirdPlc)).toEqual(['a@b.com']);
    });
  });

  describe('getPlcTeammateEmails', () => {
    it('excludes the caller (selfUid)', () => {
      const emails = getPlcTeammateEmails(mockPlc, 'user-1');
      // memberUids: ['user-1', 'user-2', 'user-3']
      // filtered: ['user-2', 'user-3']
      // user-2 -> user-2@example.com
      // user-3 -> user-1@example.com (Wait, memberEmails[user-3] is ' USER-1@example.com')
      expect(emails).toHaveLength(2);
      expect(emails).toContain('user-2@example.com');
      expect(emails).toContain('user-1@example.com');
      expect(emails).not.toContain('USER-1@example.com '); // should be normalized
    });

    it('returns empty array if selfUid is the only member', () => {
      const singleMemberPlc = {
        ...mockPlc,
        memberUids: ['user-1'],
        memberEmails: { 'user-1': 'user-1@example.com' },
      } as Plc;
      expect(getPlcTeammateEmails(singleMemberPlc, 'user-1')).toEqual([]);
    });

    it('handles selfUid not being in memberUids', () => {
      const emails = getPlcTeammateEmails(mockPlc, 'external-user');
      // memberUids: ['user-1', 'user-2', 'user-3']
      // none filtered
      expect(emails).toHaveLength(2); // user-1 and user-3 share same email after normalization
      expect(emails).toContain('user-1@example.com');
      expect(emails).toContain('user-2@example.com');
    });

    it('skips UIDs with missing or invalid emails', () => {
      const mixedPlc = {
        ...mockPlc,
        memberUids: ['u1', 'u2', 'u3', 'u4'],
        memberEmails: {
          u1: 'keep@me.com',
          u2: '  ', // empty
          u4: 456 as unknown as string, // non-string
          // u3 is missing
        },
      } as Plc;
      expect(getPlcTeammateEmails(mixedPlc, 'none')).toEqual(['keep@me.com']);
    });

    it('normalizes and de-dupes teammate emails', () => {
      const dupPlc = {
        ...mockPlc,
        memberUids: ['u1', 'u2', 'u3'],
        memberEmails: {
          u1: 'SAME@example.com',
          u2: 'same@example.com ',
          u3: 'other@example.com',
        },
      } as Plc;
      const emails = getPlcTeammateEmails(dupPlc, 'u4');
      expect(emails).toHaveLength(2);
      expect(emails).toContain('same@example.com');
      expect(emails).toContain('other@example.com');
    });
  });
});
