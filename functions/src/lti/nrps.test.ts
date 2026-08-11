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

describe('nrpsNet.fetchMembershipPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  // SSRF regression: `fetch()` follows redirects by default, so a 3xx from
  // the (platform-asserted) membership URL — or from a `Link: rel="next"`
  // page URL taken straight from the platform's response headers — could
  // silently retarget this request, bearer token included, at an arbitrary
  // off-platform host. `redirect: 'manual'` refuses to follow. Mirrors the
  // `maxRedirects: 0` assertions in index.test.ts for the axios-based guards.
  it('requests manual redirect handling on the membership GET (SSRF guard)', async () => {
    const fetchMock = vi.fn<
      (url: string | URL, init?: unknown) => Promise<Response>
    >(() =>
      Promise.resolve(
        new Response(JSON.stringify({ members: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await nrpsNet.fetchMembershipPage('https://lms/m', 'tok');

    const init = fetchMock.mock.calls[0][1] as { redirect?: string };
    expect(init.redirect).toBe('manual');
  });

  // Regression: `fetchNrpsMembers` needs `isRedirect` to distinguish "the
  // SSRF guard refused a redirect" from an ordinary platform error, so it can
  // throw instead of silently truncating the roster on page 2+.
  it('marks the result isRedirect when the response is an opaque redirect', async () => {
    const opaqueRedirect = new Response(null, { status: 200 });
    Object.defineProperty(opaqueRedirect, 'type', {
      value: 'opaqueredirect',
    });
    Object.defineProperty(opaqueRedirect, 'status', { value: 0 });
    Object.defineProperty(opaqueRedirect, 'ok', { value: false });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(opaqueRedirect))
    );

    const result = await nrpsNet.fetchMembershipPage('https://lms/m', 'tok');
    expect(result).toMatchObject({ ok: false, isRedirect: true });
  });
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
      isRedirect: false,
    });

    const members = await fetchNrpsMembers('https://lms/m', 'tok');
    expect(members).toEqual([
      {
        userId: 'sub-1',
        givenName: 'Ada',
        familyName: 'Lovelace',
        email: '',
        roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
        status: 'Active',
      },
    ]);
  });

  it('surfaces the platform email lowercased (for transient overlap matching), and "" when absent', async () => {
    vi.spyOn(nrpsNet, 'fetchMembershipPage').mockResolvedValue({
      ok: true,
      status: 200,
      members: [
        {
          user_id: 'sub-e',
          given_name: 'Ada',
          family_name: 'Lovelace',
          email: 'Ada.Lovelace@School.EDU',
        },
        { user_id: 'sub-noemail', given_name: 'No', family_name: 'Email' },
      ],
      nextUrl: null,
      isRedirect: false,
    });

    const members = await fetchNrpsMembers('https://lms/m', 'tok');
    expect(members[0].email).toBe('ada.lovelace@school.edu');
    expect(members[1].email).toBe('');
  });

  it('falls back to the composite name when given/family are absent', async () => {
    vi.spyOn(nrpsNet, 'fetchMembershipPage').mockResolvedValue({
      ok: true,
      status: 200,
      members: [{ user_id: 'sub-2', name: 'Grace Hopper' }],
      nextUrl: null,
      isRedirect: false,
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
      isRedirect: false,
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
        isRedirect: false,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        members: [{ user_id: 'b', given_name: 'B', family_name: 'B' }],
        nextUrl: null,
        isRedirect: false,
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
      isRedirect: false,
    });
    await expect(fetchNrpsMembers('https://lms/m', 'tok')).rejects.toThrow(
      /403/
    );
  });

  // Regression (#2433 round-2 review): the page===0 branch throws on ANY
  // failure already, but the message text differs by isRedirect — swapping
  // the ternary's arms in fetchNrpsMembers would pass every other test here
  // (they only assert `.rejects.toThrow()`, not the message) while silently
  // mislabeling a first-page redirect refusal as an ordinary status error.
  it('throws with the redirect-specific message when the FIRST page is a refused redirect', async () => {
    vi.spyOn(nrpsNet, 'fetchMembershipPage').mockResolvedValue({
      ok: false,
      status: 0,
      members: [],
      nextUrl: null,
      isRedirect: true,
    });
    await expect(fetchNrpsMembers('https://lms/m', 'tok')).rejects.toThrow(
      /refused a redirect \(SSRF guard\)/
    );
  });

  it('returns the partial roster when a LATER page errors', async () => {
    vi.spyOn(nrpsNet, 'fetchMembershipPage')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        members: [{ user_id: 'a', given_name: 'A', family_name: 'A' }],
        nextUrl: 'https://lms/m?page=2',
        isRedirect: false,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        members: [],
        nextUrl: null,
        isRedirect: false,
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
      isRedirect: false,
    });
    await fetchNrpsMembers('https://lms/m', 'tok');
    // MAX_PAGES is 20 — the loop must stop rather than spin forever.
    expect(spy).toHaveBeenCalledTimes(20);
  });

  // Regression: a refused redirect (SSRF guard) on page 2+ used to hit the
  // same silent `break` path as an ordinary transient page error, returning
  // a truncated roster WITHOUT throwing. Callers (e.g. ltiResolveNamesForAssignmentV1)
  // counted that as a successful `contextsFetched`, so a persistent
  // configuration-level failure looked identical to "class roster fully
  // resolved" — students past the redirected page silently showed as
  // "Student" with no error surfaced anywhere. A refused redirect must throw
  // regardless of which page it occurs on, unlike an ordinary page-2+ error.
  it('throws (does not silently truncate) when a LATER page is a refused redirect', async () => {
    vi.spyOn(nrpsNet, 'fetchMembershipPage')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        members: [{ user_id: 'a', given_name: 'A', family_name: 'A' }],
        nextUrl: 'https://lms/m?page=2',
        isRedirect: false,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 0,
        members: [],
        nextUrl: null,
        isRedirect: true,
      });

    await expect(fetchNrpsMembers('https://lms/m', 'tok')).rejects.toThrow(
      /redirect/i
    );
  });
});
