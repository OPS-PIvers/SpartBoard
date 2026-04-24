import { describe, it, expect, vi, beforeEach } from 'vitest';

type TriggerHandler = (event: unknown) => Promise<void>;

// `vi.mock` is hoisted above all imports, so the factory cannot close over
// module-scope variables. `vi.hoisted` gives us a shared holder that runs in
// the same pre-import phase and is safe to reference from the mock factory.
const triggerHolder = vi.hoisted(() => ({
  handler: null as TriggerHandler | null,
}));

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (_path: string, handler: TriggerHandler) => {
    triggerHolder.handler = handler;
    return handler;
  },
}));

const loggerMock = vi.hoisted(() => ({
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock('firebase-functions/logger', () => loggerMock);

// Shared mutable state for the firebase-admin mock. Each test seeds the
// per-doc behavior it needs (which `update()` calls reject, what the domain
// list snapshot returns) and inspects the recorded `update()` calls.
const adminMock = vi.hoisted(() => ({
  // Map of doc path -> Error to throw, or null to succeed.
  updateFailures: new Map<string, Error>(),
  updateSpy:
    vi.fn<(call: { path: string; patch: Record<string, unknown> }) => void>(),
  domainDocs: [] as { id: string; data: Record<string, unknown> }[],
}));

vi.mock('firebase-admin', () => {
  const firestoreFn = vi.fn(() => ({
    doc: vi.fn((path: string) => ({
      update: (patch: Record<string, unknown>) => {
        adminMock.updateSpy({ path, patch });
        const failure = adminMock.updateFailures.get(path);
        if (failure) return Promise.reject(failure);
        return Promise.resolve();
      },
    })),
    collection: vi.fn(() => ({
      get: () =>
        Promise.resolve({
          docs: adminMock.domainDocs.map((d) => ({
            id: d.id,
            data: () => d.data,
          })),
        }),
    })),
  }));

  return {
    apps: [{ name: '[DEFAULT]' }],
    initializeApp: vi.fn(),
    firestore: Object.assign(firestoreFn, {
      FieldValue: {
        increment: (n: number) => ({ __op: 'increment', value: n }),
      },
    }),
  };
});

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    increment: (n: number) => ({ __op: 'increment', value: n }),
  },
}));

// Import AFTER mocks so the module's onDocumentWritten registration lands in
// our stub and admin.firestore() resolves to the mock above.
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

// ---------------------------------------------------------------------------
// Trigger-handler tests
// ---------------------------------------------------------------------------
//
// These tests exercise the all-or-nothing behavior on org-doc write failure.
// Importing the module below registers the trigger via our mocked
// `onDocumentWritten`, which captures the handler in `triggerHolder`.

const makeWriteEvent = (opts: {
  orgId: string;
  emailLower: string;
  before: CounterMemberFields | null;
  after: CounterMemberFields | null;
}) => ({
  params: { orgId: opts.orgId, emailLower: opts.emailLower },
  data: {
    before: {
      exists: opts.before !== null,
      data: () => opts.before ?? undefined,
    },
    after: {
      exists: opts.after !== null,
      data: () => opts.after ?? undefined,
    },
  },
});

const invokeTrigger = async (event: unknown): Promise<void> => {
  // Lazy-require the module so the mocks above are in place when its
  // `onDocumentWritten` call runs.
  await import('./organizationMemberCounters');
  if (!triggerHolder.handler) {
    throw new Error('trigger handler not registered');
  }
  await triggerHolder.handler(event);
};

describe('organizationMemberCounters trigger (all-or-nothing semantics)', () => {
  beforeEach(() => {
    adminMock.updateFailures.clear();
    adminMock.updateSpy.mockClear();
    adminMock.domainDocs = [];
    loggerMock.warn.mockClear();
    loggerMock.info.mockClear();
    loggerMock.error.mockClear();
  });

  it('on org-doc increment failure, skips per-building and per-domain writes, returns without throwing, logs structured action_required error', async () => {
    const orgId = 'orono';
    const emailLower = 'newteacher@orono.k12.mn.us';
    const orgPath = `organizations/${orgId}`;
    adminMock.updateFailures.set(
      orgPath,
      Object.assign(new Error('PERMISSION_DENIED: rules tightened'), {
        code: 'permission-denied',
      })
    );
    adminMock.domainDocs = [
      { id: 'primary', data: { domain: '@orono.k12.mn.us' } },
    ];

    await expect(
      invokeTrigger(
        makeWriteEvent({
          orgId,
          emailLower,
          before: null,
          after: { email: emailLower, buildingIds: ['orono-high'] },
        })
      )
    ).resolves.toBeUndefined();

    // Only the org-doc update should have been attempted; per-building and
    // per-domain writes must NOT fire after the org failure.
    const updateCalls = adminMock.updateSpy.mock.calls.map((c) => c[0]);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].path).toBe(orgPath);
    expect(updateCalls.some((c) => c.path.includes('/buildings/'))).toBe(false);
    expect(updateCalls.some((c) => c.path.includes('/domains/'))).toBe(false);

    // Exactly one structured error log with the action_required marker and
    // the pending deltas that were dropped.
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    const [message, payload] = loggerMock.error.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(message).toContain(
      'action_required:run scripts/recount-org-members.js'
    );
    expect(payload).toMatchObject({
      orgId,
      memberDocPath: `organizations/${orgId}/members/${emailLower}`,
      orgDelta: 1,
      pendingBuildingDeltas: { 'orono-high': 1 },
      pendingDomainDeltas: { 'orono.k12.mn.us': 1 },
      action_required: 'run scripts/recount-org-members.js',
    });
    expect(payload.errorCode).toBe('permission-denied');
    expect(payload.error).toContain('PERMISSION_DENIED');
  });

  it('on successful org increment, proceeds with per-building and per-domain writes', async () => {
    const orgId = 'orono';
    const emailLower = 'happy.path@orono.k12.mn.us';
    adminMock.domainDocs = [
      { id: 'primary', data: { domain: '@orono.k12.mn.us' } },
    ];

    await invokeTrigger(
      makeWriteEvent({
        orgId,
        emailLower,
        before: null,
        after: { email: emailLower, buildingIds: ['orono-high'] },
      })
    );

    const paths = adminMock.updateSpy.mock.calls.map((c) => c[0].path);
    expect(paths).toContain(`organizations/${orgId}`);
    expect(paths).toContain(`organizations/${orgId}/buildings/orono-high`);
    expect(paths).toContain(`organizations/${orgId}/domains/primary`);
    expect(loggerMock.error).not.toHaveBeenCalled();
  });
});
