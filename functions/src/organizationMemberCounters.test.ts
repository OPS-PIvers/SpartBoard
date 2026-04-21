import { describe, it, expect } from 'vitest';
import {
  planMemberCounterDeltas,
  emailDomain,
  resolveDomainDocId,
  type CounterMemberFields,
} from './organizationMemberCounters';

const EMAIL = 'paul.ivers@orono.k12.mn.us';

const member = (
  overrides: Partial<CounterMemberFields> = {}
): CounterMemberFields => ({
  email: EMAIL,
  buildingIds: [],
  ...overrides,
});

describe('emailDomain', () => {
  it('returns lowercase domain with no leading @', () => {
    expect(emailDomain('Paul.Ivers@Orono.K12.MN.US')).toBe('orono.k12.mn.us');
  });

  it('returns empty string for non-string / missing / malformed input', () => {
    expect(emailDomain(undefined)).toBe('');
    expect(emailDomain(null)).toBe('');
    expect(emailDomain('')).toBe('');
    expect(emailDomain('no-at-sign')).toBe('');
    expect(emailDomain(42)).toBe('');
  });

  it('takes the portion after the last @ (defensive against multi-@ inputs)', () => {
    expect(emailDomain('a@b@example.com')).toBe('example.com');
  });
});

describe('planMemberCounterDeltas', () => {
  it('create (before=null, after=member): +1 org, +1 per building, +1 on domain', () => {
    const deltas = planMemberCounterDeltas(
      null,
      member({ buildingIds: ['orono-high', 'orono-middle'] })
    );

    expect(deltas.orgDelta).toBe(1);
    expect(Object.fromEntries(deltas.buildingDeltas)).toEqual({
      'orono-high': 1,
      'orono-middle': 1,
    });
    expect(Object.fromEntries(deltas.emailDomainDeltas)).toEqual({
      'orono.k12.mn.us': 1,
    });
  });

  it('delete (before=member, after=null): -1 org, -1 per building, -1 on domain', () => {
    const deltas = planMemberCounterDeltas(
      member({ buildingIds: ['orono-high'] }),
      null
    );

    expect(deltas.orgDelta).toBe(-1);
    expect(Object.fromEntries(deltas.buildingDeltas)).toEqual({
      'orono-high': -1,
    });
    expect(Object.fromEntries(deltas.emailDomainDeltas)).toEqual({
      'orono.k12.mn.us': -1,
    });
  });

  it('no-op update (email + buildingIds unchanged): no deltas', () => {
    const deltas = planMemberCounterDeltas(
      member({ buildingIds: ['orono-high'] }),
      member({ buildingIds: ['orono-high'] })
    );

    expect(deltas.orgDelta).toBe(0);
    expect(deltas.buildingDeltas.size).toBe(0);
    expect(deltas.emailDomainDeltas.size).toBe(0);
  });

  it('add one building to an existing member: +1 on new building only', () => {
    const deltas = planMemberCounterDeltas(
      member({ buildingIds: ['orono-high'] }),
      member({ buildingIds: ['orono-high', 'community-ed'] })
    );

    expect(deltas.orgDelta).toBe(0);
    expect(Object.fromEntries(deltas.buildingDeltas)).toEqual({
      'community-ed': 1,
    });
    expect(deltas.emailDomainDeltas.size).toBe(0);
  });

  it('reassign building (A → B): -1 on A, +1 on B', () => {
    const deltas = planMemberCounterDeltas(
      member({ buildingIds: ['orono-high'] }),
      member({ buildingIds: ['orono-middle'] })
    );

    expect(deltas.orgDelta).toBe(0);
    expect(Object.fromEntries(deltas.buildingDeltas)).toEqual({
      'orono-high': -1,
      'orono-middle': 1,
    });
  });

  it('remove all buildings: -1 per previously-assigned building', () => {
    const deltas = planMemberCounterDeltas(
      member({ buildingIds: ['orono-high', 'orono-middle'] }),
      member({ buildingIds: [] })
    );

    expect(deltas.orgDelta).toBe(0);
    expect(Object.fromEntries(deltas.buildingDeltas)).toEqual({
      'orono-high': -1,
      'orono-middle': -1,
    });
  });

  it('assign buildings to a previously-unassigned member (the reported bug)', () => {
    const deltas = planMemberCounterDeltas(
      member({ buildingIds: [] }),
      member({ buildingIds: ['community-ed'] })
    );

    expect(deltas.orgDelta).toBe(0);
    expect(Object.fromEntries(deltas.buildingDeltas)).toEqual({
      'community-ed': 1,
    });
    expect(deltas.emailDomainDeltas.size).toBe(0);
  });

  it('email domain change moves one count between domain buckets', () => {
    const deltas = planMemberCounterDeltas(
      member({ email: 'user@old.example.com' }),
      member({ email: 'user@new.example.com' })
    );

    expect(deltas.orgDelta).toBe(0);
    expect(deltas.buildingDeltas.size).toBe(0);
    expect(Object.fromEntries(deltas.emailDomainDeltas)).toEqual({
      'old.example.com': -1,
      'new.example.com': 1,
    });
  });

  it('missing buildingIds array on either side is treated as empty', () => {
    const deltas = planMemberCounterDeltas(
      { email: EMAIL },
      { email: EMAIL, buildingIds: ['orono-high'] }
    );

    expect(deltas.orgDelta).toBe(0);
    expect(Object.fromEntries(deltas.buildingDeltas)).toEqual({
      'orono-high': 1,
    });
  });

  it('empty-string building ids are ignored', () => {
    const deltas = planMemberCounterDeltas(
      null,
      member({ buildingIds: ['', 'orono-high', ''] })
    );

    expect(Object.fromEntries(deltas.buildingDeltas)).toEqual({
      'orono-high': 1,
    });
  });

  it('duplicate building ids in one array increment per occurrence (matches recount script)', () => {
    const deltas = planMemberCounterDeltas(
      null,
      member({ buildingIds: ['orono-high', 'orono-high'] })
    );

    expect(Object.fromEntries(deltas.buildingDeltas)).toEqual({
      'orono-high': 2,
    });
  });

  it('missing email on either side is skipped (no domain delta)', () => {
    const deltas = planMemberCounterDeltas(
      { buildingIds: [] },
      { buildingIds: ['orono-high'] }
    );

    expect(Object.fromEntries(deltas.emailDomainDeltas)).toEqual({});
  });

  it('create with no email and no buildings: org counter still +1', () => {
    const deltas = planMemberCounterDeltas(null, {});

    expect(deltas.orgDelta).toBe(1);
    expect(deltas.buildingDeltas.size).toBe(0);
    expect(deltas.emailDomainDeltas.size).toBe(0);
  });
});

describe('resolveDomainDocId', () => {
  const DOMAIN_DOCS = [
    { id: 'primary', domain: '@orono.k12.mn.us' },
    { id: 'students', domain: 'students.orono.k12.mn.us' },
    { id: 'broken', domain: null },
  ];

  it('matches stored domain with a leading @', () => {
    expect(resolveDomainDocId('orono.k12.mn.us', DOMAIN_DOCS)).toBe('primary');
  });

  it('matches stored domain without a leading @', () => {
    expect(resolveDomainDocId('students.orono.k12.mn.us', DOMAIN_DOCS)).toBe(
      'students'
    );
  });

  it('returns null when no doc matches', () => {
    expect(resolveDomainDocId('unknown.example.com', DOMAIN_DOCS)).toBeNull();
  });

  it('returns null for empty bucket string', () => {
    expect(resolveDomainDocId('', DOMAIN_DOCS)).toBeNull();
  });

  it('ignores domain docs with non-string `domain` fields', () => {
    expect(
      resolveDomainDocId('anything', [{ id: 'x', domain: null }])
    ).toBeNull();
  });

  it('case-insensitive against stored value', () => {
    expect(
      resolveDomainDocId('orono.k12.mn.us', [
        { id: 'primary', domain: '@ORONO.K12.MN.US' },
      ])
    ).toBe('primary');
  });
});
