import { describe, it, expect, vi, beforeEach } from 'vitest';

type TriggerHandler = (event: unknown) => Promise<void>;

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

// Per-test shared state for the firebase-admin mock. Each test seeds the
// data it needs and inspects the recorded mail-collection write.
const adminMock = vi.hoisted(() => ({
  configDoc: null as Record<string, unknown> | null,
  plcDocs: new Map<string, Record<string, unknown>>(),
  mailSets: [] as Array<{ id: string; payload: Record<string, unknown> }>,
  mailSetFailure: null as Error | null,
}));

vi.mock('firebase-admin', () => {
  const firestoreFn = vi.fn(() => ({
    collection: vi.fn((name: string) => {
      if (name === 'global_permissions') {
        return {
          doc: vi.fn(() => ({
            get: () =>
              Promise.resolve({
                exists: adminMock.configDoc !== null,
                data: () => adminMock.configDoc ?? {},
              }),
          })),
        };
      }
      if (name === 'plcs') {
        return {
          doc: vi.fn((id: string) => ({
            get: () => {
              const data = adminMock.plcDocs.get(id);
              return Promise.resolve({
                exists: data !== undefined,
                data: () => data ?? {},
              });
            },
          })),
        };
      }
      if (name === 'mail') {
        return {
          doc: vi.fn((id: string) => ({
            set: (payload: Record<string, unknown>) => {
              adminMock.mailSets.push({ id, payload });
              if (adminMock.mailSetFailure) {
                return Promise.reject(adminMock.mailSetFailure);
              }
              return Promise.resolve();
            },
          })),
        };
      }
      throw new Error(`Unexpected collection: ${name}`);
    }),
  }));

  return {
    apps: [{ name: '[DEFAULT]' }],
    initializeApp: vi.fn(),
    firestore: firestoreFn,
  };
});

// Import AFTER mocks so the module's onDocumentWritten registration lands in
// our stub and admin.firestore() resolves to the mock above.
import {
  parseInviteDoc,
  shouldSendEmail,
  buildPlcInvitationEmail,
  buildPlcAcceptUrl,
  escapeHtml,
  CLAIM_URL_ORIGIN,
  type PlcInvitationDoc,
} from './plcInviteEmails';
// Importing the module registers the trigger handler via the mocked
// onDocumentWritten factory above — side-effect import.
import './plcInviteEmails';

const INVITE_ID = 'plc-1_invitee@example.com';

const pendingInvite = (
  overrides: Partial<PlcInvitationDoc> = {}
): PlcInvitationDoc => ({
  plcId: 'plc-1',
  plcName: 'Grade 3 Math',
  inviteeEmailLower: 'invitee@example.com',
  invitedByUid: 'lead-uid',
  invitedByName: 'Lead Teacher',
  invitedAt: 1_700_000_000_000,
  status: 'pending',
  ...overrides,
});

function makeEvent(opts: {
  beforeExists: boolean;
  beforeData?: PlcInvitationDoc | Record<string, unknown>;
  afterExists: boolean;
  afterData?: PlcInvitationDoc | Record<string, unknown>;
}) {
  return {
    params: { inviteId: INVITE_ID },
    data: {
      before: {
        exists: opts.beforeExists,
        data: () => opts.beforeData ?? {},
      },
      after: {
        exists: opts.afterExists,
        data: () => opts.afterData ?? {},
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  adminMock.configDoc = { enabled: true };
  adminMock.plcDocs = new Map([
    [
      'plc-1',
      { leadUid: 'lead-uid', memberUids: ['lead-uid'], name: 'Grade 3 Math' },
    ],
  ]);
  adminMock.mailSets = [];
  adminMock.mailSetFailure = null;
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('parseInviteDoc', () => {
  it('returns the parsed doc for valid pending input', () => {
    const parsed = parseInviteDoc(pendingInvite());
    expect(parsed).not.toBeNull();
    expect(parsed?.plcId).toBe('plc-1');
    expect(parsed?.status).toBe('pending');
  });

  it('returns null for missing required fields', () => {
    const { plcId: _plcId, ...rest } = pendingInvite();
    void _plcId;
    expect(parseInviteDoc(rest)).toBeNull();
  });

  it('returns null for an unknown status string', () => {
    expect(parseInviteDoc({ ...pendingInvite(), status: 'bogus' })).toBeNull();
  });

  it('carries respondedAt when present', () => {
    const parsed = parseInviteDoc({
      ...pendingInvite({ status: 'accepted' }),
      respondedAt: 123,
    });
    expect(parsed?.respondedAt).toBe(123);
  });
});

describe('shouldSendEmail', () => {
  it('sends on fresh create (pending)', () => {
    expect(shouldSendEmail(null, pendingInvite())).toBe(true);
  });

  it('sends on re-send (pending -> pending with new invitedAt)', () => {
    expect(
      shouldSendEmail(
        pendingInvite({ invitedAt: 1 }),
        pendingInvite({ invitedAt: 2 })
      )
    ).toBe(true);
  });

  it('skips no-op writes (pending -> pending with same invitedAt)', () => {
    expect(shouldSendEmail(pendingInvite(), pendingInvite())).toBe(false);
  });

  it('skips terminal transitions (pending -> accepted/declined)', () => {
    expect(
      shouldSendEmail(pendingInvite(), pendingInvite({ status: 'accepted' }))
    ).toBe(false);
    expect(
      shouldSendEmail(pendingInvite(), pendingInvite({ status: 'declined' }))
    ).toBe(false);
  });

  it('skips deletes (no post-state)', () => {
    expect(shouldSendEmail(pendingInvite(), null)).toBe(false);
  });
});

describe('buildPlcAcceptUrl', () => {
  it('points at the dedicated landing page', () => {
    expect(buildPlcAcceptUrl(INVITE_ID)).toBe(
      `${CLAIM_URL_ORIGIN}/plc-invite/${INVITE_ID}`
    );
  });
});

describe('escapeHtml', () => {
  it('escapes HTML-significant characters', () => {
    expect(escapeHtml('<b>"x\' & y</b>')).toBe(
      '&lt;b&gt;&quot;x&#39; &amp; y&lt;/b&gt;'
    );
  });
});

describe('buildPlcInvitationEmail', () => {
  it('uses plc name and inviter in the subject and body', () => {
    const { subject, text, html } = buildPlcInvitationEmail({
      plcName: 'Grade 3 Math',
      invitedByName: 'Ms. Rivers',
      acceptUrl: 'https://spartboard.web.app/plc-invite/abc',
    });
    expect(subject).toContain('Ms. Rivers');
    expect(subject).toContain('Grade 3 Math');
    expect(text).toContain('https://spartboard.web.app/plc-invite/abc');
    expect(html).toContain('Ms. Rivers');
    expect(html).toContain('Grade 3 Math');
    expect(html).toContain('https://spartboard.web.app/plc-invite/abc');
  });

  it('escapes injected HTML in the plc name and inviter', () => {
    const { html } = buildPlcInvitationEmail({
      plcName: '<script>alert(1)</script>',
      invitedByName: 'Evil " Name',
      acceptUrl: 'https://spartboard.web.app/plc-invite/x',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Evil &quot; Name');
  });
});

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

describe('plcInvitationEmail trigger', () => {
  const runTrigger = async (event: ReturnType<typeof makeEvent>) => {
    if (!triggerHolder.handler) {
      throw new Error('Trigger handler not registered');
    }
    await triggerHolder.handler(event);
  };

  it('queues a mail doc on fresh create (pending)', async () => {
    await runTrigger(
      makeEvent({
        beforeExists: false,
        afterExists: true,
        afterData: pendingInvite(),
      })
    );

    expect(adminMock.mailSets).toHaveLength(1);
    const [entry] = adminMock.mailSets;
    expect(entry.id).toBe(INVITE_ID);
    expect(entry.payload.to).toEqual(['invitee@example.com']);
    const message = entry.payload.message as {
      subject: string;
      text: string;
      html: string;
    };
    expect(message.subject).toContain('Grade 3 Math');
    expect(message.text).toContain('/plc-invite/' + INVITE_ID);
  });

  it('re-queues on re-send (pending -> pending with new invitedAt)', async () => {
    await runTrigger(
      makeEvent({
        beforeExists: true,
        beforeData: pendingInvite({ invitedAt: 1 }),
        afterExists: true,
        afterData: pendingInvite({ invitedAt: 2 }),
      })
    );
    expect(adminMock.mailSets).toHaveLength(1);
  });

  it('skips on accept transition', async () => {
    await runTrigger(
      makeEvent({
        beforeExists: true,
        beforeData: pendingInvite(),
        afterExists: true,
        afterData: pendingInvite({ status: 'accepted' }),
      })
    );
    expect(adminMock.mailSets).toHaveLength(0);
  });

  it('skips on decline transition', async () => {
    await runTrigger(
      makeEvent({
        beforeExists: true,
        beforeData: pendingInvite(),
        afterExists: true,
        afterData: pendingInvite({ status: 'declined' }),
      })
    );
    expect(adminMock.mailSets).toHaveLength(0);
  });

  it('skips on delete', async () => {
    await runTrigger(
      makeEvent({
        beforeExists: true,
        beforeData: pendingInvite(),
        afterExists: false,
      })
    );
    expect(adminMock.mailSets).toHaveLength(0);
  });

  it('skips on no-op writes (same invitedAt)', async () => {
    await runTrigger(
      makeEvent({
        beforeExists: true,
        beforeData: pendingInvite(),
        afterExists: true,
        afterData: pendingInvite(),
      })
    );
    expect(adminMock.mailSets).toHaveLength(0);
  });

  it('skips when the kill switch is off (config doc enabled=false)', async () => {
    adminMock.configDoc = { enabled: false };
    await runTrigger(
      makeEvent({
        beforeExists: false,
        afterExists: true,
        afterData: pendingInvite(),
      })
    );
    expect(adminMock.mailSets).toHaveLength(0);
  });

  it('skips when the kill switch doc is missing entirely', async () => {
    adminMock.configDoc = null;
    await runTrigger(
      makeEvent({
        beforeExists: false,
        afterExists: true,
        afterData: pendingInvite(),
      })
    );
    expect(adminMock.mailSets).toHaveLength(0);
  });

  it('skips + logs when the parent PLC is missing', async () => {
    adminMock.plcDocs = new Map();
    await runTrigger(
      makeEvent({
        beforeExists: false,
        afterExists: true,
        afterData: pendingInvite(),
      })
    );
    expect(adminMock.mailSets).toHaveLength(0);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      'plcInvitationEmail: parent PLC missing — skipping',
      expect.objectContaining({ inviteId: INVITE_ID })
    );
  });

  it('applies from / replyTo overrides from the config doc', async () => {
    adminMock.configDoc = {
      enabled: true,
      from: 'SpartBoard <noreply@spartboard.app>',
      replyTo: 'support@spartboard.app',
    };
    await runTrigger(
      makeEvent({
        beforeExists: false,
        afterExists: true,
        afterData: pendingInvite(),
      })
    );
    expect(adminMock.mailSets[0].payload.from).toBe(
      'SpartBoard <noreply@spartboard.app>'
    );
    expect(adminMock.mailSets[0].payload.replyTo).toBe(
      'support@spartboard.app'
    );
  });

  it('swallows mail-write failures (does not throw, so Firestore will not retry)', async () => {
    adminMock.mailSetFailure = new Error('mail backend down');
    await expect(
      runTrigger(
        makeEvent({
          beforeExists: false,
          afterExists: true,
          afterData: pendingInvite(),
        })
      )
    ).resolves.not.toThrow();
    expect(loggerMock.error).toHaveBeenCalledWith(
      'plcInvitationEmail: failed to queue mail',
      expect.objectContaining({ inviteId: INVITE_ID })
    );
  });
});
