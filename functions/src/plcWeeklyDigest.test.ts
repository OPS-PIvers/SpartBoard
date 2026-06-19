// Unit tests for the opt-in weekly PLC digest `plcWeeklyDigest` (Wave 4 —
// PRD §5 / §8 / §2.3, Decision 2.3).
//
// Two layers, mirroring the established functions-test posture
// (`gcPlcOrphans.test.ts` / `plcInviteEmails.test.ts`):
//
//   1. PURE HELPERS — `escapeHtml`, `isDigestOptIn`, `isWithinDigestWindow`,
//      `collectRecipientEmails`, `describeDigestEvent`, `buildPlcDigestEmail`.
//      These carry the load-bearing invariants (opt-in default OFF, window
//      bounds, HTML escaping, NO duplicate recipients) and need no Firestore.
//
//   2. SWEEP — `runPlcWeeklyDigest` driven against an in-memory stub Firestore
//      that emulates the Admin SDK surface the sweep uses
//      (collection().limit().get(), activity().orderBy().limit().get(),
//      collection('mail').doc(id).set(data)). Proves the acceptance criteria:
//        - kill switch OFF → no mail queued;
//        - ON + opted-in PLC with recent activity → EXACTLY ONE /mail doc per
//          PLC (NO per-member fan-out — one doc, one `to: [...]` list);
//        - opted-out PLC skipped;
//        - opted-in but no recent activity → skipped.
//
// The project's Firestore emulator can't boot in this environment (see project
// notes); CI/dev-preview runs the rules-emulator suite. The Admin-SDK sweep is
// pure I/O over a documented surface, so a faithful stub pins the behaviour.

import { describe, it, expect, vi } from 'vitest';

// Mock firebase-admin so the module-level `functionsInit` side effect no-ops.
vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(),
}));

// `./functionsInit` calls `setGlobalOptions` at import time.
vi.mock('firebase-functions/v2', () => ({
  setGlobalOptions: vi.fn(),
}));

// `onSchedule` returns the handler directly so the module imports without
// registering a real scheduled trigger.
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_opts: unknown, handler: () => Promise<void>) => handler,
}));

// `firebase-functions/logger` is referenced inside the sweep.
vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import {
  escapeHtml,
  isDigestOptIn,
  isWithinDigestWindow,
  collectRecipientEmails,
  describeDigestEvent,
  buildPlcDigestEmail,
  runPlcWeeklyDigest,
  DIGEST_WINDOW_MS,
  MAX_DIGEST_LINES,
  type DigestActivityEvent,
} from './plcWeeklyDigest';

const NOW = 1_700_000_000_000;
const day = 24 * 60 * 60 * 1000;

// ===========================================================================
// 1. Pure helpers
// ===========================================================================

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`<b>"Tom" & 'Jerry'</b>`)).toBe(
      '&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;'
    );
  });

  it('leaves benign text untouched', () => {
    expect(escapeHtml('Week 3 planning')).toBe('Week 3 planning');
  });
});

describe('isDigestOptIn — default OFF', () => {
  it('is opted in ONLY for the literal boolean true', () => {
    expect(isDigestOptIn({ digestOptIn: true })).toBe(true);
  });

  it('is OFF when absent / false / truthy-but-not-true', () => {
    expect(isDigestOptIn({})).toBe(false);
    expect(isDigestOptIn({ digestOptIn: false })).toBe(false);
    expect(isDigestOptIn({ digestOptIn: 'true' as unknown })).toBe(false);
    expect(isDigestOptIn({ digestOptIn: 1 as unknown })).toBe(false);
  });
});

describe('isWithinDigestWindow — trailing 7 days', () => {
  it('includes events inside the window', () => {
    expect(isWithinDigestWindow(NOW - 1 * day, NOW)).toBe(true);
    expect(isWithinDigestWindow(NOW - (DIGEST_WINDOW_MS - 1), NOW)).toBe(true);
    expect(isWithinDigestWindow(NOW, NOW)).toBe(true);
  });

  it('excludes events at or before the window edge', () => {
    expect(isWithinDigestWindow(NOW - DIGEST_WINDOW_MS, NOW)).toBe(false);
    expect(isWithinDigestWindow(NOW - 8 * day, NOW)).toBe(false);
  });

  it('excludes future-dated events and malformed timestamps', () => {
    expect(isWithinDigestWindow(NOW + day, NOW)).toBe(false);
    expect(isWithinDigestWindow(null, NOW)).toBe(false);
    expect(isWithinDigestWindow(0, NOW)).toBe(false);
  });

  it('accepts a Firestore Timestamp', () => {
    expect(isWithinDigestWindow({ toMillis: () => NOW - day }, NOW)).toBe(true);
  });
});

describe('collectRecipientEmails — de-dupe + lowercase, no fan-out', () => {
  it('merges members-map emails and memberEmails mirror, de-duplicated', () => {
    const recipients = collectRecipientEmails({
      members: {
        u1: { email: 'Lead@School.org' },
        u2: { email: 'member@school.org' },
      },
      memberEmails: { u1: 'lead@school.org', u3: 'third@school.org' },
    });
    expect(recipients).toEqual([
      'lead@school.org',
      'member@school.org',
      'third@school.org',
    ]);
  });

  it('drops non-string / invalid (no @) entries', () => {
    const recipients = collectRecipientEmails({
      members: { u1: { email: 'good@school.org' } },
      memberEmails: { u2: 'not-an-email', u3: 42 as unknown as string },
    });
    expect(recipients).toEqual(['good@school.org']);
  });

  it('returns empty when there are no recipients', () => {
    expect(collectRecipientEmails({})).toEqual([]);
  });
});

describe('describeDigestEvent', () => {
  it('renders a known event type with a target title', () => {
    expect(
      describeDigestEvent({
        type: 'assessment_shared',
        actorName: 'Ms. Lee',
        targetTitle: 'Unit 2 Quiz',
        createdAt: NOW,
      })
    ).toBe('Ms. Lee shared an assessment: Unit 2 Quiz');
  });

  it('falls back to a humanised type and a default actor', () => {
    expect(
      describeDigestEvent({
        type: 'some_new_event',
        actorName: '   ',
        createdAt: NOW,
      })
    ).toBe('A member some new event');
  });
});

describe('buildPlcDigestEmail', () => {
  const events: DigestActivityEvent[] = [
    {
      type: 'note_created',
      actorName: 'Alice',
      targetTitle: 'Agenda',
      createdAt: NOW - 1 * day,
    },
    {
      type: 'comment_added',
      actorName: 'Bob',
      targetTitle: 'Data card',
      createdAt: NOW - 2 * day,
    },
  ];

  it('renders subject with the count and both text + html bodies', () => {
    const body = buildPlcDigestEmail({ plcName: '7th Grade Math', events });
    expect(body.subject).toBe('2 updates this week in "7th Grade Math"');
    expect(body.text).toContain('Alice added a note: Agenda');
    expect(body.text).toContain('Bob left a comment: Data card');
    expect(body.html).toContain('Alice added a note: Agenda');
  });

  it('uses the singular subject for a single update', () => {
    const body = buildPlcDigestEmail({
      plcName: 'Science',
      events: [events[0]],
    });
    expect(body.subject).toBe('1 update this week in "Science"');
  });

  it('escapes HTML in the PLC name and event content (anti-injection)', () => {
    const body = buildPlcDigestEmail({
      plcName: '<script>x</script>',
      events: [
        {
          type: 'note_created',
          actorName: '<b>Mallory</b>',
          targetTitle: '"pwn"',
          createdAt: NOW,
        },
      ],
    });
    expect(body.html).not.toContain('<script>x</script>');
    expect(body.html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(body.html).toContain('&lt;b&gt;Mallory&lt;/b&gt;');
    expect(body.html).toContain('&quot;pwn&quot;');
  });

  it('summarises the overflow beyond MAX_DIGEST_LINES', () => {
    const many: DigestActivityEvent[] = Array.from(
      { length: MAX_DIGEST_LINES + 5 },
      (_, i) => ({
        type: 'note_created',
        actorName: `User${i}`,
        targetTitle: `Note ${i}`,
        createdAt: NOW - i * 1000,
      })
    );
    const body = buildPlcDigestEmail({ plcName: 'Busy PLC', events: many });
    expect(body.text).toContain('…and 5 more updates.');
    expect(body.html).toContain('…and 5 more updates.');
  });
});

// ===========================================================================
// 2. Sweep against a stub Firestore (Admin SDK surface)
// ===========================================================================

interface StubDoc {
  id: string;
  data: Record<string, unknown>;
  activity?: StubDoc[];
}

/**
 * In-memory Firestore mirroring the Admin SDK surface `runPlcWeeklyDigest`
 * uses:
 *   db.collection('global_permissions').doc('plc-digest').get()
 *   db.collection('plcs').limit(n).get()
 *   plcRef.collection('activity').orderBy('createdAt','desc').limit(n).get()
 *   db.collection('mail').doc(id).set(data)
 */
function makeStubDb(seed: {
  digestEnabled?: boolean;
  digestConfig?: Record<string, unknown>;
  plcs?: StubDoc[];
}) {
  const plcs = seed.plcs ?? [];
  const mail = new Map<string, Record<string, unknown>>();

  interface ColRef {
    limit: (n: number) => ColRef;
    orderBy: (field: string, dir: string) => ColRef;
    get: () => Promise<{ docs: DocSnap[]; size: number }>;
    doc: (id: string) => DocRef;
  }
  interface DocRef {
    get: () => Promise<{
      exists: boolean;
      data: () => Record<string, unknown>;
    }>;
    set: (data: Record<string, unknown>) => Promise<void>;
    collection: (name: string) => ColRef;
  }
  interface DocSnap {
    id: string;
    ref: DocRef;
    data: () => Record<string, unknown>;
  }

  const makeDocRef = (parent: StubDoc): DocRef => ({
    get: () => Promise.resolve({ exists: true, data: () => parent.data }),
    set: () => Promise.resolve(),
    collection: (name: string) => {
      if (name === 'activity') {
        parent.activity = parent.activity ?? [];
        return makeColRef(parent.activity, { orderField: 'createdAt' });
      }
      return makeColRef([], {});
    },
  });

  const makeColRef = (
    backing: StubDoc[],
    opts: { orderField?: string; desc?: boolean; lim?: number }
  ): ColRef => ({
    limit: (n: number) => makeColRef(backing, { ...opts, lim: n }),
    orderBy: (field: string, dir: string) =>
      makeColRef(backing, { ...opts, orderField: field, desc: dir === 'desc' }),
    get: () => {
      let rows = [...backing];
      if (opts.orderField === 'createdAt') {
        rows.sort((a, b) => {
          const av = (a.data.createdAt as number) ?? 0;
          const bv = (b.data.createdAt as number) ?? 0;
          return opts.desc ? bv - av : av - bv;
        });
      }
      if (opts.lim !== undefined) rows = rows.slice(0, opts.lim);
      return Promise.resolve({
        size: rows.length,
        docs: rows.map((d) => ({
          id: d.id,
          ref: makeDocRef(d),
          data: () => d.data,
        })),
      });
    },
    doc: (id: string) => {
      const found = backing.find((d) => d.id === id);
      return makeDocRef(found ?? { id, data: {} });
    },
  });

  const db = {
    collection: (name: string) => {
      if (name === 'global_permissions') {
        return {
          doc: () => ({
            get: () =>
              Promise.resolve(
                seed.digestEnabled === undefined && !seed.digestConfig
                  ? { exists: false, data: () => ({}) }
                  : {
                      exists: true,
                      data: () =>
                        seed.digestConfig ?? { enabled: seed.digestEnabled },
                    }
              ),
          }),
        };
      }
      if (name === 'plcs') {
        return makeColRef(plcs, {});
      }
      if (name === 'mail') {
        return {
          doc: (id: string) => ({
            set: (data: Record<string, unknown>) => {
              mail.set(id, data);
              return Promise.resolve();
            },
          }),
        };
      }
      return makeColRef([], {});
    },
  };

  return {
    db: db as unknown as Parameters<typeof runPlcWeeklyDigest>[0],
    mail,
  };
}

const recentActivity = (id: string): StubDoc => ({
  id,
  data: {
    type: 'note_created',
    actorName: 'Alice',
    targetTitle: 'Agenda',
    createdAt: NOW - 1 * day,
  },
});

describe('runPlcWeeklyDigest — kill switch (default OFF)', () => {
  it('queues NO mail when the global switch doc is missing', async () => {
    const { db, mail } = makeStubDb({
      plcs: [
        {
          id: 'plc-1',
          data: {
            name: 'Math',
            digestOptIn: true,
            memberEmails: { u1: 'a@school.org' },
          },
          activity: [recentActivity('e1')],
        },
      ],
    });
    const counts = await runPlcWeeklyDigest(db, NOW);
    expect(counts.mailQueued).toBe(0);
    expect(mail.size).toBe(0);
  });

  it('queues NO mail when the switch is explicitly disabled', async () => {
    const { db, mail } = makeStubDb({
      digestEnabled: false,
      plcs: [
        {
          id: 'plc-1',
          data: {
            name: 'Math',
            digestOptIn: true,
            memberEmails: { u1: 'a@school.org' },
          },
          activity: [recentActivity('e1')],
        },
      ],
    });
    const counts = await runPlcWeeklyDigest(db, NOW);
    expect(counts.mailQueued).toBe(0);
    expect(mail.size).toBe(0);
  });
});

describe('runPlcWeeklyDigest — switch ON', () => {
  it('queues EXACTLY ONE /mail doc per opted-in PLC (no per-member fan-out)', async () => {
    const { db, mail } = makeStubDb({
      digestEnabled: true,
      plcs: [
        {
          id: 'plc-1',
          data: {
            name: '7th Grade Math',
            digestOptIn: true,
            members: {
              u1: { email: 'lead@school.org' },
              u2: { email: 'member@school.org' },
              u3: { email: 'third@school.org' },
            },
          },
          activity: [recentActivity('e1'), recentActivity('e2')],
        },
      ],
    });

    const counts = await runPlcWeeklyDigest(db, NOW);

    expect(counts.mailQueued).toBe(1);
    expect(mail.size).toBe(1);
    const [[, doc]] = [...mail.entries()];
    // ONE doc carrying ALL three recipients — not three docs.
    expect(doc.to).toEqual([
      'lead@school.org',
      'member@school.org',
      'third@school.org',
    ]);
  });

  it('skips an opted-OUT PLC even with recent activity', async () => {
    const { db, mail } = makeStubDb({
      digestEnabled: true,
      plcs: [
        {
          id: 'opted-out',
          data: {
            name: 'Quiet PLC',
            digestOptIn: false,
            memberEmails: { u1: 'a@school.org' },
          },
          activity: [recentActivity('e1')],
        },
      ],
    });
    const counts = await runPlcWeeklyDigest(db, NOW);
    expect(counts.optedIn).toBe(0);
    expect(counts.mailQueued).toBe(0);
    expect(mail.size).toBe(0);
  });

  it('skips an opted-in PLC with no in-window activity', async () => {
    const { db, mail } = makeStubDb({
      digestEnabled: true,
      plcs: [
        {
          id: 'stale',
          data: {
            name: 'Dormant PLC',
            digestOptIn: true,
            memberEmails: { u1: 'a@school.org' },
          },
          activity: [
            {
              id: 'old',
              data: {
                type: 'note_created',
                actorName: 'Alice',
                createdAt: NOW - 30 * day, // outside the 7-day window
              },
            },
          ],
        },
      ],
    });
    const counts = await runPlcWeeklyDigest(db, NOW);
    expect(counts.optedIn).toBe(1);
    expect(counts.skippedNoActivity).toBe(1);
    expect(counts.mailQueued).toBe(0);
    expect(mail.size).toBe(0);
  });

  it('skips an opted-in PLC with activity but no recipients', async () => {
    const { db, mail } = makeStubDb({
      digestEnabled: true,
      plcs: [
        {
          id: 'no-emails',
          data: { name: 'Ghost PLC', digestOptIn: true },
          activity: [recentActivity('e1')],
        },
      ],
    });
    const counts = await runPlcWeeklyDigest(db, NOW);
    expect(counts.skippedNoRecipients).toBe(1);
    expect(counts.mailQueued).toBe(0);
    expect(mail.size).toBe(0);
  });

  it('queues one doc per PLC across multiple opted-in PLCs', async () => {
    const { db, mail } = makeStubDb({
      digestEnabled: true,
      plcs: [
        {
          id: 'plc-a',
          data: {
            name: 'A',
            digestOptIn: true,
            memberEmails: { u1: 'a@school.org' },
          },
          activity: [recentActivity('e1')],
        },
        {
          id: 'plc-b',
          data: {
            name: 'B',
            digestOptIn: true,
            memberEmails: { u2: 'b@school.org' },
          },
          activity: [recentActivity('e2')],
        },
      ],
    });
    const counts = await runPlcWeeklyDigest(db, NOW);
    expect(counts.mailQueued).toBe(2);
    expect(mail.size).toBe(2);
  });
});
