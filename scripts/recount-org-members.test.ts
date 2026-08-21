// Pure-helper coverage for recount-org-members.js; emailDomain must match organizationMemberCounters.ts's copy exactly.
import { describe, it, expect } from 'vitest';
import { emailDomain, tallyMembers, parseArgs } from './recount-org-members';

describe('emailDomain', () => {
  it('returns lowercase domain with no leading @', () => {
    expect(emailDomain('Paul.Ivers@Orono.K12.MN.US')).toBe('orono.k12.mn.us');
  });

  it('returns empty string for a missing @', () => {
    expect(emailDomain('no-at-sign')).toBe('');
  });

  it('takes the portion after the last @ (defensive against multi-@ inputs)', () => {
    expect(emailDomain('a@b@example.com')).toBe('example.com');
  });

  it('trims incidental whitespace around the domain (parity with the CF trigger)', () => {
    expect(emailDomain('teacher@ orono.k12.mn.us')).toBe('orono.k12.mn.us');
    expect(emailDomain('teacher@orono.k12.mn.us ')).toBe('orono.k12.mn.us');
  });
});

describe('tallyMembers', () => {
  it('counts org total, per-building, and per-domain buckets', () => {
    const members = [
      { email: 'a@orono.k12.mn.us', buildingIds: ['hs'] },
      { email: 'b@orono.k12.mn.us', buildingIds: ['hs', 'ms'] },
      { email: 'c@other.org', buildingIds: [] },
    ];
    const { orgTotal, byBuilding, byDomain } = tallyMembers(members, false);
    expect(orgTotal).toBe(3);
    expect(byBuilding.get('hs')).toBe(2);
    expect(byBuilding.get('ms')).toBe(1);
    expect(byDomain.get('orono.k12.mn.us')).toBe(2);
    expect(byDomain.get('other.org')).toBe(1);
  });

  it('buckets a whitespace-polluted email the same as a clean one', () => {
    const members = [
      { email: 'a@orono.k12.mn.us', buildingIds: [] },
      { email: 'b@ orono.k12.mn.us', buildingIds: [] },
    ];
    const { byDomain } = tallyMembers(members, false);
    // Both members must land in the same bucket, not a phantom " orono.k12.mn.us" split.
    expect(byDomain.get('orono.k12.mn.us')).toBe(2);
    expect(byDomain.size).toBe(1);
  });

  it('ignores non-string / empty building ids and members with no email', () => {
    const members = [
      { buildingIds: ['', 42, null, 'hs'] },
      { email: 42, buildingIds: [] },
    ];
    const { orgTotal, byBuilding, byDomain } = tallyMembers(members, false);
    expect(orgTotal).toBe(2);
    expect(byBuilding.get('hs')).toBe(1);
    expect(byDomain.size).toBe(0);
  });
});

describe('parseArgs', () => {
  it('defaults to org "orono", no dry-run, no verbose', () => {
    expect(parseArgs([])).toEqual({
      dryRun: false,
      orgId: 'orono',
      verbose: false,
      help: false,
    });
  });

  it('parses --dry-run, --org, and --verbose', () => {
    expect(parseArgs(['--dry-run', '--org', 'other-org', '--verbose'])).toEqual(
      {
        dryRun: true,
        orgId: 'other-org',
        verbose: true,
        help: false,
      }
    );
  });
});
