import { describe, it, expect } from 'vitest';
import { getPlcMemberEmails, getPlcTeammateEmails } from './plc';
import { Plc } from '@/types';

const mockPlc: Plc = {
  id: 'plc-123',
  name: 'Test PLC',
  leadUid: 'user-1',
  memberUids: ['user-1', 'user-2', 'user-3'],
  memberEmails: {
    'user-1': 'User1@example.com',
    'user-2': 'user2@example.com ',
    'user-3': 'USER3@EXAMPLE.COM',
  },
  createdAt: 123456789,
  updatedAt: 123456789,
};

describe('plc utils', () => {
  describe('getPlcMemberEmails', () => {
    it('returns all normalized and de-duped member emails', () => {
      const plc: Plc = {
        ...mockPlc,
        memberEmails: {
          u1: ' ALICE@example.com ',
          u2: 'alice@example.com', // Duplicate after normalization
          u3: 'BOB@example.com',
          u4: '', // Empty string should be ignored
          u5: 'charles@example.com',
        },
      };
      const result = getPlcMemberEmails(plc);
      expect(result).toHaveLength(3);
      expect(result).toContain('alice@example.com');
      expect(result).toContain('bob@example.com');
      expect(result).toContain('charles@example.com');
    });

    it('handles missing memberEmails', () => {
      /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */
      const plc: Plc = { ...mockPlc, memberEmails: undefined as any };
      /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */
      expect(getPlcMemberEmails(plc)).toEqual([]);
    });

    it('ignores non-string values', () => {
      /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */
      const plc: Plc = {
        ...mockPlc,
        memberEmails: {
          u1: 'alice@example.com',
          u2: 123 as any,
          u3: null as any,
        },
      };
      /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */
      expect(getPlcMemberEmails(plc)).toEqual(['alice@example.com']);
    });
  });

  describe('getPlcTeammateEmails', () => {
    it('returns teammate emails excluding selfUid', () => {
      const result = getPlcTeammateEmails(mockPlc, 'user-1');
      expect(result).toHaveLength(2);
      expect(result).toContain('user2@example.com');
      expect(result).toContain('user3@example.com');
      expect(result).not.toContain('user1@example.com');
    });

    it('normalizes and de-dupes teammate emails', () => {
      const plc: Plc = {
        ...mockPlc,
        memberUids: ['u1', 'u2', 'u3'],
        memberEmails: {
          u1: 'self@example.com',
          u2: ' TEAMMATE@example.com ',
          u3: 'teammate@example.com',
        },
      };
      const result = getPlcTeammateEmails(plc, 'u1');
      expect(result).toEqual(['teammate@example.com']);
    });

    it('handles selfUid not being in the member list', () => {
      const result = getPlcTeammateEmails(mockPlc, 'non-existent');
      expect(result).toHaveLength(3);
      expect(result).toContain('user1@example.com');
      expect(result).toContain('user2@example.com');
      expect(result).toContain('user3@example.com');
    });

    it('ignores teammates with missing or invalid emails', () => {
      const plc: Plc = {
        ...mockPlc,
        memberUids: ['u1', 'u2', 'u3'],
        memberEmails: {
          u1: 'self@example.com',
          u2: '', // Empty
          // u3 is missing from memberEmails
        },
      };
      const result = getPlcTeammateEmails(plc, 'u1');
      expect(result).toEqual([]);
    });

    it('ignores non-string teammate values', () => {
      /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */
      const plc: Plc = {
        ...mockPlc,
        memberUids: ['u1', 'u2', 'u3', 'u4'],
        memberEmails: {
          u1: 'self@example.com',
          u2: 42 as any,
          u3: null as any,
          u4: 'teammate@example.com',
        },
      };
      /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */
      expect(getPlcTeammateEmails(plc, 'u1')).toEqual(['teammate@example.com']);
    });

    it('handles missing memberEmails gracefully', () => {
      /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */
      const plc: Plc = { ...mockPlc, memberEmails: undefined as any };
      /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */
      expect(getPlcTeammateEmails(plc, 'user-1')).toEqual([]);
    });
  });
});
