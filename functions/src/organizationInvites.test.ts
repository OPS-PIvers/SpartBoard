import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock firebase-admin before the module under test loads. The helpers we
// test don't touch Firestore, so the mocks only need to satisfy the
// module-load-time `admin.apps.length` guard and keep `admin.firestore()`
// callable (it isn't actually invoked by the helpers).
vi.mock('firebase-admin', () => {
  return {
    apps: [{ name: '[DEFAULT]' }], // non-empty so initializeApp() is skipped
    initializeApp: vi.fn(),
    firestore: vi.fn(() => ({})),
  };
});

// Mock firebase-functions/v2/https so `onCall` is a no-op shell and
// `HttpsError` is a lightweight Error subclass. The class is defined inside
// the factory because vi.mock is hoisted to the top of the file — referencing
// a top-level binding from the factory body fails with a TDZ error.
vi.mock('firebase-functions/v2/https', () => {
  class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = 'HttpsError';
    }
  }
  return {
    onCall: (_options: unknown, handler: unknown) => handler,
    HttpsError,
  };
});

// Stable crypto mock so `generateToken` is deterministic.
// Each call consumes from a list of canned byte sequences; tests that need
// uniqueness pre-queue additional entries.
const tokenQueue: string[] = [];
function enqueueToken(tok: string) {
  tokenQueue.push(tok);
}
vi.mock('crypto', async () => {
  const actual = await vi.importActual<typeof import('crypto')>('crypto');
  return {
    ...actual,
    randomBytes: vi.fn((size: number) => {
      const next = tokenQueue.shift();
      if (next !== undefined) {
        // Embed the token so base64url decoding is a known value. We pad to
        // `size` bytes so caller expectations about length aren't broken.
        const buf = Buffer.alloc(size);
        buf.write(next);
        return {
          toString: (enc: BufferEncoding) => {
            if ((enc as string) === 'base64url') return next;
            return actual.randomBytes(size).toString(enc);
          },
        } as unknown as Buffer;
      }
      return actual.randomBytes(size);
    }),
  };
});

import {
  clampExpiresInDays,
  normalizeInvite,
  parseCreateInvitesPayload,
  parseClaimInvitePayload,
  computeExpiresAt,
  evaluateClaim,
  planMemberWrite,
  filterValidBuildingIds,
  buildClaimUrl,
  generateToken,
  buildInvitationEmail,
  escapeHtml,
  formatRoleLabel,
  CLAIM_URL_ORIGIN,
  DEFAULT_EXPIRES_IN_DAYS,
  MAX_EXPIRES_IN_DAYS,
  type InvitationRecord,
  type MemberRecord,
} from './organizationInvites';

beforeEach(() => {
  tokenQueue.length = 0;
  vi.clearAllMocks();
});

afterEach(() => {
  tokenQueue.length = 0;
});

// ---------------------------------------------------------------------------
// clampExpiresInDays
// ---------------------------------------------------------------------------

describe('clampExpiresInDays', () => {
  it('uses default for undefined', () => {
    expect(clampExpiresInDays(undefined)).toBe(DEFAULT_EXPIRES_IN_DAYS);
  });

  it('uses default for non-number', () => {
    expect(clampExpiresInDays('14')).toBe(DEFAULT_EXPIRES_IN_DAYS);
    expect(clampExpiresInDays(null)).toBe(DEFAULT_EXPIRES_IN_DAYS);
    expect(clampExpiresInDays(NaN)).toBe(DEFAULT_EXPIRES_IN_DAYS);
  });

  it('uses default for zero or negative', () => {
    expect(clampExpiresInDays(0)).toBe(DEFAULT_EXPIRES_IN_DAYS);
    expect(clampExpiresInDays(-5)).toBe(DEFAULT_EXPIRES_IN_DAYS);
  });

  it('caps values above the maximum', () => {
    expect(clampExpiresInDays(90)).toBe(MAX_EXPIRES_IN_DAYS);
    expect(clampExpiresInDays(61)).toBe(MAX_EXPIRES_IN_DAYS);
    expect(clampExpiresInDays(1000)).toBe(MAX_EXPIRES_IN_DAYS);
  });

  it('passes through valid values', () => {
    expect(clampExpiresInDays(7)).toBe(7);
    expect(clampExpiresInDays(30)).toBe(30);
    expect(clampExpiresInDays(60)).toBe(60);
  });

  it('floors fractional values', () => {
    expect(clampExpiresInDays(7.9)).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// normalizeInvite
// ---------------------------------------------------------------------------

describe('normalizeInvite', () => {
  it('lowercases the email', () => {
    const result = normalizeInvite({
      email: 'Foo.Bar@Example.Com',
      roleId: 'teacher',
      buildingIds: [],
    });
    expect('invite' in result).toBe(true);
    if ('invite' in result) {
      expect(result.invite.email).toBe('foo.bar@example.com');
    }
  });

  it('trims whitespace from email and roleId', () => {
    const result = normalizeInvite({
      email: '  user@ex.com  ',
      roleId: '  teacher  ',
      buildingIds: [],
    });
    expect('invite' in result).toBe(true);
    if ('invite' in result) {
      expect(result.invite.email).toBe('user@ex.com');
      expect(result.invite.roleId).toBe('teacher');
    }
  });

  it('rejects missing email', () => {
    const result = normalizeInvite({ roleId: 'teacher', buildingIds: [] });
    expect('error' in result).toBe(true);
  });

  it('rejects malformed email', () => {
    const r1 = normalizeInvite({
      email: 'not-an-email',
      roleId: 'teacher',
      buildingIds: [],
    });
    expect('error' in r1).toBe(true);

    const r2 = normalizeInvite({
      email: '@nodomain',
      roleId: 'teacher',
      buildingIds: [],
    });
    expect('error' in r2).toBe(true);
  });

  it('rejects missing roleId', () => {
    const result = normalizeInvite({
      email: 'user@ex.com',
      buildingIds: [],
    });
    expect('error' in result).toBe(true);
  });

  it('filters non-string buildingIds', () => {
    const result = normalizeInvite({
      email: 'user@ex.com',
      roleId: 'teacher',
      buildingIds: ['b1', 2, null, '', 'b2'] as unknown as string[],
    });
    expect('invite' in result).toBe(true);
    if ('invite' in result) {
      expect(result.invite.buildingIds).toEqual(['b1', 'b2']);
    }
  });

  it('omits name when blank', () => {
    const result = normalizeInvite({
      email: 'user@ex.com',
      roleId: 'teacher',
      buildingIds: [],
      name: '   ',
    });
    expect('invite' in result).toBe(true);
    if ('invite' in result) {
      expect(result.invite.name).toBeUndefined();
    }
  });

  it('preserves trimmed name', () => {
    const result = normalizeInvite({
      email: 'user@ex.com',
      roleId: 'teacher',
      buildingIds: [],
      name: '  Jane Doe  ',
    });
    expect('invite' in result).toBe(true);
    if ('invite' in result) {
      expect(result.invite.name).toBe('Jane Doe');
    }
  });
});

// ---------------------------------------------------------------------------
// parseCreateInvitesPayload
// ---------------------------------------------------------------------------

describe('parseCreateInvitesPayload', () => {
  it('throws for non-object payload', () => {
    expect(() => parseCreateInvitesPayload(null)).toThrow();
    expect(() => parseCreateInvitesPayload('nope')).toThrow();
  });

  it('throws when orgId is missing', () => {
    expect(() => parseCreateInvitesPayload({ invitations: [] })).toThrow(
      /orgId/
    );
  });

  it('throws when invitations array is empty', () => {
    expect(() =>
      parseCreateInvitesPayload({ orgId: 'orono', invitations: [] })
    ).toThrow(/non-empty/);
  });

  it('throws when invitations is not an array', () => {
    expect(() =>
      parseCreateInvitesPayload({ orgId: 'orono', invitations: 'nope' })
    ).toThrow();
  });

  it('clamps expiresInDays in the returned payload', () => {
    const { payload } = parseCreateInvitesPayload({
      orgId: 'orono',
      invitations: [
        { email: 'user@ex.com', roleId: 'teacher', buildingIds: [] },
      ],
      expiresInDays: 180,
    });
    expect(payload.expiresInDays).toBe(MAX_EXPIRES_IN_DAYS);
  });

  it('defaults expiresInDays when omitted', () => {
    const { payload } = parseCreateInvitesPayload({
      orgId: 'orono',
      invitations: [
        { email: 'user@ex.com', roleId: 'teacher', buildingIds: [] },
      ],
    });
    expect(payload.expiresInDays).toBe(DEFAULT_EXPIRES_IN_DAYS);
  });

  it('returns per-entry errors without aborting', () => {
    const { payload, perEntryErrors } = parseCreateInvitesPayload({
      orgId: 'orono',
      invitations: [
        { email: 'good@ex.com', roleId: 'teacher', buildingIds: [] },
        { email: '', roleId: 'teacher', buildingIds: [] },
        { email: 'also-good@ex.com', roleId: 'teacher', buildingIds: [] },
      ],
    });
    expect(payload.invitations).toHaveLength(2);
    expect(perEntryErrors).toHaveLength(1);
  });

  it('trims orgId', () => {
    const { payload } = parseCreateInvitesPayload({
      orgId: '  orono  ',
      invitations: [
        { email: 'user@ex.com', roleId: 'teacher', buildingIds: [] },
      ],
    });
    expect(payload.orgId).toBe('orono');
  });

  it('discards message field silently', () => {
    const { payload } = parseCreateInvitesPayload({
      orgId: 'orono',
      invitations: [
        { email: 'user@ex.com', roleId: 'teacher', buildingIds: [] },
      ],
      message: 'welcome!',
    });
    // `message` is in the payload but callers ignore it; this test just
    // confirms it doesn't crash payload parsing.
    expect(payload).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// parseClaimInvitePayload
// ---------------------------------------------------------------------------

describe('parseClaimInvitePayload', () => {
  it('throws for non-object', () => {
    expect(() => parseClaimInvitePayload(null)).toThrow();
  });

  it('throws for missing token', () => {
    expect(() => parseClaimInvitePayload({ orgId: 'orono' })).toThrow(/token/);
  });

  it('throws for missing orgId', () => {
    expect(() => parseClaimInvitePayload({ token: 'abc' })).toThrow(/orgId/);
  });

  it('trims both fields', () => {
    const result = parseClaimInvitePayload({
      token: '  abc  ',
      orgId: '  orono  ',
    });
    expect(result).toEqual({ token: 'abc', orgId: 'orono' });
  });
});

// ---------------------------------------------------------------------------
// generateToken / buildClaimUrl / computeExpiresAt
// ---------------------------------------------------------------------------

describe('generateToken', () => {
  it('is deterministic under mocked crypto', () => {
    enqueueToken('tok-one');
    enqueueToken('tok-two');
    expect(generateToken()).toBe('tok-one');
    expect(generateToken()).toBe('tok-two');
  });

  it('produces unique tokens across calls (unmocked fallback)', () => {
    // Both calls fall through to the real crypto.randomBytes since the queue
    // is empty — they should differ with overwhelming probability.
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    // base64url output contains no padding / +/ chars
    expect(a).not.toMatch(/[+/=]/);
  });
});

describe('buildClaimUrl', () => {
  it('assembles the prod origin + /invite/:token', () => {
    expect(buildClaimUrl('abc123')).toBe(`${CLAIM_URL_ORIGIN}/invite/abc123`);
  });
});

// ---------------------------------------------------------------------------
// escapeHtml / formatRoleLabel / buildInvitationEmail
// ---------------------------------------------------------------------------

describe('escapeHtml', () => {
  it('escapes the five characters that break HTML context', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'
    );
    expect(escapeHtml("O'Brien & Sons")).toBe('O&#39;Brien &amp; Sons');
  });

  it('passes through ordinary text unchanged', () => {
    expect(escapeHtml('Orono Schools')).toBe('Orono Schools');
  });
});

describe('formatRoleLabel', () => {
  it('title-cases snake_case role ids', () => {
    expect(formatRoleLabel('super_admin')).toBe('Super Admin');
    expect(formatRoleLabel('domain_admin')).toBe('Domain Admin');
    expect(formatRoleLabel('teacher')).toBe('Teacher');
  });
});

describe('buildInvitationEmail', () => {
  const base = {
    orgName: 'Orono Schools',
    roleId: 'teacher',
    claimUrl: 'https://spartboard.web.app/invite/tok-xyz',
    expiresAt: '2026-05-03T12:00:00.000Z',
  };

  it('generates subject with org name', () => {
    const { subject } = buildInvitationEmail(base);
    expect(subject).toBe("You're invited to Orono Schools on SpartBoard");
  });

  it('text and html both carry the claim URL', () => {
    const { text, html } = buildInvitationEmail(base);
    expect(text).toContain('https://spartboard.web.app/invite/tok-xyz');
    expect(html).toContain('https://spartboard.web.app/invite/tok-xyz');
  });

  it('renders role label in human form', () => {
    const { text, html } = buildInvitationEmail({
      ...base,
      roleId: 'super_admin',
    });
    expect(text).toContain('as a Super Admin');
    expect(html).toContain('Super Admin');
  });

  it('omits personal message block when none provided', () => {
    const { text, html } = buildInvitationEmail(base);
    expect(text).not.toContain('note from your administrator');
    expect(html).not.toContain('border-left:3px solid');
  });

  it('renders personal message in both bodies when provided', () => {
    const { text, html } = buildInvitationEmail({
      ...base,
      personalMessage: 'Welcome aboard!\nSee you Monday.',
    });
    expect(text).toContain('A note from your administrator:');
    expect(text).toContain('  Welcome aboard!');
    expect(text).toContain('  See you Monday.');
    expect(html).toContain('Welcome aboard!<br>See you Monday.');
  });

  it('escapes HTML in org name, role, and personal message', () => {
    const { html } = buildInvitationEmail({
      ...base,
      orgName: '<evil>Acme</evil>',
      personalMessage: '<img src=x onerror=alert(1)>',
    });
    expect(html).not.toContain('<evil>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;evil&gt;Acme&lt;/evil&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('formats the expiry date in UTC', () => {
    const { text, html } = buildInvitationEmail(base);
    // 2026-05-03 → "May 3, 2026" in en-US long form
    expect(text).toContain('May 3, 2026');
    expect(html).toContain('May 3, 2026');
  });
});

describe('computeExpiresAt', () => {
  it('adds the given number of days', () => {
    const now = new Date('2026-04-19T12:00:00.000Z');
    const out = computeExpiresAt(now, 14);
    expect(out).toBe('2026-05-03T12:00:00.000Z');
  });

  it('clamps to the maximum ceiling', () => {
    const now = new Date('2026-04-19T12:00:00.000Z');
    const out = computeExpiresAt(now, 999);
    // 60 days from 2026-04-19 = 2026-06-18
    expect(out).toBe('2026-06-18T12:00:00.000Z');
  });

  it('uses default for invalid input', () => {
    const now = new Date('2026-04-19T12:00:00.000Z');
    const out = computeExpiresAt(now, NaN);
    expect(out).toBe('2026-05-03T12:00:00.000Z'); // 14 days default
  });
});

// ---------------------------------------------------------------------------
// planMemberWrite — idempotency / merge behavior
// ---------------------------------------------------------------------------

describe('planMemberWrite', () => {
  const now = new Date('2026-04-19T12:00:00.000Z');
  const baseInvite = {
    email: 'user@ex.com',
    roleId: 'teacher',
    buildingIds: ['b1'],
  };

  it('skips already-active members', () => {
    const existing: MemberRecord = {
      email: 'user@ex.com',
      orgId: 'orono',
      roleId: 'teacher',
      buildingIds: ['b1'],
      status: 'active',
      uid: 'uid-1',
    };
    const plan = planMemberWrite(existing, baseInvite, {
      orgId: 'orono',
      now,
      addedBy: 'admin-uid',
    });
    expect(plan.action).toBe('already_active');
  });

  it('creates a new invited member when none exists', () => {
    const plan = planMemberWrite(undefined, baseInvite, {
      orgId: 'orono',
      now,
      addedBy: 'admin-uid',
    });
    expect(plan.action).toBe('create');
    if (plan.action === 'create') {
      expect(plan.patch).toMatchObject({
        email: 'user@ex.com',
        orgId: 'orono',
        roleId: 'teacher',
        buildingIds: ['b1'],
        status: 'invited',
        invitedAt: '2026-04-19T12:00:00.000Z',
        addedBy: 'admin-uid',
      });
      // uid is NEVER written from this path — rules forbid client writes,
      // and CF writes to uid happen only on claim.
      expect('uid' in plan.patch).toBe(false);
    }
  });

  it('refreshes an already-invited member without duplicating', () => {
    const existing: MemberRecord = {
      email: 'user@ex.com',
      orgId: 'orono',
      roleId: 'teacher',
      buildingIds: ['b1'],
      status: 'invited',
      invitedAt: '2026-01-01T00:00:00.000Z',
      addedBy: 'old-admin',
    };
    const refreshed = planMemberWrite(
      existing,
      {
        email: 'user@ex.com',
        roleId: 'domain_admin',
        buildingIds: ['b2', 'b3'],
      },
      { orgId: 'orono', now, addedBy: 'new-admin' }
    );
    expect(refreshed.action).toBe('create');
    if (refreshed.action === 'create') {
      expect(refreshed.patch.roleId).toBe('domain_admin');
      expect(refreshed.patch.buildingIds).toEqual(['b2', 'b3']);
      expect(refreshed.patch.invitedAt).toBe('2026-04-19T12:00:00.000Z');
      expect(refreshed.patch.addedBy).toBe('new-admin');
    }
  });

  it('preserves existing name when invite omits it', () => {
    const existing: MemberRecord = {
      email: 'user@ex.com',
      orgId: 'orono',
      roleId: 'teacher',
      buildingIds: [],
      status: 'invited',
      name: 'Jane Doe',
    };
    const plan = planMemberWrite(existing, baseInvite, {
      orgId: 'orono',
      now,
      addedBy: 'admin',
    });
    if (plan.action === 'create') {
      expect(plan.patch.name).toBe('Jane Doe');
    }
  });

  it('overwrites name when the invite provides one', () => {
    const existing: MemberRecord = {
      email: 'user@ex.com',
      orgId: 'orono',
      roleId: 'teacher',
      buildingIds: [],
      status: 'invited',
      name: 'Old Name',
    };
    const plan = planMemberWrite(
      existing,
      { ...baseInvite, name: 'New Name' },
      { orgId: 'orono', now, addedBy: 'admin' }
    );
    if (plan.action === 'create') {
      expect(plan.patch.name).toBe('New Name');
    }
  });
});

// ---------------------------------------------------------------------------
// filterValidBuildingIds
// ---------------------------------------------------------------------------

describe('filterValidBuildingIds', () => {
  it('drops unknown ids silently', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const known = new Set(['b1', 'b2', 'b3']);
    const out = filterValidBuildingIds(
      ['b1', 'bogus', 'b2'],
      known,
      'user@ex.com'
    );
    expect(out).toEqual(['b1', 'b2']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('does not warn when all ids are valid', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const known = new Set(['b1', 'b2']);
    const out = filterValidBuildingIds(['b1', 'b2'], known, 'user@ex.com');
    expect(out).toEqual(['b1', 'b2']);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('handles empty input', () => {
    const out = filterValidBuildingIds([], new Set(['b1']), 'user@ex.com');
    expect(out).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// evaluateClaim — verdict logic
// ---------------------------------------------------------------------------

describe('evaluateClaim', () => {
  const now = new Date('2026-04-19T12:00:00.000Z');
  const validInvitation: InvitationRecord = {
    token: 'tok',
    orgId: 'orono',
    email: 'user@ex.com',
    roleId: 'teacher',
    buildingIds: ['b1'],
    createdAt: '2026-04-18T12:00:00.000Z',
    expiresAt: '2026-05-03T12:00:00.000Z',
    issuedBy: 'admin-uid',
  };
  const validMember: MemberRecord = {
    email: 'user@ex.com',
    orgId: 'orono',
    roleId: 'teacher',
    buildingIds: ['b1'],
    status: 'invited',
  };

  it('returns not-found when invitation missing', () => {
    const verdict = evaluateClaim({
      invitation: undefined,
      member: validMember,
      signedInEmailLower: 'user@ex.com',
      signedInUid: 'uid',
      now,
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.code).toBe('not-found');
  });

  it('returns failed-precondition when already claimed', () => {
    const verdict = evaluateClaim({
      invitation: {
        ...validInvitation,
        claimedAt: '2026-04-19T10:00:00.000Z',
      },
      member: validMember,
      signedInEmailLower: 'user@ex.com',
      signedInUid: 'uid',
      now,
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.code).toBe('failed-precondition');
  });

  it('returns deadline-exceeded when expired', () => {
    const verdict = evaluateClaim({
      invitation: {
        ...validInvitation,
        expiresAt: '2026-04-01T00:00:00.000Z',
      },
      member: validMember,
      signedInEmailLower: 'user@ex.com',
      signedInUid: 'uid',
      now,
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.code).toBe('deadline-exceeded');
  });

  it('returns permission-denied on email mismatch', () => {
    const verdict = evaluateClaim({
      invitation: validInvitation,
      member: validMember,
      signedInEmailLower: 'someone-else@ex.com',
      signedInUid: 'uid',
      now,
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.code).toBe('permission-denied');
  });

  it('returns internal when member missing', () => {
    const verdict = evaluateClaim({
      invitation: validInvitation,
      member: undefined,
      signedInEmailLower: 'user@ex.com',
      signedInUid: 'uid',
      now,
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.code).toBe('internal');
  });

  it('returns ok with uid link + claim markers when everything checks out', () => {
    const verdict = evaluateClaim({
      invitation: validInvitation,
      member: validMember,
      signedInEmailLower: 'user@ex.com',
      signedInUid: 'firebase-uid-42',
      now,
    });
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.memberPatch).toEqual({
        uid: 'firebase-uid-42',
        status: 'active',
        lastActive: '2026-04-19T12:00:00.000Z',
      });
      expect(verdict.invitationPatch).toEqual({
        claimedAt: '2026-04-19T12:00:00.000Z',
        claimedByUid: 'firebase-uid-42',
      });
    }
  });
});
