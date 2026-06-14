import { describe, it, expect } from 'vitest';
import type { UserTier } from '@/types';
import { deriveUserTier, meetsMinTier } from '@/utils/userTier';

describe('deriveUserTier', () => {
  it('derives internal for an internal-domain email', () => {
    expect(deriveUserTier('teacher@orono.k12.mn.us', false)).toBe('internal');
  });

  it('matches the internal domain case-insensitively', () => {
    expect(deriveUserTier('Teacher@ORONO.K12.MN.US', false)).toBe('internal');
  });

  it('internal wins even when also an org member', () => {
    expect(deriveUserTier('teacher@orono.k12.mn.us', true)).toBe('internal');
  });

  it('derives org for a non-internal org member', () => {
    expect(deriveUserTier('teacher@example.com', true)).toBe('org');
  });

  it('derives free for a non-internal non-member', () => {
    expect(deriveUserTier('teacher@example.com', false)).toBe('free');
  });

  it('does not match a domain that merely contains the internal domain', () => {
    expect(deriveUserTier('x@evil-orono.k12.mn.us.attacker.com', false)).toBe(
      'free'
    );
  });

  it('derives free (or org) for null/undefined email', () => {
    expect(deriveUserTier(null, false)).toBe('free');
    expect(deriveUserTier(undefined, false)).toBe('free');
    expect(deriveUserTier(null, true)).toBe('org');
  });
});

describe('meetsMinTier', () => {
  const tiers: UserTier[] = ['free', 'org', 'internal'];

  it('undefined minTier imposes no restriction (back-compat)', () => {
    for (const tier of tiers) {
      expect(meetsMinTier(tier, undefined)).toBe(true);
    }
  });

  // Full tier × minTier matrix: free < org < internal.
  const matrix: [UserTier, UserTier, boolean][] = [
    ['free', 'free', true],
    ['free', 'org', false],
    ['free', 'internal', false],
    ['org', 'free', true],
    ['org', 'org', true],
    ['org', 'internal', false],
    ['internal', 'free', true],
    ['internal', 'org', true],
    ['internal', 'internal', true],
  ];

  it.each(matrix)('tier %s vs minTier %s → %s', (tier, minTier, expected) => {
    expect(meetsMinTier(tier, minTier)).toBe(expected);
  });
});
