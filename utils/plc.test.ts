import { describe, it, expect } from 'vitest';
import {
  getPlcMemberEmails,
  getPlcTeammateEmails,
  getPlcMembers,
  getPlcRole,
  isPlcLeadOrCoLead,
  canEditPlcContent,
  tsToMillis,
} from './plc';
import { Plc, PlcMember } from '@/types';

describe('plc helpers', () => {
  // Legacy-shape PLC (no `members` map) — exercises the back-compat
  // fallback path in the helpers that synthesizes membership from the
  // denormalized arrays.
  const mockPlc = {
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
  } as unknown as Plc;

  describe('getPlcMemberEmails', () => {
    it('returns normalized and de-duped member emails', () => {
      const emails = getPlcMemberEmails(mockPlc);
      // memberUids is the source of truth, so user-4's email is excluded
      // even though it has a memberEmails entry — its UID isn't in memberUids.
      // user-1: 'user-1@example.com'
      // user-2: 'user-2@example.com'
      // user-3: 'user-1@example.com' (duplicate of user-1 after normalization)
      expect(emails).toHaveLength(2);
      expect(emails).toContain('user-1@example.com');
      expect(emails).toContain('user-2@example.com');
      expect(emails).not.toContain('user-4@example.com');
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
        memberUids: ['u1', 'u2', 'u3', 'u4'],
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
    it('excludes the caller by uid and by email alias', () => {
      const emails = getPlcTeammateEmails(mockPlc, 'user-1');
      // memberUids: ['user-1', 'user-2', 'user-3']
      // filtered teammate uids: ['user-2', 'user-3']
      // user-2 -> 'user-2@example.com'
      // user-3 -> 'user-1@example.com' (the caller's email under a UID alias;
      //          the helper drops it so we don't try to grant the caller a
      //          permission they already have on the sheet they own).
      expect(emails).toEqual(['user-2@example.com']);
      expect(emails).not.toContain('user-1@example.com');
      expect(emails).not.toContain('USER-1@example.com '); // not raw casing/whitespace
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
      // No self-uid match, so the only de-dup happens on email value.
      // 'external-user' has no email entry, so the alias-self check is a no-op.
      expect(emails).toHaveLength(2);
      expect(emails).toContain('user-1@example.com');
      expect(emails).toContain('user-2@example.com');
    });

    it('handles missing memberEmails gracefully', () => {
      const noEmailsPlc = {
        ...mockPlc,
        memberEmails: undefined,
      } as unknown as Plc;
      expect(getPlcTeammateEmails(noEmailsPlc, 'user-1')).toEqual([]);
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

  // ---------------------------------------------------------------------------
  // Members map + roles model (T1)
  // ---------------------------------------------------------------------------

  const makeMember = (overrides: Partial<PlcMember>): PlcMember => ({
    uid: 'u',
    email: 'u@example.com',
    displayName: 'U',
    role: 'member',
    joinedAt: 1000,
    status: 'active',
    ...overrides,
  });

  const mapPlc = (members: Record<string, PlcMember>): Plc =>
    ({
      id: 'plc-map',
      name: 'Map PLC',
      leadUid: 'lead-1',
      memberUids: Object.keys(members),
      memberEmails: Object.fromEntries(
        Object.values(members).map((m) => [m.uid, m.email])
      ),
      members,
      createdAt: 1000,
      updatedAt: 1000,
    }) as Plc;

  describe('getPlcMembers', () => {
    it('reads the canonical members map when present', () => {
      const plc = mapPlc({
        'lead-1': makeMember({
          uid: 'lead-1',
          email: 'lead@example.com',
          displayName: 'Lead',
          role: 'lead',
          joinedAt: 100,
        }),
        'mem-2': makeMember({
          uid: 'mem-2',
          email: 'mem@example.com',
          displayName: 'Member',
          role: 'member',
          joinedAt: 200,
        }),
      });
      const members = getPlcMembers(plc);
      expect(members.map((m) => m.uid).sort()).toEqual(['lead-1', 'mem-2']);
      const lead = members.find((m) => m.uid === 'lead-1');
      expect(lead?.role).toBe('lead');
      expect(lead?.displayName).toBe('Lead');
      expect(lead?.joinedAt).toBe(100);
    });

    it('excludes removed members from the map', () => {
      const plc = mapPlc({
        'lead-1': makeMember({ uid: 'lead-1', role: 'lead' }),
        'gone-3': makeMember({ uid: 'gone-3', status: 'removed' }),
      });
      expect(getPlcMembers(plc).map((m) => m.uid)).toEqual(['lead-1']);
    });

    it('synthesizes members from legacy arrays when the map is absent', () => {
      const members = getPlcMembers(mockPlc);
      // memberUids: ['user-1', 'user-2', 'user-3']
      expect(members.map((m) => m.uid)).toEqual(['user-1', 'user-2', 'user-3']);
      // Lead uid gets role 'lead'; everyone else 'member'.
      expect(getPlcRole(mockPlc, 'user-1')).toBe('lead');
      expect(getPlcRole(mockPlc, 'user-2')).toBe('member');
      // Emails are normalized + a best-effort displayName is derived.
      const lead = members.find((m) => m.uid === 'user-1');
      expect(lead?.email).toBe('user-1@example.com');
      expect(lead?.displayName).toBe('user-1');
      expect(lead?.joinedAt).toBe(0);
      expect(lead?.status).toBe('active');
    });

    it('treats an empty members map as un-migrated and falls back to arrays', () => {
      // A backfilled PLC always has at least the lead in `members`, so an
      // empty `{}` can only mean "not yet migrated" — fall back to the arrays.
      const plc = {
        ...mockPlc,
        members: {},
      } as Plc;
      expect(getPlcMembers(plc).map((m) => m.uid)).toEqual([
        'user-1',
        'user-2',
        'user-3',
      ]);
    });
  });

  describe('getPlcRole', () => {
    it('returns the role from the members map', () => {
      const plc = mapPlc({
        'lead-1': makeMember({ uid: 'lead-1', role: 'lead' }),
        'co-2': makeMember({ uid: 'co-2', role: 'coLead' }),
        'view-3': makeMember({ uid: 'view-3', role: 'viewer' }),
      });
      expect(getPlcRole(plc, 'lead-1')).toBe('lead');
      expect(getPlcRole(plc, 'co-2')).toBe('coLead');
      expect(getPlcRole(plc, 'view-3')).toBe('viewer');
    });

    it('returns null for a non-member', () => {
      const plc = mapPlc({
        'lead-1': makeMember({ uid: 'lead-1', role: 'lead' }),
      });
      expect(getPlcRole(plc, 'stranger')).toBeNull();
    });

    it('returns null for a removed member', () => {
      const plc = mapPlc({
        'lead-1': makeMember({ uid: 'lead-1', role: 'lead' }),
        'gone-3': makeMember({ uid: 'gone-3', status: 'removed' }),
      });
      expect(getPlcRole(plc, 'gone-3')).toBeNull();
    });
  });

  describe('isPlcLeadOrCoLead', () => {
    const plc = mapPlc({
      'lead-1': makeMember({ uid: 'lead-1', role: 'lead' }),
      'co-2': makeMember({ uid: 'co-2', role: 'coLead' }),
      'mem-3': makeMember({ uid: 'mem-3', role: 'member' }),
      'view-4': makeMember({ uid: 'view-4', role: 'viewer' }),
    });

    it('detects lead and coLead', () => {
      expect(isPlcLeadOrCoLead(plc, 'lead-1')).toBe(true);
      expect(isPlcLeadOrCoLead(plc, 'co-2')).toBe(true);
    });

    it('rejects member, viewer, and non-members', () => {
      expect(isPlcLeadOrCoLead(plc, 'mem-3')).toBe(false);
      expect(isPlcLeadOrCoLead(plc, 'view-4')).toBe(false);
      expect(isPlcLeadOrCoLead(plc, 'stranger')).toBe(false);
    });
  });

  describe('canEditPlcContent', () => {
    const plc = mapPlc({
      'lead-1': makeMember({ uid: 'lead-1', role: 'lead' }),
      'co-2': makeMember({ uid: 'co-2', role: 'coLead' }),
      'mem-3': makeMember({ uid: 'mem-3', role: 'member' }),
      'view-4': makeMember({ uid: 'view-4', role: 'viewer' }),
    });

    it('allows lead, coLead, and member to edit', () => {
      expect(canEditPlcContent(plc, 'lead-1')).toBe(true);
      expect(canEditPlcContent(plc, 'co-2')).toBe(true);
      expect(canEditPlcContent(plc, 'mem-3')).toBe(true);
    });

    it('blocks viewer from editing', () => {
      expect(canEditPlcContent(plc, 'view-4')).toBe(false);
    });

    it('blocks non-members from editing', () => {
      expect(canEditPlcContent(plc, 'stranger')).toBe(false);
    });
  });

  describe('email helpers read the members map first', () => {
    it('getPlcMemberEmails prefers the map and dedups + lowercases', () => {
      const plc = mapPlc({
        'lead-1': makeMember({ uid: 'lead-1', email: 'LEAD@example.com' }),
        'mem-2': makeMember({ uid: 'mem-2', email: 'mem@example.com' }),
        'dup-3': makeMember({ uid: 'dup-3', email: 'lead@example.com' }),
      });
      const emails = getPlcMemberEmails(plc);
      expect(emails.sort()).toEqual(['lead@example.com', 'mem@example.com']);
    });

    it('getPlcTeammateEmails prefers the map and drops self', () => {
      const plc = mapPlc({
        'lead-1': makeMember({ uid: 'lead-1', email: 'lead@example.com' }),
        'mem-2': makeMember({ uid: 'mem-2', email: 'mem@example.com' }),
      });
      expect(getPlcTeammateEmails(plc, 'lead-1')).toEqual(['mem@example.com']);
    });
  });

  describe('tsToMillis', () => {
    it('reads .toMillis() from a Firestore Timestamp-like value', () => {
      const fakeTimestamp = { toMillis: () => 1717000000000 };
      expect(tsToMillis(fakeTimestamp)).toBe(1717000000000);
    });

    it('passes through a legacy numeric millis value', () => {
      expect(tsToMillis(1717000000000)).toBe(1717000000000);
      expect(tsToMillis(0)).toBe(0);
    });

    it('returns 0 for undefined / null / unrecognized values', () => {
      expect(tsToMillis(undefined)).toBe(0);
      expect(tsToMillis(null)).toBe(0);
      expect(tsToMillis('not-a-time')).toBe(0);
      expect(tsToMillis({})).toBe(0);
    });
  });
});
