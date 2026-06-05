/**
 * Tests for the NRPS membership client. The single network call goes through
 * the `nrpsNet` seam so these stay pure: they pin pagination, name composition
 * (structured vs. composite `name`), member filtering, and the first-page-error
 * vs. partial-roster semantics.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchNrpsMembers, parseNextLink, nrpsNet } from './nrps';

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseNextLink', () => {
  it('extracts the rel="next" target', () => {
    expect(parseNextLink('<https://lms/memberships?page=2>; rel="next"')).toBe(
      'https://lms/memberships?page=2'
    );
  });

  it('ignores other rels and returns the next among many', () => {
    const header =
      '<https://lms/m?page=1>; rel="first", <https://lms/m?page=3>; rel="next", <https://lms/m?page=9>; rel="last"';
    expect(parseNextLink(header)).toBe('https://lms/m?page=3');
  });

  it('returns null when no next link / empty / null', () => {
    expect(parseNextLink('<https://lms/m>; rel="first"')).toBeNull();
    expect(parseNextLink('')).toBeNull();
    expect(parseNextLink(null)).toBeNull();
  });
});

describe('fetchNrpsMembers', () => {
  it('maps structured given/family names and the LTI sub', async () => {
    vi.spyOn(nrpsNet, 'fetchMembershipPage').mockResolvedValue({
      ok: true,
      status: 200,
      members: [
        {
          user_id: 'sub-1',
          given_name: 'Ada',
          family_name: 'Lovelace',
          name: 'Ada Lovelace',
          roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
          status: 'Active',
        },
      ],
      nextUrl: null,
    });

    const members = await fetchNrpsMembers('https://lms/m', 'tok');
    expect(members).toEqual([
      {
        userId: 'sub-1',
        givenName: 'Ada',
        familyName: 'Lovelace',
        roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
        status: 'Active',
      },
    ]);
  });

  it('falls back to the composite name when given/family are absent', async () => {
    vi.spyOn(nrpsNet, 'fetchMembershipPage').mockResolvedValue({
      ok: true,
      status: 200,
      members: [{ user_id: 'sub-2', name: 'Grace Hopper' }],
      nextUrl: null,
    });

    const members = await fetchNrpsMembers('https://lms/m', 'tok');
    expect(members[0]).toMatchObject({
      userId: 'sub-2',
      givenName: 'Grace Hopper',
      familyName: '',
    });
  });

  it('skips members with no user_id (cannot map to a response doc)', async () => {
    vi.spyOn(nrpsNet, 'fetchMembershipPage').mockResolvedValue({
      ok: true,
      status: 200,
      members: [
        { given_name: 'No', family_name: 'Id' },
        { user_id: 'sub-3', given_name: 'Has', family_name: 'Id' },
      ],
      nextUrl: null,
    });

    const members = await fetchNrpsMembers('https://lms/m', 'tok');
    expect(members.map((m) => m.userId)).toEqual(['sub-3']);
  });

  it('follows Link rel=next pagination and concatenates pages', async () => {
    const spy = vi
      .spyOn(nrpsNet, 'fetchMembershipPage')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        members: [{ user_id: 'a', given_name: 'A', family_name: 'A' }],
        nextUrl: 'https://lms/m?page=2',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        members: [{ user_id: 'b', given_name: 'B', family_name: 'B' }],
        nextUrl: null,
      });

    const members = await fetchNrpsMembers('https://lms/m?page=1', 'tok');
    expect(members.map((m) => m.userId)).toEqual(['a', 'b']);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[1][0]).toBe('https://lms/m?page=2');
  });

  it('throws when the FIRST page errors (distinguishes no-access from empty)', async () => {
    vi.spyOn(nrpsNet, 'fetchMembershipPage').mockResolvedValue({
      ok: false,
      status: 403,
      members: [],
      nextUrl: null,
    });
    await expect(fetchNrpsMembers('https://lms/m', 'tok')).rejects.toThrow(
      /403/
    );
  });

  it('returns the partial roster when a LATER page errors', async () => {
    vi.spyOn(nrpsNet, 'fetchMembershipPage')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        members: [{ user_id: 'a', given_name: 'A', family_name: 'A' }],
        nextUrl: 'https://lms/m?page=2',
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        members: [],
        nextUrl: null,
      });

    const members = await fetchNrpsMembers('https://lms/m', 'tok');
    expect(members.map((m) => m.userId)).toEqual(['a']);
  });

  it('caps pagination at MAX_PAGES so a self-referential next loop terminates', async () => {
    const spy = vi.spyOn(nrpsNet, 'fetchMembershipPage').mockResolvedValue({
      ok: true,
      status: 200,
      members: [{ user_id: 'x', given_name: 'X', family_name: 'X' }],
      nextUrl: 'https://lms/m?page=next', // always points onward
    });
    await fetchNrpsMembers('https://lms/m', 'tok');
    // MAX_PAGES is 20 — the loop must stop rather than spin forever.
    expect(spy).toHaveBeenCalledTimes(20);
  });
});
